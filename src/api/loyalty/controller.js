import moment from 'moment';
import { LoyaltyProfile, LoyaltyTransaction } from './model';
import { User } from '../user/model';
import { Transaction } from '../transaction/model';
import {
	LOYALTY_TIERS,
	TIER_DOWNGRADES,
	REFERRAL_QUALIFICATION_AMOUNT,
	INACTIVITY_CHECK_DAYS
} from './constants';

// Initialize loyalty profile for a new user
export const initializeLoyalty = async userId => {
	try {
		const existingLoyalty = await LoyaltyProfile.findOne({ user: userId });
		if (existingLoyalty) {
			return existingLoyalty;
		}

		const loyalty = new LoyaltyProfile({
			user: userId,
			currentTier: 'NONE',
			xpBalance: 0,
			tierProgress: {
				daysPlayedThisWeek: 0,
				daysPlayedThisMonth: 0,
				totalDeposit30Days: 0,
				totalDeposit60Days: 0,
				totalDeposit90Days: 0,
			},
			weeklyWithdrawalUsed: 0,
			weeklyWithdrawalReset: moment().endOf('week').toDate(),
		});

		await loyalty.save();
		return loyalty;
	} catch (error) {
		console.error('Error initializing loyalty:', error);
		throw error;
	}
};

// Award XP to a user
export const awardXP = async (userId, amount, type, description, reference = null) => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		const previousBalance = loyalty.xpBalance;
		loyalty.xpBalance += amount;

		await loyalty.save();

		// Record transaction
		await LoyaltyTransaction.create({
			user: userId,
			transactionType: type,
			xpAmount: amount,
			description,
			reference,
			previousBalance,
			newBalance: loyalty.xpBalance,
			tier: loyalty.currentTier,
		});

		return loyalty;
	} catch (error) {
		console.error('Error awarding XP:', error);
		throw error;
	}
};

// Record play activity
export const recordPlayActivity = async userId => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		const today = moment().startOf('day');
		const lastPlayDate = loyalty.tierProgress.lastPlayDate
			? moment(loyalty.tierProgress.lastPlayDate).startOf('day')
			: null;

		// Only count as a new play day if it's a different day
		if (!lastPlayDate || !today.isSame(lastPlayDate)) {
			loyalty.tierProgress.daysPlayedThisWeek += 1;
			loyalty.tierProgress.daysPlayedThisMonth += 1;
			loyalty.tierProgress.lastPlayDate = today.toDate();

			// Reset weekly counter if it's a new week
			const startOfWeek = moment().startOf('week');
			if (lastPlayDate && lastPlayDate.isBefore(startOfWeek)) {
				loyalty.tierProgress.daysPlayedThisWeek = 1;
			}

			// Reset monthly counter if it's a new month
			const startOfMonth = moment().startOf('month');
			if (lastPlayDate && lastPlayDate.isBefore(startOfMonth)) {
				loyalty.tierProgress.daysPlayedThisMonth = 1;
			}

			// Clear inactivity if user is playing
			loyalty.tierProgress.inactivityStartDate = null;
		}

		await loyalty.save();

		// Evaluate tier to check if user qualifies for upgrades
		await evaluateUserTier(userId);

		return loyalty;
	} catch (error) {
		console.error('Error recording play activity:', error);
		throw error;
	}
};

// Record a deposit
export const recordDeposit = async (userId, amount) => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		// Update deposit amounts for the different periods
		loyalty.tierProgress.totalDeposit30Days += amount;
		loyalty.tierProgress.totalDeposit60Days += amount;
		loyalty.tierProgress.totalDeposit90Days += amount;

		await loyalty.save();

		// Evaluate tier after deposit
		await evaluateUserTier(userId);

		return loyalty;
	} catch (error) {
		console.error('Error recording deposit:', error);
		throw error;
	}
};

// Check if user has proper ID verification
const checkIDVerification = async userId => {
	try {
		const user = await User.findById(userId);
		// Assuming the User model has an isIDVerified field
		// If not available, you can use user.isActive as fallback but should implement proper ID verification
		return user?.isIDVerified === true || user?.isActive === true;
	} catch (error) {
		console.error('Error checking ID verification:', error);
		return false;
	}
};

