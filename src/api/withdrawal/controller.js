import { Withdrawal } from './model';
import { Wallet } from '../wallet/model';
import { BankAccount } from '../bank_account/model';
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
			const withdrawalLimitResult =
				await LoyaltyService.checkWithdrawalLimit(user._id);
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
					availableWithdrawable: wallet
						? wallet.realBalanceWithdrawable
						: 0,
					totalReal: wallet
						? wallet.realBalanceWithdrawable +
							wallet.realBalanceNonWithdrawable
						: 0,
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
			withdrawal._id.toString(),
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
					hasMore: parseInt(offset) + parseInt(limit) < total,
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

export const getWithdrawals = async req => {
	return await getUserWithdrawals(req);
};
