import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import { list, getTicket, placeBet } from './controller';

const router = new Router();

// Get all tickets for user with pagination
router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await list(req.query, req.user))
);

router.post('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await placeBet(req.params, req.body, req.user))
);

router.get('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getTicket(req.params, req.user))
);

export default router;
