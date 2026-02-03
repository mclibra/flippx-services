import { Withdrawal } from './model';
import { Wallet } from '../wallet/model';
import { BankAccount } from '../bank_account/model';
import { Card } from '../card/model';
import { LoyaltyService } from '../loyalty/service';
import { makeTransaction } from '../transaction/controller';
import { Transaction } from '../transaction/model';
import {
	createPayout,
	createBankAccountBeneficiary,
	getPayoutMethodTypesByCurrency,
	getBeneficiary,
	getPayoutMethodTypesByCategory,
} from '../../services/rapyd';
import { User } from '../user/model';

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

		// Populate withdrawal with bank account/card details for payout creation
		await withdrawal.populate('bankAccount');
		await withdrawal.populate('card');

		// Determine if withdrawal is from bank account or card
		const isCardWithdrawal = !!withdrawal.card;
		const isBankAccountWithdrawal = !!withdrawal.bankAccount;

		// Variables for payout creation (needed in catch block)
		let payoutMethodType = null;
		let senderCountry = null;
		let senderCurrency = 'USD';
		let senderEntityType = 'company';
		let sender = null;

		// Create payout in Rapyd
		try {
			if (!isCardWithdrawal && !isBankAccountWithdrawal) {
				throw new Error(
					'Withdrawal must have either a bank account or card'
				);
			}

			// Get beneficiary ID from bank account or card
			let beneficiaryId;
			if (isCardWithdrawal) {
				beneficiaryId =
					withdrawal.card.rapydBeneficiaryId ||
					withdrawal.paymentDetails?.rapydBeneficiaryId;

				// Verify beneficiary ID exists
				if (!beneficiaryId) {
					throw new Error(
						'Beneficiary ID not found. The card must have a valid Rapyd beneficiary. Please ensure the card was created successfully.'
					);
				}

				// Check if there was an error creating the beneficiary
				if (withdrawal.card.rapydBeneficiaryError) {
					throw new Error(
						`Card has a beneficiary creation error: ${withdrawal.card.rapydBeneficiaryError}. Please contact support.`
					);
				}
			} else {
				// Bank account withdrawal
				beneficiaryId =
					withdrawal.bankAccount.rapydBeneficiaryId ||
					withdrawal.paymentDetails?.rapydBeneficiaryId;

				// Verify beneficiary ID exists
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
			}

			// Get user details for beneficiary country
			const userDetails = await User.findById(user._id);
			if (!userDetails) {
				throw new Error('User not found');
			}

			// Get beneficiary details from Rapyd
			let beneficiaryCountry;
			let beneficiaryEntityType = 'individual';

			try {
				const beneficiaryDetails = await getBeneficiary(beneficiaryId);
				beneficiaryCountry = beneficiaryDetails.country;
				beneficiaryEntityType =
					beneficiaryDetails.entity_type || 'individual';
				console.log(
					`[initiateWithdrawal] Beneficiary details from Rapyd - country: ${beneficiaryCountry}, entity_type: ${beneficiaryEntityType}`
				);
			} catch (beneficiaryError) {
				console.warn(
					`[initiateWithdrawal] Could not fetch beneficiary details, using user's country`,
					beneficiaryError.message
				);
				beneficiaryCountry = userDetails.countryISO || 'US';
			}

			// Get payout method types from Rapyd API
			let payoutMethodType;
			try {
				if (isCardWithdrawal) {
					const payoutMethodTypes =
						await getPayoutMethodTypesByCategory({
							category: 'card',
							payoutCurrency: 'USD',
							beneficiaryCountry: beneficiaryCountry,
						});

					const cardBeneficiaryDetails =
						await getBeneficiary(beneficiaryId);
					const cardScheme =
						cardBeneficiaryDetails.default_payout_method_type ||
						withdrawal.card?.payoutMethodType;

					if (cardScheme) {
						const matchingMethod = payoutMethodTypes.find(
							method =>
								method.payout_method_type === cardScheme &&
								method.status === 1
						);

						if (matchingMethod) {
							payoutMethodType =
								matchingMethod.payout_method_type;
						}
					}

					if (!payoutMethodType) {
						const cardMethod = payoutMethodTypes.find(
							method =>
								method.beneficiary_country?.toLowerCase() ===
									beneficiaryCountry?.toLowerCase() &&
								method.category === 'card' &&
								method.status === 1
						);

						if (cardMethod) {
							payoutMethodType = cardMethod.payout_method_type;
						}
					}
				} else {
					const payoutMethodTypes =
						await getPayoutMethodTypesByCurrency('USD');

					if (beneficiaryCountry?.toUpperCase() === 'US') {
						const usStandardMethod = payoutMethodTypes.find(
							method =>
								method.payout_method_type ===
									'us_standard_bank_account' &&
								method.category === 'bank' &&
								method.status === 1
						);

						if (usStandardMethod) {
							payoutMethodType = 'us_standard_bank_account';
						} else {
							const usGeneralMethod = payoutMethodTypes.find(
								method =>
									method.payout_method_type ===
										'us_general_bank' &&
									method.category === 'bank' &&
									method.status === 1
							);

							if (usGeneralMethod) {
								payoutMethodType = 'us_general_bank';
							}
						}
					}

					if (!payoutMethodType) {
						const bankAccountMethod = payoutMethodTypes.find(
							method =>
								method.beneficiary_country?.toLowerCase() ===
									beneficiaryCountry?.toLowerCase() &&
								method.category === 'bank' &&
								method.status === 1
						);

						if (bankAccountMethod) {
							payoutMethodType =
								bankAccountMethod.payout_method_type;
						} else {
							const fallbackMethod = payoutMethodTypes.find(
								method =>
									method.beneficiary_country?.toLowerCase() ===
										beneficiaryCountry?.toLowerCase() &&
									method.category === 'bank'
							);

							if (fallbackMethod) {
								payoutMethodType =
									fallbackMethod.payout_method_type;
							} else {
								payoutMethodType = `${beneficiaryCountry?.toLowerCase()}_standard_bank_account`;
							}
						}
					}
				}
			} catch (payoutMethodError) {
				if (isCardWithdrawal) {
					throw new Error(
						`Failed to determine payout method type for card withdrawal: ${payoutMethodError.message}`
					);
				} else {
					payoutMethodType = `${beneficiaryCountry?.toLowerCase()}_standard_bank_account`;
					console.warn(
						`[initiateWithdrawal] Error getting payout method types, using fallback: ${payoutMethodType}`,
						payoutMethodError.message
					);
				}
			}

			if (!payoutMethodType) {
				throw new Error(
					`Could not determine payout method type for ${
						isCardWithdrawal ? 'card' : 'bank account'
					} withdrawal`
				);
			}

			// Prepare sender information for payout
			senderCountry =
				process.env.SENDER_COUNTRY || beneficiaryCountry || 'US';
			senderCurrency = 'USD';
			senderEntityType = 'company';

			sender = {
				company_name: process.env.COMPANY_NAME || 'FlippX',
				country: senderCountry,
				currency: senderCurrency,
				address: process.env.COMPANY_ADDRESS || 'Address',
				city: process.env.COMPANY_CITY || 'Boston',
				purpose_code: 'other',
			};

			// Prepare metadata
			const metadata = {
				userId: user._id.toString(),
				withdrawalId: withdrawal._id.toString(),
			};

			if (isCardWithdrawal) {
				metadata.cardId = withdrawal.card._id.toString();
			} else {
				metadata.bankAccountId = withdrawal.bankAccount._id.toString();
			}

			// Prepare payout parameters
			const payoutParams = {
				beneficiaryId,
				amount: withdrawal.netAmount,
				currency: 'USD',
				description: `Withdrawal for user ${userDetails.email}`,
				reference: withdrawal._id.toString(),
				payoutMethodType,
				beneficiaryCountry,
				beneficiaryEntityType,
				senderCountry,
				senderCurrency,
				senderEntityType,
				sender,
				metadata,
			};

			// Add card-specific fields for card withdrawals
			if (isCardWithdrawal) {
				payoutParams.beneficiaryRelationship = 'self';
				payoutParams.purposeCode = 'other';
				payoutParams.statementDescriptor = 'FlippX Payout';
			}

			// Create payout in Rapyd
			const payout = await createPayout(payoutParams);

			// Update withdrawal with payout details
			withdrawal.paymentReference = payout.id;
			withdrawal.paymentDetails = {
				...withdrawal.paymentDetails,
				rapydPayoutId: payout.id,
				rapydPayoutData: payout,
			};
			await withdrawal.save();
		} catch (payoutError) {
			// Handle BIC/SWIFT error for bank accounts (similar to approveWithdrawal)
			if (
				!isCardWithdrawal &&
				payoutError.response?.data?.status?.error_code?.includes(
					'BIC_SWIFT'
				)
			) {
				console.log(
					`[initiateWithdrawal] BIC/SWIFT error detected for US account. Recreating beneficiary without BIC/SWIFT for bank account ${withdrawal.bankAccount._id}`
				);

				const userDetails = await User.findById(user._id);
				if (!userDetails) {
					throw new Error('User not found');
				}

				const firstName =
					userDetails.name?.firstName ||
					userDetails.name?.first ||
					'User';
				const lastName =
					userDetails.name?.lastName ||
					userDetails.name?.last ||
					'Name';

				const isoCountryCodeForRecreation =
					userDetails.countryISO || 'US';

				const newBeneficiary = await createBankAccountBeneficiary({
					firstName,
					lastName,
					email: userDetails.email || null,
					phoneNumber: userDetails.phone || null,
					country: isoCountryCodeForRecreation,
					currency: 'USD',
					bankAccountDetails: {
						bankName: withdrawal.bankAccount.bankName,
						accountNumber: withdrawal.bankAccount.accountNumber,
						accountHolderName:
							withdrawal.bankAccount.accountHolderName,
						routingNumber:
							withdrawal.bankAccount.routingNumber || null,
						bicSwift: null,
						accountType: withdrawal.bankAccount.accountType,
					},
					entityType: 'individual',
					address: userDetails.address?.address1 || null,
					city: userDetails.address?.city || null,
					state: userDetails.address?.state || null,
					postcode: userDetails.address?.pincode || null,
					identificationType: 'identification_id',
					identificationValue: userDetails.sim_nif || 'NOT_PROVIDED',
					merchantReferenceId: withdrawal.bankAccount._id.toString(),
				});

				withdrawal.bankAccount.rapydBeneficiaryId = newBeneficiary.id;
				withdrawal.bankAccount.rapydBeneficiaryError = null;
				await withdrawal.bankAccount.save();

				// Retry payout with new beneficiary
				const beneficiaryDetails = await getBeneficiary(
					newBeneficiary.id
				);
				const newBeneficiaryCountry = beneficiaryDetails.country;
				const newBeneficiaryEntityType =
					beneficiaryDetails.entity_type || 'individual';

				// Determine payout method type for retry
				if (!payoutMethodType) {
					const payoutMethodTypes =
						await getPayoutMethodTypesByCurrency('USD');
					if (newBeneficiaryCountry?.toUpperCase() === 'US') {
						const usStandardMethod = payoutMethodTypes.find(
							method =>
								method.payout_method_type ===
									'us_standard_bank_account' &&
								method.category === 'bank' &&
								method.status === 1
						);
						payoutMethodType = usStandardMethod
							? 'us_standard_bank_account'
							: 'us_general_bank';
					} else {
						const bankAccountMethod = payoutMethodTypes.find(
							method =>
								method.beneficiary_country?.toLowerCase() ===
									newBeneficiaryCountry?.toLowerCase() &&
								method.category === 'bank' &&
								method.status === 1
						);
						payoutMethodType =
							bankAccountMethod?.payout_method_type ||
							`${newBeneficiaryCountry?.toLowerCase()}_standard_bank_account`;
					}
				}

				// Update sender country if needed
				if (!senderCountry) {
					senderCountry =
						process.env.SENDER_COUNTRY ||
						newBeneficiaryCountry ||
						'US';
				}
				if (!sender) {
					sender = {
						company_name: process.env.COMPANY_NAME || 'FlippX',
						country: senderCountry,
						currency: senderCurrency,
						address: process.env.COMPANY_ADDRESS || 'Address',
						city: process.env.COMPANY_CITY || 'Boston',
						purpose_code: 'other',
					};
				}

				const retryMetadata = {
					userId: user._id.toString(),
					withdrawalId: withdrawal._id.toString(),
					bankAccountId: withdrawal.bankAccount._id.toString(),
				};

				const retryPayoutParams = {
					beneficiaryId: newBeneficiary.id,
					amount: withdrawal.netAmount,
					currency: 'USD',
					description: `Withdrawal for user ${userDetails.email}`,
					reference: withdrawal._id.toString(),
					payoutMethodType,
					beneficiaryCountry: newBeneficiaryCountry,
					beneficiaryEntityType: newBeneficiaryEntityType,
					senderCountry,
					senderCurrency,
					senderEntityType,
					sender,
					metadata: retryMetadata,
				};

				const payout = await createPayout(retryPayoutParams);
				withdrawal.paymentReference = payout.id;
				withdrawal.paymentDetails = {
					...withdrawal.paymentDetails,
					rapydPayoutId: payout.id,
					rapydPayoutData: payout,
				};
				await withdrawal.save();
			} else {
				// For other errors, delete the withdrawal and return error
				await Withdrawal.findByIdAndDelete(withdrawal._id);
				return {
					status: 500,
					entity: {
						success: false,
						error:
							payoutError.response?.data?.status?.message ||
							payoutError.message ||
							'Failed to create payout with Rapyd. Please try again.',
					},
				};
			}
		}

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
