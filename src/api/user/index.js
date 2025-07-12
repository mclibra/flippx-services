import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import { validateUserAccess, logAdminAction } from '../../middleware/userAccess';
import { UserValidationSchemas } from './userValidation';
import { ResponseFormatter } from '../../utils/responseFormatter';
import {
	// Existing functions
	addUser,
	userData,
	sendOtp,
	verifyOtp,
	verifySecurePin,
	create,
	update,
	getUserInfo,
	getSelfImage,
	list,
	verifyReset,
	resetPassword,
	updateUser,
	getSignedUrl,
	getSignedUrlForDocument,
	getSignedUrlForAdminView,
	verifyDocument,

	// New comprehensive user detail functions
	getUserProfileDetails,
	getUserDocumentStatus,
	getUserFinancialOverview,
	getUserBankAccounts,
	getUserTransactionHistory,
	getUserGamingStats,
	getUserTicketHistory,
	getUserLoyaltyProfile,
	getUserActivityMonitoring,
	getUserPaymentHistory,
	getUserWithdrawalHistory,
	getUserSalesPerformance,
	getUserHierarchy,
	getUserAuditTrail,

	// Administrative action functions
	suspendReactivateUser,
	changeUserRole,
	resetUserPassword,
	forceLogoutUser,
	resetUserPin,
	adjustUserBalance,
	upgradeUserTier,
	sendUserNotification,
} from './controller';

// Validation middleware wrapper
const validate = (schema) => {
	return (req, res, next) => {
		const { error, value } = schema.validate({ ...req.body, ...req.query });
		if (error) {
			return res.status(400).json(ResponseFormatter.error(
				error.details[0].message,
				400,
				{ field: error.details[0].path.join('.') }
			));
		}
		req.validatedData = value;
		next();
	};
};

const router = new Router();

// ===== PUBLIC ROUTES =====
router.post('/send-otp', xApi(), async (req, res) =>
	done(res, await sendOtp(req.body))
);

router.post('/verify-otp', xApi(), async (req, res) =>
	done(res, await verifyOtp(req.body))
);

router.post('/verify-reset', xApi(), async (req, res) =>
	done(res, await verifyReset(req.body))
);

router.post('/reset-password', xApi(), async (req, res) =>
	done(res, await resetPassword(req.body))
);

router.post('/', xApi(), async (req, res) => done(res, await create(req.body)));

// ===== USER AUTHENTICATED ROUTES =====
router.get('/me', xApi(), token({ required: true }), async (req, res) =>
	done(res, {
		status: 200,
		entity: { success: true, user: req.user.view(true) },
	})
);

router.get(
	'/image/signedurl',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getSignedUrl(req.user, req.query))
);

router.get('/image/self', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getSelfImage(req.user))
);

router.post('/info', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserInfo(req.user, req.body))
);

router.post(
	'/verify/pin',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await verifySecurePin(req.user, req.body))
);

router.get(
	'/documents/signedurl',
	xApi(),
	token({ required: true }),
	async (req, res) =>
		done(res, await getSignedUrlForDocument(req.user, req.query))
);

router.put('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await update(req.user, req.body))
);

// ===== USER SELF-ACCESS DETAILED INFORMATION ROUTES =====

