import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	addCard,
	getCards,
	setDefaultCard,
	updateCard,
	removeCard,
} from './controller';

const router = new Router();

router.post('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await addCard(req, res))
);

router.get('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getCards(req, res))
);

router.put(
	'/:id/default',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await setDefaultCard(req, res))
);

router.put('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await updateCard(req, res))
);

router.delete('/:id', xApi(), token({ required: true }), async (req, res) =>
	done(res, await removeCard(req, res))
);

export default router;
