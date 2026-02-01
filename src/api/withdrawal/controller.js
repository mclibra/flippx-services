import { Withdrawal } from './model';
import { Wallet } from '../wallet/model';
import { BankAccount } from '../bank_account/model';
import { Card } from '../card/model';
import { LoyaltyService } from '../loyalty/service';
import { makeTransaction } from '../transaction/controller';
import { Transaction } from '../transaction/model';

export const initiateWithdrawal = async req => {
	try {
		const { amount, bankAccountId, cardId } = req.body;
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

		// Either bankAccountId or cardId must be provided
		if (!bankAccountId && !cardId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Either bank account or card is required',
				},
			};
		}

		// Cannot provide both bankAccountId and cardId
		if (bankAccountId && cardId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Cannot provide both bank account and card. Please provide either bankAccountId or cardId.',
				},
			};
		}

		// **NEW: Check loyalty-based withdrawal limits**
		try {
			console.log(
				'[initiateWithdrawal] Checking withdrawal limit for user:',
				user._id
			);
			const withdrawalLimitResult =
				await LoyaltyService.checkUserWithdrawalLimit(user._id);
			console.log(
				'[initiateWithdrawal] Withdrawal limit result:',
				JSON.stringify(withdrawalLimitResult, null, 2)
			);

			if (!withdrawalLimitResult.success) {
				console.error(
					'[initiateWithdrawal] Withdrawal limit check failed:',
					withdrawalLimitResult.error
				);
				return {
					status: 500,
					entity: {
						success: false,
						error:
							withdrawalLimitResult.error ||
							'Failed to validate withdrawal limits. Please try again.',
					},
				};
			}

			// Map the returned properties to expected format
			const availableAmount = withdrawalLimitResult.remaining || 0;
			const usedAmount = withdrawalLimitResult.used || 0;

			if (amount > availableAmount) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Withdrawal amount exceeds your weekly limit. Available: $${availableAmount}, Requested: $${amount}`,
						availableAmount,
						weeklyLimit: withdrawalLimitResult.weeklyLimit,
						usedAmount,
						resetDate: withdrawalLimitResult.resetDate,
					},
				};
			}
		} catch (loyaltyError) {
			console.error(
				'[initiateWithdrawal] Error checking withdrawal limits:',
				loyaltyError
			);
			console.error(
				'[initiateWithdrawal] Error stack:',
				loyaltyError.stack
			);
			return {
				status: 500,
				entity: {
					success: false,
					error:
						loyaltyError.message ||
						'Failed to validate withdrawal limits. Please try again.',
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

		// Validate bank account or card
		let bankAccount = null;
		let card = null;

		if (bankAccountId) {
			bankAccount = await BankAccount.findById(bankAccountId);
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
		}

		if (cardId) {
			card = await Card.findById(cardId);
			if (!card || card.user.toString() !== user._id.toString()) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Invalid card',
					},
				};
			}

			// Verify card has a valid beneficiary
			if (!card.rapydBeneficiaryId) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Card does not have a valid beneficiary. Please ensure the card was created successfully.',
					},
				};
			}

			if (card.rapydBeneficiaryError) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Card has a beneficiary creation error: ${card.rapydBeneficiaryError}. Please contact support.`,
					},
				};
			}
		}

		// Calculate withdrawal fee (if any)
		const fee = 0; // No fee for now
		const netAmount = amount - fee;

		// Create withdrawal record
		const withdrawalData = {
			user: user._id,
			amount,
			fee,
			netAmount,
			status: 'PENDING',
			requestDate: new Date(),
		};

		if (bankAccountId) {
			withdrawalData.bankAccount = bankAccountId;
		}

		if (cardId) {
			withdrawalData.card = cardId;
		}

		const withdrawal = await Withdrawal.create(withdrawalData);

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
			.populate('card')
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

export const cancelWithdrawal = async req => {
	try {
		const { id } = req.params;
		const user = req.user;

		// Find the withdrawal and verify it belongs to the user
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

		// Verify the withdrawal belongs to the authenticated user
		if (withdrawal.user.toString() !== user._id.toString()) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized - This withdrawal does not belong to you',
				},
			};
		}

		// Only allow cancellation of PENDING withdrawals
		if (withdrawal.status !== 'PENDING') {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Cannot cancel withdrawal with status: ${withdrawal.status}. Only PENDING withdrawals can be cancelled.`,
				},
			};
		}

		// Update withdrawal status
		withdrawal.status = 'REJECTED';
		withdrawal.rejectionReason = 'Cancelled by user';
		withdrawal.processedDate = new Date();
		await withdrawal.save();

		// Create WITHDRAWAL_REJECTED transaction to refund the amount
		await makeTransaction(
			user._id.toString(),
			user.role,
			'WITHDRAWAL_REJECTED',
			withdrawal.amount,
			withdrawal._id.toString(),
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
				message: 'Withdrawal cancelled and amount refunded',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to cancel withdrawal',
			},
		};
	}
};
