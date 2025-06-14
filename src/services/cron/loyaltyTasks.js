import cron from 'node-cron';
import {
	processWeeklyCashback,
	processMonthlyVIPCashback,
	cleanupDepositData,
	evaluateUserTier,
} from '../../api/loyalty/controller';
import { LoyaltyProfile } from '../../api/loyalty/model';

export const initializeLoyaltyScheduler = () => {
	console.log('Initializing loyalty program scheduler...');

	// Process weekly cashback for GOLD tier - Run Sunday at midnight
	cron.schedule('0 0 * * 0', async () => {
		console.log('Running weekly cashback processing job for GOLD tier users...');
		try {
			const result = await processWeeklyCashback();
			console.log(
				`Weekly cashback completed with ${result.entity.results.length} GOLD tier users processed`
			);
		} catch (error) {
			console.error('Error in weekly cashback job:', error);
		}
	});

	// Process monthly cashback for VIP tier - Run on the 1st of every month at 1 AM
	cron.schedule('0 1 1 * *', async () => {
		console.log('Running monthly cashback processing job for VIP tier users...');
		try {
			const result = await processMonthlyVIPCashback();
			console.log(
				`Monthly VIP cashback completed with ${result.entity.results.length} VIP tier users processed`
			);
		} catch (error) {
			console.error('Error in monthly VIP cashback job:', error);
		}
	});

	// Cleanup deposit data - Run daily at 2 AM
	cron.schedule('0 2 * * *', async () => {
		console.log('Running deposit data cleanup job...');
		try {
			const result = await cleanupDepositData();
			console.log('Deposit data cleanup completed:', result.entity.message);
		} catch (error) {
			console.error('Error in deposit data cleanup job:', error);
		}
	});

	// Evaluate all user tiers - Run daily at 3 AM
	cron.schedule('0 3 * * *', async () => {
		console.log('Running tier evaluation job...');
		try {
			const users = await LoyaltyProfile.find({});
			console.log(`Evaluating tiers for ${users.length} users`);

			let upgrades = 0;
			let downgrades = 0;
			let errors = 0;

			for (const loyalty of users) {
				try {
					const oldTier = loyalty.currentTier;
					await evaluateUserTier(loyalty.user);

					// Check if user was upgraded or downgraded
					const updatedLoyalty = await LoyaltyProfile.findOne({
						user: loyalty.user,
					});

					if (updatedLoyalty && updatedLoyalty.currentTier !== oldTier) {
						const tierRank = { NONE: 0, SILVER: 1, GOLD: 2, VIP: 3 };
						if (tierRank[updatedLoyalty.currentTier] > tierRank[oldTier]) {
							upgrades++;
							console.log(`User ${loyalty.user} upgraded from ${oldTier} to ${updatedLoyalty.currentTier}`);
						} else {
							downgrades++;
							console.log(`User ${loyalty.user} downgraded from ${oldTier} to ${updatedLoyalty.currentTier}`);
						}
					}
				} catch (userError) {
					errors++;
					console.error(`Error evaluating tier for user ${loyalty.user}:`, userError);
				}
			}

			console.log(
				`Tier evaluation completed. Upgrades: ${upgrades}, Downgrades: ${downgrades}, Errors: ${errors}`
			);
		} catch (error) {
			console.error('Error in tier evaluation job:', error);
		}
	});

	// Weekly counter reset - Run every Monday at midnight
	cron.schedule('0 0 * * 1', async () => {
		console.log('Running weekly counter reset job...');
		try {
			const loyalties = await LoyaltyProfile.find({});
			let resetCount = 0;

			for (const loyalty of loyalties) {
				loyalty.tierProgress.daysPlayedThisWeek = 0;
				await loyalty.save();
				resetCount++;
			}

			console.log(`Weekly play counters reset for ${resetCount} users`);
		} catch (error) {
			console.error('Error in weekly counter reset job:', error);
		}
	});

	// Monthly counter reset - Run on the 1st of every month at midnight
	cron.schedule('0 0 1 * *', async () => {
		console.log('Running monthly counter reset job...');
		try {
			const loyalties = await LoyaltyProfile.find({});
			let resetCount = 0;

			for (const loyalty of loyalties) {
				loyalty.tierProgress.daysPlayedThisMonth = 0;
				await loyalty.save();
				resetCount++;
			}

			console.log(`Monthly play counters reset for ${resetCount} users`);
		} catch (error) {
			console.error('Error in monthly counter reset job:', error);
		}
	});

	console.log('Loyalty program scheduler initialized successfully');
};