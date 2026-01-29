import { User } from '../user/model';
import { Plan } from '../plan/model';
import { UserPlan } from '../plan/userPlanModel';
import { Wallet, Payment } from './model';
import { makeTransaction } from '../transaction/controller';
import {
	createCheckoutPage,
	verifyWebhookSignature,
	mapPaymentStatus,
	mapPayoutStatus,
} from '../../services/rapyd';
import { Withdrawal } from '../withdrawal/model';

export const getUserBalance = async user => {
	try {
		let wallet = await Wallet.findOne({ user: user._id });

		if (!wallet) {
			wallet = await Wallet.create({
				user: user._id,
				virtualBalance: 0.0,
				realBalanceWithdrawable: 0.0,
				realBalanceNonWithdrawable: 0.0,
			});
		}

		return {
			status: 200,
			entity: {
				success: true,
				balance: {
					virtual: wallet.virtualBalance,
					realWithdrawable: wallet.realBalanceWithdrawable,
					realNonWithdrawable: wallet.realBalanceNonWithdrawable,
					totalReal: wallet.realBalance,
				},
			},
		};
	} catch (error) {
		console.error('Get user balance error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch balance',
			},
		};
	}
};

export const getWalletSummary = async req => {
	try {
		const { user } = req;

		// Verify admin permissions
		if (user.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized - Admin access required',
				},
			};
		}

		// Get all wallets summary
		const walletSummary = await Wallet.aggregate([
			{
				$group: {
					_id: null,
					totalUsers: { $sum: 1 },
					totalVirtualBalance: { $sum: '$virtualBalance' },
					totalRealWithdrawable: { $sum: '$realBalanceWithdrawable' },
					totalRealNonWithdrawable: {
						$sum: '$realBalanceNonWithdrawable',
					},
					totalPendingWithdrawals: { $sum: '$pendingWithdrawals' },
				},
			},
		]);

		// Get payments summary with separate real and virtual amounts
		const paymentsSummary = await Payment.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
					totalRealAmount: {
						$sum: { $ifNull: ['$realCashAmount', 0] },
					},
					totalVirtualAmount: {
						$sum: { $ifNull: ['$virtualCashAmount', 0] },
					},
				},
			},
		]);

		// Format payments data
		const paymentsData = {};
		paymentsSummary.forEach(item => {
			paymentsData[item._id] = {
				count: item.count,
				totalAmount: item.totalAmount,
				totalRealAmount: item.totalRealAmount || 0,
				totalVirtualAmount: item.totalVirtualAmount || 0,
			};
		});

		const walletData = walletSummary[0] || {
			totalUsers: 0,
			totalVirtualBalance: 0,
			totalRealWithdrawable: 0,
			totalRealNonWithdrawable: 0,
			totalPendingWithdrawals: 0,
		};

		return {
			status: 200,
			entity: {
				success: true,
				summary: {
					wallets: {
						...walletData,
						totalRealBalance:
							(walletData.totalRealWithdrawable || 0) +
							(walletData.totalRealNonWithdrawable || 0),
					},
					payments: paymentsData,
				},
			},
		};
	} catch (error) {
		console.error('Get wallet summary error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch wallet summary',
			},
		};
	}
};

