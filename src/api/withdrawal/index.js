import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	initiateWithdrawal,
	approveWithdrawal,
	rejectWithdrawal,
	getWithdrawals,
	getAdminWithdrawals,
} from './controller';

const router = new Router();

router.post('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await initiateWithdrawal(req, res))
);

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getWithdrawals(req, res))
);

router.get(
	'/admin',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getAdminWithdrawals(req, res))
);

router.post(
	'/:id/approve',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await approveWithdrawal(req, res))
);

router.post(
	'/:id/reject',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await rejectWithdrawal(req, res))
);

export default router;
