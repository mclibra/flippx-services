import mongoose from 'mongoose';
import { mongo } from '../../../config';
import { TierRequirements } from '../../api/admin/tier-management/model';
import { User } from '../../api/user/model';
import {
	LOYALTY_TIERS as CONSTANTS_TIERS,
	TIER_DOWNGRADES as CONSTANTS_DOWNGRADES,
} from '../../api/loyalty/constants';

/**
 * Migration script to transfer tier requirements from constants to database
 * This script should be run once when deploying the tier configuration feature
 */

const migrateTierRequirements = async () => {
	try {
		console.log('🔄 Starting tier requirements migration...');

		// Check if tier requirements already exist in database
		const existingCount = await TierRequirements.countDocuments();
		if (existingCount > 0) {
			console.log(
				`⚠️  Found ${existingCount} existing tier requirements in database.`
			);
			console.log('   Migration aborted to prevent data loss.');
			console.log(
				'   If you want to reset, please manually delete existing records first.'
			);
			return false;
		}

		// Find an admin user to set as creator
		const adminUser = await User.findOne({ role: 'ADMIN' });
		if (!adminUser) {
			console.error(
				'❌ No admin user found. Please create an admin user first.'
			);
			return false;
		}

		console.log(
			`👤 Using admin user: ${adminUser.name.firstName} ${adminUser.name.lastName} (${adminUser._id})`
		);

		// Convert constants to database entries
		const tierEntries = [];

		for (const [tierName, tierConfig] of Object.entries(CONSTANTS_TIERS)) {
			const tierEntry = {
				tier: tierName,
				name: tierConfig.name,
				isActive: true,
				benefits: {
					weeklyWithdrawalLimit:
						tierConfig.weeklyWithdrawalLimit || 0,
					withdrawalTime: tierConfig.withdrawalTime || 72,
					weeklyCashbackPercentage:
						tierConfig.weeklyCashbackPercentage || 0,
					monthlyCashbackPercentage:
						tierConfig.monthlyCashbackPercentage || 0,
					referralXP: tierConfig.referralXP || 0,
					noWinCashbackPercentage:
						tierConfig.noWinCashbackPercentage || 0,
					noWinCashbackDays: tierConfig.noWinCashbackDays || 0,
				},
				requirements: tierConfig.requirements || {},
				referralCommissions: tierConfig.referralCommissions || {
					borlette: { perPlay: 0, monthlyCap: 0 },
					roulette: { per100Spins: 0, monthlyCap: 0 },
					dominoes: { per100Wagered: 0, monthlyCap: 0 },
				},
				downgrades: {
					inactivityDaysMin:
						CONSTANTS_DOWNGRADES[tierName]?.min || 30,
					inactivityDaysMax:
						CONSTANTS_DOWNGRADES[tierName]?.max || 60,
				},
				createdBy: adminUser._id,
			};

			tierEntries.push(tierEntry);
			console.log(`📋 Prepared ${tierName} tier configuration`);
		}

		// Insert all tier requirements
		const createdTiers = await TierRequirements.insertMany(tierEntries);
		console.log(
			`✅ Successfully created ${createdTiers.length} tier requirements in database`
		);

		// Verify the creation
		const verificationCount = await TierRequirements.countDocuments({
			isActive: true,
		});
		console.log(
			`🔍 Verification: ${verificationCount} active tier requirements found`
		);

		// Display summary
		console.log('\n📊 Migration Summary:');
		console.log('====================================');
		for (const tier of createdTiers) {
			console.log(`${tier.tier}: ${tier.name}`);
			console.log(
				`  - Withdrawal Limit: $${tier.benefits.weeklyWithdrawalLimit}`
			);
			console.log(
				`  - Withdrawal Time: ${tier.benefits.withdrawalTime} hours`
			);
			if (tier.requirements.depositAmount30Days) {
				console.log(
					`  - Deposit Requirement (30d): $${tier.requirements.depositAmount30Days}`
				);
			}
			if (tier.requirements.daysPlayedPerWeek) {
				console.log(
					`  - Play Days Per Week: ${tier.requirements.daysPlayedPerWeek}`
				);
			}
			console.log('');
		}

		console.log('🎉 Tier requirements migration completed successfully!');
		console.log('\n⚠️  IMPORTANT NEXT STEPS:');
		console.log(
			'1. Update your application code to use database configurations'
		);
		console.log('2. Test tier evaluation with new database configs');
		console.log('3. Consider backing up the old constants file');
		console.log('4. Monitor tier evaluations for any issues');

		return true;
	} catch (error) {
		console.error('❌ Error during tier requirements migration:', error);
		return false;
	}
};

