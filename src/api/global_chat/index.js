import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	getChatHistory,
	deleteMessage,
	muteUser,
	unmuteUser,
	getMutedUsers,
	getOnlineUsers,
	reportMessage,
	reportUser,
} from './controller';

const router = new Router();

// Get chat history (authenticated users)
router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getChatHistory(req.query, req.user))
);

// Get online users count (authenticated users)
router.get('/online', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getOnlineUsers())
);

// Get muted users list (admin only)
router.get(
	'/muted',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getMutedUsers(req.query, req.user))
);

// Report message (authenticated users)
router.post(
	'/report/message',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await reportMessage(req.body, req.user))
);

// Report user (authenticated users)
router.post(
	'/report/user',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await reportUser(req.body, req.user))
);

// Delete message (admin only)
router.delete(
	'/message/:messageId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await deleteMessage(req.params, req.user))
);

// Mute user (admin only)
router.post(
	'/mute',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await muteUser(req.body, req.user))
);

// Unmute user (admin only)
router.delete(
	'/mute/:userId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await unmuteUser(req.params, req.user))
);

export default router;

