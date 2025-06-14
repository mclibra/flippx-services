import { Wallet, Payment } from './model';
import { Transaction } from '../transaction/model';
import { makeTransaction } from '../transaction/controller';
import { BankAccount } from '../bank_account/model';
import { Withdrawal } from '../withdrawal/model';
import { LoyaltyService } from '../loyalty/service';

export const getUserBalance = async user => {
	try {
		const walletData = await Wallet.findOne({
			user: user._id,
		});
		if (walletData._id) {
			return {
				status: 200,
				entity: {
					success: true,
					walletData,
				},
			};
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid parameters.',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
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

		// **NEW: Check tier-based withdrawal limits**
		try {
			const withdrawalLimitResult = await LoyaltyService.checkWithdrawalLimit(user._id);
			if (!withdrawalLimitResult.success) {
				return {
					status: 400,
					entity: {
						success: false,
						error: withdrawalLimitResult.error || 'Failed to check withdrawal limits',
					},
				};
			}

			if (withdrawalLimitResult.availableAmount < amount) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Weekly withdrawal limit exceeded. Available: $${withdrawalLimitResult.availableAmount}, Requested: $${amount}`,
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

		// Check sufficient balance
		if (wallet.realBalance < amount) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Insufficient real cash balance',
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

		// Calculate processing fee (if any)
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
			requestedAt: new Date(),
		});

		// Update wallet - place hold on funds
		const previousBalance = wallet.realBalance;
		wallet.realBalance -= amount;
		wallet.pendingWithdrawals = (wallet.pendingWithdrawals || 0) + amount;
		await wallet.save();

		// Record transaction
		await Transaction.create({
			user: user._id,
			cashType: 'REAL',
			transactionType: 'PENDING_DEBIT',
			transactionIdentifier: 'WITHDRAWAL_REQUEST',
			transactionAmount: amount,
			previousBalance,
			newBalance: wallet.realBalance,
			transactionData: {
				withdrawalId: withdrawal._id,
				bankAccount: bankAccountId,
			},
			status: 'COMPLETED',
		});

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Withdrawal request submitted successfully',
				withdrawal: {
					id: withdrawal._id,
					amount: withdrawal.amount,
					status: withdrawal.status,
					requestedAt: withdrawal.requestedAt,
				},
				wallet: {
					realBalance: wallet.realBalance,
					pendingWithdrawals: wallet.pendingWithdrawals,
				},
			},
		};
	} catch (error) {
		console.error('Withdrawal request error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process withdrawal request',
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

		// Add funds to wallet using transaction system
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
		console.error('Get payments error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch payments',
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

export const getWalletSummary = async user => {
	try {
		// Get wallet data
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
				wallet,
				recentTransactions,
				pendingWithdrawals,
				loyaltyInfo, // Include tier-based withdrawal information
				summary: {
					totalBalance: wallet.realBalance + wallet.virtualBalance,
					realBalance: wallet.realBalance,
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