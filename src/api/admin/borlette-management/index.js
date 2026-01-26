import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	listBorlette,
	getBorletteDetails,
	createLotteryRestriction,
	updateLotteryRestriction,
	createPopularNumbers,
	updatePopularNumbers,
	removePopularNumbers,
} from './controller';

const router = new Router();

// ===== BORLETTE MANAGEMENT =====

/**
 * GET /api/admin/borlette-management
 * List borlette lotteries with pagination, sorting and filtering
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - status: Filter by status (SCHEDULED, WAITING, COMPLETED, CANCELLED, ERROR)
 * - stateId: Filter by state ID
 * - type: Lottery type (default: BORLETTE)
 * - startDate: Filter by creation date start (timestamp)
 * - endDate: Filter by creation date end (timestamp)
 * - search: Search by title or metadata
 * - sortBy: Sort field (default: createdAt)
 * - sortOrder: Sort order (asc/desc, default: desc)
 * - minAmount: Minimum ticket amount to filter by
 * - maxAmount: Maximum ticket amount to filter by
 * - cashType: Filter by cash type (REAL, VIRTUAL)
 */
router.get(
	'',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listBorlette(req.query))
);

/**
 * GET /api/admin/borlette-management/:id
 * Get detailed borlette lottery information
 * Includes: all tickets, winning numbers, winning amount, lottery configuration and restrictions
 * Params: id - Lottery ID
 */
router.get(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getBorletteDetails(req.params.id))
);

/**
 * POST /api/admin/borlette-management/restrictions
 * Create lottery restrictions for a borlette lottery
 * Body: {
 *   lotteryId: string (required),
 *   twoDigit: number (optional),
 *   threeDigit: number (optional),
 *   fourDigit: number (optional),
 *   marriageNumber: number (optional),
 *   individualNumber: [
 *     {
 *       number: string (required),
 *       limit: number (required)
 *     }
 *   ] (optional)
 * }
 */
router.post(
	'/restrictions',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await createLotteryRestriction(req.body, req.user))
);

/**
 * PUT /api/admin/borlette-management/restrictions/:lotteryId
 * Update lottery restrictions for a borlette lottery
 * Params: lotteryId - Lottery ID
 * Body: {
 *   twoDigit: number (optional),
 *   threeDigit: number (optional),
 *   fourDigit: number (optional),
 *   marriageNumber: number (optional),
 *   individualNumber: [
 *     {
 *       number: string (required),
 *       limit: number (required)
 *     }
 *   ] (optional)
 * }
 */
router.put(
	'/restrictions/:lotteryId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(
			res,
			await updateLotteryRestriction(
				req.params.lotteryId,
				req.body,
				req.user
			)
		)
);

/**
 * POST /api/admin/borlette-management/popular-numbers
 * Create popular numbers for a state or global
 * Body: {
 *   stateId: string (optional) - If null/omitted, creates global popular numbers
 *   numbers: string[] (required) - Array of 2 or 3 digit numbers
 * }
 */
router.post(
	'/popular-numbers',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await createPopularNumbers(req.body, req.user))
);

/**
 * PUT /api/admin/borlette-management/popular-numbers/:stateId
 * Update popular numbers for a state or global
 * Params: stateId - State ID or "global" for global popular numbers
 * Body: {
 *   numbers: string[] (required) - Array of 2 or 3 digit numbers
 * }
 */
router.put(
	'/popular-numbers/:stateId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(
			res,
			await updatePopularNumbers(req.params.stateId, req.body, req.user)
		)
);

/**
 * DELETE /api/admin/borlette-management/popular-numbers/:stateId
 * Remove popular numbers for a state or global
 * Params: stateId - State ID or "global" for global popular numbers
 */
router.delete(
	'/popular-numbers/:stateId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await removePopularNumbers(req.params.stateId, req.user))
);

export default router;
