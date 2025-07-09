import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
    getRooms,
    leaveRoom,
    getGameState,
    getUserGameHistory,
    sendMessage,
    getChatHistory,
    updateGameConfig,
    getGameConfig,
    handleTurnTimeout,
    removeDisconnectedPlayersFromWaitingRooms,
    sendTurnWarnings
} from './controller';

const router = new Router();

// Leave room
router.post('/rooms/:roomId/leave', xApi(), token({ required: true }), async (req, res) =>
    done(res, await leaveRoom(req.params, req.user))
);

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

// ===================== ADMIN MAINTENANCE =====================

// Manually trigger cleanup of disconnected players (Admin only)
router.post('/admin/cleanup-disconnected', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) =>
    done(res, await removeDisconnectedPlayersFromWaitingRooms())
);

// Manually trigger turn warnings (Admin only)
router.post('/admin/send-turn-warnings', xApi(), token({ required: true, roles: ['ADMIN'] }), async (req, res) => {
    await sendTurnWarnings();
    done(res, { status: 200, entity: { success: true, message: 'Turn warnings sent' } });
});

export default router;