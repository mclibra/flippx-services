import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import { list, create, update, remove, show } from './controller';

const router = new Router();

router.get(
	'/',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await list(req.query))
);

router.get(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await show(req.params))
);

router.post(
	'/',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await create(req.body))
);

router.put(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await update(req.params, req.body))
);

router.delete(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await remove(req.params))
);

export default router;
