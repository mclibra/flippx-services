import cron from 'node-cron';
import {
	processWeeklyCashback,
	cleanupDepositData,
	evaluateUserTier,
} from '../../api/loyalty/controller';
import { LoyaltyProfile } from '../../api/loyalty/model';

export const initializeLoyaltyScheduler = () => {
	// Process weekly cashback - Run Sunday at midnight
	cron.schedule('0 0 * * 0', async () => {
		console.log('Running weekly cashback processing job...');
		try {
			const result = await processWeeklyCashback();
			console.log(
				`Weekly cashback completed with ${result.entity.results.length} results processed`
			);
		} catch (error) {
			console.error('Error in weekly cashback job:', error);
		}
	});

	// Cleanup deposit data - Run daily at 2 AM
	cron.schedule('0 2 * * *', async () => {
		console.log('Running deposit data cleanup job...');
		try {
			const result = await cleanupDepositData();
			console.log(
				'Deposit data cleanup completed:',
				result.entity.message
			);
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

			for (const loyalty of users) {
				const oldTier = loyalty.currentTier;
				await evaluateUserTier(loyalty.user);

				// Check if user was upgraded or downgraded
				const updatedLoyalty = await LoyaltyProfile.findOne({
					user: loyalty.user,
				});
				if (updatedLoyalty.currentTier !== oldTier) {
					if (updatedLoyalty.currentTier > oldTier) {
						upgrades++;
					} else {
						downgrades++;
					}
				}
			}

			console.log(
				`Tier evaluation completed. Upgrades: ${upgrades}, Downgrades: ${downgrades}`
			);
		} catch (error) {
			console.error('Error in tier evaluation job:', error);
		}
	});
};
