import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	initiateWithdrawal,
	getWithdrawals,
	cancelWithdrawal,
} from './controller';

const router = new Router();

router.post('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await initiateWithdrawal(req, res))
);

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getWithdrawals(req, res))
);

router.delete('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await cancelWithdrawal(req, res))
);

export default router;
