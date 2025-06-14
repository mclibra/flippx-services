import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	getUserLoyalty,
	getUserXPHistory,
	checkWeeklyWithdrawalLimit,
	recordWithdrawalUsage,
	getWithdrawalTime,
	manualTierUpgrade,
	processWeeklyCashback,
	processMonthlyVIPCashback,
	cleanupDepositData,
	processReferralQualification,
} from './controller';

const router = new Router();

// ===== USER ROUTES =====

// Get user's loyalty profile
router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserLoyalty(req.user._id))
);

// Get user's XP transaction history
router.get('/history', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserXPHistory(req.user._id, req.query))
);

// Check weekly withdrawal limits
router.get(
	'/withdrawal-limit',
	xApi(),
	token({ required: true }),
	async (req, res) =>
		done(res, await checkWeeklyWithdrawalLimit(req.user._id))
);

// Record withdrawal usage
router.post(
	'/withdrawal-usage',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const { amount } = req.body;
		if (!amount || amount <= 0) {
			return done(res, {
				status: 400,
				entity: {
					success: false,
					error: 'Valid withdrawal amount is required',
				},
			});
		}
		done(res, await recordWithdrawalUsage(req.user._id, amount));
	}
);

// Get withdrawal time based on tier
router.get(
	'/withdrawal-time',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getWithdrawalTime(req.user._id))
);

// Process referral qualification (can be called by system)
router.post(
	'/referral-qualification/:refereeId',
	xApi(),
	token({ required: true }),
	async (req, res) =>
		done(res, await processReferralQualification(req.params.refereeId))
);

// ===== ADMIN ROUTES =====

// Manual tier upgrade
router.post(
	'/tier-upgrade/:userId',
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

// Process weekly cashback for GOLD tier users
router.post(
	'/process-weekly-cashback',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await processWeeklyCashback())
);

// Process monthly cashback for VIP tier users
router.post(
	'/process-monthly-vip-cashback',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await processMonthlyVIPCashback())
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

export default router;