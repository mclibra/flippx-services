import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	getDashboardOverview,
	getFinancialSummary,
	getSystemAccountActivity,
	getWithdrawalDashboard,
	getUserCashManagement,
	getGameStatisticsByCashType,
	getUserDashboard,
	getAgentDashboard,
	getDealerDashboard,
	getUserGameHistory,
	getAgentSalesStats,
	getDealerStats,
} from './controller';

const router = new Router();

// Admin dashboard endpoints (from previous response)
router.get(
	'/overview',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getDashboardOverview(req.params, req.user))
);

router.get(
	'/financial',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getFinancialSummary(req.query, req.user))
);

router.get(
	'/system-account',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getSystemAccountActivity(req.query, req.user))
);

router.get(
	'/withdrawals',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getWithdrawalDashboard(req.query, req.user))
);

router.get(
	'/users',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getUserCashManagement(req.query, req.user))
);

router.get(
	'/games/stats',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getGameStatisticsByCashType(req.query, req.user))
);

// New Role-specific dashboard endpoints

// USER dashboard
router.get('/user', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserDashboard(req.user))
);

// USER game history
router.get('/user/games', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserGameHistory(req.user, req.query))
);

// AGENT dashboard
router.get(
	'/agent',
	xApi(),
	token({ required: true, roles: ['AGENT'] }),
	async (req, res) => done(res, await getAgentDashboard(req.user))
);

// AGENT sales stats
router.get(
	'/agent/stats',
	xApi(),
	token({ required: true, roles: ['AGENT'] }),
	async (req, res) => done(res, await getAgentSalesStats(req.user, req.query))
);

// DEALER dashboard
router.get(
	'/dealer',
	xApi(),
	token({ required: true, roles: ['DEALER'] }),
	async (req, res) => done(res, await getDealerDashboard(req.user))
);

// DEALER stats
router.get(
	'/dealer/stats',
	xApi(),
	token({ required: true, roles: ['DEALER'] }),
	async (req, res) => done(res, await getDealerStats(req.user, req.query))
);

export default router;
