import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	getUserBalance,
	getWalletSummary,
	initiateVirtualCashPurchase,
	handlePurchaseSuccess,
	handlePurchaseCancel,
	handlePayoneerWebhook,
} from './controller';

const router = new Router();

router.get('/balance', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserBalance(req.user))
);

router.get(
	'/summary',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getWalletSummary(req.user))
);

router.post(
	'/purchase/initiate',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await initiateVirtualCashPurchase(req, res))
);

router.get('/purchase/success', xApi(), async (req, res) =>
	done(res, await handlePurchaseSuccess(req, res))
);

router.get('/purchase/cancel', xApi(), async (req, res) =>
	done(res, await handlePurchaseCancel(req, res))
);

router.post('/webhook/payoneer', xApi(), async (req, res) =>
	done(res, await handlePayoneerWebhook(req, res))
);

export default router;
