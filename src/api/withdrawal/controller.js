import { Withdrawal } from './model';
import { Wallet } from '../wallet/model';
import { BankAccount } from '../bank_account/model';
import { Transaction } from '../transaction/model';
import { LoyaltyService } from '../loyalty/service';
import { makeTransaction } from '../transaction/controller';

export const initiateWithdrawal = async req => {
	try {
		const { amount, bankAccountId } = req.body;
		const user = req.user;

		// Validate input
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

		// **NEW: Check loyalty-based withdrawal limits**
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
		const withdrawal = await Withdrawal.findById(id).populate('user');
		if (!withdrawal) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Withdrawal not found',
				},
			};
		}

		if (withdrawal.status !== 'PENDING') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Withdrawal is not in pending status',
				},
			};
		}

		// Update withdrawal status
		withdrawal.status = 'APPROVED';
		withdrawal.approvedBy = admin._id;
		withdrawal.processedDate = new Date();
		await withdrawal.save();

		// Update transaction status
		await Transaction.updateOne(
			{
				transactionIdentifier: 'WITHDRAWAL_PENDING',
				'transactionData.withdrawalId': withdrawal._id,
			},
			{
				status: 'COMPLETED',
				transactionIdentifier: 'WITHDRAWAL_APPROVED',
			}
		);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
				message: 'Withdrawal approved successfully',
			},
		};
	} catch (error) {
		console.log(error);
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
		const withdrawal = await Withdrawal.findById(id).populate('user');
		if (!withdrawal) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Withdrawal not found',
				},
			};
		}

		if (withdrawal.status !== 'PENDING') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Withdrawal is not in pending status',
				},
			};
		}

		// Update withdrawal status
		withdrawal.status = 'REJECTED';
		withdrawal.rejectionReason = reason || 'Rejected by admin';
		withdrawal.approvedBy = admin._id;
		withdrawal.processedDate = new Date();
		await withdrawal.save();

		await makeTransaction(
			withdrawal.user._id.toString(),
			withdrawal.user.role,
			'WITHDRAWAL_REJECTED',
			withdrawal.amount,
			'WITHDRAWAL',
			withdrawal._id.toString(),
			null,
			'REAL'
		);

		// Update original transaction status
		await Transaction.updateOne(
			{
				transactionIdentifier: 'WITHDRAWAL_PENDING',
				'transactionData.withdrawalId': withdrawal._id,
			},
			{
				status: 'REJECTED',
				transactionIdentifier: 'WITHDRAWAL_REJECTED',
			}
		);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
				message: 'Withdrawal rejected and amount refunded',
			},
		};
	} catch (error) {
		console.log(error);
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
				error: error.message || 'Failed to get user withdrawals',
			},
		};
	}
};

export const getWithdrawals = async (req, res) => {
	return await getUserWithdrawals(req);
};

export const getAdminWithdrawals = async req => {
	try {
		const { limit = 20, offset = 0, status, userId } = req.query;

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
				error: error.message || 'Failed to get admin withdrawals',
			},
		};
	}
};