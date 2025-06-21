import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
    getCurrentConfigurations,
    setCollectionPercentage,
    updateCollectionConfiguration,
    getCollectionAnalytics,
} from './controller';

const router = new Router();

// Get current collection configurations
router.get(
    '/current',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getCurrentConfigurations(req.query, req.user))
);

// Set collection percentage
router.post(
    '/set-percentage',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await setCollectionPercentage(req.body, req.user))
);

// Update collection configuration
router.put(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await updateCollectionConfiguration(req.params, req.body, req.user))
);

// Get collection analytics
router.get(
    '/analytics',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getCollectionAnalytics(req.query, req.user))
);

export default router;