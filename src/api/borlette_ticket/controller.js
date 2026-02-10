import moment from 'moment';
import { Transaction } from '../transaction/model';
import { makeTransaction } from '../transaction/controller';
import { State } from '../admin/state-management/model';
import { Wallet } from '../wallet/model';
import { Lottery, LotteryRestriction } from '../lottery/model';
import { BorletteTicket } from './model';
import { LoyaltyService } from '../loyalty/service';
import PayoutService from '../../services/payout/payoutService';
import FlippXService from '../../services/flippx/collectionService';

export const list = async (queryParams, user) => {
	try {
		const { _id: userId, role } = user;
		const {
			offset = 0,
			limit = 20,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = queryParams;

		// Build query - users can only see their own tickets
		let query = {};
		if (role !== 'ADMIN') {
			query.user = userId;
		}

		// Add date filters if provided
		if (startDate || endDate) {
			query.createdAt = {};
			if (startDate) {
				query.createdAt.$gte = moment(parseInt(startDate)).toDate();
			}
			if (endDate) {
				query.createdAt.$lte = moment(parseInt(endDate)).toDate();
			}
		}

		// Execute query with pagination
		const tickets = await BorletteTicket.find(query)
			.populate('user', 'name email phone')
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.limit(parseInt(limit))
			.skip(parseInt(offset))
			.sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
			.exec();

		// Get total count for pagination
		const total = await BorletteTicket.countDocuments(query);

		// Transform tickets to include separate realAmount and virtualAmount
		const transformedTickets = tickets.map(ticket => {
			const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
			if (ticketObj.cashType === 'REAL') {
				return {
					...ticketObj,
					realAmountPlayed: ticketObj.totalAmountPlayed || 0,
					virtualAmountPlayed: 0,
					realAmountWon: ticketObj.totalAmountWon || 0,
					virtualAmountWon: 0,
				};
			} else {
				return {
					...ticketObj,
					realAmountPlayed: 0,
					virtualAmountPlayed: ticketObj.totalAmountPlayed || 0,
					realAmountWon: 0,
					virtualAmountWon: ticketObj.totalAmountWon || 0,
				};
			}
		});

		// Calculate summary statistics with separate real and virtual amounts
		const totalAmountPlayed = transformedTickets.reduce(
			(sum, ticket) => sum + (ticket.totalAmountPlayed || 0),
			0
		);
		const totalAmountWon = transformedTickets.reduce(
			(sum, ticket) => sum + (ticket.totalAmountWon || 0),
			0
		);
		const totalRealAmountPlayed = transformedTickets.reduce(
			(sum, ticket) => sum + (ticket.realAmountPlayed || 0),
			0
		);
		const totalVirtualAmountPlayed = transformedTickets.reduce(
			(sum, ticket) => sum + (ticket.virtualAmountPlayed || 0),
			0
		);
		const totalRealAmountWon = transformedTickets.reduce(
			(sum, ticket) => sum + (ticket.realAmountWon || 0),
			0
		);
		const totalVirtualAmountWon = transformedTickets.reduce(
			(sum, ticket) => sum + (ticket.virtualAmountWon || 0),
			0
		);

		return {
			status: 200,
			entity: {
				success: true,
				tickets: transformedTickets,
				pagination: {
					total,
					offset: parseInt(offset),
					limit: parseInt(limit),
					hasMore: parseInt(offset) + tickets.length < total,
				},
				summary: {
					totalTickets: tickets.length,
					totalAmountPlayed,
					totalAmountWon,
					totalRealAmountPlayed,
					totalVirtualAmountPlayed,
					totalRealAmountWon,
					totalVirtualAmountWon,
					netResult: totalAmountWon - totalAmountPlayed,
					netResultReal: totalRealAmountWon - totalRealAmountPlayed,
					netResultVirtual: totalVirtualAmountWon - totalVirtualAmountPlayed,
				},
			},
		};
	} catch (error) {
		console.error('Error in list method:', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error.message || error,
			},
		};
	}
};

export const show = async ({ id }, user) => {
	try {
		const { _id: userId, role } = user;

		// Validate that id is numeric
		if (isNaN(id) || id === null || id === undefined) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid ticket ID. ID must be numeric.',
				},
			};
		}

		// Build query with ownership check for non-admins
		let query = { _id: id };
		if (role !== 'ADMIN') {
			query.user = userId;
		}

		const ticket = await BorletteTicket.findOne(query)
			.populate('user', 'name email phone role')
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.exec();

		if (!ticket) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Ticket not found or access denied.',
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				ticket,
			},
		};
	} catch (error) {
		console.error('Error in show method:', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error.message || error,
			},
		};
	}
};

