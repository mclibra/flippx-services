import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	approveWithdrawal,
	rejectWithdrawal,
	getAdminWithdrawals,
} from './controller';

const router = new Router();

/**
 * GET /api/admin/withdrawal-management
 * Get all withdrawals (Admin Only)
 * Query Parameters:
 * - limit: Number of records per page (default: 20)
 * - offset: Pagination offset (default: 0)
 * - status: Filter by status (PENDING, PROCESSING, COMPLETED, REJECTED, FAILED)
 * - userId: Filter by user ID
 */
router.get(
	'/',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getAdminWithdrawals(req))
);

/**
 * POST /api/admin/withdrawal-management/:id/approve
 * Approve a withdrawal (Admin Only)
 * Params: id - Withdrawal ID
 */
router.post(
	'/:id/approve',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await approveWithdrawal(req))
);

/**
 * POST /api/admin/withdrawal-management/:id/reject
 * Reject a withdrawal (Admin Only)
 * Params: id - Withdrawal ID
 * Body: {
 *   reason: string (optional) - Rejection reason
 * }
 */
router.post(
	'/:id/reject',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await rejectWithdrawal(req))
);

export default router;
