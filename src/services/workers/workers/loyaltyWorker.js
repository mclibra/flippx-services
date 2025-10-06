import BaseWorker from '../baseWorker';
import moment from 'moment';
import mongoose from 'mongoose';
import {
	processNoWinCashback,
	cleanupDepositData,
	evaluateUserTier,
	cleanupOrphanedLoyaltyProfiles,
} from '../../../api/loyalty/controller';
import InfluencerCommissionService from '../../influencer/commissionService';
import { LoyaltyProfile } from '../../../api/loyalty/model';
import { User } from '../../../api/user/model';
import TierConfigService from '../../tier/tierConfigService';

class LoyaltyWorker extends BaseWorker {
	constructor() {
		super('loyalty');
	}

	/**
	 * Initialize all loyalty-related cron jobs
	 */
	async initializeCronJobs() {
		// Process no-win cashback daily at 1 AM
		this.createSafeCronJob(
			'0 1 * * *',
			'process-no-win-cashback',
			this.processNoWinCashbackJob.bind(this)
		);

		// Reset monthly referral commission caps - Run on the 1st of every month at 12 AM
		this.createSafeCronJob(
			'0 0 1 * *',
			'reset-monthly-referral-caps',
			this.resetMonthlyReferralCaps.bind(this)
		);

		// Reset weekly spending tracking - Run every Monday at 12 AM
		this.createSafeCronJob(
			'0 0 * * 1',
			'reset-weekly-spending',
			this.resetWeeklySpending.bind(this)
		);

		// Update no-win tracking for VIP users - Run daily at 3 AM
		this.createSafeCronJob(
			'0 3 * * *',
			'update-no-win-tracking',
			this.updateNoWinTracking.bind(this)
		);

		// Cleanup deposit data - Run daily at 4 AM
		this.createSafeCronJob(
			'0 4 * * *',
			'cleanup-deposit-data',
			this.cleanupDepositDataJob.bind(this)
		);

		// Evaluate all user tiers - Run daily at 5 AM
		this.createSafeCronJob(
			'0 5 * * *',
			'evaluate-user-tiers',
			this.evaluateUserTiersJob.bind(this)
		);

		// Refresh tier configuration cache - Run every 6 hours
		this.createSafeCronJob(
			'0 */6 * * *',
			'refresh-tier-config-cache',
			this.refreshTierConfigCache.bind(this)
		);

		// Validate tier configuration integrity - Run daily at 1 AM
		this.createSafeCronJob(
			'0 1 * * *',
			'validate-tier-config-integrity',
			this.validateTierConfigIntegrity.bind(this)
		);

		// Check VIP daily login requirements - Run daily at 2 AM
		this.createSafeCronJob(
			'0 2 * * *',
			'check-vip-daily-login',
			this.checkVipDailyLogin.bind(this)
		);
	}

	/**
	 * Process no-win cashback job
	 * Original: cron.schedule('0 1 * * *', ...)
	 */
	async processNoWinCashbackJob() {
		try {
			await processNoWinCashback();
		} catch (error) {
			this.logError('Error in no-win cashback job:', error);
		}
	}

	/**
	 * Reset monthly referral commission caps
	 * Original: cron.schedule('0 0 1 * *', ...)
	 */
	async resetMonthlyReferralCaps() {
		try {
			const loyalties = await LoyaltyProfile.find({
				currentTier: { $in: ['GOLD', 'VIP'] },
			});

			for (const loyalty of loyalties) {
				loyalty.referralCommissions.monthly = {
					borlette: { earned: 0, plays: 0 },
					roulette: { earned: 0, spins: 0 },
					dominoes: { earned: 0, wagered: 0 },
					totalEarned: 0,
					resetDate: moment().endOf('month').toDate(),
				};
				await loyalty.save();
			}

			// Reset influencer caps (tracked via monthKey, so no action needed)
			await InfluencerCommissionService.resetMonthlyInfluencerCaps();
		} catch (error) {
			this.logError('Error resetting referral commission caps:', error);
		}
	}