/**
 * Rollback migration (restore from constants)
 * Use this if you need to revert the migration
 */
const rollbackTierRequirements = async () => {
	try {
		console.log('🔄 Starting tier requirements rollback...');

		const deleteResult = await TierRequirements.deleteMany({});
		console.log(
			`🗑️  Deleted ${deleteResult.deletedCount} tier requirement records`
		);

		console.log(
			'✅ Rollback completed. Application will now use constants again.'
		);
		console.log(
			'⚠️  Remember to restart your application to clear any cached configurations.'
		);

		return true;
	} catch (error) {
		console.error('❌ Error during rollback:', error);
		return false;
	}
};

/**
 * Sync constants to database (for updates)
 * Use this to update database with any changes made to constants
 */
const syncConstantsToDatabase = async () => {
	try {
		console.log('🔄 Starting constants-to-database sync...');

		const adminUser = await User.findOne({ role: 'ADMIN' });
		if (!adminUser) {
			console.error('❌ No admin user found.');
			return false;
		}

		let updated = 0;
		let created = 0;

		for (const [tierName, tierConfig] of Object.entries(CONSTANTS_TIERS)) {
			const existingTier = await TierRequirements.findOne({
				tier: tierName,
			});

			const tierData = {
				tier: tierName,
				name: tierConfig.name,
				isActive: true,
				benefits: {
					weeklyWithdrawalLimit:
						tierConfig.weeklyWithdrawalLimit || 0,
					withdrawalTime: tierConfig.withdrawalTime || 72,
					weeklyCashbackPercentage:
						tierConfig.weeklyCashbackPercentage || 0,
					monthlyCashbackPercentage:
						tierConfig.monthlyCashbackPercentage || 0,
					referralXP: tierConfig.referralXP || 0,
					noWinCashbackPercentage:
						tierConfig.noWinCashbackPercentage || 0,
					noWinCashbackDays: tierConfig.noWinCashbackDays || 0,
				},
				requirements: tierConfig.requirements || {},
				referralCommissions: tierConfig.referralCommissions || {
					borlette: { perPlay: 0, monthlyCap: 0 },
					roulette: { per100Spins: 0, monthlyCap: 0 },
					dominoes: { per100Wagered: 0, monthlyCap: 0 },
				},
				downgrades: {
					inactivityDaysMin:
						CONSTANTS_DOWNGRADES[tierName]?.min || 30,
					inactivityDaysMax:
						CONSTANTS_DOWNGRADES[tierName]?.max || 60,
				},
				updatedBy: adminUser._id,
			};

			if (existingTier) {
				// Update existing
				Object.assign(existingTier, tierData);
				await existingTier.save();
				updated++;
				console.log(`📝 Updated ${tierName} tier`);
			} else {
				// Create new
				tierData.createdBy = adminUser._id;
				await TierRequirements.create(tierData);
				created++;
				console.log(`➕ Created ${tierName} tier`);
			}
		}

		console.log(
			`✅ Sync completed. Updated: ${updated}, Created: ${created}`
		);
		return true;
	} catch (error) {
		console.error('❌ Error during sync:', error);
		return false;
	}
};

/**
 * Migration script to update lottery indexes
 * This fixes the duplicate key error by making the unique constraints more specific
 */
