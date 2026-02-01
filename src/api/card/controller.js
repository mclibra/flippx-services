import { Card } from './model';
import { Withdrawal } from '../withdrawal/model';
import {
	createCardBeneficiary,
	normalizeCountryToISO,
	deleteBeneficiary,
	getPaymentMethodRequiredFields,
	checkCardEligibility,
	getPayoutMethodTypesByCategory,
} from '../../services/rapyd';
import { User } from '../user/model';

export const addCard = async req => {
	try {
		const {
			cardholderName,
			cardNumber,
			expirationMonth,
			expirationYear,
			cvv,
		} = req.body;

		const user = req.user;

		// Validate required fields
		if (
			!cardholderName ||
			!cardNumber ||
			!expirationMonth ||
			!expirationYear ||
			!cvv
		) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'All card fields are required',
				},
			};
		}

		// Validate expiration month (1-12)
		const month = parseInt(expirationMonth);
		if (month < 1 || month > 12) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Expiration month must be between 1 and 12',
				},
			};
		}

		// Validate expiration year (2 or 4 digits)
		const year =
			expirationYear.length === 2
				? parseInt('20' + expirationYear)
				: parseInt(expirationYear);
		const currentYear = new Date().getFullYear();
		if (year < currentYear) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Card has expired',
				},
			};
		}

		// Check card eligibility for payout before creating card
		// This is a BLOCKING check - card creation will fail if eligibility check fails
		// cardType is extracted from the eligibility check result (scheme field)
		let cardEligibility;
		let cardType; // Will be extracted from eligibility check result
		try {
			cardEligibility = await checkCardEligibility({
				cardNumber,
				transactionType: 'all',
			});
			console.log(
				`[addCard] Card eligibility check result:`,
				JSON.stringify(cardEligibility, null, 2)
			);

			// Extract card type (scheme) from eligibility check result
			// scheme can be "VISA", "MasterCard", "AMEX", etc.
			cardType = cardEligibility.scheme;
			if (!cardType) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Card eligibility check did not return card scheme. Cannot determine card type.',
						cardEligibility,
					},
				};
			}

			console.log(
				`[addCard] Extracted card type (scheme) from eligibility check: ${cardType}`
			);

			// Check if card supports AFT (Account Funding Transaction) for payouts
			// AFT must be true (domestic or international) for the card to be eligible for payout
			const supportsAFT =
				cardEligibility.aft?.domestic === true ||
				cardEligibility.aft?.international === true;

			if (!supportsAFT) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Card is not eligible for payout. The card does not support Account Funding Transactions (AFT).',
						cardEligibility,
					},
				};
			}
		} catch (eligibilityError) {
			// Eligibility check is BLOCKING - return error if check fails
			const errorCode =
				eligibilityError.response?.data?.status?.error_code;
			const errorMessage =
				eligibilityError.response?.data?.status?.message ||
				eligibilityError.message;

			return {
				status: 400,
				entity: {
					success: false,
					error:
						errorMessage ||
						'Failed to check card eligibility. Card may not be eligible for payout.',
					errorCode: errorCode || null,
				},
			};
		}

		// Check if this is the first card (to set as default)
		const existingCards = await Card.countDocuments({
			user: user._id,
		});
		const isDefault = existingCards === 0;

		// Create card
		const card = await Card.create({
			user: user._id,
			cardholderName,
			cardNumber,
			expirationMonth: String(month).padStart(2, '0'),
			expirationYear:
				expirationYear.length === 2
					? expirationYear
					: expirationYear.slice(-2),
			cvv,
			isDefault,
		});

		// Create beneficiary in Rapyd immediately
		try {
			// Get user details for beneficiary creation
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
				userDetails.name?.lastName || userDetails.name?.last || 'Name';

			// Normalize country to ISO 3166-1 ALPHA-2 code for Rapyd
			const isoCountryCode = normalizeCountryToISO(
				userDetails.address?.country || userDetails.countryCode
			);

			// Determine currency based on country (default to USD)
			let currency = 'USD';
			if (isoCountryCode === 'NG') {
				currency = 'NGN';
			}

			// Determine payoutMethodType based on cardType
			// payoutMethodType is always calculated from cardType
			let finalPayoutMethodType = null;
			if (cardType) {
				try {
					// Fetch payout method types for card category
					const payoutMethodTypes =
						await getPayoutMethodTypesByCategory({
							category: 'card',
							payoutCurrency: currency,
							beneficiaryCountry: isoCountryCode,
						});

					console.log(
						`[addCard] Fetched payout method types for category=card:`,
						JSON.stringify(payoutMethodTypes, null, 2)
					);

					// Normalize card type for matching (VISA, MasterCard, etc.)
					const normalizedCardType = cardType.toUpperCase();

					// Filter payout method types based on card type
					// Look for payout method types that match the card type
					// Common patterns: xx_visa_card, xx_mastercard_card, xx_mastercardglobal_card, etc.
					const matchingTypes = payoutMethodTypes.filter(type => {
						const typeName = (type.name || '').toLowerCase();
						const payoutMethodType = (
							type.payout_method_type || ''
						).toLowerCase();

						if (normalizedCardType === 'VISA') {
							return (
								typeName.includes('visa') ||
								payoutMethodType.includes('visa')
							);
						} else if (
							normalizedCardType === 'MASTERCARD' ||
							normalizedCardType === 'MASTER CARD'
						) {
							return (
								typeName.includes('mastercard') ||
								typeName.includes('master') ||
								payoutMethodType.includes('mastercard') ||
								payoutMethodType.includes('master')
							);
						}
						return false;
					});

					if (matchingTypes.length > 0) {
						// Prefer global/mastercardglobal types, then standard types
						const preferredType =
							matchingTypes.find(
								type =>
									(type.payout_method_type || '').includes(
										'global'
									) || (type.name || '').includes('global')
							) || matchingTypes[0];

						// Use payout_method_type field from API response
						finalPayoutMethodType =
							preferredType.payout_method_type;
						if (!finalPayoutMethodType) {
							console.warn(
								`[addCard] Selected payout method type object does not have payout_method_type field:`,
								JSON.stringify(preferredType, null, 2)
							);
							// Fallback to code or name if payout_method_type is not available
							finalPayoutMethodType =
								preferredType.code || preferredType.name;
						}
						console.log(
							`[addCard] Selected payout method type based on card type ${cardType}:`,
							finalPayoutMethodType
						);
					} else {
						console.warn(
							`[addCard] No matching payout method type found for card type: ${cardType}`
						);
					}
				} catch (payoutMethodTypesError) {
					console.warn(
						`[addCard] Failed to fetch payout method types:`,
						payoutMethodTypesError.message
					);
					// Continue without payoutMethodType - beneficiary creation might still work
				}
			}

			// Fetch required fields for the payment method type if provided
			let requiredFields = null;
			if (finalPayoutMethodType) {
				try {
					requiredFields = await getPaymentMethodRequiredFields({
						paymentMethodType: finalPayoutMethodType,
						country: isoCountryCode,
						currency,
					});
					console.log(
						`[addCard] Required fields for ${finalPayoutMethodType}:`,
						JSON.stringify(requiredFields, null, 2)
					);
				} catch (requiredFieldsError) {
					console.warn(
						`[addCard] Could not fetch required fields for ${finalPayoutMethodType}, proceeding with default fields:`,
						requiredFieldsError.message
					);
				}
			}

			// Prepare beneficiary creation data
			const beneficiaryData = {
				firstName,
				lastName,
				email: userDetails.email || null,
				country: isoCountryCode,
				currency,
				cardDetails: {
					cardNumber,
					expirationMonth: String(month).padStart(2, '0'),
					expirationYear:
						expirationYear.length === 2
							? expirationYear
							: expirationYear.slice(-2),
					cvv,
				},
				entityType: 'individual',
				address: userDetails.address?.address1 || null,
				city: userDetails.address?.city || null,
				state: userDetails.address?.state || null,
				postcode: userDetails.address?.pincode || null,
				identificationType: 'identification_id',
				identificationValue: userDetails.sim_nif || 'NOT_PROVIDED',
				merchantReferenceId: card._id.toString(),
				payoutMethodType: finalPayoutMethodType || null,
				requiredFields, // Pass required fields info for validation
			};

			// Create beneficiary in Rapyd
			const beneficiary = await createCardBeneficiary(beneficiaryData);

			// Update card with beneficiary ID
			card.rapydBeneficiaryId = beneficiary.id;
			card.rapydBeneficiaryError = null;
			await card.save();

			console.log(
				`Successfully created Rapyd beneficiary ${beneficiary.id} for card ${card._id}`
			);
		} catch (beneficiaryError) {
			// Log comprehensive error details
			const errorDetails = {
				cardId: card._id.toString(),
				cardType: cardType || 'not provided',
				errorMessage: beneficiaryError.message,
				errorStack: beneficiaryError.stack,
				responseStatus: beneficiaryError.response?.status,
				responseData: beneficiaryError.response?.data,
				errorCode: beneficiaryError.response?.data?.status?.error_code,
				rapydErrorMessage:
					beneficiaryError.response?.data?.status?.message,
				rapydOperationId:
					beneficiaryError.response?.data?.status?.operation_id,
				fullErrorResponse: JSON.stringify(
					beneficiaryError.response?.data,
					null,
					2
				),
			};

			console.error(
				`[addCard] Failed to create Rapyd beneficiary for card ${card._id}:`,
				JSON.stringify(errorDetails, null, 2)
			);

			// Store the error in the card
			const errorMessage =
				beneficiaryError.response?.data?.status?.message ||
				beneficiaryError.message ||
				'Failed to create beneficiary';
			card.rapydBeneficiaryError = errorMessage;
			await card.save();

			// Return success but with a warning
			return {
				status: 200,
				entity: {
					success: true,
					card,
					warning:
						'Card created but beneficiary creation failed. Please contact support.',
					beneficiaryError:
						beneficiaryError.response?.data?.status?.message ||
						beneficiaryError.message,
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				card,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to add card',
			},
		};
	}
};

