import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
    getRooms,
    leaveRoom,
    makeMove,
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

// ===================== ROOM MANAGEMENT =====================

// Get available rooms (for browsing/display purposes)
router.get('/rooms', xApi(), token({ required: true }), async (req, res) =>
    done(res, await getRooms(req.query, req.user))
);

// Leave room (still needed for HTTP fallback)
router.post('/rooms/:roomId/leave', xApi(), token({ required: true }), async (req, res) =>
    done(res, await leaveRoom(req.params, req.user))
);

// ===================== GAME ACTIONS =====================

// Make a move in the game
router.post('/games/:gameId/move', xApi(), token({ required: true }), async (req, res) =>
    done(res, await makeMove(req.params, req.body, req.user))
);

// Get current game state
router.get('/games/:gameId', xApi(), token({ required: true }), async (req, res) =>
    done(res, await getGameState(req.params, req.user))
);

// Handle turn timeout
router.post('/games/:gameId/timeout', xApi(), token({ required: true }), async (req, res) => {
    await handleTurnTimeout(req.params.gameId, req.user._id);
    done(res, { status: 200, entity: { success: true } });
});

// ===================== GAME HISTORY =====================

// Get user's game history
router.get('/history', xApi(), token({ required: true }), async (req, res) =>
    done(res, await getUserGameHistory(req.user, req.query))
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