export const initiateVirtualCashPurchase = async req => {
	try {
		const { user } = req;
		const {
			amount,
			currency = 'USD',
			planId,
			virtualCashAmount = 0,
			realCashAmount = 0,
		} = req.body;

		// Validate required parameters
		if (!amount || amount <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Valid amount is required',
				},
			};
		}

		let plan = null;
		let finalVirtualCashAmount = virtualCashAmount;
		let finalRealCashAmount = realCashAmount;
		let description = 'Virtual Cash Purchase';

		// If plan is specified, validate it and use plan amounts
		if (planId) {
			plan = await Plan.findById(planId);
			if (!plan) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'Plan not found',
					},
				};
			}

			if (plan.status !== 'ACTIVE' || !plan.isAvailableForPurchase) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Plan is not available for purchase',
					},
				};
			}

			// Validate amount matches plan price
			if (Math.abs(amount - plan.price) > 0.01) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Amount mismatch. Provided: $${amount}, Expected: $${plan.price}`,
					},
				};
			}

			// Use plan amounts
			finalVirtualCashAmount = plan.virtualCashAmount || 0;
			finalRealCashAmount = plan.realCashAmount || 0;
			description = `Plan Purchase - ${plan.name}`;
		} else {
			// Validate cash distribution for non-plan purchases
			const totalCashAmount =
				finalVirtualCashAmount + finalRealCashAmount;
			if (Math.abs(totalCashAmount - amount) > 0.01) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Virtual and real cash amounts must sum to total amount',
					},
				};
			}
			description = `Virtual Cash Purchase - ${finalVirtualCashAmount} Virtual, ${finalRealCashAmount} Real`;
		}

		// Generate unique session ID for tracking
		const sessionId = `vcash_${user._id}_${Date.now()}`;

		// Get base URL from environment or use default
		const baseUrl =
			process.env.HOST_URL || 'https://dev-shop.getflippx.com';

		// Prepare metadata for Rapyd
		const metadata = {
			userId: user._id.toString(),
			virtualCashAmount: finalVirtualCashAmount,
			realCashAmount: finalRealCashAmount,
			sessionId,
		};

		// Add plan ID to metadata if present
		if (planId) {
			metadata.planId = planId.toString();
		}

		// Determine country code for payment methods lookup
		// Try user's address country first, then extract from countryCode, fallback to default
		// Rapyd requires ISO 3166-1 alpha-2 country codes (e.g., 'US', 'GB', 'IN')
		let countryCode = 'US'; // Default fallback

		// Helper function to convert country names to ISO codes
		const countryNameToISO = countryName => {
			if (!countryName) return null;
			const normalized = countryName.trim().toUpperCase();
			// If already a 2-letter code, return it
			if (/^[A-Z]{2}$/.test(normalized)) {
				return normalized;
			}
			// Map common country names to ISO codes
			const countryNameMap = {
				'UNITED STATES': 'US',
				'UNITED STATES OF AMERICA': 'US',
				USA: 'US',
				US: 'US',
				'UNITED KINGDOM': 'GB',
				UK: 'GB',
				'GREAT BRITAIN': 'GB',
				INDIA: 'IN',
				FRANCE: 'FR',
				GERMANY: 'DE',
				CHINA: 'CN',
				JAPAN: 'JP',
				MEXICO: 'MX',
				BRAZIL: 'BR',
				AUSTRALIA: 'AU',
				CANADA: 'CA',
				SPAIN: 'ES',
				ITALY: 'IT',
				RUSSIA: 'RU',
				'SOUTH KOREA': 'KR',
				KOREA: 'KR',
			};
			return countryNameMap[normalized] || null;
		};

		if (user.address?.country) {
			const isoCode = countryNameToISO(user.address.country);
			if (isoCode) {
				countryCode = isoCode;
				console.log('[Payment Methods] Country code conversion:', {
					original: user.address.country,
					converted: isoCode,
				});
			} else {
				console.warn(
					'[Payment Methods] Could not convert country name to ISO code:',
					{
						country: user.address.country,
						usingDefault: countryCode,
					}
				);
			}
		} else if (user.countryCode) {
			const countryCodeMap = {
				'+1': 'US',
				'+91': 'IN',
				'+44': 'GB',
				'+33': 'FR',
				'+49': 'DE',
				'+86': 'CN',
				'+81': 'JP',
				'+52': 'MX',
				'+55': 'BR',
				'+61': 'AU',
			};
			countryCode = countryCodeMap[user.countryCode] || 'US';
			console.log('[Payment Methods] Country code from phone code:', {
				phoneCode: user.countryCode,
				isoCode: countryCode,
			});
		} else {
			console.log(
				'[Payment Methods] Using default country code:',
				countryCode
			);
		}

		let checkoutPage;
		try {
			// Note: Rapyd requires callback URLs, but we use webhook for payment processing
			// These URLs can point to a frontend page that polls the status endpoint
			checkoutPage = await createCheckoutPage({
				amount,
				currency,
				description,
				completePaymentUrl: `${baseUrl}/payment-status?session_id=${sessionId}`,
				errorPaymentUrl: `${baseUrl}/payment-status?session_id=${sessionId}`,
				metadata,
				country: countryCode,
			});
		} catch (rapydError) {
			console.error('Rapyd checkout creation failed:', rapydError);
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Payment service temporarily unavailable. Please try again later.',
				},
			};
		}

		// Create payment record in database
		const payment = await Payment.create({
			user: user._id,
			sessionId,
			amount,
			currency,
			method: 'RAPYD_CHECKOUT',
			status: 'PENDING',
			plan: planId || null,
			virtualCashAmount: finalVirtualCashAmount,
			realCashAmount: finalRealCashAmount,
			providerResponse: checkoutPage,
			ipAddress: req.ip || req.connection.remoteAddress,
			metadata: {
				userAgent: req.get('User-Agent'),
				rapydCheckoutId: checkoutPage.checkoutId,
				rapydPaymentId: checkoutPage.paymentId,
			},
		});

		return {
			status: 200,
			entity: {
				success: true,
				paymentUrl: checkoutPage.checkoutUrl,
				sessionId,
				payment: {
					id: payment._id,
					amount: payment.amount,
					currency: payment.currency,
					plan: plan ? { id: plan._id, name: plan.name } : null,
					virtualCashAmount: payment.virtualCashAmount,
					realCashAmount: payment.realCashAmount,
				},
			},
		};
	} catch (error) {
		console.error('Virtual cash purchase initiation error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to initiate purchase',
			},
		};
	}
};

export const createPayment = async (user, body) => {
	try {
		// Verify admin permissions
		if (user.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized - Admin access required',
				},
			};
		}

		const { userId, amount, paymentMethod, planId, description } = body;

		// Validate required fields
		if (!userId || !amount || !paymentMethod) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'User ID, amount, and payment method are required',
				},
			};
		}

		// Verify user exists
		const targetUser = await User.findById(userId);
		if (!targetUser) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		let plan = null;
		if (planId) {
			plan = await Plan.findById(planId);
			if (!plan) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'Plan not found',
					},
				};
			}

			// Validate amount matches plan price if plan is specified
			if (Math.abs(amount - plan.price) > 0.01) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Amount mismatch. Provided: $${amount}, Expected: $${plan.price}`,
					},
				};
			}
		}

		// Create payment record
		const payment = await Payment.create({
			user: user._id,
			amount,
			method: paymentMethod,
			plan: planId || null,
			description: description || `${paymentMethod} payment`,
			status: 'PENDING',
		});

		return {
			status: 200,
			entity: {
				success: true,
				payment,
				message: 'Payment created successfully',
			},
		};
	} catch (error) {
		console.error('Payment creation error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to create payment',
			},
		};
	}
};

