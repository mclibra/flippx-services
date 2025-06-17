import moment from 'moment';
import { LoyaltyProfile, LoyaltyTransaction, ReferralCommission } from './model';
import { User } from '../user/model';
import { Transaction } from '../transaction/model';
import {
	LOYALTY_TIERS,
	TIER_DOWNGRADES,
	REFERRAL_QUALIFICATION_AMOUNT,
	INACTIVITY_CHECK_DAYS,
	REFERRAL_MIN_BET_REQUIREMENTS,
} from './constants';

const GAME_TRANSACTION_IDENTIFIERS = [
	'TICKET_BORLETTE',
	'TICKET_MEGAMILLION',
	'TICKET_ROULETTE',
	'DOMINO_ENTRY',
];

const WINNING_TRANSACTION_IDENTIFIERS = [
	'WON_BORLETTE',
	'WON_MEGAMILLION',
	'WON_ROULETTE',
	'WON_DOMINO',
];

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
				weeklySpending: 0,
				weeklySpendingResetDate: moment().endOf('week').toDate(),
				consecutiveDaysNoWin: 0,
				totalPlaysSinceLastWin: 0,
			},
			weeklyWithdrawalUsed: 0,
			weeklyWithdrawalReset: moment().endOf('week').toDate(),
			referralCommissions: {
				monthly: {
					borlette: { earned: 0, plays: 0 },
					roulette: { earned: 0, spins: 0 },
					dominoes: { earned: 0, wagered: 0 },
					totalEarned: 0,
					resetDate: moment().endOf('month').toDate(),
				},
				lifetime: {
					borlette: { earned: 0, plays: 0 },
					roulette: { earned: 0, spins: 0 },
					dominoes: { earned: 0, wagered: 0 },
					totalEarned: 0,
				},
			},
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

// Record play activity with spending tracking
export const recordPlayActivity = async (userId, amountSpent = 0) => {
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

		// NEW: Track weekly spending
		const weekEnd = moment().endOf('week');
		if (!loyalty.tierProgress.weeklySpendingResetDate ||
			moment().isAfter(moment(loyalty.tierProgress.weeklySpendingResetDate))) {
			loyalty.tierProgress.weeklySpending = 0;
			loyalty.tierProgress.weeklySpendingResetDate = weekEnd.toDate();
		}
		loyalty.tierProgress.weeklySpending += amountSpent;

		// NEW: Track plays since last win
		loyalty.tierProgress.totalPlaysSinceLastWin += 1;

		await loyalty.save();

		// Evaluate tier to check if user qualifies for upgrades
		await evaluateUserTier(userId);

		return loyalty;
	} catch (error) {
		console.error('Error recording play activity:', error);
		throw error;
	}
};

export const checkIDVerification = async (userId) => {
	try {
		const { User } = await import('../user/model');
		const user = await User.findById(userId);

		if (!user) {
			return false;
		}

		// Check if user has verified ID proof
		const hasVerifiedId = user.idProof &&
			user.idProof.verificationStatus === 'VERIFIED';

		return hasVerifiedId;
	} catch (error) {
		console.error('Error checking ID verification:', error);
		return false;
	}
};

// Record deposit for loyalty tracking
export const recordDeposit = async (userId, amount) => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		const now = moment();

		// Update deposit amounts for different periods
		loyalty.tierProgress.totalDeposit30Days += amount;
		loyalty.tierProgress.totalDeposit60Days += amount;
		loyalty.tierProgress.totalDeposit90Days += amount;

		await loyalty.save();

		// Award XP for deposit (optional - adjust as needed)
		const depositXP = Math.floor(amount / 10); // 1 XP per $10 deposited
		if (depositXP > 0) {
			await awardXP(
				userId,
				depositXP,
				'BONUS',
				`Deposit bonus: $${amount}`,
				{ type: 'DEPOSIT', amount }
			);
		}

		// Re-evaluate tier after deposit
		await evaluateUserTier(userId);

		return loyalty;
	} catch (error) {
		console.error('Error recording deposit:', error);
		throw error;
	}
};

