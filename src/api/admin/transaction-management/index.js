import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	commissionSummaryByAgent,
	getTierBasedPayoutAnalytics,
	getRevenueImpactComparison,
} from './controller';

const router = new Router();

/**
 * GET /api/admin/transaction-management/commission/summary
 * Get commission summary by agent (Admin Only)
 * Query Parameters:
 * - agentId: Specific agent ID to filter (optional)
 * - startDate: Start date for date range filter (ISO 8601 format)
 * - endDate: End date for date range filter (ISO 8601 format)
 */
router.get(
	'/commission/summary',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await commissionSummaryByAgent(req.user, req.query))
);

/**
 * GET /api/admin/transaction-management/analytics/tier-payouts
 * Get tier-based payout analytics (Admin Only)
 * Query Parameters:
 * - startDate: Start date for date range filter (ISO 8601 format)
 * - endDate: End date for date range filter (ISO 8601 format)
 * - tier: Filter by specific tier (e.g., BRONZE, SILVER, GOLD)
 * - gameType: Filter by game type
 */
router.get(
	'/analytics/tier-payouts',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getTierBasedPayoutAnalytics(req.query, req.user))
);

/**
 * GET /api/admin/transaction-management/analytics/revenue-impact
 * Get revenue impact comparison (before vs after tier implementation) (Admin Only)
 * Query Parameters: None (uses predefined tier implementation date)
 */
router.get(
	'/analytics/revenue-impact',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getRevenueImpactComparison(req.query, req.user))
);

export default router;