export const createManualPayment = async (user, body) => {
	try {
		// Verify admin permissions
		if (user.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized - Admin access required',
				},
			};
		}

		const {
			userId,
			amount: providedAmount,
			realAmount: providedRealAmount,
			virtualAmount: providedVirtualAmount,
			bankTransferReference,
			bankName,
			transferDate,
			depositorName,
			notes,
			planId, // Optional plan ID
		} = body;

		// Validate required fields
		if (!userId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'User ID is required',
				},
			};
		}

		if (!bankTransferReference) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Bank transfer reference is required',
				},
			};
		}

		// Verify user exists
		const targetUser = await User.findById(userId);
		if (!targetUser) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		let plan = null;
		let finalAmount = providedAmount;
		let finalRealAmount = providedRealAmount;
		let finalVirtualAmount = providedVirtualAmount;

		// If plan is specified, validate it and fetch amount from plan
		if (planId) {
			plan = await Plan.findById(planId);
			if (!plan) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'Plan not found',
					},
				};
			}

			if (plan.status !== 'ACTIVE') {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Plan is not available for purchase',
					},
				};
			}

			// If planId exists, fetch amount from plan
			finalAmount = plan.price;
			finalRealAmount = plan.realCashAmount || 0;
			finalVirtualAmount = plan.virtualCashAmount || 0;

			// If amount was also provided, validate it matches the plan price
			if (
				providedAmount &&
				Math.abs(providedAmount - plan.price) > 0.01
			) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Provided amount (${providedAmount}) does not match plan price. Expected: $${plan.price}`,
					},
				};
			}
		} else {
			// If no plan, require either total amount or both real and virtual amounts
			if (
				providedRealAmount !== undefined ||
				providedVirtualAmount !== undefined
			) {
				// If real/virtual amounts are provided, validate them
				finalRealAmount = providedRealAmount || 0;
				finalVirtualAmount = providedVirtualAmount || 0;
				finalAmount = finalRealAmount + finalVirtualAmount;

				if (finalAmount <= 0) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Total of realAmount and virtualAmount must be greater than 0',
						},
					};
				}

				// If total amount was also provided, validate it matches
				if (
					providedAmount &&
					Math.abs(providedAmount - finalAmount) > 0.01
				) {
					return {
						status: 400,
						entity: {
							success: false,
							error: `Total amount (${providedAmount}) does not match sum of realAmount (${finalRealAmount}) and virtualAmount (${finalVirtualAmount})`,
						},
					};
				}
			} else if (!providedAmount || providedAmount <= 0) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Amount or both realAmount and virtualAmount are required when no plan is specified',
					},
				};
			} else {
				// If only total amount provided, default to real cash
				finalRealAmount = finalAmount;
				finalVirtualAmount = 0;
			}
		}

		// Generate unique session ID for manual payments to avoid duplicate key error
		const sessionId = `manual_${userId}_${Date.now()}_${Math.random()
			.toString(36)
			.substr(2, 9)}`;

		// Create manual payment record
		const payment = await Payment.create({
			user: userId,
			sessionId, // Add unique sessionId to prevent duplicate key error
			amount: finalAmount,
			currency: 'USD',
			method: 'BANK_TRANSFER',
			status: 'PENDING',
			plan: planId || null,
			realCashAmount: finalRealAmount,
			virtualCashAmount: finalVirtualAmount,
			isManual: true,
			bankTransferReference,
			bankName: bankName || null,
			transferDate: transferDate ? new Date(transferDate) : new Date(),
			depositorName: depositorName || null,
			notes: notes || null,
		});

		const paymentResponse = payment.toObject ? payment.toObject() : payment;
		return {
			status: 200,
			entity: {
				success: true,
				payment: {
					...paymentResponse,
					realAmount: paymentResponse.realCashAmount || 0,
					virtualAmount: paymentResponse.virtualCashAmount || 0,
				},
				message: planId
					? `Manual payment record created successfully with amount $${finalAmount} from plan "${plan.name}"`
					: 'Manual payment record created successfully',
			},
		};
	} catch (error) {
		console.error('Manual payment creation error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to create manual payment',
			},
		};
	}
};

export const confirmPayment = async (user, { paymentId }) => {
	try {
		// Find the payment
		const payment = await Payment.findById(paymentId).populate('plan');
		if (!payment) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Payment not found',
				},
			};
		}

		// Verify payment belongs to user (unless admin)
		if (
			user.role !== 'ADMIN' &&
			payment.user.toString() !== user._id.toString()
		) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized to confirm this payment',
				},
			};
		}

		// Check if already processed
		if (payment.status !== 'PENDING') {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Payment is already ${payment.status.toLowerCase()}`,
				},
			};
		}

		// Update payment status
		payment.status = 'COMPLETED';
		payment.confirmedAt = new Date();
		payment.confirmedBy = user._id;
		await payment.save();

		// Process wallet credits and user plan creation
		await processPaymentCompletion(payment);

		const paymentObj = payment.toObject ? payment.toObject() : payment;
		return {
			status: 200,
			entity: {
				success: true,
				message: 'Payment confirmed and wallet credited successfully',
				payment: {
					id: payment._id,
					amount: payment.amount,
					realAmount: paymentObj.realCashAmount || 0,
					virtualAmount: paymentObj.virtualCashAmount || 0,
					realCashAmount: paymentObj.realCashAmount || 0,
					virtualCashAmount: paymentObj.virtualCashAmount || 0,
					plan: payment.plan
						? { id: payment.plan._id, name: payment.plan.name }
						: null,
					status: payment.status,
				},
			},
		};
	} catch (error) {
		console.error('Confirm payment error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to confirm payment',
			},
		};
	}
};

