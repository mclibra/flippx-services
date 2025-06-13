import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import { list, show, nextSpin, winningNumber } from './controller';

const router = new Router();

router.get(
	'/',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await list(req.query)),
);

router.get('/nextspin', xApi(), token({ required: true }), async (req, res) =>
	done(res, await nextSpin(req.user)),
);

router.get(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await show(req.params, req.query)),
);

router.get(
	'/winningnumber/:id',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await winningNumber(req.params, req.user)),
);

export default router;
