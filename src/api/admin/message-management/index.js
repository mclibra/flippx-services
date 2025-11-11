import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	listMessages,
	getMessageDetails,
	updateMessageStatus,
	replyToMessage,
} from './controller';

const router = new Router();

router.get(
	'/messages',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listMessages(req.query))
);

router.get(
	'/messages/:messageId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getMessageDetails(req.params))
);

router.patch(
	'/messages/:messageId/status',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await updateMessageStatus(req.params, req.body, req.user))
);

router.post(
	'/messages/:messageId/replies',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await replyToMessage(req.params, req.body, req.user))
);

export default router;

