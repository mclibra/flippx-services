import { Withdrawal } from '../../withdrawal/model';
import { Transaction } from '../../transaction/model';
import { makeTransaction } from '../../transaction/controller';
import { completePayout, deletePayout } from '../../../services/rapyd';

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

		if (withdrawal.status !== 'PENDING') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Withdrawal is not in pending status',
				},
			};
		}

		// Verify payout was created (should have paymentReference or rapydPayoutId)
		const payoutId =
			withdrawal.paymentReference ||
			withdrawal.paymentDetails?.rapydPayoutId;
		if (!payoutId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Payout not found. Withdrawal must have a payout ID.',
				},
			};
		}

		try {
			// Complete payout in Rapyd
			const completedPayout = await completePayout(payoutId);

			// Update withdrawal status
			withdrawal.status = 'PROCESSING';
			withdrawal.approvedBy = admin._id;
			withdrawal.processedDate = new Date();
			withdrawal.paymentDetails = {
				...withdrawal.paymentDetails,
				rapydPayoutId: payoutId,
				rapydPayoutData: completedPayout,
			};
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
						'Withdrawal approved and payout completed successfully',
					payoutId: payoutId,
				},
			};
		} catch (rapydError) {
			console.error('Rapyd payout completion error:', rapydError);

			// Revert withdrawal status
			withdrawal.status = 'PENDING';
			withdrawal.errorMessage =
				rapydError.response?.data?.status?.message ||
				rapydError.message ||
				'Failed to complete payout';
			await withdrawal.save();

			return {
				status: 500,
				entity: {
					success: false,
					error:
						rapydError.response?.data?.status?.message ||
						'Failed to complete payout with Rapyd. Please try again.',
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

		// Get payout ID if it exists
		const payoutId =
			withdrawal.paymentReference ||
			withdrawal.paymentDetails?.rapydPayoutId;

		// Delete payout in Rapyd if it exists
		if (payoutId) {
			try {
				await deletePayout(payoutId);
			} catch (deleteError) {
				console.error('Rapyd payout deletion error:', deleteError);
				// Continue with rejection even if delete fails
				// The payout may have already been deleted or may not exist
			}
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
				message: 'Withdrawal rejected and payout deleted',
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
