import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
	getBannerSignedUrl,
	createBanner,
	updateBanner,
	deleteBanner,
	listBanners,
	getBannerDetails,
} from './controller';

const router = new Router();

// ===== BANNER MANAGEMENT =====

/**
 * GET /api/admin/banner-management/signedurl
 * Get signed URL for uploading banner image to S3
 * Query Parameters:
 * - fileType: File extension (jpg, png, gif, webp, bmp, svg, heic, heif)
 */
router.get(
	'/signedurl',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await getBannerSignedUrl(req.user, req.query))
);

/**
 * GET /api/admin/banner-management
 * List banners with pagination, sorting and filtering
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - isActive: Filter by active status (true/false)
 * - sortBy: Sort field (default: order)
 * - sortOrder: Sort order (asc/desc, default: asc)
 */
router.get(
	'',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await listBanners(req.query))
);

/**
 * GET /api/admin/banner-management/:id
 * Get banner details by ID
 * Params: id - Banner ID
 */
router.get(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await getBannerDetails(req.params.id))
);

/**
 * POST /api/admin/banner-management
 * Create a new banner
 * Body: {
 *   imageUrl: string (required) - URL of the banner image
 *   title: string (optional) - Banner title
 *   description: string (optional) - Banner description
 *   linkUrl: string (optional) - URL to navigate when banner is clicked
 *   order: number (optional) - Display order (default: 0)
 *   isActive: boolean (optional) - Active status (default: true)
 * }
 */
router.post(
	'',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await createBanner(req.body, req.user))
);

/**
 * PUT /api/admin/banner-management/:id
 * Update an existing banner
 * Params: id - Banner ID
 * Body: {
 *   imageUrl: string (optional) - URL of the banner image
 *   title: string (optional) - Banner title
 *   description: string (optional) - Banner description
 *   linkUrl: string (optional) - URL to navigate when banner is clicked
 *   order: number (optional) - Display order
 *   isActive: boolean (optional) - Active status
 * }
 */
router.put(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) =>
		done(res, await updateBanner(req.params.id, req.body, req.user))
);

/**
 * DELETE /api/admin/banner-management/:id
 * Delete a banner
 * Params: id - Banner ID
 */
router.delete(
	'/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	async (req, res) => done(res, await deleteBanner(req.params.id))
);

export default router;
