import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi } from '../../services/passport';
import { getActiveBanners } from './controller';

const router = new Router();

/**
 * GET /api/banner
 * Get list of active banner images for mobile app
 * No authentication required
 */
router.get('', xApi(), async (req, res) =>
	done(res, await getActiveBanners())
);

export default router;