// Evaluate if a user qualifies for a tier upgrade or needs a downgrade
export const evaluateUserTier = async userId => {
	try {
		const loyalty = await LoyaltyProfile.findOne({ user: userId }).populate('user');
		if (!loyalty) {
			throw new Error('Loyalty profile not found for user');
		}

		const now = moment();
		const daysPlayedPerWeek = loyalty.tierProgress.daysPlayedThisWeek;
		const lastPlay = loyalty.tierProgress.lastPlayDate
			? moment(loyalty.tierProgress.lastPlayDate)
			: null;

		// Check for inactivity
		if (lastPlay) {
			const daysSinceLastPlay = now.diff(lastPlay, 'days');

			// Start inactivity counter if no play in specified days
			if (
				daysSinceLastPlay >= INACTIVITY_CHECK_DAYS &&
				!loyalty.tierProgress.inactivityStartDate
			) {
				loyalty.tierProgress.inactivityStartDate = now.toDate();
			}

			// Check for tier downgrade due to inactivity
			if (loyalty.tierProgress.inactivityStartDate) {
				const inactivityDays = now.diff(
					moment(loyalty.tierProgress.inactivityStartDate),
					'days'
				);

				// Use flexible downgrade periods
				const currentTierDowngrade = TIER_DOWNGRADES[loyalty.currentTier];
				if (currentTierDowngrade) {
					// Use minimum downgrade period for consistency
					const downgradeThreshold = currentTierDowngrade.min;

					if (loyalty.currentTier === 'VIP' && inactivityDays >= downgradeThreshold) {
						loyalty.currentTier = 'GOLD';
						loyalty.tierProgress.vipStartDate = null;
						loyalty.tierProgress.vipEligibleDate = null;
					} else if (loyalty.currentTier === 'GOLD' && inactivityDays >= downgradeThreshold) {
						loyalty.currentTier = 'SILVER';
						loyalty.tierProgress.goldStartDate = null;
						loyalty.tierProgress.goldEligibleDate = null;
					} else if (loyalty.currentTier === 'SILVER' && inactivityDays >= downgradeThreshold) {
						loyalty.currentTier = 'NONE';
						loyalty.tierProgress.silverStartDate = null;
						loyalty.tierProgress.silverEligibleDate = null;
					}
				}
			}
		}

		// Check for tier upgrades
		// SILVER tier evaluation
		if (loyalty.currentTier === 'NONE') {
			const silverReqs = LOYALTY_TIERS.SILVER.requirements;

			// Check proper ID verification
			const isVerified = await checkIDVerification(userId);

			if (
				isVerified &&
				loyalty.tierProgress.totalDeposit30Days >= silverReqs.depositAmount30Days &&
				daysPlayedPerWeek >= silverReqs.daysPlayedPerWeek
			) {
				// Mark as eligible for silver
				if (!loyalty.tierProgress.silverEligibleDate) {
					loyalty.tierProgress.silverEligibleDate = now.toDate();
				}

				// Check if they've maintained eligibility for the required days
				if (loyalty.tierProgress.silverEligibleDate) {
					const eligibleDays = now.diff(
						moment(loyalty.tierProgress.silverEligibleDate),
						'days'
					);
					if (eligibleDays >= silverReqs.daysRequired) {
						loyalty.currentTier = 'SILVER';
						loyalty.tierProgress.silverStartDate = now.toDate();
					}
				}
			} else {
				// Reset eligibility if requirements not met
				loyalty.tierProgress.silverEligibleDate = null;
			}
		}

		// GOLD tier evaluation
		if (loyalty.currentTier === 'SILVER') {
			const goldReqs = LOYALTY_TIERS.GOLD.requirements;

			if (loyalty.tierProgress.silverStartDate) {
				const daysAsSilver = now.diff(
					moment(loyalty.tierProgress.silverStartDate),
					'days'
				);

				if (
					daysAsSilver >= goldReqs.previousTierDays &&
					loyalty.tierProgress.totalDeposit60Days >= goldReqs.depositAmount60Days &&
					daysPlayedPerWeek >= goldReqs.daysPlayedPerWeek
				) {
					// Mark as eligible for gold
					if (!loyalty.tierProgress.goldEligibleDate) {
						loyalty.tierProgress.goldEligibleDate = now.toDate();
					}

					// Check if they've maintained eligibility for the required days
					if (loyalty.tierProgress.goldEligibleDate) {
						const eligibleDays = now.diff(
							moment(loyalty.tierProgress.goldEligibleDate),
							'days'
						);
						if (eligibleDays >= goldReqs.daysRequired) {
							loyalty.currentTier = 'GOLD';
							loyalty.tierProgress.goldStartDate = now.toDate();
						}
					}
				} else {
					// Reset eligibility if requirements not met
					loyalty.tierProgress.goldEligibleDate = null;
				}
			}
		}

		// VIP tier evaluation
		if (loyalty.currentTier === 'GOLD') {
			const vipReqs = LOYALTY_TIERS.VIP.requirements;

			if (loyalty.tierProgress.goldStartDate) {
				const daysAsGold = now.diff(
					moment(loyalty.tierProgress.goldStartDate),
					'days'
				);

				if (
					daysAsGold >= vipReqs.previousTierDays &&
					loyalty.tierProgress.totalDeposit90Days >= vipReqs.depositAmount90Days &&
					daysPlayedPerWeek >= vipReqs.daysPlayedPerWeek
				) {
					// Mark as eligible for VIP
					if (!loyalty.tierProgress.vipEligibleDate) {
						loyalty.tierProgress.vipEligibleDate = now.toDate();
					}

					// Check if they've maintained eligibility for the required days
					if (loyalty.tierProgress.vipEligibleDate) {
						const eligibleDays = now.diff(
							moment(loyalty.tierProgress.vipEligibleDate),
							'days'
						);
						if (eligibleDays >= vipReqs.daysRequired) {
							loyalty.currentTier = 'VIP';
							loyalty.tierProgress.vipStartDate = now.toDate();
						}
					}
				} else {
					// Reset eligibility if requirements not met
					loyalty.tierProgress.vipEligibleDate = null;
				}
			}
		}

		// Update evaluation date
		loyalty.tierProgress.lastTierEvaluationDate = now.toDate();

		await loyalty.save();
		return loyalty;
	} catch (error) {
		console.error('Error evaluating tier:', error);
		throw error;
	}
};