	/**
	 * Reset weekly spending tracking
	 * Original: cron.schedule('0 0 * * 1', ...)
	 */
	async resetWeeklySpending() {
		try {
			await LoyaltyProfile.updateMany(
				{},
				{
					$set: {
						'tierProgress.weeklySpending': 0,
						'tierProgress.weeklySpendingResetDate': moment()
							.endOf('week')
							.toDate(),
						'tierProgress.daysPlayedThisWeek': 0,
					},
				}
			);
		} catch (error) {
			this.logError('Error resetting weekly spending tracking:', error);
		}
	}

	/**
	 * Check VIP daily login requirements
	 * Original: cron.schedule('0 2 * * *', ...)
	 */
	async checkVipDailyLogin() {
		try {
			const vipConfig = await TierConfigService.getTierConfig('VIP');
			if (!vipConfig || !vipConfig.requirements.dailyLoginRequired) {
				return;
			}

			const vipUsers = await User.find({}).populate({
				path: 'loyaltyProfile',
				match: { currentTier: 'VIP' },
			});
			const filteredVipUsers = vipUsers.filter(
				user => user.loyaltyProfile
			);

			for (const user of filteredVipUsers) {
				const yesterday = moment().subtract(1, 'day').startOf('day');
				const loggedInYesterday =
					user.sessionTracking?.lastLoginDate &&
					moment(user.sessionTracking.lastLoginDate).isBetween(
						yesterday,
						moment().startOf('day')
					);

				const requiredSessionMinutes =
					vipConfig.requirements.dailySessionMinutes || 5;
				const metSessionRequirement =
					user.sessionTracking?.totalSessionTimeToday &&
					user.sessionTracking.totalSessionTimeToday >=
						requiredSessionMinutes * 60;

			}
		} catch (error) {
			this.logError(
				'Error checking VIP daily login requirements:',
				error
			);
		}
	}

	/**
	 * Update no-win tracking for VIP users
	 * Original: cron.schedule('0 3 * * *', ...)
	 */
	async updateNoWinTracking() {
		try {
			const tierConfigs = await TierConfigService.getTierRequirements();
			const eligibleTiers = Object.keys(tierConfigs).filter(
				tier =>
					tierConfigs[tier].noWinCashbackPercentage > 0 &&
					tierConfigs[tier].noWinCashbackDays > 0
			);

			if (eligibleTiers.length === 0) {
				return;
			}

			const loyalties = await LoyaltyProfile.find({
				currentTier: { $in: eligibleTiers },
			});

			for (const loyalty of loyalties) {
				const tierConfig = tierConfigs[loyalty.currentTier];
				if (!tierConfig) continue;

				if (!loyalty.tierProgress.lastWinDate) {
					if (loyalty.tierProgress.lastPlayDate) {
						const daysSinceFirstPlay = moment().diff(
							moment(loyalty.tierProgress.lastPlayDate),
							'days'
						);
						loyalty.tierProgress.consecutiveDaysNoWin =
							daysSinceFirstPlay;
						if (
							daysSinceFirstPlay >= tierConfig.noWinCashbackDays
						) {
							loyalty.tierProgress.eligibleForNoWinCashback = true;
						}
					}
				} else {
					const daysSinceLastWin = moment().diff(
						moment(loyalty.tierProgress.lastWinDate),
						'days'
					);
					loyalty.tierProgress.consecutiveDaysNoWin =
						daysSinceLastWin;
					if (daysSinceLastWin >= tierConfig.noWinCashbackDays) {
						loyalty.tierProgress.eligibleForNoWinCashback = true;
					}
				}

				await loyalty.save();
			}

		} catch (error) {
			this.logError('Error updating no-win tracking:', error);
		}
	}

	/**
	 * Cleanup deposit data job
	 * Original: cron.schedule('0 4 * * *', ...)
	 */
	async cleanupDepositDataJob() {
		try {
			await cleanupDepositData();
		} catch (error) {
			this.logError('Error in deposit data cleanup job:', error);
		}
	}

