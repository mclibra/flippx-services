import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	listMegamillion,
	getMegamillionDetails,
	createLotteryRestriction,
	updateLotteryRestriction,
	getDefaultJackpotAmount,
	setDefaultJackpotAmount,
} from './controller';

const router = new Router();

// ===== MEGAMILLION MANAGEMENT =====

/**
 * GET /api/admin/megamillion-management
 * List megamillion lotteries with pagination, sorting and filtering
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - status: Filter by status (SCHEDULED, WAITING, COMPLETED, CANCELLED, ERROR)
 * - stateId: Filter by state ID
 * - type: Lottery type (default: MEGAMILLION)
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
	async (req, res) => done(res, await listMegamillion(req.query))
);

/**
 * GET /api/admin/megamillion-management/:id
 * Get detailed megamillion lottery information
 * Includes: all tickets, winning numbers, winning amount, lottery configuration and restrictions
 * Params: id - Lottery ID
 */
router.get(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getMegamillionDetails(req.params.id))
);

/**
 * POST /api/admin/megamillion-management/restrictions
 * Create lottery restrictions for a megamillion lottery
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
 * PUT /api/admin/megamillion-management/restrictions/:lotteryId
 * Update lottery restrictions for a megamillion lottery
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
 * GET /api/admin/megamillion-management/default-jackpot
 * Get the default jackpot amount for MEGAMILLION lotteries
 */
router.get(
	'/default-jackpot',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getDefaultJackpotAmount())
);

/**
 * PUT /api/admin/megamillion-management/default-jackpot
 * Set the default jackpot amount for MEGAMILLION lotteries
 * Body: {
 *   defaultJackpotAmount: number (required),
 *   description: string (optional)
 * }
 */
router.put(
	'/default-jackpot',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await setDefaultJackpotAmount(req.body, req.user))
);

export default router;
