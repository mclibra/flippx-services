import cron from 'node-cron';
import moment from 'moment';
import {
	processNoWinCashback,
	cleanupDepositData,
	evaluateUserTier,
} from '../../api/loyalty/controller';
import { LoyaltyProfile } from '../../api/loyalty/model';
import { User } from '../../api/user/model';
import TierConfigService from '../tier/tierConfigService';

console.log('Initializing loyalty program scheduler...');

// Process no-win cashback daily at 1 AM
cron.schedule('0 1 * * *', async () => {
	console.log('Running no-win cashback processing job...');
	try {
		const result = await processNoWinCashback();
		console.log(
			`No-win cashback completed with ${result.entity.results.length} users processed`
		);
	} catch (error) {
		console.error('Error in no-win cashback job:', error);
	}
});

// Reset monthly referral commission caps - Run on the 1st of every month at 12 AM
cron.schedule('0 0 1 * *', async () => {
	console.log('Resetting monthly referral commission caps...');
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

		console.log(`Reset referral commission caps for ${loyalties.length} users`);

		// Reset influencer caps (tracked via monthKey, so no action needed)
		const InfluencerCommissionService = (await import('../../services/influencer/commissionService')).default;
		await InfluencerCommissionService.resetMonthlyInfluencerCaps();

		console.log('Influencer commission tracking reset for new month');
	} catch (error) {
		console.error('Error resetting referral commission caps:', error);
	}
});

// Reset weekly spending tracking - Run every Monday at 12 AM
cron.schedule('0 0 * * 1', async () => {
	console.log('Resetting weekly spending tracking...');
	try {
		const result = await LoyaltyProfile.updateMany(
			{},
			{
				$set: {
					'tierProgress.weeklySpending': 0,
					'tierProgress.weeklySpendingResetDate': moment().endOf('week').toDate(),
					'tierProgress.daysPlayedThisWeek': 0,
				},
			}
		);

		console.log(`Reset weekly spending for ${result.modifiedCount} users`);
	} catch (error) {
		console.error('Error resetting weekly spending:', error);
	}
});

// Check daily login requirements for VIP users - Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
	console.log('Checking VIP daily login requirements...');
	try {
		// Get VIP tier configuration from database
		const vipConfig = await TierConfigService.getTierConfig('VIP');
		if (!vipConfig || !vipConfig.requirements.dailyLoginRequired) {
			console.log('VIP daily login requirement not configured, skipping check');
			return;
		}

		const vipUsers = await User.find({}).populate({
			path: 'loyaltyProfile',
			match: { currentTier: 'VIP' }
		});

		const filteredVipUsers = vipUsers.filter(user => user.loyaltyProfile);

		for (const user of filteredVipUsers) {
			// Check if user logged in yesterday
			const yesterday = moment().subtract(1, 'day').startOf('day');
			const dayBeforeYesterday = moment().subtract(2, 'days').startOf('day');

			const loggedInYesterday = user.sessionTracking?.lastLoginDate &&
				moment(user.sessionTracking.lastLoginDate).isBetween(yesterday, moment().startOf('day'));

			// Check session time requirement
			const requiredSessionMinutes = vipConfig.requirements.dailySessionMinutes || 5;
			const metSessionRequirement = user.sessionTracking?.totalSessionTimeToday &&
				(user.sessionTracking.totalSessionTimeToday >= requiredSessionMinutes * 60); // Convert to seconds

			if (!loggedInYesterday || !metSessionRequirement) {
				console.log(`VIP user ${user._id} failed daily login/session requirement`);
				// Log the failure for potential tier review
				console.log(`  - Logged in yesterday: ${loggedInYesterday}`);
				console.log(`  - Met session requirement: ${metSessionRequirement}`);

				// Could implement automatic tier downgrade logic here if business rules require it
				// For now, just logging for review
			}
		}

		console.log(`Checked daily login requirements for ${filteredVipUsers.length} VIP users`);
	} catch (error) {
		console.error('Error checking daily login requirements:', error);
	}
});

// Update no-win tracking daily at 3 AM
cron.schedule('0 3 * * *', async () => {
	console.log('Updating no-win tracking...');
	try {
		// Get tier configurations from database
		const tierConfigs = await TierConfigService.getTierRequirements();

		// Find users in tiers that have no-win cashback
		const eligibleTiers = Object.keys(tierConfigs).filter(tier =>
			tierConfigs[tier].noWinCashbackPercentage > 0 &&
			tierConfigs[tier].noWinCashbackDays > 0
		);

		if (eligibleTiers.length === 0) {
			console.log('No tiers have no-win cashback configured, skipping update');
			return;
		}

		const loyalties = await LoyaltyProfile.find({
			currentTier: { $in: eligibleTiers },
		});

		for (const loyalty of loyalties) {
			const tierConfig = tierConfigs[loyalty.currentTier];
			if (!tierConfig) continue;

			if (!loyalty.tierProgress.lastWinDate) {
				// Never won - count from first play
				if (loyalty.tierProgress.lastPlayDate) {
					const daysSinceFirstPlay = moment().diff(
						moment(loyalty.tierProgress.lastPlayDate),
						'days'
					);
					loyalty.tierProgress.consecutiveDaysNoWin = daysSinceFirstPlay;

					// Check eligibility using database config
					if (daysSinceFirstPlay >= tierConfig.noWinCashbackDays) {
						loyalty.tierProgress.eligibleForNoWinCashback = true;
					}
				}
			} else {
				// Has won before
				const daysSinceLastWin = moment().diff(
					moment(loyalty.tierProgress.lastWinDate),
					'days'
				);
				loyalty.tierProgress.consecutiveDaysNoWin = daysSinceLastWin;

				// Check eligibility using database config
				if (daysSinceLastWin >= tierConfig.noWinCashbackDays) {
					loyalty.tierProgress.eligibleForNoWinCashback = true;
				}
			}

			await loyalty.save();
		}

		console.log(`Updated no-win tracking for ${loyalties.length} users across tiers: ${eligibleTiers.join(', ')}`);
	} catch (error) {
		console.error('Error updating no-win tracking:', error);
	}
});

