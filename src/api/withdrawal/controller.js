import { Withdrawal } from './model';
import { BankAccount } from '../bank_account/model';
import { Wallet } from '../wallet/model';
import { Transaction } from '../transaction/model';
import { User } from '../user/model';
import { payoneerConfig } from '../../../config';
import { LoyaltyService } from '../loyalty/service'; // ADD LOYALTY SERVICE IMPORT

export const initiateWithdrawal = async req => {
	try {
		const { amount, bankAccountId } = req.body;
		const user = req.user;

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
					error: 'Document verification required to initiate withdrawal. Please upload and get your ID and address documents verified.',
				},
			};
		}

		// Validate withdrawal amount
		if (amount < payoneerConfig.minWithdrawalAmount) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Minimum withdrawal amount is ${payoneerConfig.minWithdrawalAmount}`,
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

		// Verify sufficient real cash balance
		const wallet = await Wallet.findOne({ user: user._id });
		if (!wallet || wallet.realBalance < amount) {
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

		// Place a hold on the funds by updating wallet
		const previousBalance = wallet.realBalance;
		wallet.realBalance -= amount;
		await wallet.save();

		// Record transaction
		await Transaction.create({
			user: user._id,
			cashType: 'REAL',
			transactionType: 'DEBIT',
			transactionIdentifier: 'WITHDRAWAL_PENDING',
			transactionAmount: amount,
			previousBalance,
			newBalance: wallet.realBalance,
			transactionData: {
				withdrawalId: withdrawal._id,
				bankAccountId: bankAccountId,
			},
			status: 'PENDING',
		});

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
				error: error.message || 'Failed to initiate withdrawal',
			},
		};
	}
};

export const approveWithdrawal = async req => {
	try {
		const { id } = req.params;
		const admin = req.user;

		// Verify admin permissions
		if (admin.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized',
				},
			};
		}

		// Find the withdrawal
		const withdrawal = await Withdrawal.findById(id);
		if (!withdrawal) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Withdrawal not found',
				},
			};
		}

		// Verify it's in PENDING status
		if (withdrawal.status !== 'PENDING') {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Cannot approve withdrawal in ${withdrawal.status} status`,
				},
			};
		}

		// Find the pending transaction
		const pendingTransaction = await Transaction.findOne({
			user: withdrawal.user,
			cashType: 'REAL',
			transactionIdentifier: 'WITHDRAWAL_PENDING',
			transactionData: {
				withdrawalId: withdrawal._id.toString(),
			},
			status: 'PENDING',
		});

		if (!pendingTransaction) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Pending transaction not found',
				},
			};
		}

		// Update withdrawal status
		withdrawal.status = 'APPROVED';
		withdrawal.approvedBy = admin._id;
		withdrawal.approvedAt = new Date();
		await withdrawal.save();

		// Update transaction status
		pendingTransaction.status = 'COMPLETED';
		await pendingTransaction.save();

		// **NEW: Record withdrawal usage for loyalty tracking**
		try {
			const loyaltyResult = await LoyaltyService.recordWithdrawal(withdrawal.user, withdrawal.amount);
			if (!loyaltyResult.success) {
				console.warn(`Failed to record withdrawal for loyalty tracking for user ${withdrawal.user}:`, loyaltyResult.error);
			} else {
				console.log(`Withdrawal recorded for loyalty tracking: User ${withdrawal.user}, Amount: ${withdrawal.amount}`);
			}
		} catch (loyaltyError) {
			console.error(`Error recording withdrawal for loyalty tracking for user ${withdrawal.user}:`, loyaltyError);
		}

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
				message: 'Withdrawal approved successfully',
			},
		};
	} catch (error) {
		console.error('Withdrawal approval error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to approve withdrawal',
			},
		};
	}
};