export const getAllPayments = async (user, query) => {
	try {
		// Verify admin permissions
		if (user.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized - Admin access required',
				},
			};
		}

		const { page = 1, limit = 20, status, method, userId } = query;

		// Build filter
		const filter = {};
		if (status) filter.status = status;
		if (method) filter.method = method;
		if (userId) filter.user = userId;

		// Calculate skip
		const skip = (page - 1) * limit;

		// Get payments with pagination
		const payments = await Payment.find(filter)
			.populate('user', 'name phone email')
			.populate('plan', 'name price')
			.populate('confirmedBy', 'name phone email')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))
			.lean();

		// Transform payments to include separate realAmount and virtualAmount
		const transformedPayments = payments.map(payment => ({
			...payment,
			realAmount: payment.realCashAmount || 0,
			virtualAmount: payment.virtualCashAmount || 0,
		}));

		// Get total count
		const total = await Payment.countDocuments(filter);

		return {
			status: 200,
			entity: {
				success: true,
				payments: transformedPayments,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
				},
			},
		};
	} catch (error) {
		console.error('Get all payments error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch payments',
			},
		};
	}
};

export const getUserPayments = async ({ _id, query }) => {
	try {
		const { page = 1, limit = 10, status } = query;

		// Build filter
		const filter = { user: _id };
		if (status) filter.status = status;

		// Calculate skip
		const skip = (page - 1) * limit;

		// Get user's payments
		const payments = await Payment.find(filter)
			.populate('plan', 'name price')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))
			.lean();

		// Transform payments to include separate realAmount and virtualAmount
		const transformedPayments = payments.map(payment => ({
			...payment,
			realAmount: payment.realCashAmount || 0,
			virtualAmount: payment.virtualCashAmount || 0,
		}));

		// Get total count
		const total = await Payment.countDocuments(filter);

		return {
			status: 200,
			entity: {
				success: true,
				payments: transformedPayments,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
				},
			},
		};
	} catch (error) {
		console.error('Get user payments error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch user payments',
			},
		};
	}
};

