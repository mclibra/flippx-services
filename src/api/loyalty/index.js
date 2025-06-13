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
	cleanupDepositData,
} from './controller';

const router = new Router();

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
	async (req, res) =>
		done(res, await recordWithdrawalUsage(req.user._id, req.body.amount))
);

// Get withdrawal time based on tier
router.get(
	'/withdrawal-time',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getWithdrawalTime(req.user._id))
);

// Admin routes
router.post(
	'/tier-upgrade/:userId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await manualTierUpgrade(req.params.userId, req.body.tier))
);

router.post(
	'/process-cashback',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await processWeeklyCashback())
);

router.post(
	'/cleanup-data',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await cleanupDepositData())
);

export default router;