// Financial information (User can access their own)
router.get(
	'/me/financial',
	xApi(),
	token({ required: true }),
	validate(UserValidationSchemas.dateRange),
	async (req, res) => {
		try {
			const result = await getUserFinancialOverview(req.user._id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.financialOverview));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Bank accounts (User can access their own)
router.get(
	'/me/bank-accounts',
	xApi(),
	token({ required: true }),
	validate(UserValidationSchemas.listQuery),
	async (req, res) => {
		try {
			const result = await getUserBankAccounts(req.user._id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.bankAccounts,
					result.entity.pagination
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Transaction history (User can access their own)
router.get(
	'/me/transactions',
	xApi(),
	token({ required: true }),
	validate(UserValidationSchemas.listWithDate),
	async (req, res) => {
		try {
			const result = await getUserTransactionHistory(req.user._id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.transactions,
					result.entity.pagination,
					null,
					{ summary: result.entity.summary }
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Gaming statistics (User can access their own)
router.get(
	'/me/gaming/stats',
	xApi(),
	token({ required: true }),
	validate(UserValidationSchemas.dateRange),
	async (req, res) => {
		try {
			const result = await getUserGamingStats(req.user._id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.gamingStats));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Ticket history (User can access their own)
router.get(
	'/me/gaming/tickets',
	xApi(),
	token({ required: true }),
	validate(UserValidationSchemas.listWithDate),
	async (req, res) => {
		try {
			const result = await getUserTicketHistory(req.user._id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.tickets,
					result.entity.pagination
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Loyalty profile (User can access their own)
router.get(
	'/me/loyalty',
	xApi(),
	token({ required: true }),
	validate(UserValidationSchemas.listQuery),
	async (req, res) => {
		try {
			const result = await getUserLoyaltyProfile(req.user._id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.loyaltyData));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// ===== USER ACCESS FOR OTHERS (AGENTS/DEALERS can access their managed users) =====

// Financial information (Agents/Dealers can access their users)
router.get(
	'/:id/financial',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	validateUserAccess('id'),
	validate(UserValidationSchemas.dateRange),
	logAdminAction('VIEW_USER_FINANCIAL'),
	async (req, res) => {
		try {
			const result = await getUserFinancialOverview(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.financialOverview));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Bank accounts (Agents/Dealers can access their users)
router.get(
	'/:id/bank-accounts',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	validateUserAccess('id'),
	validate(UserValidationSchemas.listQuery),
	logAdminAction('VIEW_USER_BANK_ACCOUNTS'),
	async (req, res) => {
		try {
			const result = await getUserBankAccounts(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.bankAccounts,
					result.entity.pagination
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Transaction history (Agents/Dealers can access their users)
router.get(
	'/:id/transactions',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	validateUserAccess('id'),
	validate(UserValidationSchemas.listWithDate),
	logAdminAction('VIEW_USER_TRANSACTIONS'),
	async (req, res) => {
		try {
			const result = await getUserTransactionHistory(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.transactions,
					result.entity.pagination,
					null,
					{ summary: result.entity.summary }
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Gaming statistics (Agents/Dealers can access their users)
router.get(
	'/:id/gaming/stats',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	validateUserAccess('id'),
	validate(UserValidationSchemas.dateRange),
	logAdminAction('VIEW_USER_GAMING_STATS'),
	async (req, res) => {
		try {
			const result = await getUserGamingStats(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.gamingStats));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Ticket history (Agents/Dealers can access their users)
router.get(
	'/:id/gaming/tickets',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	validateUserAccess('id'),
	validate(UserValidationSchemas.listWithDate),
	logAdminAction('VIEW_USER_TICKETS'),
	async (req, res) => {
		try {
			const result = await getUserTicketHistory(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.tickets,
					result.entity.pagination
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Loyalty profile (Agents/Dealers can access their users)
router.get(
	'/:id/loyalty',
	xApi(),
	token({ required: true, roles: ['ADMIN', 'AGENT', 'DEALER'] }),
	validateUserAccess('id'),
	validate(UserValidationSchemas.listQuery),
	logAdminAction('VIEW_USER_LOYALTY'),
	async (req, res) => {
		try {
			const result = await getUserLoyaltyProfile(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.loyaltyData));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// ===== ADMIN-ONLY ROUTES =====

// User management
router.get(
	'/admin',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listQuery),
	async (req, res) => {
		try {
			const result = await list(req.validatedData);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.users,
					result.entity.pagination
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.post(
	'/admin/add',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('CREATE_USER'),
	async (req, res) => {
		try {
			const result = await addUser(req.body);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.user,
					'User created successfully'
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('VIEW_USER_DETAILS'),
	async (req, res) => {
		try {
			const result = await userData(req.params);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.user));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.put(
	'/admin/:id',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('UPDATE_USER'),
	async (req, res) => {
		try {
			const result = await updateUser(req.params, req.body);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.user,
					'User updated successfully'
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Admin detailed user information routes
router.get(
	'/admin/:id/profile',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('VIEW_USER_PROFILE'),
	async (req, res) => {
		try {
			const result = await getUserProfileDetails(req.params.id, req.query);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.profileDetails));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/documents',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('VIEW_USER_DOCUMENTS'),
	async (req, res) => {
		try {
			const result = await getUserDocumentStatus(req.params.id, req.query);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.documentStatus));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/financial',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.dateRange),
	logAdminAction('VIEW_USER_FINANCIAL'),
	async (req, res) => {
		try {
			const result = await getUserFinancialOverview(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.financialOverview));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/bank-accounts',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listQuery),
	logAdminAction('VIEW_USER_BANK_ACCOUNTS'),
	async (req, res) => {
		try {
			const result = await getUserBankAccounts(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.bankAccounts,
					result.entity.pagination
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/transactions',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listWithDate),
	logAdminAction('VIEW_USER_TRANSACTIONS'),
	async (req, res) => {
		try {
			const result = await getUserTransactionHistory(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.transactions,
					result.entity.pagination,
					null,
					{ summary: result.entity.summary }
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/gaming/stats',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.dateRange),
	logAdminAction('VIEW_USER_GAMING_STATS'),
	async (req, res) => {
		try {
			const result = await getUserGamingStats(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.gamingStats));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/gaming/tickets',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listWithDate),
	logAdminAction('VIEW_USER_TICKETS'),
	async (req, res) => {
		try {
			const result = await getUserTicketHistory(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.tickets,
					result.entity.pagination
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/loyalty',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listQuery),
	logAdminAction('VIEW_USER_LOYALTY'),
	async (req, res) => {
		try {
			const result = await getUserLoyaltyProfile(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.loyaltyData));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/activity',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.dateRange),
	logAdminAction('VIEW_USER_ACTIVITY'),
	async (req, res) => {
		try {
			const result = await getUserActivityMonitoring(req.params.id, req.validatedData);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.activityMonitoring));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/payments',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listWithDate),
	logAdminAction('VIEW_USER_PAYMENTS'),
	async (req, res) => {
		try {
			const result = await getUserPaymentHistory(req.params.id, req.validatedData);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.payments,
					result.entity.pagination,
					null,
					{ summary: result.entity.summary }
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/withdrawals',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listWithDate),
	logAdminAction('VIEW_USER_WITHDRAWALS'),
	async (req, res) => {
		try {
			const result = await getUserWithdrawalHistory(req.params.id, req.validatedData);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.paginated(
					result.entity.withdrawals,
					result.entity.pagination,
					null,
					{ summary: result.entity.summary }
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/sales',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.dateRange),
	logAdminAction('VIEW_USER_SALES'),
	async (req, res) => {
		try {
			const result = await getUserSalesPerformance(req.params.id, req.validatedData);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.salesPerformance));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/hierarchy',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('VIEW_USER_HIERARCHY'),
	async (req, res) => {
		try {
			const result = await getUserHierarchy(req.params.id, req.query);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.hierarchy));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.get(
	'/admin/:id/audit',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.listWithDate),
	logAdminAction('VIEW_USER_AUDIT'),
	async (req, res) => {
		try {
			const result = await getUserAuditTrail(req.params.id, req.validatedData);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity.auditTrail));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Document management (Admin only)
router.get(
	'/admin/documents/signedurl',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('GET_DOCUMENT_SIGNED_URL'),
	async (req, res) => {
		try {
			const result = await getSignedUrlForAdminView(req.user, req.query);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(result.entity));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

router.put(
	'/admin/documents/verify',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('VERIFY_USER_DOCUMENT'),
	async (req, res) => {
		try {
			const result = await verifyDocument(req.user, req.body);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.user,
					'Document verification updated successfully'
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// ===== ADMINISTRATIVE ACTION ROUTES =====

// Account suspension/activation
router.put(
	'/admin/:id/suspend',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.userSuspension),
	logAdminAction('SUSPEND_REACTIVATE_USER'),
	async (req, res) => {
		try {
			const result = await suspendReactivateUser(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.user,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Role modification
router.put(
	'/admin/:id/role',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.roleChange),
	logAdminAction('CHANGE_USER_ROLE'),
	async (req, res) => {
		try {
			const result = await changeUserRole(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.user,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Password reset
router.post(
	'/admin/:id/password-reset',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.passwordReset),
	logAdminAction('RESET_USER_PASSWORD'),
	async (req, res) => {
		try {
			const result = await resetUserPassword(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					null,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Force logout from all sessions
router.post(
	'/admin/:id/logout-all',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	logAdminAction('FORCE_LOGOUT_USER'),
	async (req, res) => {
		try {
			const result = await forceLogoutUser(req.params.id, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					null,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// PIN reset
router.post(
	'/admin/:id/pin-reset',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.pinReset),
	logAdminAction('RESET_USER_PIN'),
	async (req, res) => {
		try {
			const result = await resetUserPin(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					null,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Manual balance adjustment
router.put(
	'/admin/:id/balance-adjustment',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.balanceAdjustment),
	logAdminAction('ADJUST_USER_BALANCE'),
	async (req, res) => {
		try {
			const result = await adjustUserBalance(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.adjustment,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Manual tier upgrade
router.put(
	'/admin/:id/tier-upgrade',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.tierUpgrade),
	logAdminAction('UPGRADE_USER_TIER'),
	async (req, res) => {
		try {
			const result = await upgradeUserTier(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.upgrade,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

// Send notification to user
router.post(
	'/admin/:id/notification',
	xApi(),
	token({ required: true, roles: ['ADMIN'] }),
	validate(UserValidationSchemas.notification),
	logAdminAction('SEND_USER_NOTIFICATION'),
	async (req, res) => {
		try {
			const result = await sendUserNotification(req.params.id, req.validatedData, req.user);
			if (result.status === 200) {
				return res.status(200).json(ResponseFormatter.success(
					result.entity.notification,
					result.entity.message
				));
			}
			return res.status(result.status).json(ResponseFormatter.error(result.entity.error, result.status));
		} catch (error) {
			return res.status(500).json(ResponseFormatter.error('Internal server error', 500));
		}
	}
);

export default router;