export const getCards = async req => {
	try {
		const user = req.user;

		const cards = await Card.find({ user: user._id });

		return {
			status: 200,
			entity: {
				success: true,
				cards,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve cards',
			},
		};
	}
};

export const setDefaultCard = async req => {
	try {
		const { id } = req.params;
		const user = req.user;

		// Find the card
		const card = await Card.findOne({
			_id: id,
			user: user._id,
		});

		if (!card) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Card not found',
				},
			};
		}

		// Remove default from all cards
		await Card.updateMany(
			{ user: user._id },
			{ $set: { isDefault: false } }
		);

		// Set this card as default
		card.isDefault = true;
		await card.save();

		return {
			status: 200,
			entity: {
				success: true,
				card,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to set default card',
			},
		};
	}
};

export const updateCard = async req => {
	try {
		const { id } = req.params;
		const { cardholderName, expirationMonth, expirationYear } = req.body;
		const user = req.user;

		// Find the card
		const card = await Card.findOne({
			_id: id,
			user: user._id,
		});

		if (!card) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Card not found',
				},
			};
		}

		// Update fields if provided
		if (cardholderName) {
			card.cardholderName = cardholderName;
		}
		if (expirationMonth) {
			const month = parseInt(expirationMonth);
			if (month < 1 || month > 12) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Expiration month must be between 1 and 12',
					},
				};
			}
			card.expirationMonth = String(month).padStart(2, '0');
		}
		if (expirationYear) {
			const year =
				expirationYear.length === 2
					? parseInt('20' + expirationYear)
					: parseInt(expirationYear);
			const currentYear = new Date().getFullYear();
			if (year < currentYear) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Card has expired',
					},
				};
			}
			card.expirationYear =
				expirationYear.length === 2
					? expirationYear
					: expirationYear.slice(-2);
		}

		await card.save();

		// If beneficiary exists and card details changed, we might need to update beneficiary
		// For now, we'll just update the card record
		// Note: Rapyd doesn't support updating card details in beneficiary, so this is just for our records

		return {
			status: 200,
			entity: {
				success: true,
				card,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to update card',
			},
		};
	}
};

