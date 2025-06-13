import config from '../config';
import { User } from './api/user/model';
import { Wallet } from './api/wallet/model';

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

export const createSystemAccount = async () => {
	try {
		// Check if system account already exists
		let systemUser = await User.findOne({ role: 'SYSTEM' });

		if (!systemUser) {
			console.log('Creating system account...');

			const systemData = config.systemData;

			systemUser = await User.create(systemData);

			// Create wallet for system account
			await Wallet.create({
				user: systemUser._id,
				virtualBalance: 0,
				realBalance: 0,
				active: true,
			});

			console.log('System account created with ID:', systemUser._id);

			// Store system account ID in config or environment variable if needed
			// This would typically be done through updating the environment
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
	await Wallet.create({
		user: newUser._id,
		virtualBalance: 0,
		realBalance: 0,
	});
	return newUser;
};
