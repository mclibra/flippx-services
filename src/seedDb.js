import config from '../config';
import { User } from './api/user/model';
import { Wallet } from './api/wallet/model';
import { DominoGameConfig } from './api/domino/model';
import { TierRequirements } from './api/admin/tier-management/model';
import TierConfigService from './services/tier/tierConfigService';

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

// NEW: Initialize tier requirements in database
export const initializeTierRequirements = async () => {
	try {
		// Check if tier requirements already exist
		const existingCount = await TierRequirements.countDocuments();

		if (existingCount === 0) {
			console.log('Initializing tier requirements...');

			// Get admin user for audit trail
			const adminUser = await User.findOne({ role: 'ADMIN' });
			if (!adminUser) {
				console.warn('No admin user found for tier requirements initialization');
				return null;
			}

			// Initialize using the TierConfigService
			await TierConfigService.initializeDefaultTiers(adminUser._id);

			console.log('Tier requirements initialized successfully');
			return true;
		} else {
			console.log(`Tier requirements already exist (${existingCount} records)`);
			return true;
		}
	} catch (error) {
		console.error('Failed to initialize tier requirements:', error);
		return null;
	}
};

// NEW: Comprehensive database seeding function
export const seedDatabase = async () => {
	console.log('🌱 Starting database seeding...');

	try {
		// 1. Create admin user
		console.log('👤 Creating admin user...');
		const admin = await createAdmin();
		if (!admin) {
			console.error('❌ Failed to create admin user');
			return false;
		}
		console.log('✅ Admin user ready');

		// 2. Create system account
		console.log('🤖 Creating system account...');
		const systemAccount = await createSystemAccount();
		if (!systemAccount) {
			console.error('❌ Failed to create system account');
			return false;
		}
		console.log('✅ System account ready');

		// 3. Create domino config
		console.log('🎲 Creating domino configuration...');
		const dominoConfig = await createDominoConfig();
		if (!dominoConfig) {
			console.error('❌ Failed to create domino configuration');
			return false;
		}
		console.log('✅ Domino configuration ready');

		// 4. Initialize tier requirements
		console.log('🏆 Initializing tier requirements...');
		const tierRequirements = await initializeTierRequirements();
		if (!tierRequirements) {
			console.error('❌ Failed to initialize tier requirements');
			return false;
		}
		console.log('✅ Tier requirements ready');

		console.log('🎉 Database seeding completed successfully!');
		return true;
	} catch (error) {
		console.error('❌ Database seeding failed:', error);
		return false;
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