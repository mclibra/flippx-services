import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	createMessage,
	listMessages,
	getMessageById,
} from './controller';

const router = new Router();

router.post(
	'/',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await createMessage(req.body, req.user))
);

router.get(
	'/',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await listMessages(req.query, req.user))
);

router.get(
	'/:messageId',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getMessageById(req.params, req.user))
);

export default router;

