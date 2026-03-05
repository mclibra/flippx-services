import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	listRoulette,
	getRouletteDetails,
	setTemporaryWinningNumber,
} from './controller';

const router = new Router();

// ===== ROULETTE MANAGEMENT =====

/**
 * GET /api/admin/roulette-management
 * List roulette games with pagination, sorting and filtering
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - status: Filter by status (SCHEDULED, COMPLETED, CANCELLED)
 * - startDate: Filter by creation date start (timestamp)
 * - endDate: Filter by creation date end (timestamp)
 * - sortBy: Sort field (default: createdAt)
 * - sortOrder: Sort order (asc/desc, default: desc)
 */
router.get(
	'',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listRoulette(req.query))
);

/**
 * GET /api/admin/roulette-management/:id
 * Get detailed roulette game information
 * Includes: all tickets, winning number, winning amount, and all related data
 * Params: id - Roulette ID
 */
router.get(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getRouletteDetails(req.params.id))
);

/**
 * POST /api/admin/roulette-management/temporary-winning-number
 * Set or clear a temporary winning number that applies to all roulettes
 * Body:
 * - winningNumber: number (0-36). Omit or set to null to clear.
 * - expiresAt: ISO date string or timestamp (optional)
 * - expiresInSeconds: number of seconds until expiry (optional)
 */
router.post(
	'/temporary-winning-number',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await setTemporaryWinningNumber(req.body, req.user))
);

export default router;
