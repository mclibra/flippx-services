import { Withdrawal } from '../../withdrawal/model';
import { Transaction } from '../../transaction/model';
import { makeTransaction } from '../../transaction/controller';
import {
	createPayout,
	createBankAccountBeneficiary,
	normalizeCountryToISO,
	getPayoutMethodTypesByCurrency,
	getBeneficiary,
	getPayoutMethodTypesByCategory,
} from '../../../services/rapyd';
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

		// Find the withdrawal with bank account/card and user details
		const withdrawal = await Withdrawal.findById(id)
			.populate('user')
			.populate('bankAccount')
			.populate('card');
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
			// Determine if withdrawal is from bank account or card
			const isCardWithdrawal = !!withdrawal.card;
			const isBankAccountWithdrawal = !!withdrawal.bankAccount;

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

			// Get beneficiary details from Rapyd
			// We need country and entity_type for the payout request
			let beneficiaryCountry;
			let beneficiaryEntityType = 'individual';

			try {
				const beneficiaryDetails = await getBeneficiary(beneficiaryId);
				// Use the country exactly as stored in Rapyd (preserve case)
				beneficiaryCountry = beneficiaryDetails.country;
				beneficiaryEntityType =
					beneficiaryDetails.entity_type || 'individual';
				console.log(
					`[approveWithdrawal] Beneficiary details from Rapyd - country: ${beneficiaryCountry}, entity_type: ${beneficiaryEntityType}`
				);
			} catch (beneficiaryError) {
				// Fallback to user's country if we can't fetch beneficiary
				console.warn(
					`[approveWithdrawal] Could not fetch beneficiary details, using user's country`,
					beneficiaryError.message
				);
				beneficiaryCountry = normalizeCountryToISO(
					user.address?.country || user.countryCode
				);
			}

			// Get payout method types from Rapyd API
			// Different logic for bank accounts vs cards
			let payoutMethodType;
			try {
				if (isCardWithdrawal) {
					// For card withdrawals, fetch payout method types with category=card
					const payoutMethodTypes =
						await getPayoutMethodTypesByCategory({
							category: 'card',
							payoutCurrency: 'USD',
							beneficiaryCountry: beneficiaryCountry,
						});

					// Get card scheme from beneficiary details or card eligibility
					// The beneficiary should have the payout method type stored
					// Try to get it from the card's stored data first
					// Note: beneficiaryDetails was already fetched above, but we need the default_payout_method_type
					// We'll use the beneficiaryDetails from the earlier fetch or get it from card
					const cardBeneficiaryDetails =
						await getBeneficiary(beneficiaryId);
					const cardScheme =
						cardBeneficiaryDetails.default_payout_method_type ||
						withdrawal.card?.payoutMethodType;

					if (cardScheme) {
						// Find matching payout method type based on scheme
						const matchingMethod = payoutMethodTypes.find(
							method =>
								method.payout_method_type === cardScheme &&
								method.status === 1
						);

						if (matchingMethod) {
							payoutMethodType =
								matchingMethod.payout_method_type;
							console.log(
								`[approveWithdrawal] Using card payout method type: ${payoutMethodType}`
							);
						}
					}

					// If not found, try to find by beneficiary country
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
							console.log(
								`[approveWithdrawal] Found card payout method type: ${payoutMethodType} for country: ${beneficiaryCountry}`
							);
						}
					}
				} else {
					// For bank account withdrawals, use existing logic
					const payoutMethodTypes =
						await getPayoutMethodTypesByCurrency('USD');

					// For US accounts, prefer us_standard_bank_account over us_general_bank
					// us_general_bank may require BIC_SWIFT which US accounts don't have
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
							console.log(
								`[approveWithdrawal] Using us_standard_bank_account for US account`
							);
						} else {
							// Fallback to us_general_bank if us_standard_bank_account not available
							const usGeneralMethod = payoutMethodTypes.find(
								method =>
									method.payout_method_type ===
										'us_general_bank' &&
									method.category === 'bank' &&
									method.status === 1
							);

							if (usGeneralMethod) {
								payoutMethodType = 'us_general_bank';
								console.log(
									`[approveWithdrawal] Using us_general_bank for US account (us_standard_bank_account not available)`
								);
							}
						}
					}

					// If not US or no US-specific method found, find by beneficiary country
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
							console.log(
								`[approveWithdrawal] Found payout method type: ${payoutMethodType} for country: ${beneficiaryCountry}`
							);
						} else {
							// Fallback: try to find any bank method for the country
							const fallbackMethod = payoutMethodTypes.find(
								method =>
									method.beneficiary_country?.toLowerCase() ===
										beneficiaryCountry?.toLowerCase() &&
									method.category === 'bank'
							);

							if (fallbackMethod) {
								payoutMethodType =
									fallbackMethod.payout_method_type;
								console.log(
									`[approveWithdrawal] Using fallback payout method type: ${payoutMethodType} for country: ${beneficiaryCountry}`
								);
							} else {
								// Last resort: construct from country code (use lowercase for payout method type)
								payoutMethodType = `${beneficiaryCountry?.toLowerCase()}_standard_bank_account`;
								console.warn(
									`[approveWithdrawal] Could not find payout method type for country ${beneficiaryCountry}, using constructed: ${payoutMethodType}`
								);
							}
						}
					}
				}
			} catch (payoutMethodError) {
				// Fallback to constructed method type if API call fails
				if (isCardWithdrawal) {
					console.warn(
						`[approveWithdrawal] Error getting card payout method types:`,
						payoutMethodError.message
					);
					// For cards, we can't construct a fallback easily, so throw error
					throw new Error(
						`Failed to determine payout method type for card withdrawal: ${payoutMethodError.message}`
					);
				} else {
					// For bank accounts, use constructed fallback
					payoutMethodType = `${beneficiaryCountry?.toLowerCase()}_standard_bank_account`;
					console.warn(
						`[approveWithdrawal] Error getting payout method types, using fallback: ${payoutMethodType}`,
						payoutMethodError.message
					);
				}
			}

			// Verify payout method type is set
			if (!payoutMethodType) {
				throw new Error(
					`Could not determine payout method type for ${
						isCardWithdrawal ? 'card' : 'bank account'
					} withdrawal`
				);
			}

			// Prepare sender information for payout
			// Sender is the company (FlippX) making the payout
			const senderCountry = normalizeCountryToISO(
				process.env.SENDER_COUNTRY || beneficiaryCountry || 'IN'
			);
			const senderCurrency = 'USD';
			const senderEntityType = 'company';

			const sender = {
				company_name: process.env.COMPANY_NAME || 'FlippX',
				country: senderCountry,
				currency: senderCurrency,
				address: process.env.COMPANY_ADDRESS || 'Address',
				city: process.env.COMPANY_CITY || 'Boston',
				purpose_code:
					process.env.PAYOUT_PURPOSE_CODE || 'payment_of_services',
			};

			console.log(
				`[approveWithdrawal] Sender info - country: ${senderCountry}, company: ${sender.company_name}`
			);

			// Create payout in Rapyd
			let payout;
			try {
				// Prepare metadata based on withdrawal type
				const metadata = {
					userId: user._id.toString(),
					withdrawalId: withdrawal._id.toString(),
				};

				if (isCardWithdrawal) {
					metadata.cardId = withdrawal.card._id.toString();
				} else {
					metadata.bankAccountId =
						withdrawal.bankAccount._id.toString();
				}

				// Prepare payout parameters
				const payoutParams = {
					beneficiaryId,
					amount: withdrawal.netAmount, // Use net amount after fees
					currency: 'USD',
					description: `Withdrawal for user ${user.email}`,
					reference: withdrawal._id.toString(),
					payoutMethodType, // Use country-specific payout method type
					beneficiaryCountry, // Match beneficiary's country from Rapyd
					beneficiaryEntityType, // Use beneficiary's actual entity type from Rapyd
					senderCountry, // Sender (company) country
					senderCurrency, // Sender currency
					senderEntityType, // Sender entity type (company)
					sender, // Sender object with company details
					metadata,
				};

				// Add card-specific fields for card withdrawals
				if (isCardWithdrawal) {
					payoutParams.beneficiaryRelationship = 'self'; // Required for card payouts
					payoutParams.purposeCode =
						process.env.PAYOUT_PURPOSE_CODE || 'remittances'; // Required for card payouts
					payoutParams.statementDescriptor =
						process.env.STATEMENT_DESCRIPTOR || 'FlippX Payout'; // Optional
				}

				payout = await createPayout(payoutParams);
			} catch (payoutError) {
				// BIC/SWIFT error handling only applies to bank account withdrawals
				if (!isCardWithdrawal) {
					// Check if error is due to BIC/SWIFT for US accounts
					const errorCode =
						payoutError.response?.data?.status?.error_code || '';
					const isBicSwiftError =
						errorCode.includes('BIC_SWIFT') &&
						payoutError.response?.data?.status?.response_code?.includes(
							'BIC_SWIFT'
						);

					// If BIC/SWIFT error and payout method is US standard bank account, recreate beneficiary
					if (isBicSwiftError) {
						console.log(
							`[approveWithdrawal] BIC/SWIFT error detected for US account. Recreating beneficiary without BIC/SWIFT for bank account ${withdrawal.bankAccount._id}`
						);

						// Get user details for beneficiary recreation
						const userDetails = await User.findById(user._id);
						if (!userDetails) {
							throw new Error('User not found');
						}

						// Extract name parts
						const firstName =
							userDetails.name?.firstName ||
							userDetails.name?.first ||
							'User';
						const lastName =
							userDetails.name?.lastName ||
							userDetails.name?.last ||
							'Name';

						// Normalize country to ISO 3166-1 ALPHA-2 code for Rapyd
						const isoCountryCodeForRecreation =
							normalizeCountryToISO(
								userDetails.address?.country ||
									userDetails.countryCode
							);

						// Recreate beneficiary without BIC/SWIFT for US accounts
						const newBeneficiary =
							await createBankAccountBeneficiary({
								firstName,
								lastName,
								email: userDetails.email || null,
								phoneNumber: userDetails.phone || null,
								country: isoCountryCodeForRecreation,
								currency: 'USD',
								bankAccountDetails: {
									bankName: withdrawal.bankAccount.bankName,
									accountNumber:
										withdrawal.bankAccount.accountNumber,
									accountHolderName:
										withdrawal.bankAccount
											.accountHolderName,
									routingNumber:
										withdrawal.bankAccount.routingNumber ||
										null,
									bicSwift: null, // Explicitly set to null for US accounts
									accountType:
										withdrawal.bankAccount.accountType,
								},
								entityType: 'individual',
								address: userDetails.address?.address1 || null,
								city: userDetails.address?.city || null,
								state: userDetails.address?.state || null,
								postcode: userDetails.address?.pincode || null,
								identificationType: 'identification_id',
								identificationValue:
									userDetails.sim_nif || 'NOT_PROVIDED',
								merchantReferenceId:
									withdrawal.bankAccount._id.toString(),
							});

						// Update bank account with new beneficiary ID
						withdrawal.bankAccount.rapydBeneficiaryId =
							newBeneficiary.id;
						withdrawal.bankAccount.rapydBeneficiaryError = null;
						await withdrawal.bankAccount.save();

						console.log(
							`[approveWithdrawal] Successfully recreated beneficiary ${newBeneficiary.id} without BIC/SWIFT for bank account ${withdrawal.bankAccount._id}`
						);

						// Update beneficiary ID and retry payout
						beneficiaryId = newBeneficiary.id;

						// Get the new beneficiary's details from Rapyd
						let newBeneficiaryCountry = beneficiaryCountry; // Use existing country
						let newBeneficiaryEntityType = 'individual';
						try {
							const newBeneficiaryDetails = await getBeneficiary(
								newBeneficiary.id
							);
							newBeneficiaryCountry =
								newBeneficiaryDetails.country;
							newBeneficiaryEntityType =
								newBeneficiaryDetails.entity_type ||
								'individual';
						} catch (beneficiaryFetchError) {
							console.warn(
								`[approveWithdrawal] Could not fetch new beneficiary details, using defaults`,
								beneficiaryFetchError.message
							);
						}

						// Prepare metadata for retry
						const retryMetadata = {
							userId: user._id.toString(),
							withdrawalId: withdrawal._id.toString(),
							bankAccountId:
								withdrawal.bankAccount._id.toString(),
						};

						// Prepare retry payout parameters (same structure as original call)
						const retryPayoutParams = {
							beneficiaryId,
							amount: withdrawal.netAmount,
							currency: 'USD',
							description: `Withdrawal for user ${user.email}`,
							reference: withdrawal._id.toString(),
							payoutMethodType,
							beneficiaryCountry: newBeneficiaryCountry, // Match beneficiary's country
							beneficiaryEntityType: newBeneficiaryEntityType,
							senderCountry, // Sender (company) country
							senderCurrency, // Sender currency
							senderEntityType, // Sender entity type (company)
							sender, // Sender object with company details
							metadata: retryMetadata,
							// Note: No card-specific fields needed here as this is only for bank account retries
						};

						// Retry payout with new beneficiary (using same payout method type and sender info)
						payout = await createPayout(retryPayoutParams);
					} else {
						// Re-throw if it's not a BIC/SWIFT error or not US account
						throw payoutError;
					}
				} else {
					// For card withdrawals or other errors, re-throw
					throw payoutError;
				}
			}

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
