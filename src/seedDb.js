import config from '../config';
import { User } from './api/user/model';
import { Wallet } from './api/wallet/model';
import { DominoGameConfig } from './api/domino/model';

export const createAdmin = async () => {
	const adminData = config.adminData;
	try {
		const admin = await User.findOne({
			phone: adminData.phone,
			role: 'ADMIN',
		}).exec();
		if (!admin) {
			const admin = await createNewAdminUser(adminData);
			if (admin) {
				return admin;
			}
			return null;
		}
		return admin;
	} catch (error) {
		return null;
	}
};

export const createDominoConfig = async () => {
	const configData = config.dominoConfigData;
	try {
		let dominoConfigData = await DominoGameConfig.findOne({
			isActive: true
		}).exec();
		if (!dominoConfigData) {
			dominoConfigData = await DominoGameConfig.create(configData);
			console.log('Domino config created with ID:', dominoConfigData._id);
		} else {
			console.log(
				'Domino config already exists with ID:',
				dominoConfigData._id
			);
		}
		return dominoConfigData;
	} catch (error) {
		return null;
	}
};

export const createSystemAccount = async () => {
	try {
		// Check if system account already exists
		let systemUser = await User.findOne({ role: 'SYSTEM' });

		if (!systemUser) {
			console.log('Creating system account...');

			const systemData = config.systemData;

			systemUser = await User.create(systemData);

			// Create wallet for system account with new Real Cash structure
			await Wallet.create({
				user: systemUser._id,
				virtualBalance: 0,
				realBalanceWithdrawable: 0,
				realBalanceNonWithdrawable: 0,
				active: true,
			});

			console.log('System account created with ID:', systemUser._id);
		} else {
			console.log(
				'System account already exists with ID:',
				systemUser._id
			);
		}

		return systemUser;
	} catch (error) {
		console.error('Failed to create system account:', error);
		return null;
	}
};

const createNewAdminUser = async userData => {
	const newUser = await User.create(userData);
	if (!newUser) {
		return null;
	}

	// Create wallet with new Real Cash structure
	await Wallet.create({
		user: newUser._id,
		virtualBalance: 0,
		realBalanceWithdrawable: 0,
		realBalanceNonWithdrawable: 0,
		active: true,
	});

	return newUser;
};