export const listAllByLottery = async (
	{ id },
	{
		offset,
		limit,
		startDate,
		endDate,
		sortBy = 'purchasedOn',
		sortOrder = 'desc',
	}
) => {
	try {
		let params = {
			lottery: id,
		};
		if (startDate || endDate) {
			params['$and'] = [];
			if (startDate) {
				params['$and'].push({
					createdAt: {
						$gte: moment(parseInt(startDate)).toISOString(),
					},
				});
			}
			if (endDate) {
				params['$and'].push({
					createdAt: {
						$lte: moment(parseInt(endDate)).toISOString(),
					},
				});
			}
		}
		const borletteTickets = await BorletteTicket.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.populate('user')
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.exec();
		const total = await BorletteTicket.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				borletteTickets,
				total,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const ticketByLottery = async ({ id }, user) => {
	try {
		const { _id: userId, role } = user;

		// Build query - users can only see their own tickets for the lottery
		let query = { lottery: id };
		if (role !== 'ADMIN') {
			query.user = userId;
		}

		const tickets = await BorletteTicket.find(query)
			.populate('user', 'name email phone')
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.sort({ purchasedOn: -1 })
			.exec();

		// Get lottery information
		const lottery = await Lottery.findById(id)
			.populate('state', 'name code')
			.exec();

		if (!lottery) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Lottery not found.',
				},
			};
		}

		// Calculate summary stats
		const totalAmountPlayed = tickets.reduce(
			(sum, ticket) => sum + ticket.totalAmountPlayed,
			0
		);
		const totalAmountWon = tickets.reduce(
			(sum, ticket) => sum + (ticket.totalAmountWon || 0),
			0
		);

		return {
			status: 200,
			entity: {
				success: true,
				lottery,
				tickets,
				summary: {
					totalTickets: tickets.length,
					totalAmountPlayed,
					totalAmountWon,
					netResult: totalAmountWon - totalAmountPlayed,
				},
			},
		};
	} catch (error) {
		console.error('Error in ticketByLottery method:', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error.message || error,
			},
		};
	}
};

export const listByState = async (
	{ stateId },
	{ offset, limit, startDate, endDate },
	user
) => {
	try {
		if (user.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Access denied. Admin privileges required.',
				},
			};
		}

		// Validate state exists
		const state = await State.findById(stateId);
		if (!state) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'State not found.',
				},
			};
		}

		// Get all lotteries for this state
		const lotteries = await Lottery.find({ state: stateId }).select('_id');
		const lotteryIds = lotteries.map(lottery => lottery._id.toString());

		// Build query with date filters
		let query = {
			lottery: { $in: lotteryIds },
		};

		if (startDate || endDate) {
			query.createdAt = {};
			if (startDate) {
				query.createdAt.$gte = moment(parseInt(startDate)).toDate();
			}
			if (endDate) {
				query.createdAt.$lte = moment(parseInt(endDate)).toDate();
			}
		}

		const tickets = await BorletteTicket.find(query)
			.populate('user', 'name email phone')
			.populate({
				path: 'lottery',
				select: 'title scheduledTime status',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.limit(limit ? parseInt(limit) : 50)
			.skip(offset ? parseInt(offset) : 0)
			.sort({ createdAt: -1 })
			.exec();

		const total = await BorletteTicket.countDocuments(query);

		// Calculate summary statistics
		const summary = await BorletteTicket.aggregate([
			{ $match: query },
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: {
						$sum: { $ifNull: ['$totalAmountWon', 0] },
					},
					completedTickets: {
						$sum: {
							$cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0],
						},
					},
					activeTickets: {
						$sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] },
					},
					cancelledTickets: {
						$sum: {
							$cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0],
						},
					},
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				state,
				tickets,
				pagination: {
					total,
					offset: parseInt(offset) || 0,
					limit: parseInt(limit) || 50,
				},
				summary: summary[0] || {
					totalTickets: 0,
					totalAmountPlayed: 0,
					totalAmountWon: 0,
					completedTickets: 0,
					activeTickets: 0,
					cancelledTickets: 0,
				},
			},
		};
	} catch (error) {
		console.error('Error in listByState method:', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error.message || error,
			},
		};
	}
};

