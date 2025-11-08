import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	listChatMessages,
	deleteChatMessage,
	muteChatUser,
	unmuteChatUser,
	getChatStatus,
	updateChatStatus,
} from './controller';

const router = new Router();

router.get(
	'/messages',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listChatMessages(req.query))
);

router.delete(
	'/messages/:messageId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await deleteChatMessage(req.params, req.user))
);

router.post(
	'/mutes',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await muteChatUser(req.body, req.user))
);

router.delete(
	'/mutes/:userId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await unmuteChatUser(req.params, req.user))
);

router.get(
	'/status',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getChatStatus())
);

router.patch(
	'/status',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await updateChatStatus(req.body, req.user))
);

export default router;


