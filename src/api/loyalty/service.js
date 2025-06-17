import {
	initializeLoyalty,
	awardXP,
	recordPlayActivity,
	recordDeposit,
	checkIDVerification,
	evaluateUserTier,
	getUserLoyalty,
	getUserXPHistory,
	calculateTierProgress,
	checkWeeklyWithdrawalLimit,
	recordWithdrawalUsage,
	processReferralQualification,
	manualTierUpgrade,
	cleanupDepositData,
	getWithdrawalTime,
	// NEW functions
	recordDailyLogin,
	updateSessionTime,
	recordWinActivity,
	checkNoWinCashbackEligibility,
	processReferralCommission,
	processNoWinCashback,
} from './controller';

// Export all functions wrapped with consistent error handling
export const LoyaltyService = {
	// ===== User Loyalty Management =====

	// Initialize loyalty for a user
	initializeLoyaltyForUser: async (userId) => {
		try {
			const loyalty = await initializeLoyalty(userId);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error initializing loyalty:', error);
			return { success: false, error: error.message };
		}
	},

	// Award XP to a user
	awardUserXP: async (userId, amount, type, description, reference = null) => {
		try {
			const loyalty = await awardXP(userId, amount, type, description, reference);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error awarding XP:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Activity Tracking =====

	// Record user play activity with spending
	recordUserPlayActivity: async (userId, amountSpent = 0) => {
		try {
			const loyalty = await recordPlayActivity(userId, amountSpent);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error recording play activity:', error);
			return { success: false, error: error.message };
		}
	},

	// NEW: Record daily login
	recordDailyLogin: async (userId) => {
		try {
			const loyalty = await recordDailyLogin(userId);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error recording daily login:', error);
			return { success: false, error: error.message };
		}
	},

	// NEW: Update session time
	updateUserSessionTime: async (userId, sessionMinutes) => {
		try {
			const loyalty = await updateSessionTime(userId, sessionMinutes);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error updating session time:', error);
			return { success: false, error: error.message };
		}
	},

	// NEW: Record win activity
	recordUserWin: async (userId) => {
		try {
			const loyalty = await recordWinActivity(userId);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error recording win:', error);
			return { success: false, error: error.message };
		}
	},

	// Record user deposit
	recordUserDeposit: async (userId, amount) => {
		try {
			const loyalty = await recordDeposit(userId, amount);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error recording deposit:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Tier Management =====

	// Evaluate user tier
	evaluateUserTier: async (userId) => {
		try {
			const loyalty = await evaluateUserTier(userId);
			return { success: true, loyalty };
		} catch (error) {
			console.error('Error evaluating tier:', error);
			return { success: false, error: error.message };
		}
	},

	// Get user loyalty profile
	getUserLoyaltyProfile: async (userId) => {
		try {
			const result = await getUserLoyalty(userId);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to get loyalty profile' };
			}
		} catch (error) {
			console.error('Error getting loyalty profile:', error);
			return { success: false, error: error.message };
		}
	},

	// Check tier eligibility (utility method)
	checkTierEligibility: async (userId, targetTier) => {
		try {
			const loyaltyResult = await getUserLoyalty(userId);
			if (loyaltyResult.status !== 200) {
				return { success: false, error: 'Failed to get loyalty profile' };
			}

			const loyalty = loyaltyResult.entity.loyalty;
			const progress = calculateTierProgress(loyalty);

			return {
				success: true,
				eligible: progress.nextTier === targetTier,
				progress,
				currentTier: loyalty.currentTier,
			};
		} catch (error) {
			console.error('Error checking tier eligibility:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Referral System =====

	// Process referral qualification
	processReferralQualification: async (refereeId) => {
		try {
			const result = await processReferralQualification(refereeId);
			return result;
		} catch (error) {
			console.error('Error processing referral qualification:', error);
			return { success: false, error: error.message };
		}
	},

	// NEW: Process referral commission
	processReferralCommission: async (refereeId, gameType, playAmount, playId) => {
		try {
			const result = await processReferralCommission(refereeId, gameType, playAmount, playId);
			return result;
		} catch (error) {
			console.error('Error processing referral commission:', error);
			return { success: false, error: error.message };
		}
	},

	// Get referral statistics for a user
	getUserReferralStats: async (userId) => {
		try {
			const loyaltyResult = await getUserLoyalty(userId);
			if (loyaltyResult.status !== 200) {
				return { success: false, error: 'Failed to get loyalty profile' };
			}

			const loyalty = loyaltyResult.entity.loyalty;

			return {
				success: true,
				totalReferrals: loyalty.referralBenefits.length,
				qualifiedReferrals: loyalty.referralBenefits.filter(ref => ref.qualified).length,
				totalXPEarned: loyalty.referralBenefits.reduce((sum, ref) => sum + ref.earnedXP, 0),
				currentTier: loyalty.currentTier,
				referralCommissions: loyalty.referralCommissions,
			};
		} catch (error) {
			console.error('Error getting referral stats:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Cashback Methods =====

	// NEW: Check no-win cashback eligibility
	checkNoWinCashback: async (userId) => {
		try {
			const result = await checkNoWinCashbackEligibility(userId);
			return { success: true, ...result };
		} catch (error) {
			console.error('Error checking no-win cashback:', error);
			return { success: false, error: error.message };
		}
	},

	// NEW: Process no-win cashback
	processNoWinCashback: async () => {
		try {
			const result = await processNoWinCashback();
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to process no-win cashback' };
			}
		} catch (error) {
			console.error('Error processing no-win cashback:', error);
			return { success: false, error: error.message };
		}
	},

	// Get user's cashback history
	getUserCashbackHistory: async (userId) => {
		try {
			const loyaltyResult = await getUserLoyalty(userId);
			if (loyaltyResult.status !== 200) {
				return { success: false, error: 'Failed to get loyalty profile' };
			}

			const loyalty = loyaltyResult.entity.loyalty;
			const cashbackHistory = loyalty.cashbackHistory.map(cb => ({
				...cb,
				tierAtTime: loyalty.currentTier,
			}));

			return { success: true, cashbackHistory };
		} catch (error) {
			console.error('Error getting cashback history:', error);
			return { success: false, error: error.message };
		}
	},

	// ===== Transaction History =====

	// Get user XP history
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

	// ===== Withdrawal Management =====

	// Check weekly withdrawal limit
	checkUserWithdrawalLimit: async (userId) => {
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

	// Record withdrawal usage
	recordUserWithdrawal: async (userId, amount) => {
		try {
			const result = await recordWithdrawalUsage(userId, amount);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to record withdrawal' };
			}
		} catch (error) {
			console.error('Error recording withdrawal:', error);
			return { success: false, error: error.message };
		}
	},

	// Get withdrawal processing time
	getUserWithdrawalTime: async (userId) => {
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

	// ===== Admin Functions =====

	// Manual tier upgrade
	upgradeUserTier: async (userId, targetTier) => {
		try {
			const result = await manualTierUpgrade(userId, targetTier);
			if (result.status === 200) {
				return result.entity;
			} else {
				return { success: false, error: result.entity?.error || 'Failed to upgrade tier' };
			}
		} catch (error) {
			console.error('Error upgrading tier:', error);
			return { success: false, error: error.message };
		}
	},

	// Cleanup deposit data
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

	// ===== Analytics Methods =====

	// Get loyalty system statistics
	getLoyaltyStatistics: async () => {
		try {
			const { LoyaltyProfile, LoyaltyTransaction } = await import('./model');

			const tierDistribution = await LoyaltyProfile.aggregate([
				{
					$group: {
						_id: '$currentTier',
						count: { $sum: 1 },
					},
				},
			]);

			const totalUsers = await LoyaltyProfile.countDocuments();
			const activeUsers = await LoyaltyProfile.countDocuments({
				'tierProgress.lastPlayDate': {
					$gte: moment().subtract(30, 'days').toDate(),
				},
			});

			const totalXPAwarded = await LoyaltyTransaction.aggregate([
				{
					$group: {
						_id: null,
						total: { $sum: '$xpAmount' },
					},
				},
			]);

			return {
				success: true,
				statistics: {
					tierDistribution,
					totalUsers,
					activeUsers,
					totalXPAwarded: totalXPAwarded[0]?.total || 0,
				},
			};
		} catch (error) {
			console.error('Error getting loyalty statistics:', error);
			return { success: false, error: error.message };
		}
	},
};