export const getPaymentStatusBySessionId = async req => {
	try {
		const { session_id } = req.query;

		if (!session_id) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Session ID is required',
				},
			};
		}

		// Find payment record
		const payment = await Payment.findOne({
			sessionId: session_id,
		}).populate('plan');

		if (!payment) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Payment session not found',
				},
			};
		}

		// Return payment status and details
		return {
			status: 200,
			entity: {
				success: true,
				payment: {
					id: payment._id,
					sessionId: payment.sessionId,
					amount: payment.amount,
					currency: payment.currency,
					virtualCashAmount: payment.virtualCashAmount,
					realCashAmount: payment.realCashAmount,
					plan: payment.plan
						? { id: payment.plan._id, name: payment.plan.name }
						: null,
					status: payment.status,
					method: payment.method,
					createdAt: payment.createdAt,
					updatedAt: payment.updatedAt,
				},
			},
		};
	} catch (error) {
		console.error('Get payment status by session ID error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get payment status',
			},
		};
	}
};

export const handleRapydWebhook = async req => {
	try {
		// Headers (timestamp, salt, signature) are in HTTP headers
		const signature = req.get('signature');
		const timestamp = req.get('timestamp');
		const salt = req.get('salt');

		if (!signature || !timestamp || !salt) {
			console.error('Missing webhook headers', {
				hasSignature: !!signature,
				hasTimestamp: !!timestamp,
				hasSalt: !!salt,
			});
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Missing required webhook headers',
				},
			};
		}

		// Use the raw body string for signature verification (exact match with Rapyd)
		if (!Buffer.isBuffer(req.body)) {
			console.error('Expected raw body Buffer, got:', typeof req.body);
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Raw body not available for signature verification',
				},
			};
		}

		const rawBody = req.body.toString('utf8');
		const webhookBody = JSON.parse(rawBody);
		console.log('Rapyd webhook received', webhookBody);

		// The payload for signature verification is the raw body string
		// According to Rapyd docs: HMAC-SHA256(url_path + salt + timestamp + access_key + secret_key + body_string)
		// url_path is the entire URL configured for the webhook endpoint
		const payload = rawBody;
		const urlPath = req.originalUrl || req.path;

		// Verify webhook signature
		if (
			!signature ||
			!timestamp ||
			!salt ||
			!verifyWebhookSignature(
				urlPath,
				payload,
				signature,
				timestamp,
				salt
			)
		) {
			console.error('Invalid Rapyd webhook signature', {
				hasSignature: !!signature,
				hasTimestamp: !!timestamp,
				hasSalt: !!salt,
				httpHeaders: {
					signature: req.get('signature'),
					timestamp: req.get('timestamp'),
					salt: req.get('salt'),
				},
				bodyHeaders: req.body?.headers,
			});
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Invalid webhook signature',
				},
			};
		}

		const { type, data } = webhookBody;

		console.log(`Rapyd webhook received: ${type}`, data);

		// Handle payment events
		if (type === 'PAYMENT_COMPLETED' || type === 'PAYMENT_SUCCEEDED') {
			const paymentId = data?.id || data?.payment?.id;
			const metadata = data?.metadata || {};

			if (!paymentId && !metadata.sessionId) {
				console.error(
					'No payment ID or session ID found in webhook data'
				);
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Payment ID or session ID not found in webhook',
					},
				};
			}

			// Find payment by session ID from metadata or payment ID
			const payment = await Payment.findOne({
				$or: [
					{ sessionId: metadata.sessionId },
					{ 'metadata.rapydPaymentId': paymentId },
					{ 'providerResponse.paymentId': paymentId },
				],
			}).populate('plan');

			if (!payment) {
				console.error(
					`Payment not found for payment ID: ${paymentId} or session ID: ${metadata.sessionId}`
				);
				return {
					status: 404,
					entity: {
						success: false,
						error: 'Payment not found',
					},
				};
			}

			// Only process if payment is still pending
			if (payment.status !== 'PENDING') {
				console.log(
					`Payment ${payment._id} already processed with status: ${payment.status}`
				);
				return {
					status: 200,
					entity: {
						success: true,
						message: 'Payment already processed',
					},
				};
			}

			// Map Rapyd status to internal status
			const rapydStatus = data?.status || 'ACT';
			const internalStatus = mapPaymentStatus(rapydStatus);

			// Update payment status
			payment.status = internalStatus;
			payment.providerResponse = {
				...payment.providerResponse,
				webhook_data: data,
				rapyd_payment_id: paymentId,
			};
			await payment.save();

			// Process wallet credits and user plan creation if completed
			if (internalStatus === 'COMPLETED') {
				try {
					await processPaymentCompletion(payment);
					console.log(
						`Successfully processed payment ${payment._id} via webhook`
					);
				} catch (transactionError) {
					console.error(
						`Error processing transactions for payment ${payment._id}:`,
						transactionError
					);
					// Update payment status to failed
					payment.status = 'FAILED';
					payment.errorMessage = transactionError.message;
					await payment.save();
				}
			}
		} else if (
			type === 'PAYMENT_FAILED' ||
			type === 'PAYMENT_CANCELLED' ||
			type === 'PAYMENT_ERROR'
		) {
			const paymentId = data?.id || data?.payment?.id;
			const metadata = data?.metadata || {};

			if (paymentId || metadata.sessionId) {
				const payment = await Payment.findOne({
					$or: [
						{ sessionId: metadata.sessionId },
						{ 'metadata.rapydPaymentId': paymentId },
						{ 'providerResponse.paymentId': paymentId },
					],
				});

				if (payment && payment.status === 'PENDING') {
					const rapydStatus = data?.status || 'ERR';
					payment.status = mapPaymentStatus(rapydStatus);
					payment.errorMessage =
						data?.failure_reason ||
						data?.message ||
						'Payment failed';
					payment.providerResponse = {
						...payment.providerResponse,
						webhook_data: data,
					};
					await payment.save();
					console.log(
						`Payment ${payment._id} marked as ${payment.status} via webhook`
					);
				}
			}
		} else {
			console.log(`Unhandled Rapyd webhook event type: ${type}`);
		}

		// Handle payout events
		if (type === 'PAYOUT_COMPLETED' || type === 'PAYOUT_SUCCEEDED') {
			const payoutId = data?.id;
			const metadata = data?.metadata || {};

			if (!payoutId && !metadata.withdrawalId) {
				console.error(
					'No payout ID or withdrawal ID found in webhook data'
				);
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Payout ID or withdrawal ID not found in webhook',
					},
				};
			}

			// Find withdrawal by payout ID or withdrawal ID from metadata
			const withdrawal = await Withdrawal.findOne({
				$or: [
					{ paymentReference: payoutId },
					{ _id: metadata.withdrawalId },
					{ 'paymentDetails.rapydPayoutId': payoutId },
				],
			}).populate('user');

			if (withdrawal && withdrawal.status === 'PROCESSING') {
				const rapydStatus = data?.status || 'CLO';
				const internalStatus = mapPayoutStatus(rapydStatus);

				withdrawal.status = internalStatus;
				withdrawal.paymentDetails = {
					...withdrawal.paymentDetails,
					webhook_data: data,
				};
				await withdrawal.save();

				console.log(
					`Withdrawal ${withdrawal._id} updated to ${internalStatus} via webhook`
				);
			}
		} else if (
			type === 'PAYOUT_FAILED' ||
			type === 'PAYOUT_CANCELLED' ||
			type === 'PAYOUT_ERROR'
		) {
			const payoutId = data?.id;
			const metadata = data?.metadata || {};

			if (payoutId || metadata.withdrawalId) {
				const withdrawal = await Withdrawal.findOne({
					$or: [
						{ paymentReference: payoutId },
						{ _id: metadata.withdrawalId },
						{ 'paymentDetails.rapydPayoutId': payoutId },
					],
				});

				if (withdrawal && withdrawal.status === 'PROCESSING') {
					const rapydStatus = data?.status || 'ERR';
					withdrawal.status = mapPayoutStatus(rapydStatus);
					withdrawal.errorMessage =
						data?.failure_reason ||
						data?.message ||
						'Payout failed';
					withdrawal.paymentDetails = {
						...withdrawal.paymentDetails,
						webhook_data: data,
					};
					await withdrawal.save();
					console.log(
						`Withdrawal ${withdrawal._id} marked as ${withdrawal.status} via webhook`
					);
				}
			}
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Webhook processed successfully',
			},
		};
	} catch (error) {
		console.error('Rapyd webhook error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process webhook',
			},
		};
	}
};

