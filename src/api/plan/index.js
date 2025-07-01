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
    getUserPlans,
} from './controller';

const router = new Router();

// Get all plans (public)
router.get('/', xApi(), async (req, res) =>
    done(res, await list(req.query))
);

// Get user's own plans
router.get('/my-plans', xApi(), token({ required: true }), async (req, res) =>
    done(res, await getUserPlans(req.user, req.query))
);

// Get plan by ID
router.get('/:id', xApi(), async (req, res) =>
    done(res, await show(req.params))
);

// Get plan analytics (Admin only)
router.get('/:id/analytics', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) =>
    done(res, await getPlanAnalytics(req.params, req.query))
);

// Create new plan (Admin only)
router.post('/', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) =>
    done(res, await create(req.body, req.user))
);

// Update plan (Admin only)
router.put('/:id', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) =>
    done(res, await update(req.params, req.body, req.user))
);

// Deprecate plan (Admin only)
router.delete('/:id', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) =>
    done(res, await remove(req.params, req.user))
);

export default router;