// Cleanup deposit data - Run daily at 4 AM
cron.schedule('0 4 * * *', async () => {
	console.log('Running deposit data cleanup job...');
	try {
		const result = await cleanupDepositData();
		console.log('Deposit data cleanup completed:', result.entity.message);
	} catch (error) {
		console.error('Error in deposit data cleanup job:', error);
	}
});

// Evaluate all user tiers - Run daily at 5 AM
cron.schedule('0 5 * * *', async () => {
	console.log('Running tier evaluation job...');
	try {
		// Clear tier configuration cache before daily evaluation
		TierConfigService.clearCache();
		console.log('Tier configuration cache cleared for fresh evaluation');

		const users = await LoyaltyProfile.find({});
		console.log(`Evaluating tiers for ${users.length} users`);

		let upgrades = 0;
		let downgrades = 0;
		let errors = 0;
		let unchanged = 0;

		for (const loyalty of users) {
			try {
				const oldTier = loyalty.currentTier;
				await evaluateUserTier(loyalty.user);

				// Check if user was upgraded or downgraded
				const updatedLoyalty = await LoyaltyProfile.findOne({
					user: loyalty.user,
				});

				if (updatedLoyalty && updatedLoyalty.currentTier !== oldTier) {
					const tierRank = { NONE: 0, SILVER: 1, GOLD: 2, VIP: 3 };
					if (tierRank[updatedLoyalty.currentTier] > tierRank[oldTier]) {
						upgrades++;
						console.log(`User ${loyalty.user} upgraded from ${oldTier} to ${updatedLoyalty.currentTier}`);
					} else {
						downgrades++;
						console.log(`User ${loyalty.user} downgraded from ${oldTier} to ${updatedLoyalty.currentTier}`);
					}
				} else {
					unchanged++;
				}
			} catch (userError) {
				errors++;
				console.error(`Error evaluating tier for user ${loyalty.user}:`, userError);
			}
		}

		console.log(
			`Tier evaluation completed. Upgrades: ${upgrades}, Downgrades: ${downgrades}, Unchanged: ${unchanged}, Errors: ${errors}`
		);

		// Log summary statistics
		if (upgrades > 0 || downgrades > 0) {
			console.log(`📊 Tier changes summary:`);
			console.log(`   ⬆️  Upgrades: ${upgrades}`);
			console.log(`   ⬇️  Downgrades: ${downgrades}`);
			console.log(`   ➡️  Unchanged: ${unchanged}`);
			if (errors > 0) {
				console.log(`   ❌ Errors: ${errors}`);
			}
		}
	} catch (error) {
		console.error('Error in tier evaluation job:', error);
	}
});

// NEW: Refresh tier configuration cache - Run every 6 hours
cron.schedule('0 */6 * * *', async () => {
	console.log('Refreshing tier configuration cache...');
	try {
		TierConfigService.clearCache();
		// Pre-load the cache
		await TierConfigService.getTierRequirements();
		console.log('Tier configuration cache refreshed successfully');
	} catch (error) {
		console.error('Error refreshing tier configuration cache:', error);
	}
});

// NEW: Validate tier configuration integrity - Run daily at 1 AM
cron.schedule('0 1 * * *', async () => {
	console.log('Validating tier configuration integrity...');
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
				if (currentTier.weeklyWithdrawalLimit < previousTier.weeklyWithdrawalLimit) {
					issues.push(`${tierOrder[i]} withdrawal limit (${currentTier.weeklyWithdrawalLimit}) is less than ${tierOrder[i - 1]} (${previousTier.weeklyWithdrawalLimit})`);
				}

				// Check if withdrawal times are decreasing (faster for higher tiers)
				if (currentTier.withdrawalTime > previousTier.withdrawalTime) {
					issues.push(`${tierOrder[i]} withdrawal time (${currentTier.withdrawalTime}h) is slower than ${tierOrder[i - 1]} (${previousTier.withdrawalTime}h)`);
				}
			}
		}

		if (issues.length > 0) {
			console.warn('⚠️  Tier configuration issues detected:');
			issues.forEach(issue => console.warn(`   - ${issue}`));
		} else {
			console.log('✅ Tier configuration integrity check passed');
		}
	} catch (error) {
		console.error('Error validating tier configuration integrity:', error);
	}
});

console.log('Loyalty program scheduler initialized with database-driven tier configurations');
console.log('Scheduled tasks:');
console.log('  - 01:00: Tier configuration integrity check');
console.log('  - 02:00: VIP daily login requirements check');
console.log('  - 03:00: No-win tracking update');
console.log('  - 04:00: Deposit data cleanup');
console.log('  - 05:00: Daily tier evaluation');
console.log('  - Every 6 hours: Tier configuration cache refresh');