// Calculate total play amount for a user
const calculateTotalPlayAmount = async userId => {
	try {
		const transactions = await Transaction.aggregate([
			{
				$match: {
					user: userId.toString(),
					transactionIdentifier: {
						$in: ['TICKET_BORLETTE', 'TICKET_MEGAMILLION', 'TICKET_ROULETTE'],
					},
				},
			},
			{
				$group: {
					_id: null,
					total: { $sum: '$transactionAmount' },
				},
			},
		]);

		return transactions.length > 0 ? transactions[0].total : 0;
	} catch (error) {
		console.error('Error calculating play amount:', error);
		throw error;
	}
};

// Process weekly cashback for GOLD tier users only
export const processWeeklyCashback = async () => {
	try {
		// Find only GOLD tier users for weekly cashback
		const eligibleLoyalties = await LoyaltyProfile.find({
			currentTier: 'GOLD', // Only GOLD gets weekly cashback
		}).populate('user');

		const results = [];

		for (const loyalty of eligibleLoyalties) {
			try {
				// Get user's loss/win data for the week
				const endDate = moment().endOf('week');
				const startDate = moment().startOf('week');

				// Calculate total amounts played and won from transactions
				const transactionResults = await Transaction.aggregate([
					{
						$match: {
							user: loyalty.user._id.toString(),
							createdAt: {
								$gte: startDate.toDate(),
								$lte: endDate.toDate(),
							},
							transactionIdentifier: {
								$in: [
									'TICKET_BORLETTE',
									'TICKET_MEGAMILLION',
									'TICKET_ROULETTE',
									'WON_BORLETTE',
									'WON_MEGAMILLION',
									'WON_ROULETTE',
								],
							},
						},
					},
					{
						$group: {
							_id: {
								type: '$transactionIdentifier',
							},
							total: { $sum: '$transactionAmount' },
						},
					},
				]);

				// Calculate total losses
				let totalSpent = 0;
				let totalWon = 0;

				for (const result of transactionResults) {
					if (
						[
							'TICKET_BORLETTE',
							'TICKET_MEGAMILLION',
							'TICKET_ROULETTE',
						].includes(result._id.type)
					) {
						totalSpent += result.total;
					} else {
						totalWon += result.total;
					}
				}

				const netLoss = totalSpent - totalWon;

				// Only process cashback for net losses
				if (netLoss > 0) {
					const cashbackPercentage = LOYALTY_TIERS[loyalty.currentTier].weeklyCashbackPercentage;
					const cashbackAmount = netLoss * (cashbackPercentage / 100);

					// Record cashback history
					loyalty.cashbackHistory.push({
						date: new Date(),
						amount: cashbackAmount,
						processed: false,
						type: 'WEEKLY',
					});

					await loyalty.save();

					// Award XP for the cashback
					await awardXP(
						loyalty.user._id.toString(),
						cashbackAmount,
						'CASHBACK',
						`Weekly cashback (${cashbackPercentage}%) for ${startDate.format('MMM D')} - ${endDate.format('MMM D')}`,
						{
							weekStart: startDate.toISOString(),
							weekEnd: endDate.toISOString(),
							type: 'WEEKLY',
						}
					);

					// Mark cashback as processed
					const lastIndex = loyalty.cashbackHistory.length - 1;
					loyalty.cashbackHistory[lastIndex].processed = true;
					await loyalty.save();

					results.push({
						userId: loyalty.user._id.toString(),
						tier: loyalty.currentTier,
						netLoss,
						cashbackAmount,
						success: true,
					});
				} else {
					results.push({
						userId: loyalty.user._id.toString(),
						tier: loyalty.currentTier,
						netLoss: 0,
						cashbackAmount: 0,
						success: true,
						message: 'No losses to process cashback for',
					});
				}
			} catch (error) {
				console.error(`Error processing weekly cashback for user ${loyalty.user._id}:`, error);
				results.push({
					userId: loyalty.user._id.toString(),
					success: false,
					error: error.message,
				});
			}
		}

		return {
			status: 200,
			entity: {
				success: true,
				results,
			},
		};
	} catch (error) {
		console.error('Error processing weekly cashback:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process weekly cashback',
			},
		};
	}
};

