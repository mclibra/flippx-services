import { BankAccount } from './model';
import { Withdrawal } from '../withdrawal/model';
import {
	createBankAccountBeneficiary,
	normalizeCountryToISO,
	deleteBeneficiary,
} from '../../services/rapyd';
import { User } from '../user/model';

export const addBankAccount = async req => {
	try {
		const {
			bankName,
			accountNumber,
			accountHolderName,
			routingNumber,
			bicSwift,
			accountType,
		} = req.body;

		const user = req.user;

		// Validate required fields
		if (!bankName || !accountNumber || !accountHolderName || !accountType) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Bank name, account number, account holder name, and account type are required',
				},
			};
		}

		// Get user details to determine country
		const userDetails = await User.findById(user._id);
		if (!userDetails) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		// Normalize country to ISO 3166-1 ALPHA-2 code
		const isoCountryCode = normalizeCountryToISO(
			userDetails.address?.country || userDetails.countryCode
		);

		// BIC/SWIFT is required for ALL bank accounts (US and non-US)
		if (!bicSwift) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'BIC/SWIFT code is required for all bank accounts',
				},
			};
		}

		// Validate country-specific requirements
		const isUSAccount = isoCountryCode?.toUpperCase() === 'US';

		if (isUSAccount) {
			// US accounts also require routing number
			if (!routingNumber) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Routing number is required for US bank accounts',
					},
				};
			}
		}

		// Check if this is the first account (to set as default)
		const existingAccounts = await BankAccount.countDocuments({
			user: user._id,
		});
		const isDefault = existingAccounts === 0;

		// Create bank account
		const bankAccount = await BankAccount.create({
			user: user._id,
			bankName,
			accountNumber,
			accountHolderName,
			routingNumber: routingNumber || null,
			bicSwift: bicSwift || null,
			accountType,
			isDefault,
		});

		// Create beneficiary in Rapyd immediately
		try {
			// Extract name parts
			const firstName =
				userDetails.name?.firstName ||
				userDetails.name?.first ||
				'User';
			const lastName =
				userDetails.name?.lastName || userDetails.name?.last || 'Name';

			// Create beneficiary in Rapyd
			// BIC/SWIFT is required for all accounts (US and non-US)
			const beneficiary = await createBankAccountBeneficiary({
				firstName,
				lastName,
				email: userDetails.email || null,
				phoneNumber: userDetails.phone || null,
				country: isoCountryCode,
				currency: 'USD',
				bankAccountDetails: {
					bankName,
					accountNumber,
					accountHolderName,
					routingNumber: isUSAccount ? routingNumber : null,
					bicSwift: bicSwift, // Required for all accounts
					accountType,
				},
				entityType: 'individual',
				address: userDetails.address?.address1 || null,
				city: userDetails.address?.city || null,
				state: userDetails.address?.state || null,
				postcode: userDetails.address?.pincode || null,
				identificationType: 'identification_id',
				identificationValue: userDetails.sim_nif || 'NOT_PROVIDED',
				merchantReferenceId: bankAccount._id.toString(),
			});

			// Update bank account with beneficiary ID
			bankAccount.rapydBeneficiaryId = beneficiary.id;
			bankAccount.rapydBeneficiaryError = null;
			await bankAccount.save();

			console.log(
				`Successfully created Rapyd beneficiary ${beneficiary.id} for bank account ${bankAccount._id}`
			);
		} catch (beneficiaryError) {
			// Log the error but don't fail the bank account creation
			console.error(
				`Failed to create Rapyd beneficiary for bank account ${bankAccount._id}:`,
				beneficiaryError
			);

			// Store the error in the bank account
			bankAccount.rapydBeneficiaryError =
				beneficiaryError.response?.data?.status?.message ||
				beneficiaryError.message ||
				'Failed to create beneficiary';
			await bankAccount.save();

			// Return success but with a warning
			return {
				status: 200,
				entity: {
					success: true,
					bankAccount,
					warning:
						'Bank account created but beneficiary creation failed. Please contact support.',
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
				bankAccount,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to add bank account',
			},
		};
	}
};

export const getBankAccounts = async req => {
	try {
		const user = req.user;

		const bankAccounts = await BankAccount.find({ user: user._id });

		return {
			status: 200,
			entity: {
				success: true,
				bankAccounts,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve bank accounts',
			},
		};
	}
};

export const setDefaultBankAccount = async req => {
	try {
		const { id } = req.params;
		const user = req.user;

		// Find the bank account
		const bankAccount = await BankAccount.findOne({
			_id: id,
			user: user._id,
		});

		if (!bankAccount) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Bank account not found',
				},
			};
		}

		// Remove default from all accounts
		await BankAccount.updateMany(
			{ user: user._id },
			{ $set: { isDefault: false } }
		);

		// Set this account as default
		bankAccount.isDefault = true;
		await bankAccount.save();

		return {
			status: 200,
			entity: {
				success: true,
				bankAccount,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to set default bank account',
			},
		};
	}
};

export const removeBankAccount = async req => {
	try {
		const { id } = req.params;
		const user = req.user;

		// Find the bank account
		const bankAccount = await BankAccount.findOne({
			_id: id,
			user: user._id,
		});

		if (!bankAccount) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Bank account not found',
				},
			};
		}

		// Check if there are any pending withdrawals
		const pendingWithdrawals = await Withdrawal.countDocuments({
			bankAccount: id,
			status: { $in: ['PENDING', 'APPROVED', 'PROCESSING'] },
		});

		if (pendingWithdrawals > 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Cannot remove bank account with pending withdrawals',
				},
			};
		}

		// If this was the default account, set another one as default
		if (bankAccount.isDefault) {
			const anotherAccount = await BankAccount.findOne({
				user: user._id,
				_id: { $ne: id },
			});

			if (anotherAccount) {
				anotherAccount.isDefault = true;
				await anotherAccount.save();
			}
		}

		// Delete the Rapyd beneficiary if it exists
		if (bankAccount.rapydBeneficiaryId) {
			try {
				await deleteBeneficiary(bankAccount.rapydBeneficiaryId);
				console.log(
					`Successfully deleted Rapyd beneficiary ${bankAccount.rapydBeneficiaryId} for bank account ${bankAccount._id}`
				);
			} catch (beneficiaryError) {
				// Log the error but don't fail the bank account deletion
				// The beneficiary might have already been deleted or might not exist
				console.error(
					`Failed to delete Rapyd beneficiary ${bankAccount.rapydBeneficiaryId} for bank account ${bankAccount._id}:`,
					beneficiaryError.message
				);
			}
		}

		// Remove the bank account
		await bankAccount.remove();

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Bank account removed successfully',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to remove bank account',
			},
		};
	}
};
