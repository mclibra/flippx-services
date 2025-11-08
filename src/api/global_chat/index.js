import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	getChatHistory,
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

export default router;
