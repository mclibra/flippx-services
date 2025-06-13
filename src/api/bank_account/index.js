import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	addBankAccount,
	getBankAccounts,
	setDefaultBankAccount,
	removeBankAccount,
} from './controller';

const router = new Router();

router.post('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await addBankAccount(req, res))
);

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getBankAccounts(req, res))
);

router.put(
	'/:id/default',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await setDefaultBankAccount(req, res))
);

router.delete('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await removeBankAccount(req, res))
);

export default router;
