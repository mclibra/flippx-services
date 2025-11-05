import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	listBorlette,
	getBorletteDetails,
	createLotteryRestriction,
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
	async (req, res) =>
		done(res, await getBorletteDetails(req.params.id))
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

export default router;

