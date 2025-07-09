import moment from 'moment';
import { makeTransaction } from '../transaction/controller';
import { Wallet } from '../wallet/model';
import { Lottery } from '../lottery/model';
import { MegaMillionTicket } from './model';
import { LoyaltyService } from '../loyalty/service';

const MEGAMILLION_TICKET_AMOUNT = 2;

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

		if (balanceToCheck >= MEGAMILLION_TICKET_AMOUNT) {
			const lottery = await Lottery.findById(id);
			if (lottery._id && lottery.scheduledTime > moment.now()) {
				body.user = user._id;
				body.lottery = id;
				body.amountPlayed = MEGAMILLION_TICKET_AMOUNT;
				body.purchasedOn = moment.now();
				body.purchasedBy = user.role;
				body.cashType = cashType;

				const megaMillionTicket = await MegaMillionTicket.create(body);
				if (megaMillionTicket._id) {
					// Process transaction
					await makeTransaction(
						user._id,
						user.role,
						'TICKET_MEGAMILLION',
						megaMillionTicket.amountPlayed,
						megaMillionTicket._id,
						cashType // Pass cash type to transaction function
					);

					// **NEW: Record play activity for loyalty tracking**
					try {
						const loyaltyResult = await LoyaltyService.recordUserPlayActivity(user._id);
						if (!loyaltyResult.success) {
							console.warn(`Failed to record play activity for user ${user._id}:`, loyaltyResult.error);
						} else {
							console.log(`Play activity recorded for user ${user._id} - Megamillion ticket purchase`);
						}
					} catch (loyaltyError) {
						console.error(`Error recording play activity for user ${user._id}:`, loyaltyError);
						// Don't fail ticket creation if loyalty tracking fails
					}

					// **NEW: Award XP for ticket purchase**
					try {
						// Calculate XP for Megamillion (fixed $2 amount)
						const baseXP = 10; // Base XP for Megamillion ticket
						const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
						const totalXP = baseXP * cashTypeMultiplier;

						const xpResult = await LoyaltyService.awardUserXP(
							user._id,
							totalXP,
							'GAME_ACTIVITY',
							`Megamillion ticket purchase - Amount: $${MEGAMILLION_TICKET_AMOUNT} (${cashType})`,
							{
								gameType: 'MEGAMILLION',
								ticketId: megaMillionTicket._id,
								amountPlayed: MEGAMILLION_TICKET_AMOUNT,
								cashType,
								baseXP,
								multiplier: cashTypeMultiplier,
								numbers: body.numbers,
								megaBall: body.megaBall
							}
						);

						if (!xpResult.success) {
							console.warn(`Failed to award XP for user ${user._id}:`, xpResult.error);
						} else {
							console.log(`Awarded ${totalXP} XP to user ${user._id} for Megamillion ticket purchase`);
						}
					} catch (xpError) {
						console.error(`Error awarding XP for user ${user._id}:`, xpError);
						// Don't fail ticket creation if XP awarding fails
					}

					return {
						status: 200,
						entity: {
							success: true,
							megaMillionTicket: megaMillionTicket,
						},
					};
				}
			}
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid parameters.',
				},
			};
		} else {
			return {
				status: 500,
				entity: {
					success: false,
					error: `Insufficient ${cashType.toLowerCase()} balance.`,
				},
			};
		}
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
			megamillionTicket.cashType,
		);

		// **NEW: Award XP for winning**
		try {
			// Calculate XP based on amount won
			const baseXP = Math.max(25, Math.floor(totalAmountWon / 10)); // Higher XP for wins, Megamillion wins are typically larger
			const cashTypeMultiplier = megamillionTicket.cashType === 'REAL' ? 2 : 1;
			const winMultiplier = 2; // Higher bonus for Megamillion wins
			const totalXP = Math.floor(baseXP * cashTypeMultiplier * winMultiplier);

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
					megaBall: megamillionTicket.megaBall
				}
			);

			if (!xpResult.success) {
				console.warn(`Failed to award win XP for user ${megamillionTicket.user._id}:`, xpResult.error);
			} else {
				console.log(`Awarded ${totalXP} XP to user ${megamillionTicket.user._id} for Megamillion win`);
			}
		} catch (xpError) {
			console.error(`Error awarding win XP for user ${megamillionTicket.user._id}:`, xpError);
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