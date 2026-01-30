import { Withdrawal } from '../../withdrawal/model';
import { Transaction } from '../../transaction/model';
import { makeTransaction } from '../../transaction/controller';
import { createPayout } from '../../../services/rapyd';
import { User } from '../../user/model';

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

		// Find the withdrawal with bank account and user details
		const withdrawal = await Withdrawal.findById(id)
			.populate('user')
			.populate('bankAccount');
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

		// Get user details
		const user = await User.findById(
			withdrawal.user._id || withdrawal.user
		);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		// Update withdrawal status to processing
		withdrawal.status = 'PROCESSING';
		withdrawal.approvedBy = admin._id;
		withdrawal.processedDate = new Date();
		await withdrawal.save();

		try {
			// Get beneficiary ID from bank account (should be created when bank account was added)
			const beneficiaryId =
				withdrawal.bankAccount.rapydBeneficiaryId ||
				withdrawal.paymentDetails?.rapydBeneficiaryId;

			// Verify beneficiary ID exists - it should have been created when bank account was added
			if (!beneficiaryId) {
				throw new Error(
					'Beneficiary ID not found. The bank account must have a valid Rapyd beneficiary. Please ensure the bank account was created successfully.'
				);
			}

			// Check if there was an error creating the beneficiary
			if (withdrawal.bankAccount.rapydBeneficiaryError) {
				throw new Error(
					`Bank account has a beneficiary creation error: ${withdrawal.bankAccount.rapydBeneficiaryError}. Please contact support.`
				);
			}

			// Create payout in Rapyd
			const payout = await createPayout({
				beneficiaryId,
				amount: withdrawal.netAmount, // Use net amount after fees
				currency: 'USD',
				description: `Withdrawal for user ${user.email}`,
				reference: withdrawal._id.toString(),
				payoutMethodType: 'us_standard_bank_account', // Should match beneficiary category
				metadata: {
					userId: user._id.toString(),
					withdrawalId: withdrawal._id.toString(),
					bankAccountId: withdrawal.bankAccount._id.toString(),
				},
			});

			// Update withdrawal with payout details
			withdrawal.paymentReference = payout.id;
			withdrawal.paymentDetails = {
				...withdrawal.paymentDetails,
				rapydPayoutId: payout.id,
				rapydPayoutData: payout,
			};
			withdrawal.status = 'PROCESSING';
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
					message:
						'Withdrawal approved and payout initiated successfully',
					payoutId: payout.id,
				},
			};
		} catch (rapydError) {
			console.error('Rapyd payout creation error:', rapydError);

			// Revert withdrawal status
			withdrawal.status = 'PENDING';
			withdrawal.errorMessage =
				rapydError.response?.data?.status?.message ||
				rapydError.message ||
				'Failed to create payout';
			await withdrawal.save();

			return {
				status: 500,
				entity: {
					success: false,
					error:
						rapydError.response?.data?.status?.message ||
						'Failed to create payout with Rapyd. Please try again.',
				},
			};
		}
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
				error: error.message || 'Failed to get admin withdrawals',
			},
		};
	}
};
