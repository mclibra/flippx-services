import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import { list, getTicket, getTicketDetails, placeBet } from './controller';

const router = new Router();

// Get all tickets for user with pagination
router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await list(req.query, req.user))
);

router.post('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await placeBet(req.params, req.body, req.user))
);

// Get ticket details by ticket ID
router.get('/ticket/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getTicketDetails(req.params, req.user))
);

// Get user's ticket for a specific roulette game (by roulette game ID)
router.get('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getTicket(req.params, req.user))
);

export default router;
