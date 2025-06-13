import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	list,
	show,
	ticketByLottery,
	listAllByLottery,
	create,
	cancelTicket,
	cashoutTicket,
	commissionSummary,
} from './controller';

const router = new Router();

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await list(req.params, req.user)),
);

router.put(
	'/cashout/:id',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await cashoutTicket(req.params, req.user)),
);

router.get(
	'/commission/summary/:id',
	xApi(),
	token({ required: true }),
	async (req, res) =>
		done(res, await commissionSummary(req.params, req.user)),
);

router.get(
	'/lottery/:id',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await ticketByLottery(req.params, req.query)),
);

router.get(
	'/lottery/:id/list',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listAllByLottery(req.params, req.user)),
);

router.get('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await show(req.params, req.user)),
);

router.post(
	'/:id',
	xApi(),
	// token({ required: true, roles: ['USER'] }),
	token({ required: true }),
	async (req, res) => done(res, await create(req.params, req.body, req.user)),
);

router.delete(
	'/:id',
	xApi(),
	// token({ required: true, roles: ['USER'] }),
	token({ required: true }),
	async (req, res) => done(res, await cancelTicket(req.params, req.user)),
);
export default router;
