// Updated index.js - Add this new route to the existing router

import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	list,
	nextLottery,
	lastLottery,
	showUserTickets,
	showAllTickets,
	create,
	update,
	preview,
	publish,
	remove,
	stateReport,
	allStatesSummary,
	getLotteryDashboard,
	closestUpcomingByState,
	getPopularNumbers,
} from './controller';

const router = new Router();

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await list(req.query, req.user))
);

router.get('/next', xApi(), token({ required: true }), async (req, res) =>
	done(res, await nextLottery(req.query, req.user))
);

router.get(
	'/closest-by-state',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await closestUpcomingByState(req.query.type))
);

router.get('/last', xApi(), token({ required: true }), async (req, res) =>
	done(res, await lastLottery(req.query, req.user))
);

// Get popular numbers for a state
router.get(
	'/popular-numbers',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getPopularNumbers(req.query))
);

// New admin lottery dashboard route
router.get(
	'/dashboard',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getLotteryDashboard(req.params, req.user))
);

// Existing state-based reporting routes
router.get(
	'/state/:stateId/report',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await stateReport(req.params, req.user))
);

router.get(
	'/states/summary',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await allStatesSummary(req.params, req.user))
);

router.get('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await showUserTickets(req.params, req.user, req.query))
);

router.get(
	'/admin/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await showAllTickets(req.params, req.query))
);

router.post(
	'/',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await create(req.body, req.user))
);

router.put(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await update(req.params, req.body, req.user))
);

router.put(
	'/preview/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await preview(req.params, req.body, req.user))
);

router.put(
	'/publish/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await publish(req.params, req.body, req.user))
);

router.delete(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await remove(req.params, req.user))
);

export default router;
