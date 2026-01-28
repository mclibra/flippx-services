import { Withdrawal } from '../../withdrawal/model';
import { Transaction } from '../../transaction/model';
import { makeTransaction } from '../../transaction/controller';
import { createBeneficiary, createPayout } from '../../../services/rapyd';
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
			// Use beneficiary ID from bank account (should be created when bank account was added)
			let beneficiaryId =
				withdrawal.bankAccount.rapydBeneficiaryId ||
				withdrawal.paymentDetails?.rapydBeneficiaryId;

			// If beneficiary doesn't exist, try to create it (fallback)
			if (!beneficiaryId) {
				console.warn(
					`Beneficiary not found for bank account ${withdrawal.bankAccount._id}, attempting to create one`
				);

				try {
					const beneficiary = await createBeneficiary({
						firstName:
							user.name?.firstName || user.name?.first || 'User',
						lastName:
							user.name?.lastName || user.name?.last || 'Name',
						email: user.email,
						phoneNumber: user.phone,
						country: user.countryCode || 'US',
						currency: 'USD',
						bankAccountDetails: {
							bankName: withdrawal.bankAccount.bankName,
							accountNumber: withdrawal.bankAccount.accountNumber,
							accountHolderName:
								withdrawal.bankAccount.accountHolderName,
							routingNumber: withdrawal.bankAccount.routingNumber,
							accountType: withdrawal.bankAccount.accountType,
						},
						address: user.address?.address1 || null,
						city: user.address?.city || null,
						state: user.address?.state || null,
						postcode: user.address?.pincode || null,
						identificationType: 'identification_id',
						identificationValue: user.sim_nif || 'NOT_PROVIDED',
						merchantReferenceId:
							withdrawal.bankAccount._id.toString(),
						routingNumber: withdrawal.bankAccount.routingNumber,
					});

					beneficiaryId = beneficiary.id;

					// Update bank account with beneficiary ID
					withdrawal.bankAccount.rapydBeneficiaryId = beneficiaryId;
					withdrawal.bankAccount.rapydBeneficiaryError = null;
					await withdrawal.bankAccount.save();

					// Also store in withdrawal payment details
					withdrawal.paymentDetails = {
						...withdrawal.paymentDetails,
						rapydBeneficiaryId: beneficiaryId,
					};
					await withdrawal.save();

					console.log(
						`Created beneficiary ${beneficiaryId} for bank account ${withdrawal.bankAccount._id}`
					);
				} catch (beneficiaryError) {
					console.error(
						'Failed to create beneficiary during withdrawal approval:',
						beneficiaryError
					);
					throw new Error(
						`Beneficiary not found and failed to create: ${
							beneficiaryError.response?.data?.status?.message ||
							beneficiaryError.message ||
							'Unknown error'
						}`
					);
				}
			}

			// Verify beneficiary ID exists
			if (!beneficiaryId) {
				throw new Error(
					'Beneficiary ID is required but not found. Please ensure the bank account has a valid beneficiary.'
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
