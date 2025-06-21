import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
    getCurrentConfigurations,
    setPayoutConfiguration,
    updatePayoutConfiguration,
    deactivateConfiguration,
    getConfigurationHistory,
    getPayoutAnalytics,
    validateTierPayoutSystem,
    testTierPayoutCalculation,
} from './controller';

const router = new Router();

// ===== ADMIN ROUTES (All require ADMIN role) =====

// Get current active payout configurations
router.get(
    '/current',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getCurrentConfigurations(req.query, req.user))
);

// Set new payout configuration
router.post(
    '/',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await setPayoutConfiguration(req.body, req.user))
);

// Update existing payout configuration
router.put(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await updatePayoutConfiguration(req.params, req.body, req.user))
);

// Deactivate payout configuration
router.delete(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await deactivateConfiguration(req.params, req.user))
);

// Get configuration history
router.get(
    '/history',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getConfigurationHistory(req.query, req.user))
);

// Get payout analytics
router.get(
    '/analytics',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getPayoutAnalytics(req.query, req.user))
);

// NEW: Validate tier-based payout system
router.get(
    '/validate-system',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await validateTierPayoutSystem(req.query, req.user))
);

// NEW: Test tier-based payout calculation
router.post(
    '/test-calculation',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await testTierPayoutCalculation(req.body, req.user))
);

export default router;