	/**
	 * Evaluate all user tiers job
	 * Original: cron.schedule('0 5 * * *', ...)
	 */
	async evaluateUserTiersJob() {
		try {
			// Clear tier configuration cache before daily evaluation
			TierConfigService.clearCache();

			// Clean up orphaned loyalty profiles first
			await cleanupOrphanedLoyaltyProfiles();

			const users = await LoyaltyProfile.find({});

			let upgrades = 0;
			let downgrades = 0;
			let errors = 0;
			let unchanged = 0;

			for (const loyalty of users) {
				try {
					// Skip loyalty profiles with invalid user IDs
					if (
						!loyalty.user ||
						!mongoose.Types.ObjectId.isValid(loyalty.user)
					) {
						this.logError(
							`Skipping loyalty profile with invalid user ID: ${loyalty.user}`
						);
						errors++;
						continue;
					}

					const oldTier = loyalty.currentTier;
					await evaluateUserTier(loyalty.user);

					// Check if user was upgraded or downgraded
					const updatedLoyalty = await LoyaltyProfile.findOne({
						user: loyalty.user,
					});

					if (
						updatedLoyalty &&
						updatedLoyalty.currentTier !== oldTier
					) {
						const tierRank = {
							NONE: 0,
							SILVER: 1,
							GOLD: 2,
							VIP: 3,
						};
						if (
							tierRank[updatedLoyalty.currentTier] >
							tierRank[oldTier]
						) {
							upgrades++;
						} else {
							downgrades++;
						}
					} else {
						unchanged++;
					}
				} catch (userError) {
					errors++;
					const errorType = userError.message.includes(
						'User not found'
					)
						? 'MISSING_USER'
						: userError.message.includes(
									'Loyalty profile not found'
							  )
							? 'MISSING_LOYALTY_PROFILE'
							: userError.message.includes(
										'Invalid user ID format'
								  )
								? 'INVALID_OBJECTID'
								: 'OTHER';

					this.logError(
						`[${errorType}] Error evaluating tier for user ${loyalty.user}:`,
						userError
					);
				}
			}

		} catch (error) {
			this.logError('Error in tier evaluation job:', error);
		}
	}

	/**
	 * Refresh tier configuration cache
	 * Original: cron.schedule('0 *\/6 * * *', ...)
	 */
	async refreshTierConfigCache() {
		try {
			TierConfigService.clearCache();
			// Pre-load the cache
			await TierConfigService.getTierRequirements();
		} catch (error) {
			this.logError('Error refreshing tier configuration cache:', error);
		}
	}

	/**
	 * Validate tier configuration integrity
	 * Original: cron.schedule('0 1 * * *', ...)
	 */
	async validateTierConfigIntegrity() {
		try {
			const tierConfigs = await TierConfigService.getTierRequirements();
			const issues = [];

			// Check if all required tiers exist
			const requiredTiers = ['NONE', 'SILVER', 'GOLD', 'VIP'];
			for (const tier of requiredTiers) {
				if (!tierConfigs[tier]) {
					issues.push(`Missing tier configuration: ${tier}`);
				}
			}

			// Check for logical consistency in tier progression
			const tierOrder = ['NONE', 'SILVER', 'GOLD', 'VIP'];
			for (let i = 1; i < tierOrder.length; i++) {
				const currentTier = tierConfigs[tierOrder[i]];
				const previousTier = tierConfigs[tierOrder[i - 1]];

				if (currentTier && previousTier) {
					// Check if withdrawal limits are progressive
					if (
						currentTier.weeklyWithdrawalLimit <
						previousTier.weeklyWithdrawalLimit
					) {
						issues.push(
							`${tierOrder[i]} withdrawal limit (${
								currentTier.weeklyWithdrawalLimit
							}) is less than ${tierOrder[i - 1]} (${
								previousTier.weeklyWithdrawalLimit
							})`
						);
					}

					// Check if withdrawal times are decreasing (faster for higher tiers)
					if (
						currentTier.withdrawalTime > previousTier.withdrawalTime
					) {
						issues.push(
							`${tierOrder[i]} withdrawal time (${
								currentTier.withdrawalTime
							}h) is slower than ${tierOrder[i - 1]} (${
								previousTier.withdrawalTime
							}h)`
						);
					}
				}
			}

		} catch (error) {
			this.logError(
				'Error validating tier configuration integrity:',
				error
			);
		}
	}
}

// Start the worker
const loyaltyWorker = new LoyaltyWorker();

// Export for testing purposes
export default LoyaltyWorker;
