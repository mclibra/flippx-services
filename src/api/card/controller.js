import { Card } from './model';
import { Withdrawal } from '../withdrawal/model';
import {
	createCardBeneficiary,
	normalizeCountryToISO,
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
			payoutMethodType,
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
		const year = expirationYear.length === 2 
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
			expirationYear: expirationYear.length === 2 
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

			// Create beneficiary in Rapyd
			const beneficiary = await createCardBeneficiary({
				firstName,
				lastName,
				email: userDetails.email || null,
				phoneNumber: userDetails.phone || null,
				country: isoCountryCode,
				currency,
				cardDetails: {
					cardNumber,
					expirationMonth: String(month).padStart(2, '0'),
					expirationYear: expirationYear.length === 2 
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
				payoutMethodType: payoutMethodType || null,
			});

			// Update card with beneficiary ID
			card.rapydBeneficiaryId = beneficiary.id;
			card.rapydBeneficiaryError = null;
			await card.save();

			console.log(
				`Successfully created Rapyd beneficiary ${beneficiary.id} for card ${card._id}`
			);
		} catch (beneficiaryError) {
			// Log the error but don't fail the card creation
			console.error(
				`Failed to create Rapyd beneficiary for card ${card._id}:`,
				beneficiaryError
			);

			// Store the error in the card
			card.rapydBeneficiaryError =
				beneficiaryError.response?.data?.status?.message ||
				beneficiaryError.message ||
				'Failed to create beneficiary';
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
		const {
			cardholderName,
			expirationMonth,
			expirationYear,
			payoutMethodType,
		} = req.body;
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
			const year = expirationYear.length === 2 
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
			card.expirationYear = expirationYear.length === 2 
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
