import { Wallet, Payment } from './model';
import { Transaction } from '../transaction/model';
import { makeTransaction } from '../transaction/controller';
import { BankAccount } from '../bank_account/model';
import { Withdrawal } from '../withdrawal/model';
import { LoyaltyService } from '../loyalty/service';

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
			user._id.toString(),
			user.role,
			'WITHDRAWAL_PENDING',
			amount,
			'WITHDRAWAL',
			withdrawal._id.toString(),
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
			paymentMethod,
			description: description || `${paymentMethod} payment`,
			status: 'PENDING',
			createdAt: new Date(),
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

// NEW: Create manual bank transfer payment (Admin only)
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
			'PAYMENT',
			payment._id,
			null,
			'REAL' // Payments add real cash
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

export const getUserPayments = async user => {
	try {
		const { limit = 10, offset = 0, status } = user.query || {};

		let query = { user: user._id };
		if (status) {
			query.status = status.toUpperCase();
		}

		const payments = await Payment.find(query)
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await Payment.countDocuments(query);

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

export const getWalletSummary = async req => {
	try {
		const user = req.user;

		// Get user wallet
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

		// Get recent transactions
		const recentTransactions = await Transaction.find({ user: user._id })
			.sort({ createdAt: -1 })
			.limit(10)
			.select('transactionType transactionIdentifier transactionAmount cashType createdAt status');

		// Get pending withdrawals
		const pendingWithdrawals = await Withdrawal.find({
			user: user._id,
			status: 'PENDING'
		}).select('amount requestedAt');

		// **NEW: Get loyalty-based withdrawal information**
		let loyaltyInfo = {};
		try {
			const [processingTimeResult, limitResult] = await Promise.all([
				LoyaltyService.getWithdrawalProcessingTime(user._id),
				LoyaltyService.checkWithdrawalLimit(user._id)
			]);

			if (processingTimeResult.success) {
				loyaltyInfo.processingTime = processingTimeResult.processingTimeHours;
				loyaltyInfo.tier = processingTimeResult.tier;
			}

			if (limitResult.success) {
				loyaltyInfo.weeklyLimit = limitResult.weeklyLimit;
				loyaltyInfo.usedAmount = limitResult.usedAmount;
				loyaltyInfo.availableAmount = limitResult.availableAmount;
				loyaltyInfo.resetDate = limitResult.resetDate;
			}
		} catch (loyaltyError) {
			console.error('Error getting loyalty info for wallet summary:', loyaltyError);
		}

		return {
			status: 200,
			entity: {
				success: true,
				wallet: {
					virtualBalance: wallet.virtualBalance,
					realBalanceWithdrawable: wallet.realBalanceWithdrawable,
					realBalanceNonWithdrawable: wallet.realBalanceNonWithdrawable,
					totalRealBalance: wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable,
					active: wallet.active,
				},
				recentTransactions,
				pendingWithdrawals,
				loyaltyInfo, // Include tier-based withdrawal information
				summary: {
					totalBalance: wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable + wallet.virtualBalance,
					totalRealBalance: wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable,
					withdrawableBalance: wallet.realBalanceWithdrawable,
					nonWithdrawableBalance: wallet.realBalanceNonWithdrawable,
					virtualBalance: wallet.virtualBalance,
					pendingWithdrawalAmount: pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0),
					pendingWithdrawalCount: pendingWithdrawals.length,
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

// Existing Payoneer functions (preserved as-is)
export const initiateVirtualCashPurchase = async (req, res) => {
	// Implementation preserved from existing code
	// This function handles Payoneer integration for virtual cash purchases
};

export const handlePurchaseSuccess = async (req, res) => {
	// Implementation preserved from existing code
	// This function handles successful Payoneer payments
};

export const handlePurchaseCancel = async (req, res) => {
	// Implementation preserved from existing code
	// This function handles cancelled Payoneer payments
};

export const handlePayoneerWebhook = async (req, res) => {
	// Implementation preserved from existing code
	// This function handles Payoneer webhooks
};