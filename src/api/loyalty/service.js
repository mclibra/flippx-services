import moment from 'moment';
import {
	initializeLoyalty,
	awardXP,
	recordPlayActivity,
	recordDeposit,
	evaluateUserTier,
	getUserLoyalty,
	getUserXPHistory,
	checkWeeklyWithdrawalLimit,
	recordWithdrawalUsage,
	getWithdrawalTime,
	processReferralQualification,
	processWeeklyCashback,
	processMonthlyVIPCashback,
	cleanupDepositData,
} from './controller';
import { LoyaltyProfile, LoyaltyTransaction } from './model';
import { LOYALTY_TIERS } from './constants';

export const LoyaltyService = {
	// ===== Core loyalty methods =====

	// Initialize loyalty for a new user
	initializeLoyaltyForUser: async (userId) => {
		try {
			const loyalty = await initializeLoyalty(userId);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error initializing loyalty for user:', error);
			return { success: false, error: error.message };
		}
	},

	// Award XP to a user
	awardUserXP: async (userId, amount, type, description, reference = null) => {
		try {
			const loyalty = await awardXP(userId, amount, type, description, reference);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error awarding XP to user:', error);
			return { success: false, error: error.message };
		}
	},

	// Record play activity
	recordUserPlayActivity: async (userId) => {
		try {
			const loyalty = await recordPlayActivity(userId);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error recording play activity:', error);
			return { success: false, error: error.message };
		}
	},

	// Record deposit
	recordUserDeposit: async (userId, amount) => {
		try {
			const loyalty = await recordDeposit(userId, amount);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error recording deposit:', error);
			return { success: false, error: error.message };
		}
	},

	// Get user loyalty profile (CORRECTED - consistent response format)
	getUserLoyaltyProfile: async (userId) => {
		try {
			const result = await getUserLoyalty(userId);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to get loyalty profile' };
			}
		} catch (error) {
			console.error('Error getting user loyalty profile:', error);
			return { success: false, error: error.message };
		}
	},

	// Get user XP history (CORRECTED - consistent response format)
	getUserXPHistory: async (userId, options = {}) => {
		try {
			const result = await getUserXPHistory(userId, options);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to get XP history' };
			}
		} catch (error) {
			console.error('Error getting XP history:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Tier evaluation methods =====

	evaluateUserTierStatus: async (userId) => {
		try {
			const oldLoyalty = await LoyaltyProfile.findOne({ user: userId });
			const oldTier = oldLoyalty ? oldLoyalty.currentTier : 'NONE';

			await evaluateUserTier(userId);

			const newLoyalty = await LoyaltyProfile.findOne({ user: userId });
			const newTier = newLoyalty ? newLoyalty.currentTier : 'NONE';

			return {
				success: true,
				previousTier: oldTier,
				currentTier: newTier,
				tierChanged: oldTier !== newTier,
				loyalty: newLoyalty,
			};
		} catch (error) {
			console.error('Error evaluating user tier:', error);
			return { success: false, error: error.message };
		}
	},

	// Check if user qualifies for a specific tier (CORRECTED - complete implementation)
	checkTierEligibility: async (userId, targetTier) => {
		try {
			const loyalty = await LoyaltyProfile.findOne({ user: userId });
			if (!loyalty) {
				return { success: false, error: 'Loyalty profile not found' };
			}

			const tierReqs = LOYALTY_TIERS[targetTier]?.requirements;
			if (!tierReqs) {
				return { success: false, error: 'Invalid tier specified' };
			}

			// Check requirements based on tier
			let eligible = true;
			const reasons = [];

			if (targetTier === 'SILVER') {
				if (loyalty.tierProgress.totalDeposit30Days < tierReqs.depositAmount30Days) {
					eligible = false;
					reasons.push(`Need $${tierReqs.depositAmount30Days - loyalty.tierProgress.totalDeposit30Days} more in deposits`);
				}
				if (loyalty.tierProgress.daysPlayedThisWeek < tierReqs.daysPlayedPerWeek) {
					eligible = false;
					reasons.push(`Need ${tierReqs.daysPlayedPerWeek - loyalty.tierProgress.daysPlayedThisWeek} more play days this week`);
				}
			} else if (targetTier === 'GOLD') {
				if (loyalty.currentTier !== 'SILVER') {
					eligible = false;
					reasons.push('Must be Silver tier first');
				}
				if (loyalty.tierProgress.totalDeposit60Days < tierReqs.depositAmount60Days) {
					eligible = false;
					reasons.push(`Need $${tierReqs.depositAmount60Days - loyalty.tierProgress.totalDeposit60Days} more in 60-day deposits`);
				}
			} else if (targetTier === 'VIP') {
				if (loyalty.currentTier !== 'GOLD') {
					eligible = false;
					reasons.push('Must be Gold tier first');
				}
				if (loyalty.tierProgress.totalDeposit90Days < tierReqs.depositAmount90Days) {
					eligible = false;
					reasons.push(`Need $${tierReqs.depositAmount90Days - loyalty.tierProgress.totalDeposit90Days} more in 90-day deposits`);
				}
			}

			return {
				success: true,
				eligible,
				reasons,
				currentTier: loyalty.currentTier,
				targetTier,
			};
		} catch (error) {
			console.error('Error checking tier eligibility:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Withdrawal-related methods =====

	// Get withdrawal processing time based on tier (CORRECTED - consistent response format)
	getWithdrawalProcessingTime: async (userId) => {
		try {
			const result = await getWithdrawalTime(userId);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to get withdrawal time' };
			}
		} catch (error) {
			console.error('Error getting withdrawal time:', error);
			return { success: false, error: error.message };
		}
	},

	// Check weekly withdrawal limit (CORRECTED - consistent response format)
	checkWithdrawalLimit: async (userId) => {
		try {
			const result = await checkWeeklyWithdrawalLimit(userId);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to check withdrawal limit' };
			}
		} catch (error) {
			console.error('Error checking withdrawal limit:', error);
			return { success: false, error: error.message };
		}
	},

	// Record withdrawal usage (CORRECTED - consistent response format)
	recordWithdrawal: async (userId, amount) => {
		try {
			const result = await recordWithdrawalUsage(userId, amount);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to record withdrawal' };
			}
		} catch (error) {
			console.error('Error recording withdrawal usage:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Referral methods =====

	// Process referral qualification (CORRECTED - consistent service pattern)
	processReferralQualification: async (refereeId) => {
		try {
			const result = await processReferralQualification(refereeId);
			// processReferralQualification returns raw object, not controller response format
			return {
				success: result.success,
				message: result.message,
				xpAwarded: result.xpAwarded,
				error: result.error,
			};
		} catch (error) {
			console.error('Error processing referral qualification:', error);
			return { success: false, error: error.message };
		}
	},

	// Get referral statistics for a user
	getUserReferralStats: async (userId) => {
		try {
			const loyalty = await LoyaltyProfile.findOne({ user: userId });
			if (!loyalty) {
				return { success: false, error: 'Loyalty profile not found' };
			}

			const totalReferrals = loyalty.referralBenefits.length;
			const qualifiedReferrals = loyalty.referralBenefits.filter(ref => ref.qualified).length;
			const totalXPEarned = loyalty.referralBenefits.reduce((sum, ref) => sum + ref.earnedXP, 0);

			return {
				success: true,
				totalReferrals,
				qualifiedReferrals,
				totalXPEarned,
				currentTier: loyalty.currentTier,
				referralXP: LOYALTY_TIERS[loyalty.currentTier].referralXP,
			};
		} catch (error) {
			console.error('Error getting referral stats:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Cashback methods =====

	// Process weekly cashback (CORRECTED - consistent response format)
	processWeeklyCashback: async () => {
		try {
			const result = await processWeeklyCashback();
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to process weekly cashback' };
			}
		} catch (error) {
			console.error('Error processing weekly cashback:', error);
			return { success: false, error: error.message };
		}
	},

	// Process monthly VIP cashback (CORRECTED - consistent response format)
	processMonthlyVIPCashback: async () => {
		try {
			const result = await processMonthlyVIPCashback();
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to process VIP cashback' };
			}
		} catch (error) {
			console.error('Error processing monthly VIP cashback:', error);
			return { success: false, error: error.message };
		}
	},

	// Get user's cashback history
	getUserCashbackHistory: async (userId) => {
		try {
			const loyalty = await LoyaltyProfile.findOne({ user: userId });
			if (!loyalty) {
				return { success: false, error: 'Loyalty profile not found' };
			}

			const cashbackHistory = loyalty.cashbackHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
			const totalCashback = cashbackHistory.reduce((sum, cb) => sum + cb.amount, 0);

			return {
				success: true,
				cashbackHistory,
				totalCashback,
				currentTier: loyalty.currentTier,
			};
		} catch (error) {
			console.error('Error getting cashback history:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Analytics methods =====

	// Get loyalty tier distribution
	getTierDistribution: async () => {
		try {
			const distribution = await LoyaltyProfile.aggregate([
				{
					$group: {
						_id: '$currentTier',
						count: { $sum: 1 },
					},
				},
				{
					$sort: { _id: 1 },
				},
			]);

			return { success: true, distribution };
		} catch (error) {
			console.error('Error getting tier distribution:', error);
			return { success: false, error: error.message };
		}
	},

	// Get average XP by tier
	getAverageXPByTier: async () => {
		try {
			const averages = await LoyaltyProfile.aggregate([
				{
					$group: {
						_id: '$currentTier',
						averageXP: { $avg: '$xpBalance' },
						count: { $sum: 1 },
					},
				},
				{
					$sort: { _id: 1 },
				},
			]);

			return { success: true, averages };
		} catch (error) {
			console.error('Error getting average XP by tier:', error);
			return { success: false, error: error.message };
		}
	},

	// Get total cashback paid
	getTotalCashbackPaid: async (period = 'all') => {
		try {
			let dateFilter = {};

			if (period !== 'all') {
				let startDate;
				if (period === 'week') {
					startDate = moment().subtract(1, 'week').toDate();
				} else if (period === 'month') {
					startDate = moment().subtract(1, 'month').toDate();
				} else if (period === 'year') {
					startDate = moment().subtract(1, 'year').toDate();
				}

				if (startDate) {
					dateFilter = { createdAt: { $gte: startDate } };
				}
			}

			const cashback = await LoyaltyTransaction.aggregate([
				{
					$match: {
						transactionType: 'CASHBACK',
						...dateFilter,
					},
				},
				{
					$group: {
						_id: null,
						total: { $sum: '$xpAmount' },
						count: { $sum: 1 },
					},
				},
			]);

			return {
				success: true,
				total: cashback.length > 0 ? cashback[0].total : 0,
				count: cashback.length > 0 ? cashback[0].count : 0,
				period,
			};
		} catch (error) {
			console.error('Error getting total cashback paid:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Utility methods =====

	// Cleanup deposit data (CORRECTED - consistent response format)
	cleanupDepositData: async () => {
		try {
			const result = await cleanupDepositData();
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to cleanup deposit data' };
			}
		} catch (error) {
			console.error('Error cleaning up deposit data:', error);
			return { success: false, error: error.message };
		}
	},

	// Get loyalty system health status
	getSystemHealth: async () => {
		try {
			const totalUsers = await LoyaltyProfile.countDocuments();
			const activeUsers = await LoyaltyProfile.countDocuments({
				'tierProgress.lastPlayDate': {
					$gte: moment().subtract(30, 'days').toDate(),
				},
			});

			const tierCounts = await LoyaltyProfile.aggregate([
				{
					$group: {
						_id: '$currentTier',
						count: { $sum: 1 },
					},
				},
			]);

			const recentTransactions = await LoyaltyTransaction.countDocuments({
				createdAt: { $gte: moment().subtract(24, 'hours').toDate() },
			});

			// Get domino game statistics
			const dominoTransactions = await LoyaltyTransaction.countDocuments({
				'reference.gameType': 'DOMINO',
				createdAt: { $gte: moment().subtract(7, 'days').toDate() },
			});

			return {
				success: true,
				totalUsers,
				activeUsers,
				tierCounts,
				recentTransactions,
				dominoTransactions,
				activityRate: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(2) : 0,
				lastUpdated: new Date(),
			};
		} catch (error) {
			console.error('Error getting system health:', error);
			return { success: false, error: error.message };
		}
	},

	getGameStatistics: async (gameType = null, period = 'week') => {
		try {
			let dateFilter = {};
			let startDate;

			if (period === 'week') {
				startDate = moment().subtract(1, 'week').toDate();
			} else if (period === 'month') {
				startDate = moment().subtract(1, 'month').toDate();
			} else if (period === 'year') {
				startDate = moment().subtract(1, 'year').toDate();
			}

			if (startDate) {
				dateFilter.createdAt = { $gte: startDate };
			}

			let matchFilter = {
				transactionType: 'GAME_REWARD',
				...dateFilter,
			};

			if (gameType) {
				matchFilter['reference.gameType'] = gameType;
			}

			const statistics = await LoyaltyTransaction.aggregate([
				{
					$match: matchFilter,
				},
				{
					$group: {
						_id: '$reference.gameType',
						totalXPAwarded: { $sum: '$xpAmount' },
						gamesPlayed: { $sum: 1 },
						uniquePlayers: { $addToSet: '$user' },
						averageXP: { $avg: '$xpAmount' },
						wins: {
							$sum: {
								$cond: [{ $eq: ['$reference.isWinner', true] }, 1, 0]
							}
						},
					},
				},
				{
					$addFields: {
						uniquePlayerCount: { $size: '$uniquePlayers' },
						winRate: {
							$multiply: [
								{ $divide: ['$wins', '$gamesPlayed'] },
								100
							]
						}
					}
				},
				{
					$project: {
						uniquePlayers: 0, // Remove the array, keep only count
					}
				},
			]);

			return {
				success: true,
				statistics,
				period,
				gameType: gameType || 'ALL',
			};
		} catch (error) {
			console.error('Error getting game statistics:', error);
			return { success: false, error: error.message };
		}
	},
};