// Process monthly cashback for VIP tier users only
export const processMonthlyVIPCashback = async () => {
	try {
		// Find only VIP tier users for monthly cashback
		const eligibleLoyalties = await LoyaltyProfile.find({
			currentTier: 'VIP', // Only VIP gets monthly cashback
		}).populate('user');

		const results = [];

		for (const loyalty of eligibleLoyalties) {
			try {
				// Get user's loss/win data for the previous month
				const endDate = moment().subtract(1, 'month').endOf('month');
				const startDate = moment().subtract(1, 'month').startOf('month');

				// Calculate total amounts played and won from transactions
				const transactionResults = await Transaction.aggregate([
					{
						$match: {
							user: loyalty.user._id.toString(),
							createdAt: {
								$gte: startDate.toDate(),
								$lte: endDate.toDate(),
							},
							transactionIdentifier: {
								$in: [
									'TICKET_BORLETTE',
									'TICKET_MEGAMILLION',
									'TICKET_ROULETTE',
									'WON_BORLETTE',
									'WON_MEGAMILLION',
									'WON_ROULETTE',
								],
							},
						},
					},
					{
						$group: {
							_id: {
								type: '$transactionIdentifier',
							},
							total: { $sum: '$transactionAmount' },
						},
					},
				]);

				// Calculate total losses
				let totalSpent = 0;
				let totalWon = 0;

				for (const result of transactionResults) {
					if (
						[
							'TICKET_BORLETTE',
							'TICKET_MEGAMILLION',
							'TICKET_ROULETTE',
						].includes(result._id.type)
					) {
						totalSpent += result.total;
					} else {
						totalWon += result.total;
					}
				}

				const netLoss = totalSpent - totalWon;

				// Only process cashback for net losses
				if (netLoss > 0) {
					const cashbackPercentage = LOYALTY_TIERS[loyalty.currentTier].monthlyCashbackPercentage;
					const cashbackAmount = netLoss * (cashbackPercentage / 100);

					// Check if cashback for this month was already processed
					const monthKey = startDate.format('YYYY-MM');
					const existingCashback = loyalty.cashbackHistory.find(
						cb => cb.reference?.monthKey === monthKey && cb.type === 'MONTHLY'
					);

					if (!existingCashback) {
						// Record cashback history
						loyalty.cashbackHistory.push({
							date: new Date(),
							amount: cashbackAmount,
							processed: false,
							type: 'MONTHLY',
							reference: { monthKey },
						});

						await loyalty.save();

						// Award XP for the cashback
						await awardXP(
							loyalty.user._id.toString(),
							cashbackAmount,
							'CASHBACK',
							`Monthly cashback (${cashbackPercentage}%) for ${startDate.format('MMMM YYYY')}`,
							{
								monthStart: startDate.toISOString(),
								monthEnd: endDate.toISOString(),
								type: 'MONTHLY',
								monthKey,
							}
						);

						// Mark cashback as processed
						const lastIndex = loyalty.cashbackHistory.length - 1;
						loyalty.cashbackHistory[lastIndex].processed = true;
						await loyalty.save();

						results.push({
							userId: loyalty.user._id.toString(),
							tier: loyalty.currentTier,
							netLoss,
							cashbackAmount,
							month: startDate.format('MMMM YYYY'),
							success: true,
						});
					} else {
						results.push({
							userId: loyalty.user._id.toString(),
							tier: loyalty.currentTier,
							success: true,
							message: `Monthly cashback for ${startDate.format('MMMM YYYY')} already processed`,
						});
					}
				} else {
					results.push({
						userId: loyalty.user._id.toString(),
						tier: loyalty.currentTier,
						netLoss: 0,
						cashbackAmount: 0,
						month: startDate.format('MMMM YYYY'),
						success: true,
						message: 'No losses to process cashback for',
					});
				}
			} catch (error) {
				console.error(`Error processing monthly cashback for user ${loyalty.user._id}:`, error);
				results.push({
					userId: loyalty.user._id.toString(),
					success: false,
					error: error.message,
				});
			}
		}

		return {
			status: 200,
			entity: {
				success: true,
				results,
			},
		};
	} catch (error) {
		console.error('Error processing monthly VIP cashback:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process monthly VIP cashback',
			},
		};
	}
};

