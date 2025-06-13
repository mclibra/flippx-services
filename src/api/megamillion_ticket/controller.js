import moment from 'moment';
import { makeTransaction } from '../transaction/controller';
import { Wallet } from '../wallet/model';
import { Lottery } from '../lottery/model';
import { User } from '../user/model';
import { MegaMillionTicket } from './model';

const MEGAMILLION_TICKET_AMOUNT = 2;

const config = {
	depositCommissionAgent: 0.01,
	depositCommissionAdmin: 0.02,
	userTransferComissionAdmin: 0.03,
	ticketBorletteComissionAgent: 0.15,
	ticketMegamillionComissionAgent: 0.015,
	withdrawCommissionAgent: 0.01,
	withdrawCommissionAdmin: 0.02,
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
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.populate('lottery')
			.exec();
		const amount = await MegaMillionTicket.aggregate([
			{
				$match: {
					lottery: id,
				},
			},
			{
				$group: {
					_id: null,
					totalAmountPlayed: {
						$sum: '$amountPlayed',
					},
					totalAmountWon: {
						$sum: '$amountWon',
					},
				},
			},
		]);
		const total = await MegaMillionTicket.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				tickets: megaMillionTickets,
				total,
				amount: amount.map(item => ({
					...item,
					totalAmountPlayed: parseFloat(
						item.totalAmountPlayed
					).toFixed(2),
					totalAmountWon: parseFloat(item.totalAmountWon).toFixed(2),
				})),
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const list = async ({ offset, limit }, { _id }) => {
	try {
		const megaMillionTickets = await MegaMillionTicket.find({
			user: _id,
		})
			.limit(limit || 50)
			.skip(offset || 0)
			.populate('lottery')
			.sort({
				purchasedOn: 'desc',
			})
			.exec();
		return {
			status: 200,
			entity: {
				success: true,
				tickets: megaMillionTickets,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const show = async ({ id }) => {
	try {
		const megaMillionTicket = await MegaMillionTicket.findById(id)
			.populate('user', 'name email phone')
			.exec();
		return {
			status: 200,
			entity: {
				success: true,
				megaMillionTicket,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const ticketByLottery = async ({ id }, { _id }) => {
	try {
		const tickets = await MegaMillionTicket.find({
			user: _id,
			lottery: id,
		}).exec();
		return {
			status: 200,
			entity: {
				success: true,
				tickets,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const create = async ({ id }, body, user) => {
	try {
		const walletData = await Wallet.findOne({
			user: user._id,
		});

		// Validate cash type
		const cashType = body.cashType || 'VIRTUAL';
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid cash type. Must be REAL or VIRTUAL',
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
					await makeTransaction(
						user._id,
						user.role,
						'TICKET_MEGAMILLION',
						megaMillionTicket.amountPlayed,
						null,
						null,
						megaMillionTicket._id,
						cashType // Pass cash type to transaction function
					);

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
				null,
				null,
				megamillionTicket._id
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
			totalAmountWon
		);
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
			throw 'You are not authorized to cashout ticket.';
		}

		const summary = await MegaMillionTicket.aggregate([
			{
				$match: {
					lottery: id,
					status: {
						$ne: 'CANCELLED',
					},
				},
			},
			{
				$group: {
					_id: '$user',
					sales: {
						$sum: '$amountPlayed',
					},
					rewards: {
						$sum: '$amountWon',
					},
				},
			},
		]);
		const summaryPopulated = await User.populate(summary, {
			path: '_id',
			select: 'name role',
		});
		const data = summaryPopulated
			.filter(item => item._id.role === 'AGENT')
			.map(item => ({
				...item,
				sales: parseFloat(item.sales),
				rewards: parseFloat(item.rewards),
				commission: parseFloat(
					config.ticketMegamillionComissionAgent * item.sales
				),
			}));
		return {
			status: 200,
			entity: {
				success: true,
				data: data,
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
