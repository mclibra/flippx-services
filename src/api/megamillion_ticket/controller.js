import moment from 'moment';
import { makeTransaction } from '../transaction/controller';
import { Wallet } from '../wallet/model';
import { Lottery } from '../lottery/model';
import { MegaMillionTicket } from './model';
import { LoyaltyService } from '../loyalty/service';
import { LotteryDefaultConfig } from '../lottery-default-config/model';

const MEGAMILLION_TICKET_AMOUNT = 2;

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
		const tickets = await MegaMillionTicket.find(query)
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
		const total = await MegaMillionTicket.countDocuments(query);

		// Calculate summary statistics
		const totalAmountPlayed = tickets.reduce(
			(sum, ticket) => sum + (ticket.amountPlayed || 0),
			0
		);
		const totalAmountWon = tickets.reduce(
			(sum, ticket) => sum + (ticket.amountWon || 0),
			0
		);

		return {
			status: 200,
			entity: {
				success: true,
				tickets,
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
					netResult: totalAmountWon - totalAmountPlayed,
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

		const ticket = await MegaMillionTicket.findOne(query)
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

export const ticketByLottery = async ({ id }, user) => {
	try {
		const { _id: userId, role } = user;

		// Build query - users can only see their own tickets for the lottery
		let query = { lottery: id };
		if (role !== 'ADMIN') {
			query.user = userId;
		}

		const tickets = await MegaMillionTicket.find(query)
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
			(sum, ticket) => sum + ticket.amountPlayed,
			0
		);
		const totalAmountWon = tickets.reduce(
			(sum, ticket) => sum + (ticket.amountWon || 0),
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
		const megaMillionTickets = await MegaMillionTicket.find(params)
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
		const total = await MegaMillionTicket.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				megaMillionTickets,
				total,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const placeBet = async ({ id }, body, user) => {
	try {
		const { cashType = 'VIRTUAL', tickets: ticketsFromRequest } = body;

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

		// Normalize ticket payload to support single and multiple ticket purchases
		let normalizedTickets = [];
		if (Array.isArray(ticketsFromRequest)) {
			normalizedTickets = ticketsFromRequest;
		} else if (body && Array.isArray(body.numbers)) {
			normalizedTickets = [
				{
					numbers: body.numbers,
					megaBall:
						body.megaBall === undefined ? null : body.megaBall,
				},
			];
		}

		if (!normalizedTickets.length) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'At least one ticket must be provided.',
				},
			};
		}

		const invalidTicketIndex = normalizedTickets.findIndex(
			ticket =>
				!ticket ||
				!Array.isArray(ticket.numbers) ||
				!ticket.numbers.length
		);

		if (invalidTicketIndex !== -1) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Ticket ${
						invalidTicketIndex + 1
					} is invalid. Each ticket must include at least one number.`,
				},
			};
		}

		const ticketCount = normalizedTickets.length;
		const totalAmountPlayed = ticketCount * MEGAMILLION_TICKET_AMOUNT;

		// Get the appropriate balance based on cash type
		const balanceToCheck =
			cashType === 'REAL'
				? walletData.realBalance
				: walletData.virtualBalance;

		if (balanceToCheck < totalAmountPlayed) {
			return {
				status: 500,
				entity: {
					success: false,
					error: `Insufficient ${cashType.toLowerCase()} balance for ${ticketCount} ticket${
						ticketCount > 1 ? 's' : ''
					}.`,
				},
			};
		}

		const lottery = await Lottery.findById(id);
		if (!lottery || !lottery._id || lottery.scheduledTime <= moment.now()) {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid parameters.',
				},
			};
		}

		// Check if lottery is within 15 minutes of scheduled time
		const currentTime = moment();
		const scheduledTime = moment(lottery.scheduledTime);
		const minutesUntilDraw = scheduledTime.diff(currentTime, 'minutes');

		if (minutesUntilDraw <= 15) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Lottery purchases are closed. Tickets must be purchased at least 15 minutes before the scheduled draw time (${scheduledTime.format(
						'MM/DD/YYYY h:mm A'
					)}).`,
				},
			};
		}

		const purchaseTimestamp = moment.now();
		const ticketsToCreate = normalizedTickets.map(ticket => ({
			...ticket,
			user: user._id,
			lottery: id,
			amountPlayed: MEGAMILLION_TICKET_AMOUNT,
			purchasedOn: purchaseTimestamp,
			purchasedBy: user.role,
			cashType,
		}));

		const createdTicketsRaw =
			await MegaMillionTicket.create(ticketsToCreate);
		const createdTickets = Array.isArray(createdTicketsRaw)
			? createdTicketsRaw
			: [createdTicketsRaw];

		// Process individual transactions for each ticket to maintain referential integrity
		for (const ticket of createdTickets) {
			await makeTransaction(
				user._id,
				user.role,
				'TICKET_MEGAMILLION',
				ticket.amountPlayed,
				ticket._id,
				cashType
			);
		}

		// **NEW: Record play activity for loyalty tracking (only for REAL cash)**
		if (cashType === 'REAL') {
			try {
				const loyaltyResult = await LoyaltyService.recordUserPlayActivity(
					user._id,
					totalAmountPlayed
				);
				if (!loyaltyResult.success) {
					console.warn(
						`Failed to record play activity for user ${user._id}:`,
						loyaltyResult.error
					);
				} else {
					console.log(
						`Play activity recorded for user ${
							user._id
						} - Megamillion ticket purchase (${ticketCount} ticket${
							ticketCount > 1 ? 's' : ''
						}, REAL cash: $${totalAmountPlayed})`
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

		// **NEW: Award XP for ticket purchase (aggregate for multiple tickets)**
		try {
			const baseXPPerTicket = 10; // Base XP for each Megamillion ticket
			const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
			const totalXP = baseXPPerTicket * cashTypeMultiplier * ticketCount;
			const xpDescription =
				ticketCount === 1
					? `Megamillion ticket purchase - Amount: $${MEGAMILLION_TICKET_AMOUNT} (${cashType})`
					: `Megamillion ticket purchase (${ticketCount} tickets) - Amount: $${totalAmountPlayed} (${cashType})`;

			const xpReference = {
				gameType: 'MEGAMILLION',
				ticketIds: createdTickets.map(ticket => ticket._id),
				amountPlayedPerTicket: MEGAMILLION_TICKET_AMOUNT,
				totalAmountPlayed,
				cashType,
				baseXPPerTicket,
				multiplier: cashTypeMultiplier,
			};

			if (ticketCount === 1) {
				xpReference.ticketId = createdTickets[0]._id;
				xpReference.numbers = createdTickets[0].numbers;
				xpReference.megaBall = createdTickets[0].megaBall;
			}

			const xpResult = await LoyaltyService.awardUserXP(
				user._id,
				totalXP,
				'GAME_ACTIVITY',
				xpDescription,
				xpReference
			);

			if (!xpResult.success) {
				console.warn(
					`Failed to award XP for user ${user._id}:`,
					xpResult.error
				);
			} else {
				console.log(
					`Awarded ${totalXP} XP to user ${
						user._id
					} for Megamillion ticket purchase (${ticketCount} ticket${
						ticketCount > 1 ? 's' : ''
					})`
				);
			}
		} catch (xpError) {
			console.error(`Error awarding XP for user ${user._id}:`, xpError);
			// Don't fail ticket creation if XP awarding fails
		}

		const responseEntity = {
			success: true,
			megaMillionTicket: createdTickets[0],
			totalTicketsPurchased: ticketCount,
			totalAmountPlayed,
		};

		if (ticketCount > 1) {
			responseEntity.megaMillionTickets = createdTickets;
		}

		return {
			status: 200,
			entity: responseEntity,
		};
	} catch (error) {
		console.log(error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const update = async ({ id }, body) => {
	try {
		const megaMillionTicket = await MegaMillionTicket.findById(id);
		if (megaMillionTicket._id) {
			const updateResponse = await Object.assign(
				megaMillionTicket,
				body
			).save();
			if (updateResponse._id) {
				return {
					status: 200,
					entity: {
						success: true,
						megaMillionTicket: updateResponse,
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
		const megamillionTicket = await MegaMillionTicket.findById(criteria)
			.populate('lottery')
			.populate('user');
		if (!megamillionTicket._id) {
			throw 'Ticket ID is invalid.';
		}
		if (!megamillionTicket.status === 'CANCELLED') {
			throw 'This ticket has already been cancelled.';
		}
		if (!megamillionTicket.status === 'COMPLETED') {
			throw 'This result for this ticket has already been rolled out.';
		}
		if (
			moment(megamillionTicket.lottery.scheduledTime)
				.subtract(2, 'minute')
				.isBefore(moment())
		) {
			throw 'The ticket can not be cancelled now.';
		}
		if (megamillionTicket._id) {
			await Object.assign(megamillionTicket, {
				status: 'CANCELLED',
			}).save();

			await makeTransaction(
				megamillionTicket.user._id,
				megamillionTicket.user.role,
				'TICKET_MEGAMILLION_CANCELLED',
				megamillionTicket.amountPlayed,
				megamillionTicket._id,
				megamillionTicket.cashType
			);
			return {
				status: 200,
				entity: {
					success: true,
				},
			};
		}
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
			throw 'You are not authorized to cashout ticket.';
		}
		const megamillionTicket =
			await MegaMillionTicket.findById(id).populate('user');
		if (!megamillionTicket._id) {
			throw 'This ticket does not exist.';
		}
		if (megamillionTicket.user.role !== 'AGENT') {
			throw 'You are not authorized to cashout this ticket.';
		}
		if (megamillionTicket.isAmountDisbursed) {
			throw 'This ticket has already been claimed.';
		}
		const totalAmountWon = megamillionTicket.amountWon;

		const amountTransferred = await makeTransaction(
			user._id,
			user.role,
			'WON_MEGAMILLION',
			totalAmountWon,
			megamillionTicket._id,
			megamillionTicket.cashType
		);

		// **NEW: Award XP for winning**
		try {
			// Calculate XP based on amount won
			const baseXP = Math.max(25, Math.floor(totalAmountWon / 10)); // Higher XP for wins, Megamillion wins are typically larger
			const cashTypeMultiplier =
				megamillionTicket.cashType === 'REAL' ? 2 : 1;
			const winMultiplier = 2; // Higher bonus for Megamillion wins
			const totalXP = Math.floor(
				baseXP * cashTypeMultiplier * winMultiplier
			);

			const xpResult = await LoyaltyService.awardUserXP(
				megamillionTicket.user._id,
				totalXP,
				'GAME_REWARD',
				`Megamillion win - Amount: $${totalAmountWon} (${megamillionTicket.cashType})`,
				{
					gameType: 'MEGAMILLION',
					ticketId: megamillionTicket._id,
					amountWon: totalAmountWon,
					cashType: megamillionTicket.cashType,
					baseXP,
					multiplier: cashTypeMultiplier * winMultiplier,
					isWin: true,
					numbers: megamillionTicket.numbers,
					megaBall: megamillionTicket.megaBall,
				}
			);

			if (!xpResult.success) {
				console.warn(
					`Failed to award win XP for user ${megamillionTicket.user._id}:`,
					xpResult.error
				);
			} else {
				console.log(
					`Awarded ${totalXP} XP to user ${megamillionTicket.user._id} for Megamillion win`
				);
			}
		} catch (xpError) {
			console.error(
				`Error awarding win XP for user ${megamillionTicket.user._id}:`,
				xpError
			);
		}

		await Object.assign(megamillionTicket, {
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
		console.log(error);
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const remove = async ({ id }) => {
	try {
		const megaMillionTicket = await MegaMillionTicket.findById(id);
		if (megaMillionTicket._id) {
			const removed = await megaMillionTicket.remove();
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
		console.log(error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const commissionSummary = async ({ id }, user) => {
	try {
		if (!['ADMIN'].includes(user.role)) {
			throw 'You are not authorized to view commission data.';
		}
		// Note: id here is a user ID, not a ticket ID, so no numeric validation needed
		const megaMillionTickets = await MegaMillionTicket.find({
			user: id,
		}).populate('user');
		return {
			status: 200,
			entity: {
				success: true,
				megaMillionTickets,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

// ===== GET JACKPOT AMOUNT =====

export const getJackpotAmount = async () => {
	try {
		const config = await LotteryDefaultConfig.findOne({
			lotteryType: 'MEGAMILLION',
		});

		// If no config exists, return default value
		const jackpotAmount = config
			? config.defaultJackpotAmount
			: '1000000'; // Default to 1 million

		return {
			status: 200,
			entity: {
				success: true,
				jackpotAmount,
			},
		};
	} catch (error) {
		console.error('Get jackpot amount error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					error.message || 'Failed to retrieve jackpot amount',
			},
		};
	}
};