// Evaluate if a user qualifies for a tier upgrade or needs a downgrade
export const evaluateUserTier = async userId => {
	try {
		const loyalty = await LoyaltyProfile.findOne({ user: userId }).populate('user');
		if (!loyalty) {
			throw new Error('Loyalty profile not found for user');
		}

		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}

		const now = moment();
		const daysPlayedPerWeek = loyalty.tierProgress.daysPlayedThisWeek;
		const weeklySpending = loyalty.tierProgress.weeklySpending || 0;
		const dailySessionMinutes = loyalty.tierProgress.dailySessionMinutesToday || 0;
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

				// Check all requirements including new ones
				const meetsRequirements =
					daysAsSilver >= goldReqs.previousTierDays &&
					loyalty.tierProgress.totalDeposit60Days >= goldReqs.depositAmount60Days &&
					daysPlayedPerWeek >= goldReqs.daysPlayedPerWeek &&
					weeklySpending >= goldReqs.weeklySpendAmount &&
					dailySessionMinutes >= goldReqs.dailySessionMinutes;

				if (meetsRequirements) {
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

				// Check daily login requirement
				const hasDailyLogin = user.sessionTracking &&
					user.sessionTracking.dailyLoginStreak >= 7; // At least 7 days consecutive

				// Check all requirements including new ones
				const meetsRequirements =
					daysAsGold >= vipReqs.previousTierDays &&
					loyalty.tierProgress.totalDeposit90Days >= vipReqs.depositAmount90Days &&
					daysPlayedPerWeek >= vipReqs.daysPlayedPerWeek &&
					weeklySpending >= vipReqs.weeklySpendAmount &&
					dailySessionMinutes >= vipReqs.dailySessionMinutes &&
					hasDailyLogin;

				if (meetsRequirements) {
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

		// Check no-win cashback eligibility
		await checkNoWinCashbackEligibility(userId);

		await loyalty.save();
		return loyalty;
	} catch (error) {
		console.error('Error evaluating tier:', error);
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
									...GAME_TRANSACTION_IDENTIFIERS,
									...WINNING_TRANSACTION_IDENTIFIERS
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
						GAME_TRANSACTION_IDENTIFIERS.includes(result._id.type)
					) {
						totalSpent += result.total;
					} else if (
						WINNING_TRANSACTION_IDENTIFIERS.includes(result._id.type)
					) {
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
									...GAME_TRANSACTION_IDENTIFIERS,
									...WINNING_TRANSACTION_IDENTIFIERS
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
						GAME_TRANSACTION_IDENTIFIERS.includes(result._id.type)
					) {
						totalSpent += result.total;
					} else if (
						WINNING_TRANSACTION_IDENTIFIERS.includes(result._id.type)
					) {
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
			message: `Referee needs to play ${REFERRAL_QUALIFICATION_AMOUNT} to qualify (current: ${playAmount})`,
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
				error: error.message || 'Failed to retrieve loyalty profile',
			},
		};
	}
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
					? 'Same day withdrawal'
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
		const now = moment();
		const updated30Days = 0;
		const updated60Days = 0;
		const updated90Days = 0;

		// Get all loyalty profiles
		const loyalties = await LoyaltyProfile.find({});

		for (const loyalty of loyalties) {
			// Get deposit transactions from the past 90 days
			const deposits30Days = await Transaction.aggregate([
				{
					$match: {
						user: loyalty.user.toString(),
						transactionIdentifier: 'DEPOSIT',
						transactionType: 'CREDIT',
						createdAt: {
							$gte: now.clone().subtract(30, 'days').toDate(),
							$lte: now.toDate(),
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

			const deposits60Days = await Transaction.aggregate([
				{
					$match: {
						user: loyalty.user.toString(),
						transactionIdentifier: 'DEPOSIT',
						transactionType: 'CREDIT',
						createdAt: {
							$gte: now.clone().subtract(60, 'days').toDate(),
							$lte: now.toDate(),
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

			const deposits90Days = await Transaction.aggregate([
				{
					$match: {
						user: loyalty.user.toString(),
						transactionIdentifier: 'DEPOSIT',
						transactionType: 'CREDIT',
						createdAt: {
							$gte: now.clone().subtract(90, 'days').toDate(),
							$lte: now.toDate(),
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

			// Update deposit totals
			loyalty.tierProgress.totalDeposit30Days = deposits30Days.length > 0 ? deposits30Days[0].total : 0;
			loyalty.tierProgress.totalDeposit60Days = deposits60Days.length > 0 ? deposits60Days[0].total : 0;
			loyalty.tierProgress.totalDeposit90Days = deposits90Days.length > 0 ? deposits90Days[0].total : 0;

			await loyalty.save();
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: `Cleaned up deposit data for ${loyalties.length} users`,
			},
		};
	} catch (error) {
		console.error('Error cleaning up deposit data:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to cleanup deposit data',
			},
		};
	}
};

// NEW: Record daily login
export const recordDailyLogin = async userId => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		const today = moment().startOf('day');
		const lastLogin = loyalty.tierProgress.lastDailyLoginDate;

		if (!lastLogin || !moment(lastLogin).isSame(today, 'day')) {
			loyalty.tierProgress.lastDailyLoginDate = today.toDate();

			// Check consecutive days for daily login requirements
			if (lastLogin && moment(lastLogin).add(1, 'day').isSame(today, 'day')) {
				loyalty.tierProgress.dailyLoginStreak = (loyalty.tierProgress.dailyLoginStreak || 0) + 1;
			} else {
				loyalty.tierProgress.dailyLoginStreak = 1;
			}

			await loyalty.save();
		}

		return loyalty;
	} catch (error) {
		console.error('Error recording daily login:', error);
		throw error;
	}
};

// NEW: Update session time
export const updateSessionTime = async (userId, sessionMinutes) => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		const today = moment().startOf('day');

		// Reset daily session minutes if it's a new day
		if (!loyalty.tierProgress.lastDailyLoginDate ||
			!moment(loyalty.tierProgress.lastDailyLoginDate).isSame(today, 'day')) {
			loyalty.tierProgress.dailySessionMinutesToday = 0;
		}

		loyalty.tierProgress.dailySessionMinutesToday += sessionMinutes;
		await loyalty.save();

		return loyalty;
	} catch (error) {
		console.error('Error updating session time:', error);
		throw error;
	}
};

// NEW: Record win activity
export const recordWinActivity = async userId => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			loyalty = await initializeLoyalty(userId);
		}

		loyalty.tierProgress.lastWinDate = new Date();
		loyalty.tierProgress.consecutiveDaysNoWin = 0;
		loyalty.tierProgress.totalPlaysSinceLastWin = 0;
		loyalty.tierProgress.eligibleForNoWinCashback = false;

		await loyalty.save();
		return loyalty;
	} catch (error) {
		console.error('Error recording win activity:', error);
		throw error;
	}
};

// NEW: Check no-win cashback eligibility
export const checkNoWinCashbackEligibility = async userId => {
	try {
		let loyalty = await LoyaltyProfile.findOne({ user: userId });
		if (!loyalty) {
			return { eligible: false };
		}

		// Only Gold and VIP tiers get no-win cashback
		if (loyalty.currentTier !== 'GOLD' && loyalty.currentTier !== 'VIP') {
			return { eligible: false };
		}

		const tierConfig = LOYALTY_TIERS[loyalty.currentTier];
		const lastWin = loyalty.tierProgress.lastWinDate;

		if (!lastWin) {
			// Never won - check days since first play
			if (loyalty.tierProgress.lastPlayDate) {
				const daysSinceFirstPlay = moment().diff(moment(loyalty.tierProgress.lastPlayDate), 'days');
				if (daysSinceFirstPlay >= tierConfig.noWinCashbackDays) {
					loyalty.tierProgress.eligibleForNoWinCashback = true;
					loyalty.tierProgress.consecutiveDaysNoWin = daysSinceFirstPlay;
					await loyalty.save();
					return { eligible: true, daysNoWin: daysSinceFirstPlay };
				}
			}
		} else {
			const daysSinceWin = moment().diff(moment(lastWin), 'days');
			if (daysSinceWin >= tierConfig.noWinCashbackDays) {
				loyalty.tierProgress.eligibleForNoWinCashback = true;
				loyalty.tierProgress.consecutiveDaysNoWin = daysSinceWin;
				await loyalty.save();
				return { eligible: true, daysNoWin: daysSinceWin };
			}
		}

		return { eligible: false };
	} catch (error) {
		console.error('Error checking no-win cashback eligibility:', error);
		throw error;
	}
};

// NEW: Process referral commission
export const processReferralCommission = async (refereeId, gameType, playAmount, playId) => {
	try {
		// Check minimum bet requirement
		const minBet = REFERRAL_MIN_BET_REQUIREMENTS[gameType.toLowerCase()];
		if (!minBet || playAmount < minBet) {
			return { success: false, message: `Minimum bet of ${minBet} required for referral commission` };
		}

		// Find the referee user
		const referee = await User.findById(refereeId);
		if (!referee || !referee.refferalCode) {
			return { success: false, message: 'User or referral code not found' };
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

		// Only Gold and VIP tiers earn referral commissions
		if (referrerLoyalty.currentTier !== 'GOLD' && referrerLoyalty.currentTier !== 'VIP') {
			return { success: false, message: 'Referrer tier does not earn commissions' };
		}

		const tierConfig = LOYALTY_TIERS[referrerLoyalty.currentTier];
		const commissionConfig = tierConfig.referralCommissions[gameType.toLowerCase()];

		if (!commissionConfig || commissionConfig.perPlay === 0) {
			return { success: false, message: 'No commission configured for this game type' };
		}

		// Check monthly cap
		const monthlyCommissions = referrerLoyalty.referralCommissions.monthly;
		if (monthlyCommissions.totalEarned >= commissionConfig.monthlyCap) {
			return { success: false, message: 'Monthly commission cap reached' };
		}

		// Calculate commission
		let commissionAmount = 0;
		let commissionRate = 0;

		switch (gameType.toLowerCase()) {
			case 'borlette':
				commissionAmount = commissionConfig.perPlay;
				commissionRate = commissionConfig.perPlay;
				monthlyCommissions.borlette.plays += 1;
				referrerLoyalty.referralCommissions.lifetime.borlette.plays += 1;
				break;

			case 'roulette':
				// Commission per 100 spins
				monthlyCommissions.roulette.spins += 1;
				referrerLoyalty.referralCommissions.lifetime.roulette.spins += 1;

				if (monthlyCommissions.roulette.spins % 100 === 0) {
					commissionAmount = commissionConfig.per100Spins;
					commissionRate = commissionConfig.per100Spins;
				}
				break;

			case 'dominoes':
				// Commission per $100 wagered
				monthlyCommissions.dominoes.wagered += playAmount;
				referrerLoyalty.referralCommissions.lifetime.dominoes.wagered += playAmount;

				const totalWagered = monthlyCommissions.dominoes.wagered;
				const previousHundreds = Math.floor((totalWagered - playAmount) / 100);
				const currentHundreds = Math.floor(totalWagered / 100);

				if (currentHundreds > previousHundreds) {
					commissionAmount = commissionConfig.per100Wagered * (currentHundreds - previousHundreds);
					commissionRate = commissionConfig.per100Wagered;
				}
				break;
		}

		if (commissionAmount > 0) {
			// Ensure we don't exceed monthly cap
			const remainingCap = commissionConfig.monthlyCap - monthlyCommissions.totalEarned;
			commissionAmount = Math.min(commissionAmount, remainingCap);

			// Update commission tracking
			monthlyCommissions[gameType.toLowerCase()].earned += commissionAmount;
			monthlyCommissions.totalEarned += commissionAmount;
			referrerLoyalty.referralCommissions.lifetime[gameType.toLowerCase()].earned += commissionAmount;
			referrerLoyalty.referralCommissions.lifetime.totalEarned += commissionAmount;

			await referrerLoyalty.save();

			// Create commission record
			await ReferralCommission.create({
				referrer: referrer._id,
				referee: refereeId,
				gameType: gameType.toUpperCase(),
				playId,
				playAmount,
				commissionAmount,
				commissionRate,
				referrerTier: referrerLoyalty.currentTier,
				processed: true,
				processedDate: new Date(),
			});

			// Create transaction record
			await LoyaltyTransaction.create({
				user: referrer._id.toString(),
				transactionType: 'REFERRAL_COMMISSION',
				xpAmount: 0, // Commissions are cash, not XP
				description: `${gameType} referral commission from ${referee.userName || 'user'}`,
				reference: {
					commissionType: gameType.toUpperCase(),
					commissionAmount,
					referredUser: refereeId,
					playId,
					playAmount,
				},
				previousBalance: referrerLoyalty.xpBalance,
				newBalance: referrerLoyalty.xpBalance,
				tier: referrerLoyalty.currentTier,
			});

			// Credit commission to referrer's wallet
			const { Wallet } = await import('../wallet/model');
			const referrerWallet = await Wallet.findOne({ user: referrer._id });
			if (referrerWallet) {
				referrerWallet.realBalance += commissionAmount;
				await referrerWallet.save();
			}

			return {
				success: true,
				message: `Commission of ${commissionAmount.toFixed(2)} credited to referrer`,
				commissionAmount,
			};
		}

		return { success: false, message: 'No commission earned for this play' };
	} catch (error) {
		console.error('Error processing referral commission:', error);
		return { success: false, error: error.message };
	}
};

// NEW: Process no-win cashback
export const processNoWinCashback = async () => {
	try {
		// Find eligible users for no-win cashback
		const eligibleLoyalties = await LoyaltyProfile.find({
			currentTier: { $in: ['GOLD', 'VIP'] },
			'tierProgress.eligibleForNoWinCashback': true,
		}).populate('user');

		const results = [];

		for (const loyalty of eligibleLoyalties) {
			try {
				const tierConfig = LOYALTY_TIERS[loyalty.currentTier];

				// Calculate total spent in the last 15 days
				const startDate = moment().subtract(tierConfig.noWinCashbackDays, 'days');
				const endDate = moment();

				const transactionResults = await Transaction.aggregate([
					{
						$match: {
							user: loyalty.user._id.toString(),
							createdAt: {
								$gte: startDate.toDate(),
								$lte: endDate.toDate(),
							},
							transactionIdentifier: {
								$in: GAME_TRANSACTION_IDENTIFIERS,
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

				const totalSpent = transactionResults.length > 0 ? transactionResults[0].total : 0;

				if (totalSpent > 0) {
					const cashbackPercentage = tierConfig.noWinCashbackPercentage;
					const cashbackAmount = totalSpent * (cashbackPercentage / 100);

					// Record cashback history
					loyalty.cashbackHistory.push({
						date: new Date(),
						amount: cashbackAmount,
						processed: false,
						type: 'NO_WIN',
						reference: {
							noWinDays: loyalty.tierProgress.consecutiveDaysNoWin,
						},
					});

					await loyalty.save();

					// Award cashback as real balance
					const { Wallet } = await import('../wallet/model');
					const userWallet = await Wallet.findOne({ user: loyalty.user._id });
					if (userWallet) {
						userWallet.realBalance += cashbackAmount;
						await userWallet.save();
					}

					// Create transaction record
					await LoyaltyTransaction.create({
						user: loyalty.user._id.toString(),
						transactionType: 'CASHBACK',
						xpAmount: 0,
						description: `No-win cashback (${cashbackPercentage}%) for ${tierConfig.noWinCashbackDays} days without winning`,
						reference: {
							type: 'NO_WIN',
							noWinDays: loyalty.tierProgress.consecutiveDaysNoWin,
							totalSpent,
							cashbackAmount,
						},
						previousBalance: loyalty.xpBalance,
						newBalance: loyalty.xpBalance,
						tier: loyalty.currentTier,
					});

					// Mark cashback as processed
					const lastIndex = loyalty.cashbackHistory.length - 1;
					loyalty.cashbackHistory[lastIndex].processed = true;
					loyalty.tierProgress.eligibleForNoWinCashback = false;
					await loyalty.save();

					results.push({
						userId: loyalty.user._id.toString(),
						tier: loyalty.currentTier,
						totalSpent,
						cashbackAmount,
						noWinDays: loyalty.tierProgress.consecutiveDaysNoWin,
						success: true,
					});
				}
			} catch (error) {
				console.error(`Error processing no-win cashback for user ${loyalty.user._id}:`, error);
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
		console.error('Error processing no-win cashback:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process no-win cashback',
			},
		};
	}
};

// Calculate user's progress to the next tier
export const calculateTierProgress = loyalty => {
	const currentTier = loyalty.currentTier;
	let progress = {};

	if (currentTier === 'NONE') {
		const silverReqs = LOYALTY_TIERS.SILVER.requirements;
		progress = {
			nextTier: 'SILVER',
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
		const goldReqs = LOYALTY_TIERS.GOLD.requirements;
		progress = {
			nextTier: 'GOLD',
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
			spendingProgress: {
				current: loyalty.tierProgress.weeklySpending || 0,
				required: goldReqs.weeklySpendAmount,
				percentage: Math.min(
					100,
					((loyalty.tierProgress.weeklySpending || 0) / goldReqs.weeklySpendAmount) * 100
				),
			},
			sessionProgress: {
				current: loyalty.tierProgress.dailySessionMinutesToday || 0,
				required: goldReqs.dailySessionMinutes,
				percentage: Math.min(
					100,
					((loyalty.tierProgress.dailySessionMinutesToday || 0) / goldReqs.dailySessionMinutes) * 100
				),
			},
		};
	} else if (currentTier === 'GOLD') {
		const vipReqs = LOYALTY_TIERS.VIP.requirements;
		progress = {
			nextTier: 'VIP',
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
			spendingProgress: {
				current: loyalty.tierProgress.weeklySpending || 0,
				required: vipReqs.weeklySpendAmount,
				percentage: Math.min(
					100,
					((loyalty.tierProgress.weeklySpending || 0) / vipReqs.weeklySpendAmount) * 100
				),
			},
			dailyLoginProgress: {
				current: loyalty.tierProgress.dailyLoginStreak || 0,
				required: 7, // Minimum 7 days consecutive
				percentage: Math.min(
					100,
					((loyalty.tierProgress.dailyLoginStreak || 0) / 7) * 100
				),
			},
		};
	} else if (currentTier === 'VIP') {
		// Already at highest tier
		progress = {
			nextTier: null,
			message: "You've reached the highest tier!",
			benefits: {
				referralCommissions: LOYALTY_TIERS.VIP.referralCommissions,
				noWinCashback: `${LOYALTY_TIERS.VIP.noWinCashbackPercentage}% after ${LOYALTY_TIERS.VIP.noWinCashbackDays} days`,
			},
		};
	}

	return progress;
};

// Calculate total play amount for a user
const calculateTotalPlayAmount = async userId => {
	try {
		const transactions = await Transaction.aggregate([
			{
				$match: {
					user: userId.toString(),
					transactionIdentifier: {
						$in: GAME_TRANSACTION_IDENTIFIERS,
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