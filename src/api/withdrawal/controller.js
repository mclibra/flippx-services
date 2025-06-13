import { Withdrawal } from './model';
import { BankAccount } from '../bank_account/model';
import { Wallet } from '../wallet/model';
import { Transaction } from '../transaction/model';
import { User } from '../user/model';
import { payoneerConfig } from '../../../config';

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
		const withdrawal =
			await Withdrawal.findById(id).populate('bankAccount');
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

		// Get system account
		const systemAccount = await User.findOne({ role: 'SYSTEM' });

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
		await withdrawal.save();

		// Update transaction status
		pendingTransaction.status = 'COMPLETED';
		pendingTransaction.transactionIdentifier = 'WITHDRAWAL';
		await pendingTransaction.save();

		// Record system transaction
		await Transaction.create({
			user: systemAccount._id,
			cashType: 'REAL',
			transactionType: 'DEBIT',
			transactionIdentifier: 'WITHDRAWAL_PAYOUT',
			transactionAmount: withdrawal.netAmount,
			previousBalance: 0,
			newBalance: 0,
			referenceType: 'USER',
			referenceIndex: withdrawal.user,
			transactionData: {
				withdrawalId: withdrawal._id,
				bankAccountId: withdrawal.bankAccount._id,
			},
			status: 'COMPLETED',
		});

		// TODO: Initiate the actual payout with Payoneer
		// This would typically be handled by a background job

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
				message: 'Withdrawal approved and will be processed',
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
				reason,
			},
			status: 'COMPLETED',
		});

		return {
			status: 200,
			entity: {
				success: true,
				withdrawal,
				message: 'Withdrawal rejected and funds returned to user',
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

export const getWithdrawals = async req => {
	try {
		const user = req.user;
		const { status, limit = 10, offset = 0 } = req.query;

		// Build query
		const query = { user: user._id };

		if (status) {
			query.status = status.toUpperCase();
		}

		// Get withdrawals
		const withdrawals = await Withdrawal.find(query)
			.sort({ requestDate: -1 })
			.skip(parseInt(offset))
			.limit(parseInt(limit))
			.populate('bankAccount', '-user');

		const total = await Withdrawal.countDocuments(query);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawals,
				total,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get withdrawals',
			},
		};
	}
};

export const getAdminWithdrawals = async req => {
	try {
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

		const { status, limit = 10, offset = 0, userId } = req.query;

		// Build query
		const query = {};

		if (status) {
			query.status = status.toUpperCase();
		}

		if (userId) {
			query.user = userId;
		}

		// Get withdrawals
		const withdrawals = await Withdrawal.find(query)
			.sort({ requestDate: -1 })
			.skip(parseInt(offset))
			.limit(parseInt(limit))
			.populate('bankAccount')
			.populate('user', 'name email phone');

		const total = await Withdrawal.countDocuments(query);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawals,
				total,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get withdrawals',
			},
		};
	}
};
