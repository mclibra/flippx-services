import { User } from '../user/model';
import { Plan } from '../plan/model';
import { UserPlan } from '../plan/userPlanModel';
import { Wallet, Payment } from './model';
import { makeTransaction } from '../transaction/controller';
import { createPaymentSession, verifyWebhookSignature } from '../../services/payoneer';

export const getUserBalance = async (user) => {
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

export const getWalletSummary = async (req) => {
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
					totalRealNonWithdrawable: { $sum: '$realBalanceNonWithdrawable' },
					totalPendingWithdrawals: { $sum: '$pendingWithdrawals' },
				},
			},
		]);

		// Get payments summary
		const paymentsSummary = await Payment.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
				},
			},
		]);

		// Format payments data
		const paymentsData = {};
		paymentsSummary.forEach((item) => {
			paymentsData[item._id] = {
				count: item.count,
				totalAmount: item.totalAmount,
			};
		});

		return {
			status: 200,
			entity: {
				success: true,
				summary: {
					wallets: walletSummary[0] || {
						totalUsers: 0,
						totalVirtualBalance: 0,
						totalRealWithdrawable: 0,
						totalRealNonWithdrawable: 0,
						totalPendingWithdrawals: 0,
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

export const initiateVirtualCashPurchase = async (req, res) => {
	try {
		const { user } = req;
		const { amount, currency = 'USD', planId, virtualCashAmount = 0, realCashAmount = 0 } = req.body;

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

			// Check if user already has an active plan of this type
			const existingUserPlan = await UserPlan.findOne({
				user: user._id,
				plan: planId,
				status: 'ACTIVE',
			});

			if (existingUserPlan) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'You already have an active subscription to this plan',
					},
				};
			}
		} else {
			// Validate cash distribution for non-plan purchases
			const totalCashAmount = finalVirtualCashAmount + finalRealCashAmount;
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
		const baseUrl = process.env.HOST_URL || 'http://localhost:3000';

		// Prepare metadata for Payoneer
		const metadata = {
			userId: user._id,
			virtualCashAmount: finalVirtualCashAmount,
			realCashAmount: finalRealCashAmount,
			sessionId,
		};

		// Add plan ID to metadata if present
		if (planId) {
			metadata.planId = planId;
		}

		let paymentSession;
		try {
			paymentSession = await createPaymentSession({
				amount,
				currency,
				description,
				successUrl: `${baseUrl}/api/wallet/purchase/success?session_id=${sessionId}`,
				cancelUrl: `${baseUrl}/api/wallet/purchase/cancel?session_id=${sessionId}`,
				metadata,
			});
		} catch (payoneerError) {
			console.error('Payoneer session creation failed:', payoneerError);
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
			method: 'PAYONEER_BALANCE',
			status: 'PENDING',
			plan: planId || null,
			virtualCashAmount: finalVirtualCashAmount,
			realCashAmount: finalRealCashAmount,
			providerResponse: paymentSession,
			ipAddress: req.ip || req.connection.remoteAddress,
			metadata: {
				userAgent: req.get('User-Agent'),
				payoneerSessionId: paymentSession.session_id,
			},
		});

		return {
			status: 200,
			entity: {
				success: true,
				paymentUrl: paymentSession.checkout_url,
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

			if (plan.status !== 'ACTIVE' || !plan.isAvailableForPurchase) {
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

			// If amount was also provided, validate it matches the plan price
			if (providedAmount && Math.abs(providedAmount - plan.price) > 0.01) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Provided amount (${providedAmount}) does not match plan price. Expected: $${plan.price}`,
					},
				};
			}

			// Check if user already has an active plan of this type
			const existingUserPlan = await UserPlan.findOne({
				user: userId,
				plan: planId,
				status: 'ACTIVE',
			});

			if (existingUserPlan) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'User already has an active subscription to this plan',
					},
				};
			}
		} else {
			if (!providedAmount || providedAmount <= 0) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Amount is required when no plan is specified',
					},
				};
			}
		}

		// Generate unique session ID for manual payments to avoid duplicate key error
		const sessionId = `manual_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		// Create manual payment record
		const payment = await Payment.create({
			user: userId,
			sessionId, // Add unique sessionId to prevent duplicate key error
			amount: finalAmount,
			currency: 'USD',
			method: 'BANK_TRANSFER',
			status: 'PENDING',
			plan: planId || null,
			isManual: true,
			bankTransferReference,
			bankName: bankName || null,
			transferDate: transferDate ? new Date(transferDate) : new Date(),
			depositorName: depositorName || null,
			notes: notes || null,
		});

		return {
			status: 200,
			entity: {
				success: true,
				payment,
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
		if (user.role !== 'ADMIN' && payment.user.toString() !== user._id.toString()) {
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

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Payment confirmed and wallet credited successfully',
				payment: {
					id: payment._id,
					amount: payment.amount,
					virtualCashAmount: payment.virtualCashAmount,
					realCashAmount: payment.realCashAmount,
					plan: payment.plan ? { id: payment.plan._id, name: payment.plan.name } : null,
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
			.limit(parseInt(limit));

		// Get total count
		const total = await Payment.countDocuments(filter);

		return {
			status: 200,
			entity: {
				success: true,
				payments,
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
			.limit(parseInt(limit));

		// Get total count
		const total = await Payment.countDocuments(filter);

		return {
			status: 200,
			entity: {
				success: true,
				payments,
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

export const handlePurchaseSuccess = async (req, res) => {
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
		const payment = await Payment.findOne({ sessionId: session_id }).populate('plan');
		if (!payment) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Payment session not found',
				},
			};
		}

		// Check if already processed
		if (payment.status !== 'PENDING') {
			return {
				status: 200,
				entity: {
					success: true,
					message: 'Payment already processed',
					payment: {
						id: payment._id,
						amount: payment.amount,
						status: payment.status,
					},
				},
			};
		}

		// Update payment status
		payment.status = 'COMPLETED';
		await payment.save();

		// Process wallet credits and user plan creation
		await processPaymentCompletion(payment);

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Payment processed successfully',
				payment: {
					id: payment._id,
					amount: payment.amount,
					virtualCashAmount: payment.virtualCashAmount,
					realCashAmount: payment.realCashAmount,
					plan: payment.plan ? { id: payment.plan._id, name: payment.plan.name } : null,
					status: payment.status,
				},
			},
		};
	} catch (error) {
		console.error('Handle purchase success error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process successful payment',
			},
		};
	}
};

export const handlePurchaseCancel = async (req, res) => {
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
		const payment = await Payment.findOne({ sessionId: session_id });
		if (!payment) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Payment session not found',
				},
			};
		}

		// Update payment status if not already processed
		if (payment.status === 'PENDING') {
			payment.status = 'CANCELLED';
			await payment.save();
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Payment cancelled successfully',
				payment: {
					id: payment._id,
					amount: payment.amount,
					status: payment.status,
				},
			},
		};
	} catch (error) {
		console.error('Handle purchase cancel error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process payment cancellation',
			},
		};
	}
};

