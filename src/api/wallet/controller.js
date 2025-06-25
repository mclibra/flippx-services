import { Wallet, Payment } from './model';
import { Transaction } from '../transaction/model';
import { makeTransaction } from '../transaction/controller';
import { BankAccount } from '../bank_account/model';
import { Withdrawal } from '../withdrawal/model';
import { LoyaltyService } from '../loyalty/service';
import { createPaymentSession, getPaymentSession, verifyWebhookSignature } from '../../services/payoneer';

export const getUserBalance = async user => {
	try {
		const wallet = await Wallet.findOne({ user: user._id });
		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Wallet not found',
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				balance: {
					virtualBalance: wallet.virtualBalance,
					realBalanceWithdrawable: wallet.realBalanceWithdrawable,
					realBalanceNonWithdrawable: wallet.realBalanceNonWithdrawable,
					totalRealBalance: wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable,
					totalBalance: wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable + wallet.virtualBalance,
				},
			},
		};
	} catch (error) {
		console.error('Get wallet balance error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get wallet balance',
			},
		};
	}
};

export const withdrawalRequest = async (user, body) => {
	try {
		const { amount, bankAccountId } = body;

		// **NEW: Document Verification Check**
		if (
			!user.idProof ||
			user.idProof.verificationStatus !== 'VERIFIED' ||
			!user.addressProof ||
			user.addressProof.verificationStatus !== 'VERIFIED'
		) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Document verification required to request withdrawal. Please upload and get your ID and address documents verified.',
				},
			};
		}

		// Validate amount
		if (!amount || amount <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid withdrawal amount',
				},
			};
		}

		if (!bankAccountId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Bank account is required',
				},
			};
		}

		// **NEW: Check tier-based withdrawal limits**
		try {
			const withdrawalLimitResult = await LoyaltyService.checkWithdrawalLimit(user._id);
			if (!withdrawalLimitResult.success) {
				return {
					status: 500,
					entity: {
						success: false,
						error: 'Failed to validate withdrawal limits. Please try again.',
					},
				};
			}

			if (amount > withdrawalLimitResult.availableAmount) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Withdrawal amount exceeds your weekly limit. Available: $${withdrawalLimitResult.availableAmount}, Requested: $${amount}`,
						availableAmount: withdrawalLimitResult.availableAmount,
						weeklyLimit: withdrawalLimitResult.weeklyLimit,
						usedAmount: withdrawalLimitResult.usedAmount,
						resetDate: withdrawalLimitResult.resetDate,
					},
				};
			}
		} catch (loyaltyError) {
			console.error('Error checking withdrawal limits:', loyaltyError);
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Failed to validate withdrawal limits. Please try again.',
				},
			};
		}

		// Verify sufficient withdrawable real cash balance
		const wallet = await Wallet.findOne({ user: user._id });
		if (!wallet || wallet.realBalanceWithdrawable < amount) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Insufficient withdrawable real cash balance',
					availableWithdrawable: wallet ? wallet.realBalanceWithdrawable : 0,
					totalReal: wallet ? wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable : 0,
				},
			};
		}

		// Validate bank account
		const bankAccount = await BankAccount.findById(bankAccountId);
		if (
			!bankAccount ||
			bankAccount.user.toString() !== user._id.toString()
		) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid bank account',
				},
			};
		}

		// Calculate withdrawal fee (if any)
		const fee = 0; // No fee for now
		const netAmount = amount - fee;

		// Create withdrawal record
		const withdrawal = await Withdrawal.create({
			user: user._id,
			bankAccount: bankAccountId,
			amount,
			fee,
			netAmount,
			status: 'PENDING',
			requestDate: new Date(),
		});

		await makeTransaction(
			user._id,
			user.role,
			'WITHDRAWAL_PENDING',
			amount,
			withdrawal._id,
			'WITHDRAWAL',
			bankAccountId,
			'REAL'
		);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
				message: 'Withdrawal initiated and pending approval',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to initiate withdrawal request',
			},
		};
	}
};

export const createPayment = async (user, body) => {
	try {
		const { amount, paymentMethod, description } = body;

		// Validate payment data
		if (!amount || amount <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid payment amount',
				},
			};
		}

		if (!paymentMethod) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Payment method is required',
				},
			};
		}

		// Create payment record
		const payment = await Payment.create({
			user: user._id,
			amount,
			method: paymentMethod,
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
			amount,
			bankTransferReference,
			bankName,
			transferDate,
			depositorName,
			notes,
		} = body;

		// Validate required fields
		if (!userId || !amount || amount <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'User ID and valid amount are required',
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
		const { User } = require('../user/model');
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

		// Create manual payment record
		const payment = await Payment.create({
			user: userId,
			amount,
			currency: 'USD',
			method: 'BANK_TRANSFER',
			status: 'PENDING',
			isManual: true,
			bankTransferReference,
			bankName: bankName || null,
			transferDate: transferDate ? new Date(transferDate) : new Date(),
			depositorName: depositorName || null,
			notes: notes || null,
			realCashAmount: amount, // Full amount goes to real cash
			virtualCashAmount: 0,
		});

		return {
			status: 200,
			entity: {
				success: true,
				payment,
				message: 'Manual payment record created successfully',
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
		const payment = await Payment.findById(paymentId);
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

		// Get user wallet
		const wallet = await Wallet.findOne({ user: payment.user });
		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		// Update payment status
		payment.status = 'COMPLETED';
		payment.confirmedAt = new Date();
		payment.confirmedBy = user._id;
		await payment.save();

		await makeTransaction(
			payment.user,
			'USER',
			'WIRE_TRANSFER',
			payment.amount,
			payment._id,
			'PAYMENT',
			null,
			'REAL'
		);

		// **NEW: Record deposit for loyalty tracking**
		try {
			const loyaltyResult = await LoyaltyService.recordUserDeposit(
				payment.user,
				payment.amount
			);
			if (!loyaltyResult.success) {
				console.warn(`Failed to record payment deposit for loyalty tracking for user ${payment.user}:`, loyaltyResult.error);
			} else {
				console.log(`Payment deposit recorded for loyalty tracking: User ${payment.user}, Amount: ${payment.amount}`);
			}
		} catch (loyaltyError) {
			console.error(`Error recording payment deposit for loyalty tracking for user ${payment.user}:`, loyaltyError);
		}

		// Get updated wallet
		const updatedWallet = await Wallet.findOne({ user: payment.user });

		return {
			status: 200,
			entity: {
				success: true,
				payment,
				wallet: updatedWallet,
				message: 'Payment confirmed and funds added to wallet',
			},
		};
	} catch (error) {
		console.error('Payment confirmation error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to confirm payment',
			},
		};
	}
};

export const getUserPayments = async ({ _id, query }) => {
	try {
		const {
			page = 1,
			limit = 10,
			status,
			method,
		} = query;

		const filters = { user: _id };

		if (status) filters.status = status;
		if (method) filters.method = method;

		const skip = (parseInt(page) - 1) * parseInt(limit);

		const payments = await Payment.find(filters)
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))
			.select('-providerResponse -metadata')
			.lean();

		const total = await Payment.countDocuments(filters);

		return {
			status: 200,
			entity: {
				success: true,
				payments,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / parseInt(limit)),
				},
			},
		};
	} catch (error) {
		console.error('Get user payments error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get user payments',
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
					error: 'Unauthorized',
				},
			};
		}

		const { limit = 10, offset = 0, status, userId } = query;

		let searchQuery = {};
		if (status) {
			searchQuery.status = status.toUpperCase();
		}
		if (userId) {
			searchQuery.user = userId;
		}

		const payments = await Payment.find(searchQuery)
			.populate('user', 'name phone email')
			.populate('confirmedBy', 'name')
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await Payment.countDocuments(searchQuery);

		return {
			status: 200,
			entity: {
				success: true,
				payments,
				total,
				pagination: {
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: (parseInt(offset) + parseInt(limit)) < total,
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

export const getWalletSummary = async (req) => {
	try {
		const user = req.user;
		// Verify admin access
		if (!['ADMIN'].includes(user.role)) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		// Find all wallets with user data
		const wallets = await Wallet.aggregate([
			{
				$lookup: {
					from: 'users',
					localField: 'user',
					foreignField: '_id',
					as: 'userData',
				},
			},
			{
				$unwind: '$userData',
			},
			{
				$match: {
					'userData.role': { $nin: ['ADMIN', 'SYSTEM'] },
				},
			},
		]);

		// Get recent transactions
		const recentTransactions = await Transaction.find({})
			.populate('user', 'name phone')
			.sort({ createdAt: -1 })
			.limit(10)
			.lean();

		// Get pending withdrawals
		const pendingWithdrawals = await Withdrawal.find({
			status: 'PENDING',
		})
			.populate('user', 'name phone')
			.populate('bankAccount')
			.sort({ createdAt: -1 })
			.lean();

		// Calculate totals
		const totalVirtualBalance = wallets.reduce((sum, w) => sum + w.virtualBalance, 0);
		const totalRealBalanceWithdrawable = wallets.reduce((sum, w) => sum + w.realBalanceWithdrawable, 0);
		const totalRealBalanceNonWithdrawable = wallets.reduce((sum, w) => sum + w.realBalanceNonWithdrawable, 0);
		const totalRealBalance = totalRealBalanceWithdrawable + totalRealBalanceNonWithdrawable;
		const totalBalance = totalVirtualBalance + totalRealBalance;

		// **NEW: Get loyalty tier distribution summary**
		let loyaltyInfo = null;
		try {
			const loyaltyResult = await LoyaltyService.getLoyaltyTierDistribution();
			if (loyaltyResult.success) {
				loyaltyInfo = loyaltyResult.data;
				loyaltyInfo.nextResetDate = loyaltyResult.resetDate;
			}
		} catch (loyaltyError) {
			console.error('Error getting loyalty info for wallet summary:', loyaltyError);
		}

		return {
			status: 200,
			entity: {
				success: true,
				wallet: {
					virtualBalance: totalVirtualBalance,
					realBalanceWithdrawable: totalRealBalanceWithdrawable,
					realBalanceNonWithdrawable: totalRealBalanceNonWithdrawable,
					totalRealBalance: totalRealBalance,
					totalBalance: totalBalance,
				},
				recentTransactions,
				pendingWithdrawals,
				loyaltyInfo, // Include tier-based withdrawal information
				summary: {
					totalBalance: totalBalance,
					totalRealBalance: totalRealBalance,
					withdrawableBalance: totalRealBalanceWithdrawable,
					nonWithdrawableBalance: totalRealBalanceNonWithdrawable,
					virtualBalance: totalVirtualBalance,
					pendingWithdrawalAmount: pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0),
					pendingWithdrawalCount: pendingWithdrawals.length,
					totalUsers: wallets.length,
				},
			},
		};
	} catch (error) {
		console.error('Wallet summary error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get wallet summary',
			},
		};
	}
};

export const initiateVirtualCashPurchase = async (req, res) => {
	try {
		const { amount, virtualCashAmount, realCashAmount, currency = 'USD' } = req.body;
		const user = req.user;

		// Validate required fields
		if (!amount || amount <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid amount specified',
				},
			};
		}

		// Validate cash distribution
		const totalCashAmount = (virtualCashAmount || 0) + (realCashAmount || 0);
		if (Math.abs(totalCashAmount - amount) > 0.01) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Virtual and real cash amounts must sum to total amount',
				},
			};
		}

		// Generate unique session ID for tracking
		const sessionId = `vcash_${user._id}_${Date.now()}`;

		// Get base URL from environment or use default
		const baseUrl = process.env.HOST_URL || 'http://localhost:3000';


		let paymentSession;
		try {
			paymentSession = await createPaymentSession({
				amount,
				currency,
				description: `Virtual Cash Purchase - ${virtualCashAmount || 0} Virtual, ${realCashAmount || 0} Real`,
				successUrl: `${baseUrl}/api/wallet/purchase/success?session_id=${sessionId}`,
				cancelUrl: `${baseUrl}/api/wallet/purchase/cancel?session_id=${sessionId}`,
				metadata: {
					userId: user._id,
					virtualCashAmount: virtualCashAmount || 0,
					realCashAmount: realCashAmount || 0,
					sessionId,
				},
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
			virtualCashAmount: virtualCashAmount || 0,
			realCashAmount: realCashAmount || 0,
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
					virtualCashAmount: payment.virtualCashAmount,
					realCashAmount: payment.realCashAmount,
					status: payment.status,
				},
			},
		};
	} catch (error) {
		console.error('Initiate virtual cash purchase error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to initiate purchase',
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

		// Check if already processed
		if (payment.status === 'COMPLETED') {
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

		// Verify payment with Payoneer
		const payoneerSession = await getPaymentSession(payment.providerResponse.session_id);

		// Check if payment was actually successful
		if (payoneerSession.status !== 'COMPLETED' && payoneerSession.status !== 'PAID') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Payment not completed successfully',
				},
			};
		}

		// Update payment status
		payment.status = 'COMPLETED';
		payment.providerResponse = {
			...payment.providerResponse,
			completion_data: payoneerSession,
		};
		await payment.save();

		// Get user wallet
		const wallet = await Wallet.findOne({ user: payment.user });
		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		// Credit virtual cash if specified
		if (payment.virtualCashAmount > 0) {
			await makeTransaction(
				payment.user,
				'USER',
				'VIRTUAL_CASH_PURCHASE',
				payment.virtualCashAmount,
				payment._id,
				'PAYMENT',
				null,
				'VIRTUAL'
			);
		}

		// Credit real cash if specified (goes to non-withdrawable)
		if (payment.realCashAmount > 0) {
			await makeTransaction(
				payment.user,
				'USER',
				'REAL_CASH_PURCHASE',
				payment.realCashAmount,
				payment._id,
				'PAYMENT',
				null,
				'REAL'
			);
		}

		// **NEW: Record deposit for loyalty tracking**
		try {
			const loyaltyResult = await LoyaltyService.recordUserDeposit(
				payment.user,
				payment.amount
			);
			if (!loyaltyResult.success) {
				console.warn(`Failed to record deposit for user ${payment.user}:`, loyaltyResult.error);
			}
		} catch (loyaltyError) {
			console.error(`Error recording deposit for user ${payment.user}:`, loyaltyError);
		}

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
				});

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

				// Process wallet credits
				try {
					// Credit virtual cash if specified
					if (payment.virtualCashAmount > 0) {
						await makeTransaction(
							payment.user,
							'USER',
							'VIRTUAL_CASH_PURCHASE',
							payment.virtualCashAmount,
							payment._id,
							'PAYMENT',
							null,
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
							'PAYMENT',
							null,
							'REAL'
						);
					}

					// Record deposit for loyalty tracking
					try {
						const loyaltyResult = await LoyaltyService.recordUserDeposit(
							payment.user,
							payment.amount
						);
						if (!loyaltyResult.success) {
							console.warn(`Failed to record deposit for user ${payment.user}:`, loyaltyResult.error);
						}
					} catch (loyaltyError) {
						console.error(`Error recording deposit for user ${payment.user}:`, loyaltyError);
					}

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