// Process referral qualification
export const processReferralQualification = async refereeId => {
	try {
		// Find the referee user
		const referee = await User.findById(refereeId);
		if (!referee || !referee.refferalCode) {
			return {
				success: false,
				message: 'User or referral code not found',
			};
		}

		// Find the referrer based on the referee's refferalCode
		const referrer = await User.findOne({
			userName: referee.refferalCode.toLowerCase(),
		});
		if (!referrer) {
			return { success: false, message: 'Referrer not found' };
		}

		// Get referrer's loyalty program
		let referrerLoyalty = await LoyaltyProfile.findOne({
			user: referrer._id.toString(),
		});
		if (!referrerLoyalty) {
			referrerLoyalty = await initializeLoyalty(referrer._id.toString());
		}

		// Check if referee already exists in referrals
		const existingReferral = referrerLoyalty.referralBenefits.find(
			ref => ref.referredUser.toString() === refereeId.toString()
		);

		if (existingReferral && existingReferral.qualified) {
			return { success: false, message: 'Referral already qualified' };
		}

		// Check if referee has played enough ($50)
		const playAmount = await calculateTotalPlayAmount(refereeId);

		if (playAmount >= REFERRAL_QUALIFICATION_AMOUNT) {
			// Determine XP amount based on referrer's tier
			let xpAmount = 0;
			if (referrerLoyalty.currentTier === 'GOLD') {
				xpAmount = LOYALTY_TIERS.GOLD.referralXP;
			} else if (referrerLoyalty.currentTier === 'VIP') {
				xpAmount = LOYALTY_TIERS.VIP.referralXP;
			}

			if (xpAmount > 0) {
				// Add or update referral record
				if (existingReferral) {
					existingReferral.qualified = true;
					existingReferral.earnedXP = xpAmount;
					existingReferral.qualificationDate = new Date();
				} else {
					referrerLoyalty.referralBenefits.push({
						referredUser: refereeId,
						earnedXP: xpAmount,
						qualified: true,
						qualificationDate: new Date(),
					});
				}

				await referrerLoyalty.save();

				// Award XP to the referrer
				await awardXP(
					referrer._id.toString(),
					xpAmount,
					'REFERRAL',
					`Referral qualification bonus for ${referee.userName || 'referred user'}`,
					{
						referredUser: refereeId,
						playAmount,
					}
				);

				return {
					success: true,
					message: `Referral qualified! ${xpAmount} XP awarded to referrer`,
					xpAmount,
				};
			}
		}

		return {
			success: false,
			message: `Referee needs to play $${REFERRAL_QUALIFICATION_AMOUNT} to qualify (current: $${playAmount})`,
		};
	} catch (error) {
		console.error('Error processing referral qualification:', error);
		return {
			success: false,
			error: error.message || 'Failed to process referral qualification',
		};
	}
};