export const stateCommissionSummary = async ({ stateId }, user) => {
	try {
		if (user.role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Access denied. Admin privileges required.',
				},
			};
		}

		// Validate state exists
		const state = await State.findById(stateId);
		if (!state) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'State not found.',
				},
			};
		}

		// Get all lotteries for this state
		const lotteries = await Lottery.find({ state: stateId }).select('_id');
		const lotteryIds = lotteries.map(lottery => lottery._id.toString());

		// Get all tickets for state lotteries
		const tickets = await BorletteTicket.find({
			lottery: { $in: lotteryIds },
			status: { $ne: 'CANCELLED' },
		});

		const ticketIds = tickets.map(ticket => ticket._id);

		// Get commission transactions for these tickets
		const commissionTransactions = await Transaction.find({
			referenceIndex: { $in: ticketIds },
			transactionIdentifier: {
				$in: [
					'TICKET_BORLETTE_COMMISSION',
					'TICKET_BORLETTE_COMMISSION_CANCELLED',
				],
			},
		}).populate('user', 'name email phone role');

		// Aggregate commission data by user
		const commissionByUser = {};
		commissionTransactions.forEach(transaction => {
			const userId = transaction.user._id;
			if (!commissionByUser[userId]) {
				commissionByUser[userId] = {
					user: transaction.user,
					totalCommissionEarned: 0,
					totalCommissionCancelled: 0,
					transactionCount: 0,
				};
			}

			if (
				transaction.transactionIdentifier ===
				'TICKET_BORLETTE_COMMISSION'
			) {
				commissionByUser[userId].totalCommissionEarned +=
					transaction.amount;
			} else if (
				transaction.transactionIdentifier ===
				'TICKET_BORLETTE_COMMISSION_CANCELLED'
			) {
				commissionByUser[userId].totalCommissionCancelled +=
					transaction.amount;
			}
			commissionByUser[userId].transactionCount++;
		});

		// Calculate net commission for each user
		Object.values(commissionByUser).forEach(userCommission => {
			userCommission.netCommission =
				userCommission.totalCommissionEarned -
				userCommission.totalCommissionCancelled;
		});

		// Calculate overall totals
		const overallSummary = {
			totalTickets: tickets.length,
			totalTicketAmount: tickets.reduce(
				(sum, ticket) => sum + ticket.totalAmountPlayed,
				0
			),
			totalCommissionEarned: Object.values(commissionByUser).reduce(
				(sum, user) => sum + user.totalCommissionEarned,
				0
			),
			totalCommissionCancelled: Object.values(commissionByUser).reduce(
				(sum, user) => sum + user.totalCommissionCancelled,
				0
			),
			uniqueCommissionEarners: Object.keys(commissionByUser).length,
		};

		overallSummary.netCommissionPaid =
			overallSummary.totalCommissionEarned -
			overallSummary.totalCommissionCancelled;

		return {
			status: 200,
			entity: {
				success: true,
				state,
				overallSummary,
				commissionByUser: Object.values(commissionByUser),
				detailedTransactions: commissionTransactions,
			},
		};
	} catch (error) {
		console.error('Error in stateCommissionSummary method:', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error.message || error,
			},
		};
	}
};