export const rejectWithdrawal = async req => {
	try {
		const { id } = req.params;
		const { reason } = req.body;
		const admin = req.user;

		// Verify admin permissions
		if (admin.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized',
				},
			};
		}

		// Find the withdrawal
		const withdrawal = await Withdrawal.findById(id);
		if (!withdrawal) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Withdrawal not found',
				},
			};
		}

		// Verify it's in PENDING status
		if (withdrawal.status !== 'PENDING') {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Cannot reject withdrawal in ${withdrawal.status} status`,
				},
			};
		}

		// Find the user's wallet
		const wallet = await Wallet.findOne({ user: withdrawal.user });

		// Find the pending transaction
		const pendingTransaction = await Transaction.findOne({
			user: withdrawal.user,
			cashType: 'REAL',
			transactionIdentifier: 'WITHDRAWAL_PENDING',
			transactionData: {
				withdrawalId: withdrawal._id.toString(),
			},
			status: 'PENDING',
		});

		if (!pendingTransaction) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Pending transaction not found',
				},
			};
		}

		// Update withdrawal status
		withdrawal.status = 'REJECTED';
		withdrawal.rejectionReason = reason;
		withdrawal.approvedBy = admin._id;
		await withdrawal.save();

		// Return funds to user's wallet
		const previousBalance = wallet.realBalance;
		wallet.realBalance += withdrawal.amount;
		await wallet.save();

		// Update transaction status
		pendingTransaction.status = 'CANCELLED';
		await pendingTransaction.save();

		// Record refund transaction
		await Transaction.create({
			user: withdrawal.user,
			cashType: 'REAL',
			transactionType: 'CREDIT',
			transactionIdentifier: 'WITHDRAWAL_REJECTED',
			transactionAmount: withdrawal.amount,
			previousBalance,
			newBalance: wallet.realBalance,
			transactionData: {
				withdrawalId: withdrawal._id,
				rejectionReason: reason,
			},
			status: 'COMPLETED',
		});

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
				message: 'Withdrawal rejected and funds returned',
			},
		};
	} catch (error) {
		console.error('Withdrawal rejection error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to reject withdrawal',
			},
		};
	}
};

export const getUserWithdrawals = async req => {
	try {
		const user = req.user;
		const { limit = 10, offset = 0, status } = req.query;

		let query = { user: user._id };
		if (status) {
			query.status = status.toUpperCase();
		}

		const withdrawals = await Withdrawal.find(query)
			.populate('bankAccount')
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await Withdrawal.countDocuments(query);

		// **NEW: Get user's withdrawal processing time and limits based on tier**
		let withdrawalInfo = {};
		try {
			const [processingTimeResult, limitResult] = await Promise.all([
				LoyaltyService.getWithdrawalProcessingTime(user._id),
				LoyaltyService.checkWithdrawalLimit(user._id)
			]);

			if (processingTimeResult.success) {
				withdrawalInfo.processingTime = processingTimeResult.processingTimeHours;
				withdrawalInfo.tier = processingTimeResult.tier;
			}

			if (limitResult.success) {
				withdrawalInfo.weeklyLimit = limitResult.weeklyLimit;
				withdrawalInfo.usedAmount = limitResult.usedAmount;
				withdrawalInfo.availableAmount = limitResult.availableAmount;
				withdrawalInfo.resetDate = limitResult.resetDate;
			}
		} catch (loyaltyError) {
			console.error('Error getting withdrawal info for user:', loyaltyError);
		}

		return {
			status: 200,
			entity: {
				success: true,
				withdrawals,
				total,
				pagination: {
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: (parseInt(offset) + parseInt(limit)) < total,
				},
				withdrawalInfo, // Include tier-based withdrawal information
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch withdrawals',
			},
		};
	}
};

export const getAllWithdrawals = async req => {
	try {
		const admin = req.user;
		const { limit = 10, offset = 0, status, userId } = req.query;

		// Verify admin permissions
		if (admin.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized',
				},
			};
		}

		let query = {};
		if (status) {
			query.status = status.toUpperCase();
		}
		if (userId) {
			query.user = userId;
		}

		const withdrawals = await Withdrawal.find(query)
			.populate('user', 'name phone email')
			.populate('bankAccount')
			.populate('approvedBy', 'name')
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await Withdrawal.countDocuments(query);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawals,
				total,
				pagination: {
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: (parseInt(offset) + parseInt(limit)) < total,
				},
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch withdrawals',
			},
		};
	}
};

export const getWithdrawalById = async req => {
	try {
		const { id } = req.params;
		const user = req.user;

		let query = { _id: id };

		// Non-admin users can only see their own withdrawals
		if (user.role !== 'ADMIN') {
			query.user = user._id;
		}

		const withdrawal = await Withdrawal.findOne(query)
			.populate('user', 'name phone email')
			.populate('bankAccount')
			.populate('approvedBy', 'name');

		if (!withdrawal) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Withdrawal not found',
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch withdrawal',
			},
		};
	}
};