// Admin function to manually upgrade a user's tier
export const manualTierUpgrade = async (userId, targetTier) => {
	try {
		if (!['SILVER', 'GOLD', 'VIP'].includes(targetTier)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid tier specified',
				},
			};
		}

		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		// Check if it's an upgrade
		const tierRank = { NONE: 0, SILVER: 1, GOLD: 2, VIP: 3 };
		if (tierRank[targetTier] <= tierRank[loyalty.currentTier]) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `User already has equivalent or higher tier (${loyalty.currentTier})`,
				},
			};
		}

		const now = moment().toDate();
		loyalty.currentTier = targetTier;

		// Set appropriate tier dates
		if (targetTier === 'SILVER' || targetTier === 'GOLD' || targetTier === 'VIP') {
			loyalty.tierProgress.silverStartDate = now;
		}
		if (targetTier === 'GOLD' || targetTier === 'VIP') {
			loyalty.tierProgress.goldStartDate = now;
		}
		if (targetTier === 'VIP') {
			loyalty.tierProgress.vipStartDate = now;
		}

		// Add manual upgrade note in a transaction
		await LoyaltyTransaction.create({
			user: userId,
			transactionType: 'ADJUSTMENT',
			xpAmount: 0,
			description: `Manual tier upgrade to ${targetTier} by admin`,
			previousBalance: loyalty.xpBalance,
			newBalance: loyalty.xpBalance,
			tier: targetTier,
		});

		await loyalty.save();

		return {
			status: 200,
			entity: {
				success: true,
				message: `User successfully upgraded to ${targetTier} tier`,
				loyalty,
			},
		};
	} catch (error) {
		console.error('Error in manual tier upgrade:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to upgrade tier',
			},
		};
	}
};

// Get loyalty profile for a user
export const getUserLoyalty = async userId => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		// Calculate progress to next tier
		const progress = calculateTierProgress(loyalty);

		return {
			status: 200,
			entity: {
				success: true,
				loyalty: {
					...loyalty.toObject(),
					progress,
				},
			},
		};
	} catch (error) {
		console.error('Error getting user loyalty:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve loyalty data',
			},
		};
	}
};