const getAvailableAmount = async (lotteryId, numbers, hasMarriageNumbers) => {
	try {
		const restrictions = await LotteryRestriction.find({
			lottery: lotteryId,
		});

		let individualNumber = {};
		let twoDigit = {};
		let threeDigit = {};
		let fourDigit = {};
		let marriageNumber = {};

		restrictions.forEach(restriction => {
			switch (restriction.type) {
				case 'INDIVIDUAL_NUMBER':
					restriction.numbers.forEach(numRestriction => {
						individualNumber[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'TWO_DIGIT':
					restriction.numbers.forEach(numRestriction => {
						twoDigit[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'THREE_DIGIT':
					restriction.numbers.forEach(numRestriction => {
						threeDigit[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'FOUR_DIGIT':
					restriction.numbers.forEach(numRestriction => {
						fourDigit[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'MARRIAGE_NUMBER':
					if (hasMarriageNumbers) {
						restriction.numbers.forEach(numRestriction => {
							marriageNumber[numRestriction.number] =
								numRestriction.availableAmount;
						});
					}
					break;
			}
		});

		return {
			individualNumber,
			twoDigit,
			threeDigit,
			fourDigit,
			marriageNumber,
		};
	} catch (error) {
		console.error('Error getting available amounts:', error);
		throw error;
	}
};

export const placeBet = async ({ id }, body, user) => {
	try {
		const { cashType = 'VIRTUAL' } = body;

		// Validate cash type
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid cash type. Must be REAL or VIRTUAL',
				},
			};
		}

		const walletData = await Wallet.findOne({
			user: user._id,
		});

		if (!walletData) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		// Get the appropriate balance based on cash type
		const balanceToCheck =
			cashType === 'REAL'
				? walletData.realBalance
				: walletData.virtualBalance;

		const lottery = await Lottery.findById(id).populate('state');

		if (lottery._id && lottery.scheduledTime > moment.now()) {
			// Check if lottery is within 3 minutes of scheduled time
			const currentTime = moment();
			const scheduledTime = moment(lottery.scheduledTime);
			const minutesUntilDraw = scheduledTime.diff(currentTime, 'minutes');

			if (minutesUntilDraw <= 3) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Lottery purchases are closed for ${
							lottery.state.name
						}. Tickets must be purchased at least 3 minutes before the scheduled draw time (${scheduledTime.format(
							'MM/DD/YYYY h:mm A'
						)}).`,
					},
				};
			}

			body.user = user._id;
			body.purchasedBy = user.role;
			body.lottery = id;
			body.purchasedOn = moment.now();
			body.cashType = cashType;

			// Check if marriage numbers are allowed
			const hasMarriageNumbers =
				lottery.additionalData?.hasMarriageNumbers !== false;

			if (!hasMarriageNumbers) {
				const hasMarriageNumberInTicket = body.numbers.some(item => {
					const numberStr = item.numberPlayed.toString();
					return numberStr.includes('x');
				});

				if (hasMarriageNumberInTicket) {
					return {
						status: 400,
						entity: {
							success: false,
							error: `Marriage numbers are not allowed for ${lottery.title} (${lottery.state.name})`,
						},
					};
				}
			}

			// Get restrictions for this lottery
			const availableAmount = await getAvailableAmount(
				id,
				body.numbers.map(item => item.numberPlayed),
				hasMarriageNumbers
			);

			body.numbers = body.numbers.map(item => {
				// Check restrictions first
				if (
					availableAmount.individualNumber[
						item.numberPlayed.toString()
					] !== undefined
				) {
					if (
						parseInt(
							availableAmount.individualNumber[
								item.numberPlayed.toString()
							]
						) < parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
				} else {
					const numberStr = item.numberPlayed.toString();
					const numberLength = numberStr.length;

					if (
						numberLength === 2 &&
						availableAmount.twoDigit[numberStr] !== undefined &&
						parseInt(availableAmount.twoDigit[numberStr]) <
							parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
					if (
						numberLength === 3 &&
						availableAmount.threeDigit[numberStr] !== undefined &&
						parseInt(availableAmount.threeDigit[numberStr]) <
							parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
					if (
						numberLength === 4 &&
						availableAmount.fourDigit[numberStr] !== undefined &&
						parseInt(availableAmount.fourDigit[numberStr]) <
							parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
					if (
						hasMarriageNumbers &&
						numberLength === 5 &&
						availableAmount.marriageNumber[
							item.numberPlayed.toString()
						] !== undefined &&
						parseInt(
							availableAmount.marriageNumber[
								item.numberPlayed.toString()
							]
						) < parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
				}

				body.totalAmountPlayed += parseInt(item.amountPlayed);
				return {
					numberPlayed: item.numberPlayed,
					amountPlayed: item.amountPlayed,
				};
			});

			if (balanceToCheck >= body.totalAmountPlayed) {
				const borletteTicket = await BorletteTicket.create(body);
				if (borletteTicket._id) {
					// Process transaction
					await makeTransaction(
						user._id,
						user.role,
						'TICKET_BORLETTE',
						body.totalAmountPlayed,
						borletteTicket._id,
						cashType // Pass cash type to transaction function
					);

					// **NEW: Record play activity for loyalty tracking (only for REAL cash)**
					if (cashType === 'REAL') {
						try {
							const loyaltyResult =
								await LoyaltyService.recordUserPlayActivity(
									user._id,
									body.totalAmountPlayed
								);
							if (!loyaltyResult.success) {
								console.warn(
									`Failed to record play activity for user ${user._id}:`,
									loyaltyResult.error
								);
							} else {
								console.log(
									`Play activity recorded for user ${user._id} - Borlette ticket purchase (REAL cash: $${body.totalAmountPlayed})`
								);
							}
						} catch (loyaltyError) {
							console.error(
								`Error recording play activity for user ${user._id}:`,
								loyaltyError
							);
							// Don't fail ticket creation if loyalty tracking fails
						}
					}

					// **NEW: Award XP for ticket purchase**
					try {
						// Calculate XP based on amount played (1 XP per $5 played, minimum 5 XP)
						const baseXP = Math.max(
							5,
							Math.floor(body.totalAmountPlayed / 5)
						);
						const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
						const totalXP = baseXP * cashTypeMultiplier;

						const xpResult = await LoyaltyService.awardUserXP(
							user._id,
							totalXP,
							'GAME_ACTIVITY',
							`Borlette ticket purchase - Amount: $${body.totalAmountPlayed} (${cashType})`,
							{
								gameType: 'BORLETTE',
								ticketId: borletteTicket._id,
								amountPlayed: body.totalAmountPlayed,
								cashType,
								baseXP,
								multiplier: cashTypeMultiplier,
							}
						);

						if (!xpResult.success) {
							console.warn(
								`Failed to award XP for user ${user._id}:`,
								xpResult.error
							);
						} else {
							console.log(
								`Awarded ${totalXP} XP to user ${user._id} for Borlette ticket purchase`
							);
						}
					} catch (xpError) {
						console.error(
							`Error awarding XP for user ${user._id}:`,
							xpError
						);
						// Don't fail ticket creation if XP awarding fails
					}

					return {
						status: 200,
						entity: {
							success: true,
							borletteTicket: {
								...borletteTicket.toObject(),
								lottery: lottery,
							},
						},
					};
				}
			} else {
				return {
					status: 500,
					entity: {
						success: false,
						error: `Insufficient ${cashType.toLowerCase()} balance.`,
					},
				};
			}
		} else {
			return {
				status: 500,
				entity: {
					success: false,
					error: lottery._id
						? 'Lottery is closed.'
						: 'Invalid lottery ID.',
				},
			};
		}
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const createMultiState = async (body, user) => {
	try {
		const { cashType = 'VIRTUAL', purchases } = body;

		// Validate input structure
		if (!purchases || !Array.isArray(purchases) || purchases.length === 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Purchases array is required and must not be empty',
				},
			};
		}

		// Validate cash type
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid cash type. Must be REAL or VIRTUAL',
				},
			};
		}

		// Validate each purchase has required fields
		for (let i = 0; i < purchases.length; i++) {
			const purchase = purchases[i];
			if (
				!purchase.lotteryId ||
				!purchase.numbers ||
				!Array.isArray(purchase.numbers) ||
				purchase.numbers.length === 0
			) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Purchase at index ${i} is missing required fields (lotteryId, numbers)`,
					},
				};
			}
		}

		// NEW: Get user's current tier for payout calculation
		let userTier = 'NONE';
		let payoutConfig = {
			percentage: 60,
			isCustom: false,
			configId: null,
			description: 'Default percentage',
		};

		try {
			const loyaltyResult = await LoyaltyService.getUserLoyaltyProfile(
				user._id
			);
			if (loyaltyResult.success && loyaltyResult.loyalty) {
				userTier = loyaltyResult.loyalty.currentTier || 'NONE';
			}

			// Map NONE tier to SILVER for payout purposes (as per requirements)
			const payoutTier = userTier === 'NONE' ? 'SILVER' : userTier;

			// Get payout configuration for this tier
			payoutConfig = await PayoutService.getPayoutPercentage(
				payoutTier,
				'BORLETTE'
			);
		} catch (loyaltyError) {
			console.warn(
				`Failed to get user tier for ${user._id}:`,
				loyaltyError
			);
			// Continue with defaults
		}

		// Get user wallet
		const walletData = await Wallet.findOne({ user: user._id });
		if (!walletData) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		const balanceToCheck =
			cashType === 'REAL'
				? walletData.realBalance
				: walletData.virtualBalance;

		// Process and validate each purchase
		const processedPurchases = [];
		let totalAmount = 0;

		for (const purchase of purchases) {
			// Get lottery and validate
			const lottery = await Lottery.findById(purchase.lotteryId)
				.populate('state')
				.populate('externalIds');

			if (!lottery || lottery.status !== 'SCHEDULED') {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Lottery ${purchase.lotteryId} is not available for play`,
					},
				};
			}

			// Check if lottery is within 3 minutes of scheduled time
			const currentTime = moment();
			const scheduledTime = moment(lottery.scheduledTime);
			const minutesUntilDraw = scheduledTime.diff(currentTime, 'minutes');

			if (minutesUntilDraw <= 3) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Lottery purchases are closed for ${
							lottery.state.name
						}. Tickets must be purchased at least 3 minutes before the scheduled draw time (${scheduledTime.format(
							'MM/DD/YYYY h:mm A'
						)}).`,
					},
				};
			}

			// Check if lottery supports marriage numbers
			const hasMarriageNumbers =
				lottery.additionalData?.hasMarriageNumbers || false;

			// Get lottery restrictions
			const lotteryRestriction = await LotteryRestriction.findOne({
				lottery: purchase.lotteryId,
			});

			// Process and validate numbers for this lottery
			let purchaseTotal = 0;
			const validatedNumbers = purchase.numbers.map(item => {
				// Validate restrictions if they exist
				if (lotteryRestriction) {
					const numberStr = item.numberPlayed.toString();
					const numberLength = numberStr.length;
					const amountPlayed = parseInt(item.amountPlayed);

					// Check individual number restrictions first
					if (
						lotteryRestriction.individualNumber &&
						Array.isArray(lotteryRestriction.individualNumber) &&
						lotteryRestriction.individualNumber.length > 0
					) {
						const individualRestriction =
							lotteryRestriction.individualNumber.find(
								restriction => restriction.number === numberStr
							);
						if (individualRestriction) {
							if (
								individualRestriction.limit !== null &&
								individualRestriction.limit !== undefined &&
								amountPlayed > individualRestriction.limit
							) {
								throw new Error(
									`${item.numberPlayed} cannot be played. Maximum amount allowed is ${individualRestriction.limit} in ${lottery.state.name}.`
								);
							}
							// If individual restriction exists, skip type-based restrictions
							purchaseTotal += amountPlayed;
							return {
								numberPlayed: item.numberPlayed,
								amountPlayed: amountPlayed,
							};
						}
					}

					// Check type-based restrictions
					if (hasMarriageNumbers && numberStr.includes('x')) {
						// Marriage number validation
						if (
							lotteryRestriction.marriageNumber !== null &&
							lotteryRestriction.marriageNumber !== undefined &&
							amountPlayed > lotteryRestriction.marriageNumber
						) {
							throw new Error(
								`${item.numberPlayed} cannot be played. Maximum amount allowed for marriage numbers is ${lotteryRestriction.marriageNumber} in ${lottery.state.name}.`
							);
						}
					} else {
						// Standard number validation based on length
						if (
							numberLength === 2 &&
							lotteryRestriction.twoDigit !== null &&
							lotteryRestriction.twoDigit !== undefined &&
							amountPlayed > lotteryRestriction.twoDigit
						) {
							throw new Error(
								`${item.numberPlayed} cannot be played. Maximum amount allowed for two-digit numbers is ${lotteryRestriction.twoDigit} in ${lottery.state.name}.`
							);
						}
						if (
							numberLength === 3 &&
							lotteryRestriction.threeDigit !== null &&
							lotteryRestriction.threeDigit !== undefined &&
							amountPlayed > lotteryRestriction.threeDigit
						) {
							throw new Error(
								`${item.numberPlayed} cannot be played. Maximum amount allowed for three-digit numbers is ${lotteryRestriction.threeDigit} in ${lottery.state.name}.`
							);
						}
						if (
							numberLength === 4 &&
							lotteryRestriction.fourDigit !== null &&
							lotteryRestriction.fourDigit !== undefined &&
							amountPlayed > lotteryRestriction.fourDigit
						) {
							throw new Error(
								`${item.numberPlayed} cannot be played. Maximum amount allowed for four-digit numbers is ${lotteryRestriction.fourDigit} in ${lottery.state.name}.`
							);
						}
					}
				}

				purchaseTotal += parseInt(item.amountPlayed);
				return {
					numberPlayed: item.numberPlayed,
					amountPlayed: parseInt(item.amountPlayed),
				};
			});

			processedPurchases.push({
				lottery,
				numbers: validatedNumbers,
				totalAmountPlayed: purchaseTotal,
			});

			totalAmount += purchaseTotal;
		}

		// Check if user has sufficient balance for all purchases
		if (balanceToCheck < totalAmount) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Insufficient ${cashType.toLowerCase()} balance. Required: ${totalAmount}, Available: ${balanceToCheck}`,
					totalRequired: totalAmount,
					availableBalance: balanceToCheck,
				},
			};
		}

		// Create all tickets and process transactions
		const createdTickets = [];
		const purchaseTime = moment.now();

		try {
			for (const processedPurchase of processedPurchases) {
				const ticketData = {
					user: user._id,
					purchasedBy: user.role,
					lottery: processedPurchase.lottery._id,
					purchasedOn: purchaseTime,
					totalAmountPlayed: processedPurchase.totalAmountPlayed,
					cashType,
					numbers: processedPurchase.numbers,
					// NEW: Store tier and payout config
					userTierAtPurchase: userTier,
					payoutConfig: payoutConfig,
				};

				const borletteTicket = await BorletteTicket.create(ticketData);

				// Process transaction for this ticket
				await makeTransaction(
					user._id,
					user.role,
					'TICKET_BORLETTE',
					processedPurchase.totalAmountPlayed,
					borletteTicket._id,
					cashType
				);

				createdTickets.push({
					...borletteTicket.toObject(),
					lottery: processedPurchase.lottery,
				});
			}

			// **NEW: Record play activity for loyalty tracking (once per multi-state purchase)**
			try {
				const loyaltyResult =
					await LoyaltyService.recordUserPlayActivity(user._id);
				if (!loyaltyResult.success) {
					console.warn(
						`Failed to record play activity for user ${user._id}:`,
						loyaltyResult.error
					);
				} else {
					console.log(
						`Play activity recorded for user ${user._id} - Multi-state Borlette purchase`
					);
				}
			} catch (loyaltyError) {
				console.error(
					`Error recording play activity for user ${user._id}:`,
					loyaltyError
				);
			}

			// **NEW: Award XP for multi-state purchase**
			try {
				// Calculate XP based on total amount played across all states
				const baseXP = Math.max(10, Math.floor(totalAmount / 5)); // Higher minimum for multi-state
				const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1;
				const multiStateMultiplier = Math.min(
					2,
					1 + (createdTickets.length - 1) * 0.2
				); // Bonus for multiple states
				const totalXP = Math.floor(
					baseXP * cashTypeMultiplier * multiStateMultiplier
				);

				const xpResult = await LoyaltyService.awardUserXP(
					user._id,
					totalXP,
					'GAME_ACTIVITY',
					`Multi-state Borlette purchase - ${createdTickets.length} states, Total: $${totalAmount} (${cashType})`,
					{
						gameType: 'BORLETTE',
						isMultiState: true,
						stateCount: createdTickets.length,
						totalAmount,
						cashType,
						baseXP,
						multiplier: cashTypeMultiplier * multiStateMultiplier,
						userTier: userTier,
						payoutPercentage: payoutConfig.percentage,
					}
				);

				if (!xpResult.success) {
					console.warn(
						`Failed to award XP for user ${user._id}:`,
						xpResult.error
					);
				} else {
					console.log(
						`Awarded ${totalXP} XP to user ${user._id} for multi-state Borlette purchase`
					);
				}
			} catch (xpError) {
				console.error(
					`Error awarding XP for user ${user._id}:`,
					xpError
				);
			}

			return {
				status: 200,
				entity: {
					success: true,
					tickets: createdTickets,
					summary: {
						totalAmount,
						purchaseCount: createdTickets.length,
						statesInvolved: [
							...new Set(
								createdTickets.map(t => t.lottery.state.name)
							),
						],
						cashType,
						purchaseTime,
						userTier: userTier,
						payoutPercentage: payoutConfig.percentage,
					},
				},
			};
		} catch (error) {
			// If any ticket creation fails, we should ideally rollback previous tickets
			// For now, we'll return an error - in production you might want to implement proper transaction rollback
			console.error('Error creating tickets:', error);
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Failed to create one or more tickets. Some tickets may have been created.',
					createdTicketsCount: createdTickets.length,
				},
			};
		}
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error:
					error.message || 'Failed to process multi-state purchase',
			},
		};
	}
};

export const cancelTicket = async ({ id }, user) => {
	try {
		// Validate that id is numeric
		if (isNaN(id) || id === null || id === undefined) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid ticket ID. ID must be numeric.',
				},
			};
		}

		const criteria = {
			_id: id,
		};
		if (user.role !== 'ADMIN') {
			criteria.user = user._id;
		}
		const borletteTicket = await BorletteTicket.findById(criteria)
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.populate('user');

		if (!borletteTicket._id) {
			throw new Error('Ticket ID is invalid.');
		}
		if (!borletteTicket.status === 'CANCELLED') {
			throw new Error('This ticket has already been cancelled.');
		}
		if (!borletteTicket.status === 'COMPLETED') {
			throw new Error(
				'This result for this ticket has already been rolled out.'
			);
		}
		if (
			moment(borletteTicket.lottery.scheduledTime)
				.subtract(2, 'minute')
				.isBefore(moment())
		) {
			throw new Error('The ticket can not be cancelled now.');
		}
		if (borletteTicket._id) {
			await Object.assign(borletteTicket, {
				status: 'CANCELLED',
			}).save();

			await makeTransaction(
				borletteTicket.user._id,
				borletteTicket.user.role,
				'TICKET_BORLETTE_CANCELLED',
				borletteTicket.totalAmountPlayed,
				borletteTicket._id
			);
			return {
				status: 200,
				entity: {
					success: true,
				},
			};
		}
	} catch (error) {
		console.log('error', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const cashoutTicket = async ({ id }, user) => {
	try {
		// Validate that id is numeric
		if (isNaN(id) || id === null || id === undefined) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid ticket ID. ID must be numeric.',
				},
			};
		}

		if (!['ADMIN', 'DEALER'].includes(user.role)) {
			throw new Error('You are not authorized to cashout ticket.');
		}
		const borletteTicket = await BorletteTicket.findById(id)
			.populate('user')
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			});

		if (!borletteTicket._id) {
			throw new Error('This ticket does not exist.');
		}
		if (borletteTicket.user.role !== 'AGENT') {
			throw new Error('You are not authorized to cashout this ticket.');
		}
		if (borletteTicket.isAmountDisbursed) {
			throw new Error('This ticket has already been claimed.');
		}
		const totalAmountWon = borletteTicket.totalAmountWon;

		// Apply FlippX collection
		const collectionResult = await FlippXService.processWinningCollection(
			user._id,
			'BORLETTE',
			totalAmountWon,
			borletteTicket._id
		);

		const netAmountWon = collectionResult.netAmount;

		const amountTransferred = await makeTransaction(
			user._id,
			user.role,
			'WON_BORLETTE',
			netAmountWon,
			borletteTicket._id,
			borletteTicket.cashType
		);

		// **NEW: Award XP for winning**
		try {
			// Calculate XP based on amount won
			const baseXP = Math.max(20, Math.floor(netAmountWon / 10)); // Higher XP for wins
			const cashTypeMultiplier =
				borletteTicket.cashType === 'REAL' ? 2 : 1;
			const winMultiplier = 1.5; // Bonus for winning
			const totalXP = Math.floor(
				baseXP * cashTypeMultiplier * winMultiplier
			);

			const xpResult = await LoyaltyService.awardUserXP(
				borletteTicket.user._id,
				totalXP,
				'GAME_REWARD',
				`Borlette win - Net Amount: $${netAmountWon} (${borletteTicket.cashType})`,
				{
					gameType: 'BORLETTE',
					ticketId: borletteTicket._id,
					amountWon: netAmountWon,
					originalWon: totalAmountWon,
					flippxCollection: collectionResult.collectionAmount,
					cashType: borletteTicket.cashType,
					baseXP,
					multiplier: cashTypeMultiplier * winMultiplier,
					isWin: true,
				}
			);

			if (!xpResult.success) {
				console.warn(
					`Failed to award win XP for user ${borletteTicket.user._id}:`,
					xpResult.error
				);
			} else {
				console.log(
					`Awarded ${totalXP} XP to user ${borletteTicket.user._id} for Borlette win`
				);
			}
		} catch (xpError) {
			console.error(
				`Error awarding win XP for user ${borletteTicket.user._id}:`,
				xpError
			);
		}

		await Object.assign(borletteTicket, {
			isAmountDisbursed: true,
		}).save();

		return {
			status: 200,
			entity: {
				success: true,
				amountTransferred: amountTransferred,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const commissionSummary = async ({ id }, user) => {
	try {
		// Validate that id is numeric
		if (isNaN(id) || id === null || id === undefined) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid ticket ID. ID must be numeric.',
				},
			};
		}

		// Get the ticket with full details
		const ticket = await BorletteTicket.findById(id)
			.populate('user', 'name email phone role')
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.exec();

		if (!ticket) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Ticket not found.',
				},
			};
		}

		// Authorization check - users can only see their own ticket commissions
		if (user.role !== 'ADMIN' && ticket.user._id !== user._id) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Access denied.',
				},
			};
		}

		// Get related commission transactions
		const commissionTransactions = await Transaction.find({
			referenceIndex: ticket._id,
			transactionIdentifier: {
				$in: [
					'TICKET_BORLETTE_COMMISSION',
					'TICKET_BORLETTE_COMMISSION_CANCELLED',
				],
			},
		}).populate('user', 'name email phone role');

		// Calculate commission summary
		const commissionSummary = {
			ticketAmount: ticket.totalAmountPlayed,
			ticketWon: ticket.totalAmountWon || 0,
			commissionTransactions: commissionTransactions,
			totalCommissionEarned: commissionTransactions
				.filter(
					tx =>
						tx.transactionIdentifier ===
						'TICKET_BORLETTE_COMMISSION'
				)
				.reduce((sum, tx) => sum + tx.amount, 0),
			totalCommissionCancelled: commissionTransactions
				.filter(
					tx =>
						tx.transactionIdentifier ===
						'TICKET_BORLETTE_COMMISSION_CANCELLED'
				)
				.reduce((sum, tx) => sum + tx.amount, 0),
		};

		commissionSummary.netCommission =
			commissionSummary.totalCommissionEarned -
			commissionSummary.totalCommissionCancelled;

		return {
			status: 200,
			entity: {
				success: true,
				ticket,
				commissionSummary,
			},
		};
	} catch (error) {
		console.error('Error in commissionSummary method:', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error.message || error,
			},
		};
	}
};

export const update = async ({ id }, body) => {
	try {
		const borletteTicket = await BorletteTicket.findById(id);
		if (borletteTicket._id) {
			const updateResponse = await Object.assign(
				borletteTicket,
				body
			).save();
			if (updateResponse._id) {
				return {
					status: 200,
					entity: {
						success: true,
						borletteTicket: updateResponse,
					},
				};
			}
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid parameters.',
			},
		};
	} catch (error) {
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const remove = async ({ id }) => {
	try {
		const borletteTicket = await BorletteTicket.findById(id);
		if (borletteTicket._id) {
			const removed = await borletteTicket.remove();
			if (removed) {
				return {
					status: 200,
					entity: {
						success: true,
					},
				};
			}
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid parameters.',
			},
		};
	} catch (error) {
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};
