import cron from 'node-cron';
import {
	processNoWinCashback,
	cleanupDepositData,
	evaluateUserTier,
} from '../../api/loyalty/controller';
import { LoyaltyProfile, ReferralCommission } from '../../api/loyalty/model';
import { User } from '../../api/user/model';
import moment from 'moment';

console.log('Initializing loyalty program scheduler...');

// Process no-win cashback daily at 1 AM
cron.schedule('0 1 * * *', async () => {
	console.log('Running no-win cashback processing job...');
	try {
		const result = await processNoWinCashback();
		console.log(
			`No-win cashback completed with ${result.entity.results.length} users processed`
		);
	} catch (error) {
		console.error('Error in no-win cashback job:', error);
	}
});

// Reset monthly referral commission caps - Run on the 1st of every month at 12 AM
cron.schedule('0 0 1 * *', async () => {
	console.log('Resetting monthly referral commission caps...');
	try {
		const loyalties = await LoyaltyProfile.find({
			currentTier: { $in: ['GOLD', 'VIP'] },
		});

		for (const loyalty of loyalties) {
			loyalty.referralCommissions.monthly = {
				borlette: { earned: 0, plays: 0 },
				roulette: { earned: 0, spins: 0 },
				dominoes: { earned: 0, wagered: 0 },
				totalEarned: 0,
				resetDate: moment().endOf('month').toDate(),
			};
			await loyalty.save();
		}

		console.log(`Reset referral commission caps for ${loyalties.length} users`);
	} catch (error) {
		console.error('Error resetting referral commission caps:', error);
	}
});

// Reset weekly spending tracking - Run every Monday at 12 AM
cron.schedule('0 0 * * 1', async () => {
	console.log('Resetting weekly spending tracking...');
	try {
		const result = await LoyaltyProfile.updateMany(
			{},
			{
				$set: {
					'tierProgress.weeklySpending': 0,
					'tierProgress.weeklySpendingResetDate': moment().endOf('week').toDate(),
					'tierProgress.daysPlayedThisWeek': 0,
				},
			}
		);

		console.log(`Reset weekly spending for ${result.modifiedCount} users`);
	} catch (error) {
		console.error('Error resetting weekly spending:', error);
	}
});

// Check daily login streaks and session requirements - Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
	console.log('Checking daily login requirements...');
	try {
		const yesterday = moment().subtract(1, 'day').startOf('day');
		const yesterdayEnd = moment().subtract(1, 'day').endOf('day');

		// Find VIP users who need daily login
		const vipUsers = await LoyaltyProfile.find({ currentTier: 'VIP' }).populate('user');

		for (const loyalty of vipUsers) {
			const user = await User.findById(loyalty.user);
			if (!user) continue;

			// Check if user logged in yesterday
			const loggedInYesterday = user.sessionTracking &&
				user.sessionTracking.lastLoginDate &&
				moment(user.sessionTracking.lastLoginDate).isBetween(yesterday, yesterdayEnd);

			// Check if user met session time requirement
			const metSessionRequirement = user.sessionTracking &&
				user.sessionTracking.lastLoginDate &&
				moment(user.sessionTracking.lastLoginDate).isSame(yesterday, 'day') &&
				(user.sessionTracking.totalSessionTimeToday >= 300); // 5 minutes = 300 seconds

			if (!loggedInYesterday || !metSessionRequirement) {
				console.log(`VIP user ${user._id} failed daily login/session requirement`);
				// Could implement tier downgrade logic here if needed
			}
		}
	} catch (error) {
		console.error('Error checking daily login requirements:', error);
	}
});

// Update no-win tracking daily at 3 AM
cron.schedule('0 3 * * *', async () => {
	console.log('Updating no-win tracking...');
	try {
		const loyalties = await LoyaltyProfile.find({
			currentTier: { $in: ['GOLD', 'VIP'] },
		});

		for (const loyalty of loyalties) {
			if (!loyalty.tierProgress.lastWinDate) {
				// Never won - count from first play
				if (loyalty.tierProgress.lastPlayDate) {
					const daysSinceFirstPlay = moment().diff(
						moment(loyalty.tierProgress.lastPlayDate),
						'days'
					);
					loyalty.tierProgress.consecutiveDaysNoWin = daysSinceFirstPlay;

					// Check eligibility
					const tierConfig = require('../../api/loyalty/constants').LOYALTY_TIERS[loyalty.currentTier];
					if (daysSinceFirstPlay >= tierConfig.noWinCashbackDays) {
						loyalty.tierProgress.eligibleForNoWinCashback = true;
					}
				}
			} else {
				// Has won before
				const daysSinceLastWin = moment().diff(
					moment(loyalty.tierProgress.lastWinDate),
					'days'
				);
				loyalty.tierProgress.consecutiveDaysNoWin = daysSinceLastWin;

				// Check eligibility
				const tierConfig = require('../../api/loyalty/constants').LOYALTY_TIERS[loyalty.currentTier];
				if (daysSinceLastWin >= tierConfig.noWinCashbackDays) {
					loyalty.tierProgress.eligibleForNoWinCashback = true;
				}
			}

			await loyalty.save();
		}

		console.log(`Updated no-win tracking for ${loyalties.length} users`);
	} catch (error) {
		console.error('Error updating no-win tracking:', error);
	}
});

// Cleanup deposit data - Run daily at 4 AM
cron.schedule('0 4 * * *', async () => {
	console.log('Running deposit data cleanup job...');
	try {
		const result = await cleanupDepositData();
		console.log('Deposit data cleanup completed:', result.entity.message);
	} catch (error) {
		console.error('Error in deposit data cleanup job:', error);
	}
});

// Evaluate all user tiers - Run daily at 5 AM
cron.schedule('0 5 * * *', async () => {
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

console.log('Loyalty program scheduler initialized with all tasks');