import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
    getTierRequirements,
    getTierRequirement,
    createTierRequirement,
    updateTierRequirement,
    deactivateTierRequirement,
    reactivateTierRequirement,
    initializeDefaultTierRequirements,
} from './controller';

const router = new Router();

// ===== TIER REQUIREMENTS MANAGEMENT =====

/**
 * GET /api/admin/users/requirements
 * Get all tier requirements configuration
 * Query Parameters:
 * - includeInactive: Include deactivated tiers (default: false)
 */
router.get(
    '/requirements',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getTierRequirements(req.query))
);

/**
 * GET /api/admin/users/requirements/:name
 * Get specific tier requirements configuration
 * Params: name
 */
router.get(
    '/requirements/:name',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getTierRequirement(req.params.name))
);

/**
 * POST /api/admin/users/requirements
 * Create new tier requirements configuration
 * Body: {
 *   name: string,
 *   benefits: {
 *     weeklyWithdrawalLimit: number,
 *     withdrawalTime: number,
 *     weeklyCashbackPercentage: number,
 *     monthlyCashbackPercentage: number,
 *     referralXP: number,
 *     noWinCashbackPercentage: number,
 *     noWinCashbackDays: number
 *   },
 *   requirements: {
 *     previousTier: string,
 *     previousTierDays: number,
 *     depositAmount30Days: number,
 *     depositAmount60Days: number,
 *     depositAmount90Days: number,
 *     daysPlayedPerWeek: number,
 *     weeklySpendAmount: number,
 *     dailySessionMinutes: number,
 *     daysRequired: number,
 *     requireIDVerification: boolean,
 *     dailyLoginRequired: boolean
 *   },
 *   referralCommissions: {
 *     borlette: { perPlay: number, monthlyCap: number },
 *     roulette: { per100Spins: number, monthlyCap: number },
 *     dominoes: { per100Wagered: number, monthlyCap: number }
 *   },
 *   downgrades: {
 *     inactivityDaysMin: number,
 *     inactivityDaysMax: number
 *   }
 * }
 */
router.post(
    '/requirements',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await createTierRequirement(req.body, req.user))
);

/**
 * PUT /api/admin/users/requirements/:name
 * Update tier requirements configuration
 * Params: name
 * Body: Partial tier requirements data (same structure as POST)
 */
router.put(
    '/requirements/:name',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await updateTierRequirement(req.params.name, req.body, req.user))
);

/**
 * DELETE /api/admin/users/requirements/:name
 * Deactivate tier requirements configuration (soft delete)
 * Params: name
 */
router.delete(
    '/requirements/:name',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await deactivateTierRequirement(req.params.name, req.user))
);

/**
 * POST /api/admin/users/requirements/:name
 * Reactivate tier requirements configuration (soft delete)
 * Params: name
 */
router.post(
    '/requirements/:name',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await reactivateTierRequirement(req.params.name, req.user))
);

/**
 * POST /api/admin/users/requirements/initialize
 * Initialize default tier requirements (one-time setup)
 * This will create all default tier configurations if none exist
 */
router.post(
    '/requirements/initialize',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await initializeDefaultTierRequirements(req.user))
);

export default router;