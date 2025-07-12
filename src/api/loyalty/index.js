import { Router } from 'express';
import { done } from '../../services/response/';
import { token, xApi } from '../../services/passport';
import {
	getUserLoyalty,
	getUserXPHistory,
	checkWeeklyWithdrawalLimit,
	getWithdrawalTime,
	checkNoWinCashbackEligibility,
	updateSessionTime,
} from './controller';
import { LoyaltyService } from './service';

const router = new Router();

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

export default router;