const migrateLotteryIndexes = async () => {
	try {
		console.log('🔄 Starting lottery index migration...');

		// Ensure MongoDB connection is established
		if (!mongoose.connection.db) {
			console.log('⏳ Waiting for MongoDB connection...');
			await new Promise(resolve => {
				if (mongoose.connection.readyState === 1) {
					resolve();
				} else {
					mongoose.connection.once('connected', resolve);
				}
			});
		}

		const db = mongoose.connection.db;
		if (!db) {
			throw new Error('MongoDB connection not established');
		}

		const collection = db.collection('lotteries');

		// Drop the old indexes
		console.log('📤 Dropping old indexes...');
		try {
			await collection.dropIndex('unique_pick3_sparse');
			console.log('✅ Dropped unique_pick3_sparse index');
		} catch (error) {
			console.log(
				'ℹ️  Index unique_pick3_sparse not found or already dropped'
			);
		}

		try {
			await collection.dropIndex('unique_pick4_sparse');
			console.log('✅ Dropped unique_pick4_sparse index');
		} catch (error) {
			console.log(
				'ℹ️  Index unique_pick4_sparse not found or already dropped'
			);
		}

		// Create the new compound unique indexes
		console.log('📥 Creating new compound unique indexes...');

		await collection.createIndex(
			{ state: 1, 'externalGameIds.pick3': 1, scheduledTime: 1 },
			{
				unique: true,
				sparse: true,
				name: 'unique_state_pick3_time',
			}
		);
		console.log('✅ Created unique_state_pick3_time index');

		await collection.createIndex(
			{ state: 1, 'externalGameIds.pick4': 1, scheduledTime: 1 },
			{
				unique: true,
				sparse: true,
				name: 'unique_state_pick4_time',
			}
		);
		console.log('✅ Created unique_state_pick4_time index');

		console.log('🎉 Lottery index migration completed successfully!');
		return true;
	} catch (error) {
		console.error('❌ Error during lottery index migration:', error);
		throw error;
	}
};

// Export functions for use in migration scripts
export {
	migrateTierRequirements,
	rollbackTierRequirements,
	syncConstantsToDatabase,
	migrateLotteryIndexes,
};

// If running directly
(() => {
	const command = process.argv[2];

	// Connect to MongoDB
	mongoose.connect(mongo.uri, {
		useNewUrlParser: true,
		useCreateIndex: true,
	});

	// Wait for connection to be established
	mongoose.connection.once('connected', async () => {
		console.log('✅ MongoDB connected successfully');

		try {
			switch (command) {
				case 'migrate':
					await migrateTierRequirements();
					break;
				case 'rollback':
					await rollbackTierRequirements();
					break;
				case 'sync':
					await syncConstantsToDatabase();
					break;
				case 'lottery':
					await migrateLotteryIndexes();
					break;
				case 'all':
					await Promise.all([
						migrateTierRequirements(),
						migrateLotteryIndexes(),
					]);
					console.log('🎉 All migrations completed successfully!');
					break;
				default:
					console.log(
						'Usage: node tierMigration.js [migrate|rollback|sync|lottery|all]'
					);
					console.log(
						'  migrate  - Transfer constants to database (first time setup)'
					);
					console.log(
						'  rollback - Remove database configs and revert to constants'
					);
					console.log(
						'  sync     - Update database with any changes from constants'
					);
					console.log(
						'  lottery  - Fix lottery duplicate key error by updating indexes'
					);
					console.log(
						'  all      - Run all migrations (tier + lottery)'
					);
					process.exit(1);
			}

			console.log('✅ Migration completed successfully');
			process.exit(0);
		} catch (error) {
			console.error('❌ Migration failed:', error);
			process.exit(1);
		}
	});

	mongoose.connection.on('error', error => {
		console.error('❌ MongoDB connection error:', error);
		process.exit(1);
	});

	// Handle process termination
	process.on('SIGINT', () => {
		mongoose.connection.close(() => {
			console.log('MongoDB connection closed');
			process.exit(0);
		});
	});
})();
