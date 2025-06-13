import { BankAccount } from './model';
import { Withdrawal } from '../withdrawal/model';

export const addBankAccount = async req => {
	try {
		const {
			bankName,
			accountNumber,
			accountHolderName,
			routingNumber,
			accountType,
		} = req.body;

		const user = req.user;

		// Validate required fields
		if (
			!bankName ||
			!accountNumber ||
			!accountHolderName ||
			!routingNumber ||
			!accountType
		) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'All bank account fields are required',
				},
			};
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
			routingNumber,
			accountType,
			isDefault,
		});

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
