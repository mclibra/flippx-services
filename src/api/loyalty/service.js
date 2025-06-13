// api/loyalty/service.js

import {
	awardXP,
	recordPlayActivity,
	recordDeposit,
	getUserLoyalty,
	getUserXPHistory,
	checkWeeklyWithdrawalLimit,
	recordWithdrawalUsage,
	getWithdrawalTime,
	processReferralQualification,
	evaluateUserTier,
	manualTierUpgrade,
	initializeLoyalty,
} from './controller';
import { LoyaltyProfile, LoyaltyTransaction } from './model';
import { LOYALTY_TIERS } from './constants';
import moment from 'moment';

// Comprehensive service for loyalty program integration
export const loyaltyService = {
	// ===== Transaction-related methods =====

	// Handle play activity (triggered by ticket purchase)
	handlePlayActivity: async (userId, ticketAmount, ticketType, ticketId) => {
		try {
			// Record the play activity for tier progression
			await recordPlayActivity(userId);

			// Award XP based on play amount (1 XP per dollar)
			const xpAmount = Math.floor(ticketAmount);
			if (xpAmount > 0) {
				await awardXP(
					userId,
					xpAmount,
					'EARN',
					`XP earned for ${ticketType} ticket`,
					{ type: 'TICKET', id: ticketId }
				);
			}

			// Check if this player was referred and if they now qualify
			await processReferralQualification(userId);

			return { success: true };
		} catch (error) {
			console.error(
				'Error handling play activity in loyalty service:',
				error
			);
			return { success: false, error: error.message };
		}
	},

	// Handle deposits
	handleDeposit: async (userId, depositAmount) => {
		try {
			// Record the deposit for tier progression
			await recordDeposit(userId, depositAmount);

			// Award XP based on deposit amount (1 XP per $2 deposited)
			const xpAmount = Math.floor(depositAmount / 2);
			if (xpAmount > 0) {
				await awardXP(
					userId,
					xpAmount,
					'EARN',
					`XP earned for deposit of $${depositAmount}`,
					{ type: 'DEPOSIT', amount: depositAmount }
				);
			}

			return { success: true };
		} catch (error) {
			console.error('Error handling deposit in loyalty service:', error);
			return { success: false, error: error.message };
		}
	},

	// Handle winnings (optional bonus XP for winning)
	handleWinnings: async (userId, winAmount, gameType, ticketId) => {
		try {
			// Award bonus XP for winning (0.5 XP per dollar won)
			const xpAmount = Math.floor(winAmount * 0.5);
			if (xpAmount > 0) {
				await awardXP(
					userId,
					xpAmount,
					'BONUS',
					`Bonus XP for winning $${winAmount} on ${gameType}`,
					{ type: 'WIN', id: ticketId }
				);
			}

			return { success: true };
		} catch (error) {
			console.error('Error handling winnings in loyalty service:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== User Profile methods =====

	// Get user's loyalty profile (for UI display)
	getUserLoyaltyProfile: async userId => {
		try {
			const result = await getUserLoyalty(userId);
			return result.entity;
		} catch (error) {
			console.error('Error getting user loyalty profile:', error);
			return { success: false, error: error.message };
		}
	},

	// Get user's XP transaction history
	getXPHistory: async (userId, options = { limit: 10, offset: 0 }) => {
		try {
			const result = await getUserXPHistory(userId, options);
			return result.entity;
		} catch (error) {
			console.error('Error getting XP history:', error);
			return { success: false, error: error.message };
		}
	},

	// Initialize loyalty for a new user
	initializeLoyaltyForUser: async userId => {
		try {
			const loyalty = await initializeLoyalty(userId);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error initializing loyalty for user:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Withdrawal-related methods =====

	// Get withdrawal processing time based on tier
	getWithdrawalProcessingTime: async userId => {
		try {
			const result = await getWithdrawalTime(userId);
			return result.entity;
		} catch (error) {
			console.error('Error getting withdrawal time:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Withdrawal-related methods =====

	// Check weekly withdrawal limit
	checkWithdrawalLimit: async userId => {
		try {
			const result = await checkWeeklyWithdrawalLimit(userId);
			return result.entity;
		} catch (error) {
			console.error('Error checking withdrawal limit:', error);
			return { success: false, error: error.message };
		}
	},

	// Record withdrawal usage
	recordWithdrawal: async (userId, amount) => {
		try {
			const result = await recordWithdrawalUsage(userId, amount);
			return result.entity;
		} catch (error) {
			console.error('Error recording withdrawal usage:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Referral-related methods =====

	// Process referral qualification
	processReferral: async refereeId => {
		try {
			const result = await processReferralQualification(refereeId);
			return result;
		} catch (error) {
			console.error('Error processing referral:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Admin methods =====

	// Manual tier upgrade (for admin use)
	upgradeUserTier: async (adminId, userId, targetTier) => {
		try {
			// Log admin action
			console.log(
				`Admin ${adminId} upgrading user ${userId} to ${targetTier} tier`
			);

			const result = await manualTierUpgrade(userId, targetTier);
			return result.entity;
		} catch (error) {
			console.error('Error upgrading user tier:', error);
			return { success: false, error: error.message };
		}
	},

	// Manual XP adjustment (for admin use)
	adjustUserXP: async (adminId, userId, amount, reason) => {
		try {
			// Log admin action
			console.log(
				`Admin ${adminId} adjusting XP for user ${userId} by ${amount} points`
			);

			await awardXP(
				userId,
				amount,
				'ADJUSTMENT',
				`Admin adjustment: ${reason}`,
				{ adminId }
			);

			return {
				success: true,
				message: `Successfully adjusted XP by ${amount}`,
			};
		} catch (error) {
			console.error('Error adjusting user XP:', error);
			return { success: false, error: error.message };
		}
	},

	// Force tier evaluation for a user
	evaluateUserTier: async userId => {
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
			};
		} catch (error) {
			console.error('Error evaluating user tier:', error);
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

				dateFilter = { createdAt: { $gte: startDate } };
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
			};
		} catch (error) {
			console.error('Error getting total cashback paid:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Utility methods =====

	// Get tier information
	getTierInfo: tierName => {
		try {
			if (!tierName || !LOYALTY_TIERS[tierName]) {
				throw new Error('Invalid tier name');
			}

			return {
				success: true,
				tier: {
					name: tierName,
					...LOYALTY_TIERS[tierName],
				},
			};
		} catch (error) {
			console.error('Error getting tier info:', error);
			return { success: false, error: error.message };
		}
	},

	// Get all tiers information
	getAllTiersInfo: () => {
		try {
			const tiers = {};

			Object.keys(LOYALTY_TIERS).forEach(tierName => {
				tiers[tierName] = {
					name: tierName,
					...LOYALTY_TIERS[tierName],
				};
			});

			return { success: true, tiers };
		} catch (error) {
			console.error('Error getting all tiers info:', error);
			return { success: false, error: error.message };
		}
	},
};
