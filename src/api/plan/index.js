// This file should be created as src/api/plan/index.js
// And imported into the main API routes file

import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
    list,
    create,
    show,
    update,
    remove,
    getPlanAnalytics,
    purchasePlan
} from './controller';

const router = new Router();

// ===== PUBLIC/USER ROUTES =====

// Get all active plans available for purchase (for users)
router.get('/available', xApi(), token({ required: true }), async (req, res) =>
    done(res, await list({ ...req.query, status: 'ACTIVE', isAvailableForPurchase: 'true' }))
);

// Purchase a plan (for users)
router.post(
    '/:id/purchase',
    xApi(),
    token({ required: true }),
    async (req, res) => done(res, await purchasePlan(req.params, req.user))
);

// ===== ADMIN ROUTES =====

// Get all plans (with filters)
router.get(
    '/',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await list(req.query))
);

// Get specific plan details
router.get(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await show(req.params))
);

// Create new plan
router.post(
    '/',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await create(req.body, req.user))
);

// Update existing plan
router.put(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await update(req.params, req.body, req.user))
);

// Deprecate plan (soft delete)
router.delete(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await remove(req.params, req.user))
);

// Get plan analytics and statistics
router.get(
    '/:id/analytics',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getPlanAnalytics(req.params, req.query))
);

export default router;