// Calculate user's progress to the next tier
const calculateTierProgress = loyalty => {
	const currentTier = loyalty.currentTier;
	let nextTier, progress = {};

	if (currentTier === 'NONE') {
		nextTier = 'SILVER';
		const silverReqs = LOYALTY_TIERS.SILVER.requirements;

		progress = {
			nextTier,
			depositProgress: {
				current: loyalty.tierProgress.totalDeposit30Days,
				required: silverReqs.depositAmount30Days,
				percentage: Math.min(
					100,
					(loyalty.tierProgress.totalDeposit30Days / silverReqs.depositAmount30Days) * 100
				),
			},
			playProgress: {
				current: loyalty.tierProgress.daysPlayedThisWeek,
				required: silverReqs.daysPlayedPerWeek,
				percentage: Math.min(
					100,
					(loyalty.tierProgress.daysPlayedThisWeek / silverReqs.daysPlayedPerWeek) * 100
				),
			},
			timeProgress: {
				current: loyalty.tierProgress.silverEligibleDate
					? moment().diff(moment(loyalty.tierProgress.silverEligibleDate), 'days')
					: 0,
				required: silverReqs.daysRequired,
				percentage: loyalty.tierProgress.silverEligibleDate
					? Math.min(
						100,
						(moment().diff(moment(loyalty.tierProgress.silverEligibleDate), 'days') / silverReqs.daysRequired) * 100
					)
					: 0,
			},
		};
	} else if (currentTier === 'SILVER') {
		nextTier = 'GOLD';
		const goldReqs = LOYALTY_TIERS.GOLD.requirements;

		progress = {
			nextTier,
			depositProgress: {
				current: loyalty.tierProgress.totalDeposit60Days,
				required: goldReqs.depositAmount60Days,
				percentage: Math.min(
					100,
					(loyalty.tierProgress.totalDeposit60Days / goldReqs.depositAmount60Days) * 100
				),
			},
			playProgress: {
				current: loyalty.tierProgress.daysPlayedThisWeek,
				required: goldReqs.daysPlayedPerWeek,
				percentage: Math.min(
					100,
					(loyalty.tierProgress.daysPlayedThisWeek / goldReqs.daysPlayedPerWeek) * 100
				),
			},
			timeAsTier: {
				current: loyalty.tierProgress.silverStartDate
					? moment().diff(moment(loyalty.tierProgress.silverStartDate), 'days')
					: 0,
				required: goldReqs.previousTierDays,
				percentage: loyalty.tierProgress.silverStartDate
					? Math.min(
						100,
						(moment().diff(moment(loyalty.tierProgress.silverStartDate), 'days') / goldReqs.previousTierDays) * 100
					)
					: 0,
			},
			timeProgress: {
				current: loyalty.tierProgress.goldEligibleDate
					? moment().diff(moment(loyalty.tierProgress.goldEligibleDate), 'days')
					: 0,
				required: goldReqs.daysRequired,
				percentage: loyalty.tierProgress.goldEligibleDate
					? Math.min(
						100,
						(moment().diff(moment(loyalty.tierProgress.goldEligibleDate), 'days') / goldReqs.daysRequired) * 100
					)
					: 0,
			},
		};
	} else if (currentTier === 'GOLD') {
		nextTier = 'VIP';
		const vipReqs = LOYALTY_TIERS.VIP.requirements;

		progress = {
			nextTier,
			depositProgress: {
				current: loyalty.tierProgress.totalDeposit90Days,
				required: vipReqs.depositAmount90Days,
				percentage: Math.min(
					100,
					(loyalty.tierProgress.totalDeposit90Days / vipReqs.depositAmount90Days) * 100
				),
			},
			playProgress: {
				current: loyalty.tierProgress.daysPlayedThisWeek,
				required: vipReqs.daysPlayedPerWeek,
				percentage: Math.min(
					100,
					(loyalty.tierProgress.daysPlayedThisWeek / vipReqs.daysPlayedPerWeek) * 100
				),
			},
			timeAsTier: {
				current: loyalty.tierProgress.goldStartDate
					? moment().diff(moment(loyalty.tierProgress.goldStartDate), 'days')
					: 0,
				required: vipReqs.previousTierDays,
				percentage: loyalty.tierProgress.goldStartDate
					? Math.min(
						100,
						(moment().diff(moment(loyalty.tierProgress.goldStartDate), 'days') / vipReqs.previousTierDays) * 100
					)
					: 0,
			},
			timeProgress: {
				current: loyalty.tierProgress.vipEligibleDate
					? moment().diff(moment(loyalty.tierProgress.vipEligibleDate), 'days')
					: 0,
				required: vipReqs.daysRequired,
				percentage: loyalty.tierProgress.vipEligibleDate
					? Math.min(
						100,
						(moment().diff(moment(loyalty.tierProgress.vipEligibleDate), 'days') / vipReqs.daysRequired) * 100
					)
					: 0,
			},
		};
	} else if (currentTier === 'VIP') {
		// Already at highest tier
		progress = {
			nextTier: null,
			message: "You've reached the highest tier!",
		};
	}

	return progress;
};

// Get user's XP history
export const getUserXPHistory = async (userId, { limit = 10, offset = 0 }) => {
	try {
		const transactions = await LoyaltyTransaction.find({ user: userId })
			.sort({ createdAt: -1 })
			.skip(parseInt(offset))
			.limit(parseInt(limit));

		const total = await LoyaltyTransaction.countDocuments({ user: userId });

		return {
			status: 200,
			entity: {
				success: true,
				transactions,
				total,
			},
		};
	} catch (error) {
		console.error('Error getting XP history:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve XP history',
			},
		};
	}
};

