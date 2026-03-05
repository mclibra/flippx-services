import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	getLotteryDashboard,
	getApplicationDashboard,
	stateReport,
	allStatesSummary,
	showAllTickets,
	create,
	update,
	preview,
	publish,
	remove,
} from './controller';

const router = new Router();

// ===== LOTTERY MANAGEMENT =====

/**
 * GET /api/admin/lottery-management/dashboard
 * Get lottery dashboard with statistics, revenue, and upcoming lotteries
 * Requires ADMIN role
 */
router.get(
	'/dashboard',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getLotteryDashboard(req.params, req.user))
);

/**
 * GET /api/admin/lottery-management/application-dashboard
 * Get comprehensive application dashboard overview with Real and Virtual monetary separation
 * Requires ADMIN role
 */
router.get(
	'/application-dashboard',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getApplicationDashboard(req.params, req.user))
);

/**
 * GET /api/admin/lottery-management/state/:stateId/report
 * Get detailed report for a specific state
 * Requires ADMIN role
 * Params: stateId - State ID
 */
router.get(
	'/state/:stateId/report',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await stateReport(req.params, req.user))
);

/**
 * GET /api/admin/lottery-management/states/summary
 * Get summary of all states with lottery statistics
 * Requires ADMIN role
 */
router.get(
	'/states/summary',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await allStatesSummary(req.params, req.user))
);

/**
 * GET /api/admin/lottery-management/:id
 * Get all tickets for a lottery (admin view - sees all tickets)
 * Requires ADMIN role
 * Params: id - Lottery ID
 * Query Parameters:
 * - offset: Pagination offset
 * - limit: Items per page
 * - startDate: Filter by creation date start (timestamp)
 * - endDate: Filter by creation date end (timestamp)
 * - sortBy: Sort field (default: purchasedOn)
 * - sortOrder: Sort order (asc/desc, default: desc)
 */
router.get(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await showAllTickets(req.params, req.query))
);

/**
 * POST /api/admin/lottery-management
 * Create a new lottery
 * Requires ADMIN role
 * Body: {
 *   title: string (required),
 *   type: string (required) - BORLETTE or MEGAMILLION,
 *   scheduledTime: number (required) - timestamp,
 *   state: string (required) - State ID,
 *   jackpotAmount: number (optional) - for MEGAMILLION,
 *   metadata: string (optional),
 *   restrictions: object (optional) - lottery restrictions
 * }
 */
router.post(
	'/',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await create(req.body, req.user))
);

/**
 * PUT /api/admin/lottery-management/:id
 * Update a lottery
 * Requires ADMIN role
 * Params: id - Lottery ID
 * Body: {
 *   state: string (optional) - State ID,
 *   restrictions: object (optional) - lottery restrictions
 * }
 */
router.put(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await update(req.params, req.body, req.user))
);

/**
 * PUT /api/admin/lottery-management/preview/:id
 * Preview lottery results before publishing
 * Requires ADMIN role
 * Params: id - Lottery ID
 * Body: {
 *   numbers: array (required) - Array of 3 winning numbers
 * }
 */
router.put(
	'/preview/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await preview(req.params, req.body))
);

/**
 * PUT /api/admin/lottery-management/publish/:id
 * Publish lottery results
 * Requires ADMIN role
 * Params: id - Lottery ID
 * Body: {
 *   numbers: array (required) - Array of winning numbers,
 *   megaBall: number (optional) - for MEGAMILLION
 * }
 */
router.put(
	'/publish/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await publish(req.params, req.body, req.user))
);

/**
 * DELETE /api/admin/lottery-management/:id
 * Delete a lottery
 * Requires ADMIN role
 * Params: id - Lottery ID
 */
router.delete(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await remove(req.params, req.user))
);

export default router;
