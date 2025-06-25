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
	createPayment,
	createManualPayment,
	confirmPayment,
	getAllPayments,
	getUserPayments,
} from './controller';

const router = new Router();

router.get('/balance', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserBalance(req.user))
);

router.get(
	'/summary',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getWalletSummary(req))
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

// ===== MANUAL PAYMENT ROUTES (ADMIN) =====

// Create manual payment record (Admin captures bank transfer)
router.post(
	'/payments',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await createPayment(req.user, req.body))
);

// Create manual bank transfer payment (Admin with detailed info)
router.post(
	'/payments/manual',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await createManualPayment(req.user, req.body))
);

// Confirm payment and credit wallet (Admin confirms bank transfer)
router.post(
	'/payments/confirm',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await confirmPayment(req.user, req.body))
);

// Get all payments (Admin view)
router.get(
	'/payments/admin',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getAllPayments(req.user, req.query))
);

// Get user's own payments
router.get(
	'/payments',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getUserPayments({ ...req.user, query: req.query }))
);

export default router;