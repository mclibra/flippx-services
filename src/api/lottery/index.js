// Updated index.js - Add this new route to the existing router

import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	list,
	nextLottery,
	lastLottery,
	showUserTickets,
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

router.get('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await showUserTickets(req.params, req.user, req.query))
);

export default router;
