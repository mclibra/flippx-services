import { Router } from 'express';
import { done } from '../../services/response/';
import { token, xApi } from '../../services/passport';
import {
	getUserLoyalty,
	getUserXPHistory,
	checkWeeklyWithdrawalLimit,
	recordWithdrawalUsage,
	getWithdrawalTime,
	processReferralQualification,
	manualTierUpgrade,
	cleanupDepositData,
	// NEW endpoints
	processNoWinCashback,
	checkNoWinCashbackEligibility,
	updateSessionTime,
} from './controller';
import { LoyaltyService } from './service';

const router = new Router();

// ===== USER ROUTES (protected) =====

// Get user's loyalty profile
router.get(
	'/profile',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getUserLoyalty(req.user._id))
);

// Get user's XP transaction history
router.get(
	'/xp-history',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getUserXPHistory(req.user._id, req.query))
);

// Check weekly withdrawal limit
router.get(
	'/withdrawal-limit',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await checkWeeklyWithdrawalLimit(req.user._id))
);

// Get withdrawal processing time
router.get(
	'/withdrawal-time',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getWithdrawalTime(req.user._id))
);

// NEW: Update session time (called periodically by frontend)
router.post(
	'/session-time',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const { sessionMinutes } = req.body;
		if (!sessionMinutes || sessionMinutes < 0) {
			return done(res, {
				status: 400,
				entity: {
					success: false,
					error: 'Valid sessionMinutes required',
				},
			});
		}
		done(res, await updateSessionTime(req.user._id, sessionMinutes));
	}
);

// NEW: Check no-win cashback eligibility
router.get(
	'/no-win-cashback/check',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const result = await checkNoWinCashbackEligibility(req.user._id);
		done(res, {
			status: 200,
			entity: {
				success: true,
				...result,
			},
		});
	}
);

// Get referral statistics
router.get(
	'/referral-stats',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const stats = await LoyaltyService.getUserReferralStats(req.user._id);
		done(res, {
			status: stats.success ? 200 : 500,
			entity: stats,
		});
	}
);

// Get cashback history
router.get(
	'/cashback-history',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const history = await LoyaltyService.getUserCashbackHistory(req.user._id);
		done(res, {
			status: history.success ? 200 : 500,
			entity: history,
		});
	}
);

// ===== ADMIN ROUTES =====

// Get user's loyalty profile (admin view)
router.get(
	'/user/:userId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getUserLoyalty(req.params.userId))
);

// Manual tier upgrade
router.post(
	'/upgrade-tier/:userId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => {
		const { tier } = req.body;
		if (!tier || !['SILVER', 'GOLD', 'VIP'].includes(tier)) {
			return done(res, {
				status: 400,
				entity: {
					success: false,
					error: 'Valid tier (SILVER, GOLD, VIP) is required',
				},
			});
		}
		done(res, await manualTierUpgrade(req.params.userId, tier));
	}
);

// NEW: Process no-win cashback for all eligible users
router.post(
	'/process-no-win-cashback',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await processNoWinCashback())
);

// Cleanup deposit data
router.post(
	'/cleanup-data',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await cleanupDepositData())
);

// ===== ANALYTICS ROUTES (ADMIN) =====

// Get loyalty tier distribution
router.get(
	'/analytics/tier-distribution',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => {
		try {
			const { LoyaltyProfile } = require('./model');
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

			done(res, {
				status: 200,
				entity: {
					success: true,
					distribution,
				},
			});
		} catch (error) {
			done(res, {
				status: 500,
				entity: {
					success: false,
					error: error.message || 'Failed to get tier distribution',
				},
			});
		}
	}
);

// Get cashback summary
router.get(
	'/analytics/cashback-summary',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => {
		try {
			const { LoyaltyTransaction } = require('./model');
			const { period = 'month' } = req.query;

			let startDate;
			if (period === 'week') {
				startDate = new Date();
				startDate.setDate(startDate.getDate() - 7);
			} else if (period === 'month') {
				startDate = new Date();
				startDate.setMonth(startDate.getMonth() - 1);
			} else {
				startDate = new Date(0); // All time
			}

			const cashbackSummary = await LoyaltyTransaction.aggregate([
				{
					$match: {
						transactionType: 'CASHBACK',
						createdAt: { $gte: startDate },
					},
				},
				{
					$group: {
						_id: '$tier',
						totalAmount: { $sum: '$xpAmount' },
						count: { $sum: 1 },
					},
				},
				{
					$sort: { _id: 1 },
				},
			]);

			done(res, {
				status: 200,
				entity: {
					success: true,
					period,
					cashbackSummary,
				},
			});
		} catch (error) {
			done(res, {
				status: 500,
				entity: {
					success: false,
					error: error.message || 'Failed to get cashback summary',
				},
			});
		}
	}
);

// NEW: Get referral commission summary
router.get(
	'/analytics/referral-commissions',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => {
		try {
			const { ReferralCommission } = require('./model');
			const { startDate, endDate } = req.query;

			let dateQuery = {};
			if (startDate || endDate) {
				dateQuery.createdAt = {};
				if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
				if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
			}

			const commissionSummary = await ReferralCommission.aggregate([
				{
					$match: dateQuery,
				},
				{
					$group: {
						_id: {
							gameType: '$gameType',
							referrerTier: '$referrerTier',
						},
						totalCommissions: { $sum: '$commissionAmount' },
						totalPlays: { $sum: 1 },
						totalPlayAmount: { $sum: '$playAmount' },
					},
				},
				{
					$sort: { '_id.gameType': 1, '_id.referrerTier': 1 },
				},
			]);

			done(res, {
				status: 200,
				entity: {
					success: true,
					commissionSummary,
					dateRange: { startDate, endDate },
				},
			});
		} catch (error) {
			done(res, {
				status: 500,
				entity: {
					success: false,
					error: error.message || 'Failed to get commission summary',
				},
			});
		}
	}
);

// Get system statistics
router.get(
	'/analytics/system-stats',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => {
		const stats = await LoyaltyService.getLoyaltyStatistics();
		done(res, {
			status: stats.success ? 200 : 500,
			entity: stats,
		});
	}
);

// ===== INTERNAL ROUTES (called by other services) =====

// Process referral qualification (internal)
router.post(
	'/internal/referral-qualification/:refereeId',
	xApi(),
	async (req, res) => {
		const result = await processReferralQualification(req.params.refereeId);
		done(res, {
			status: result.success ? 200 : 400,
			entity: result,
		});
	}
);

// Record withdrawal usage (internal)
router.post(
	'/internal/withdrawal-usage/:userId',
	xApi(),
	async (req, res) => {
		const { amount } = req.body;
		if (!amount || amount <= 0) {
			return done(res, {
				status: 400,
				entity: {
					success: false,
					error: 'Valid amount required',
				},
			});
		}
		done(res, await recordWithdrawalUsage(req.params.userId, amount));
	}
);

export default router;