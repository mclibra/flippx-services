import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, isAdmin } from '../../services/passport';
import { sendMessage } from './controller';

const router = new Router();

router.post('/', xApi(), isAdmin(), async (req, res) =>
	done(res, await sendMessage(req.body))
);

export default router;
