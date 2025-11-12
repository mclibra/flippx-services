import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import { sendInvites, getInviteStatuses } from './controller';

const router = new Router();

router.post(
	'/',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await sendInvites(req.body, req.user))
);

router.post(
	'/status',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getInviteStatuses(req.body, req.user))
);

export default router;


