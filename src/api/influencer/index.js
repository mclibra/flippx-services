import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
    createContract,
    updateContract,
    activateContract,
    deactivateContract,
    listInfluencers,
    getInfluencerAnalytics,
} from './controller';

const router = new Router();

// Create influencer contract
router.post(
    '/create-contract',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await createContract(req.body, req.user))
);

// Update influencer contract
router.put(
    '/update-contract/:userId',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await updateContract(req.params, req.body, req.user))
);

// Activate influencer contract
router.post(
    '/activate/:userId',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await activateContract(req.params, req.user))
);

// Deactivate influencer contract
router.post(
    '/deactivate/:userId',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await deactivateContract(req.params, req.body, req.user))
);

// List all influencers
router.get(
    '/list',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await listInfluencers(req.query, req.user))
);

// Get influencer analytics
router.get(
    '/analytics',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getInfluencerAnalytics(req.query, req.user))
);

export default router;