// Helper function to process payment completion
const processPaymentCompletion = async payment => {
	// Credit virtual cash if specified
	if (payment.virtualCashAmount > 0) {
		await makeTransaction(
			payment.user,
			'USER',
			'VIRTUAL_CASH_PURCHASE',
			payment.virtualCashAmount,
			payment._id,
			'VIRTUAL'
		);
	}

	// Credit real cash if specified
	if (payment.realCashAmount > 0) {
		await makeTransaction(
			payment.user,
			'USER',
			'REAL_CASH_PURCHASE',
			payment.realCashAmount,
			payment._id,
			'REAL'
		);
	}

	// If plan is associated, create user plan record
	if (payment.plan) {
		// Create user plan record
		const userPlan = await UserPlan.create({
			user: payment.user,
			plan: payment.plan._id,
			paymentReference: payment._id,
			planSnapshot: {
				name: payment.plan.name,
				price: payment.plan.price,
				realCashAmount: payment.plan.realCashAmount,
				virtualCashAmount: payment.plan.virtualCashAmount,
			},
			purchaseMethod: payment.isManual
				? 'MANUAL_PAYMENT'
				: 'PAYMENT_GATEWAY',
		});

		console.log(
			`Created user plan ${userPlan._id} for payment ${payment._id}`
		);
	}
};