export const handlePayoneerWebhook = async (req, res) => {
	try {
		const signature = req.get('X-Payoneer-Signature');
		const payload = JSON.stringify(req.body);

		// Verify webhook signature
		if (!signature || !verifyWebhookSignature(payload, signature)) {
			console.error('Invalid webhook signature');
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Invalid webhook signature',
				},
			};
		}

		const { event_type, data } = req.body;

		console.log(`Payoneer webhook received: ${event_type}`, data);

		switch (event_type) {
			case 'checkout.session.completed':
			case 'payment.completed': {
				const sessionId = data.client_reference_id || data.session_id;

				if (!sessionId) {
					console.error('No session ID found in webhook data');
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Session ID not found in webhook',
						},
					};
				}

				// Find payment by session ID
				const payment = await Payment.findOne({
					$or: [
						{ sessionId: sessionId },
						{ 'providerResponse.session_id': sessionId },
					],
				}).populate('plan');

				if (!payment) {
					console.error(`Payment not found for session ID: ${sessionId}`);
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
					console.log(`Payment ${payment._id} already processed with status: ${payment.status}`);
					return {
						status: 200,
						entity: {
							success: true,
							message: 'Payment already processed',
						},
					};
				}

				// Update payment status
				payment.status = 'COMPLETED';
				payment.providerResponse = {
					...payment.providerResponse,
					webhook_data: data,
				};
				await payment.save();

				// Process wallet credits and user plan creation
				try {
					await processPaymentCompletion(payment);
					console.log(`Successfully processed payment ${payment._id} via webhook`);
				} catch (transactionError) {
					console.error(`Error processing transactions for payment ${payment._id}:`, transactionError);
					// Update payment status to failed
					payment.status = 'FAILED';
					payment.errorMessage = transactionError.message;
					await payment.save();
				}

				break;
			}

			case 'checkout.session.failed':
			case 'payment.failed': {
				const sessionId = data.client_reference_id || data.session_id;

				if (sessionId) {
					const payment = await Payment.findOne({
						$or: [
							{ sessionId: sessionId },
							{ 'providerResponse.session_id': sessionId },
						],
					});

					if (payment && payment.status === 'PENDING') {
						payment.status = 'FAILED';
						payment.errorMessage = data.failure_reason || 'Payment failed';
						payment.providerResponse = {
							...payment.providerResponse,
							webhook_data: data,
						};
						await payment.save();
						console.log(`Payment ${payment._id} marked as failed via webhook`);
					}
				}
				break;
			}

			default:
				console.log(`Unhandled webhook event type: ${event_type}`);
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Webhook processed successfully',
			},
		};
	} catch (error) {
		console.error('Payoneer webhook error:', error);
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
const processPaymentCompletion = async (payment) => {
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
			purchaseMethod: payment.isManual ? 'MANUAL_PAYMENT' : 'PAYMENT_GATEWAY',
		});

		console.log(`Created user plan ${userPlan._id} for payment ${payment._id}`);
	}
};