export const removeCard = async req => {
	try {
		const { id } = req.params;
		const user = req.user;

		// Find the card
		const card = await Card.findOne({
			_id: id,
			user: user._id,
		});

		if (!card) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Card not found',
				},
			};
		}

		// Check if there are any pending withdrawals
		const pendingWithdrawals = await Withdrawal.countDocuments({
			card: id,
			status: { $in: ['PENDING', 'APPROVED', 'PROCESSING'] },
		});

		if (pendingWithdrawals > 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Cannot remove card with pending withdrawals',
				},
			};
		}

		// If this was the default card, set another one as default
		if (card.isDefault) {
			const anotherCard = await Card.findOne({
				user: user._id,
				_id: { $ne: id },
			});

			if (anotherCard) {
				anotherCard.isDefault = true;
				await anotherCard.save();
			}
		}

		// Delete the Rapyd beneficiary if it exists
		if (card.rapydBeneficiaryId) {
			try {
				await deleteBeneficiary(card.rapydBeneficiaryId);
				console.log(
					`Successfully deleted Rapyd beneficiary ${card.rapydBeneficiaryId} for card ${card._id}`
				);
			} catch (beneficiaryError) {
				// Log the error but don't fail the card deletion
				// The beneficiary might have already been deleted or might not exist
				console.error(
					`Failed to delete Rapyd beneficiary ${card.rapydBeneficiaryId} for card ${card._id}:`,
					beneficiaryError.message
				);
			}
		}

		// Remove the card
		await card.remove();

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Card removed successfully',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to remove card',
			},
		};
	}
};
