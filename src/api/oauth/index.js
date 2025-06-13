import { Router } from 'express';
import { done } from '../../services/response/';
import { password, xApi } from '../../services/passport';
import { login, token } from './controller';

const router = new Router();

router.post('/', xApi(), password(), async (req, res) =>
	done(res, await login(req.user))
);

router.get('/token', xApi(), async (req, res) =>
	done(res, await token(req.query))
);

export default router;
