import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
    sendMessage,
    getChatHistory,
    updateGameConfig,
    getGameConfig
} from './controller';

const router = new Router();

// ===================== CHAT FUNCTIONALITY =====================

// Send message in room
router.post('/rooms/:roomId/chat', xApi(), token({ required: true }), async (req, res) =>
    done(res, await sendMessage(req.params, req.body, req.user))
);

// Get chat history
router.get('/rooms/:roomId/chat', xApi(), token({ required: true }), async (req, res) =>
    done(res, await getChatHistory(req.params, req.query, req.user))
);

// ===================== ADMIN CONFIGURATION =====================

// Update game configuration (Admin only)
router.put('/config', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) =>
    done(res, await updateGameConfig(req.body, req.user))
);

// Get game configuration
router.get('/config', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) =>
    done(res, await getGameConfig())
);

export default router;