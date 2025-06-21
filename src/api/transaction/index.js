import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	list,
	transactionSummary,
	makeTransfer,
	initiateTransaction,
	processTransaction,
	depositMoney,
	withdrawMoney,
	selfTransaction,
	commissionSummaryByAgent,
	getTierBasedPayoutAnalytics,
	getRevenueImpactComparison,
} from './controller';

const router = new Router();

router.post('/transfer', xApi(), token({ required: true }), async (req, res) =>
	done(res, await makeTransfer(req.user, req.body))
);

router.post(
	'/deposit',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	async (req, res) => done(res, await depositMoney(req.user, req.body))
);

router.post(
	'/withdraw',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	async (req, res) => done(res, await withdrawMoney(req.user, req.body))
);

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
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	async (req, res) => done(res, await list(req.user, req.query))
);

router.get(
	'/summary',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	async (req, res) => done(res, await transactionSummary(req.user, req.query))
);

router.get(
	'/commission/summary',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await commissionSummaryByAgent(req.user, req.query))
);

router.get(
	'/analytics/tier-payouts',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getTierBasedPayoutAnalytics(req.query, req.user))
);

router.get(
	'/analytics/revenue-impact',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getRevenueImpactComparison(req.query, req.user))
);

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await selfTransaction(req.user, req.query))
);

export default router;