// Check and reset weekly withdrawal limits
export const checkWeeklyWithdrawalLimit = async userId => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		// Check if reset date is in the past
		if (
			!loyalty.weeklyWithdrawalReset ||
			moment().isAfter(moment(loyalty.weeklyWithdrawalReset))
		) {
			// Reset withdrawal counter and set new reset date
			loyalty.weeklyWithdrawalUsed = 0;
			loyalty.weeklyWithdrawalReset = moment().endOf('week').toDate();
			await loyalty.save();
		}

		const tierLimit = LOYALTY_TIERS[loyalty.currentTier].weeklyWithdrawalLimit;
		const remaining = Math.max(0, tierLimit - loyalty.weeklyWithdrawalUsed);

		return {
			status: 200,
			entity: {
				success: true,
				weeklyLimit: tierLimit,
				used: loyalty.weeklyWithdrawalUsed,
				remaining,
				resetDate: loyalty.weeklyWithdrawalReset,
			},
		};
	} catch (error) {
		console.error('Error checking weekly withdrawal limit:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to check withdrawal limit',
			},
		};
	}
};

// Record withdrawal usage
export const recordWithdrawalUsage = async (userId, amount) => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		// Check if amount exceeds remaining limit
		const tierLimit = LOYALTY_TIERS[loyalty.currentTier].weeklyWithdrawalLimit;
		const remaining = tierLimit - loyalty.weeklyWithdrawalUsed;

		if (amount > remaining) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Withdrawal amount exceeds weekly limit. Remaining: $${remaining}`,
				},
			};
		}

		loyalty.weeklyWithdrawalUsed += amount;
		await loyalty.save();

		return {
			status: 200,
			entity: {
				success: true,
				weeklyLimit: tierLimit,
				used: loyalty.weeklyWithdrawalUsed,
				remaining: tierLimit - loyalty.weeklyWithdrawalUsed,
			},
		};
	} catch (error) {
		console.error('Error recording withdrawal usage:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to record withdrawal usage',
			},
		};
	}
};

// Get withdrawal time based on tier
export const getWithdrawalTime = async userId => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		const withdrawalTime = LOYALTY_TIERS[loyalty.currentTier].withdrawalTime;

		return {
			status: 200,
			entity: {
				success: true,
				tier: loyalty.currentTier,
				withdrawalTime: withdrawalTime,
				description: withdrawalTime === 0
					? 'Same-day withdrawal'
					: `${withdrawalTime} hours processing time`,
			},
		};
	} catch (error) {
		console.error('Error getting withdrawal time:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get withdrawal time',
			},
		};
	}
};

// Clean up old deposit data (run periodically)
export const cleanupDepositData = async () => {
	try {
		// Find all loyalty profiles
		const loyalties = await LoyaltyProfile.find({});

		for (const loyalty of loyalties) {
			// Recalculate deposit amounts based on transactions
			const days30Ago = moment().subtract(30, 'days').toDate();
			const days60Ago = moment().subtract(60, 'days').toDate();
			const days90Ago = moment().subtract(90, 'days').toDate();

			// Get all deposit transactions
			const depositTransactions = await Transaction.find({
				user: loyalty.user,
				transactionIdentifier: 'DEPOSIT',
				transactionType: 'CREDIT',
				createdAt: { $gte: days90Ago },
			});

			// Calculate deposit amounts for different periods
			let deposit30Days = 0;
			let deposit60Days = 0;
			let deposit90Days = 0;

			for (const tx of depositTransactions) {
				// Add to 90-day total
				deposit90Days += tx.transactionAmount;

				// Check if within 60 days
				if (moment(tx.createdAt).isAfter(days60Ago)) {
					deposit60Days += tx.transactionAmount;
				}

				// Check if within 30 days
				if (moment(tx.createdAt).isAfter(days30Ago)) {
					deposit30Days += tx.transactionAmount;
				}
			}

			// Update loyalty profile
			loyalty.tierProgress.totalDeposit30Days = deposit30Days;
			loyalty.tierProgress.totalDeposit60Days = deposit60Days;
			loyalty.tierProgress.totalDeposit90Days = deposit90Days;
			await loyalty.save();
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: `Deposit data cleaned up for ${loyalties.length} users`,
			},
		};
	} catch (error) {
		console.error('Error cleaning up deposit data:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to clean up deposit data',
			},
		};
	}
};