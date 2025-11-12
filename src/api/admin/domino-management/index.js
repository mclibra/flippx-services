import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	listDominoGames,
	getDominoGameDetails,
	listDominoRoomPrices,
	createDominoRoomPrice,
	updateDominoRoomPrice,
	deleteDominoRoomPrice,
} from './controller';

const router = new Router();

router.get(
	'/games',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listDominoGames(req.query))
);

router.get(
	'/games/:gameId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getDominoGameDetails(req.params.gameId))
);

router.get(
	'/room-prices',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listDominoRoomPrices(req.query))
);

router.post(
	'/room-prices',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await createDominoRoomPrice(req.body, req.user))
);

router.put(
	'/room-prices/:priceId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(
			res,
			await updateDominoRoomPrice(req.params.priceId, req.body, req.user)
		)
);

router.delete(
	'/room-prices/:priceId',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await deleteDominoRoomPrice(req.params.priceId))
);

export default router;

