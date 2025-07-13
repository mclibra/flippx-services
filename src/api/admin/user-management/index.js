import { Router } from 'express';
import { done } from '../../../services/response/';
import { xApi, token } from '../../../services/passport';
import {
    getUserList,
    createUser,
    updateUser,
    getUserDetails,
    verifyUserDocument,
    rejectUserDocument,
    updateUserLoyalty,
    resetUserPassword,
    resetUserPin,
    updateUserStatus,
    bulkUpdateUsers,
    exportUsers,
} from './controller';

const router = new Router();

// ===== USER LIST & SEARCH =====

/**
 * GET /api/admin-user-management
 * Get paginated list of users with search and filtering
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - search: Search by username, email, phone
 * - status: Filter by account status (active, suspended, banned, pending)
 * - loyaltyTier: Filter by loyalty tier (BRONZE, SILVER, GOLD, VIP)
 * - verificationStatus: Filter by verification status (verified, unverified, pending)
 * - registrationStartDate: Filter by registration date range start
 * - registrationEndDate: Filter by registration date range end
 * - lastLoginStartDate: Filter by last login date range start
 * - lastLoginEndDate: Filter by last login date range end
 * - country: Filter by country
 * - role: Filter by user role
 * - sortBy: Sort field (default: createdAt)
 * - sortOrder: Sort order (asc/desc, default: desc)
 */
router.get(
    '',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getUserList(req.query))
);

// ===== USER CRUD OPERATIONS =====

/**
 * POST /api/admin-user-management
 * Create new user (admin only)
 * Body: User creation data
 */
router.post(
    '',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await createUser(req.body, req.user))
);

/**
 * PUT /api/admin-user-management/:id
 * Update user information (admin only)
 * Body: User update data
 */
router.put(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await updateUser(req.params.id, req.body, req.user))
);

/**
 * GET /api/admin-user-management/:id
 * Get detailed user information including all related data
 */
router.get(
    '/:id',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await getUserDetails(req.params.id, req.query))
);

// ===== DOCUMENT VERIFICATION =====

/**
 * POST /api/admin-user-management/:id/verify-document
 * Verify user document (ID or Address proof)
 * Body: { documentType: 'idProof' | 'addressProof' }
 */
router.post(
    '/:id/verify-document',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await verifyUserDocument(req.params.id, req.body, req.user))
);

/**
 * POST /api/admin-user-management/:id/reject-document
 * Reject user document with reason
 * Body: { documentType: 'idProof' | 'addressProof', rejectionReason: string }
 */
router.post(
    '/:id/reject-document',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await rejectUserDocument(req.params.id, req.body, req.user))
);

// ===== LOYALTY & REWARDS MANAGEMENT =====

/**
 * PUT /api/admin-user-management/:id/loyalty
 * Update user loyalty tier and XP
 * Body: { tier: string, xpAdjustment: number, reason: string }
 */
router.put(
    '/:id/loyalty',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await updateUserLoyalty(req.params.id, req.body, req.user))
);

// ===== USER ACCOUNT MANAGEMENT =====

/**
 * POST /api/admin-user-management/:id/reset-password
 * Reset user password (admin sets password)
 * Body: { newPassword: string } - minimum 6 characters
 */
router.post(
    '/:id/reset-password',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await resetUserPassword(req.params.id, req.body, req.user))
);

/**
 * POST /api/admin-user-management/:id/reset-pin
 * Reset user secure pin
 */
router.post(
    '/:id/reset-pin',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await resetUserPin(req.params.id, req.user))
);

/**
 * PUT /api/admin-user-management/:id/status
 * Update user account status
 * Body: { status: 'active' | 'suspended' | 'banned', reason: string }
 */
router.put(
    '/:id/status',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await updateUserStatus(req.params.id, req.body, req.user))
);

// ===== BULK OPERATIONS =====

/**
 * POST /api/admin-user-management/bulk-update
 * Bulk update users (suspend, activate, verify, etc.)
 * Body: { userIds: string[], action: string, data: object }
 */
router.post(
    '/bulk-update',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await bulkUpdateUsers(req.body, req.user))
);

/**
 * POST /api/admin-user-management/export
 * Export users data to CSV/Excel
 * Body: { format: 'csv' | 'excel', filters: object }
 */
router.post(
    '/export',
    xApi(),
    token({ required: true, roles: ['ADMIN'] }),
    async (req, res) => done(res, await exportUsers(req.body, req.user))
);

export default router;