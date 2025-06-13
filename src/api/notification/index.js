import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token, isAdmin } from '../../services/passport';
import {
	getSelfNotification,
	markNotificationRead,
	create,
	list,
	show,
	remove,
} from './controller';

const router = new Router();

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getSelfNotification(req.user, req.query)),
);

router.get(
	'/list',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await list(req.query)),
);

router.get('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await show(req.params, req.user, req.query)),
);

router.put('/read', xApi(), token({ required: true }), async (req, res) =>
	done(res, await markNotificationRead(req.user)),
);

router.post(
	'/',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await create(req.body, req.user)),
);

router.delete(
	'/:messageId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await remove(req.params)),
);

export default router;
