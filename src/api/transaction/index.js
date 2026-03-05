import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	getTransactions,
	transactionSummary,
	initiateTransaction,
	processTransaction,
} from './controller';

const router = new Router();

router.post(
	'/initiate',
	xApi(),
	token({ required: true, roles: ['AGENT', 'DEALER'] }),
	async (req, res) => done(res, await initiateTransaction(req.user, req.body))
);

router.post(
	'/process',
	xApi(),
	token({ required: true, roles: ['AGENT', 'DEALER'] }),
	async (req, res) => done(res, await processTransaction(req.user, req.body))
);

router.get(
	'/list',
	xApi(),
	token({ required: true, roles: ['USER', 'AGENT', 'DEALER'] }),
	async (req, res) => done(res, await getTransactions(req.user, req.query))
);

router.get(
	'/summary',
	xApi(),
	token({ required: true, roles: ['USER', 'AGENT', 'DEALER'] }),
	async (req, res) => done(res, await transactionSummary(req.user, req.query))
);

export default router;
