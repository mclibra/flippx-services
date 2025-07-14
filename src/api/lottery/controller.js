import moment from 'moment';
import { MegaMillionTicket } from '../megamillion_ticket/model';
import { BorletteTicket } from '../borlette_ticket/model';
import { Lottery, LotteryRestriction } from './model';
import { State } from '../admin/state-management/model';
import { publishResult } from '../../services/lottery/resultPublisher';
import PayoutService from '../../services/payout/payoutService';

const MEGAMILLION_TICKET_AMOUNT = 2;

export const list = async ({
	offset,
	key,
	limit,
	type,
	startDate,
	status,
	endDate,
	stateId, // Added stateId parameter
	sortBy = 'createdAt',
	sortOrder = 'desc',
}) => {
	try {
		let params = {};
		if (type) {
			params.type = type.toUpperCase();
		}
		if (stateId) {
			// Filter by state if provided
			params.state = stateId;
		}
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
		if (status) {
			params.status = status.toUpperCase();
		}
		if (key) {
			params['$or'] = [
				{
					title: new RegExp(key, 'i'),
				},
				{
					metadata: new RegExp(key, 'i'),
				},
			];
		}
		const lotteries = await Lottery.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.populate('state', 'name code') // Populate state information
			.exec();
		const total = await Lottery.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				lotteries,
				total,
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

export const nextLottery = async ({
	type,
	stateId,
	limit = 10,
	offset = 0,
}) => {
	try {
		const currentTime = moment.now();

		// Build query params
		const params = {
			status: 'SCHEDULED',
			scheduledTime: { $gt: currentTime }, // Only future lotteries
		};

		if (type) {
			params.type = type.toUpperCase();
		}

		if (stateId) {
			params.state = stateId;
		}

		// Find all upcoming lotteries
		const lotteries = await Lottery.find(params)
			.sort({ scheduledTime: 'asc' }) // Sort ascending to get closest times first
			.skip(parseInt(offset))
			.limit(parseInt(limit))
			.populate('state', 'name code')
			.exec();

		// Calculate countdown for each lottery
		const lotteriesWithCountdown = lotteries.map(lottery => ({
			...lottery.toObject(),
			countdown: lottery.scheduledTime - currentTime,
		}));

		const total = await Lottery.countDocuments(params);

		return {
			status: 200,
			entity: {
				success: true,
				lotteries: lotteriesWithCountdown,
				total,
				nextLottery:
					lotteriesWithCountdown.length > 0
						? lotteriesWithCountdown[0]
						: null,
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

export const getLotteryDashboard = async (_, { role }) => {
	try {
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		const currentTime = moment.now();
		const startOfToday = moment().startOf('day').valueOf();
		const endOfToday = moment().endOf('day').valueOf();
		const startOfWeek = moment().startOf('week').valueOf();
		const startOfMonth = moment().startOf('month').valueOf();

		// Get lottery counts by status
		const lotteryStats = await Lottery.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
				},
			},
		]);

		// Get upcoming lotteries (next 5)
		const upcomingLotteries = await Lottery.find({
			status: 'SCHEDULED',
			scheduledTime: { $gt: currentTime },
		})
			.sort({ scheduledTime: 'asc' })
			.limit(5)
			.populate('state', 'name code')
			.lean();

		// Add countdown to upcoming lotteries
		const upcomingWithCountdown = upcomingLotteries.map(lottery => ({
			...lottery,
			countdown: lottery.scheduledTime - currentTime,
		}));

		// Get recent completed lotteries (last 5)
		const recentLotteries = await Lottery.find({
			status: 'COMPLETED',
		})
			.sort({ drawTime: -1 })
			.limit(5)
			.populate('state', 'name code')
			.lean();

		// Get today's lottery statistics
		const todayLotteries = await Lottery.find({
			scheduledTime: {
				$gte: startOfToday,
				$lte: endOfToday,
			},
		}).lean();

		// Get state-wise lottery distribution
		const stateDistribution = await Lottery.aggregate([
			{
				$group: {
					_id: '$state',
					total: { $sum: 1 },
					scheduled: {
						$sum: {
							$cond: [{ $eq: ['$status', 'SCHEDULED'] }, 1, 0],
						},
					},
					completed: {
						$sum: {
							$cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0],
						},
					},
				},
			},
			{
				$lookup: {
					from: 'states',
					localField: '_id',
					foreignField: '_id',
					as: 'stateInfo',
				},
			},
			{
				$unwind: '$stateInfo',
			},
			{
				$project: {
					state: {
						id: '$_id',
						name: '$stateInfo.name',
						code: '$stateInfo.code',
					},
					total: 1,
					scheduled: 1,
					completed: 1,
				},
			},
		]);

		// Get revenue statistics for completed lotteries
		const completedLotteryIds = await Lottery.find({ status: 'COMPLETED' })
			.select('_id type')
			.lean();

		const lotteryIds = completedLotteryIds.map(l => l._id.toString());

		// Get Borlette revenue
		const borletteRevenue = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: null,
					totalPlayed: { $sum: '$totalAmountPlayed' },
					totalWon: { $sum: '$totalAmountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		// Get MegaMillion revenue
		const megaMillionRevenue = await MegaMillionTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: null,
					totalPlayed: { $sum: '$amountPlayed' },
					totalWon: { $sum: '$amountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		// Calculate total revenue and profit
		const borletteData = borletteRevenue[0] || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};
		const megaMillionData = megaMillionRevenue[0] || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};

		const totalRevenue =
			borletteData.totalPlayed + megaMillionData.totalPlayed;
		const totalPayout = borletteData.totalWon + megaMillionData.totalWon;
		const totalProfit = totalRevenue - totalPayout;

		// Get periodic statistics (today, this week, this month)
		const getPeriodicStats = async (startTime, endTime = null) => {
			const timeQuery = endTime
				? { $gte: startTime, $lte: endTime }
				: { $gte: startTime };

			const periodicLotteries = await Lottery.find({
				status: 'COMPLETED',
				drawTime: timeQuery,
			})
				.select('_id')
				.lean();

			const periodicLotteryIds = periodicLotteries.map(l =>
				l._id.toString()
			);

			if (periodicLotteryIds.length === 0) {
				return {
					borlette: { totalPlayed: 0, totalWon: 0, ticketCount: 0 },
					megaMillion: {
						totalPlayed: 0,
						totalWon: 0,
						ticketCount: 0,
					},
					lotteryCount: 0,
				};
			}

			const [borletteStats, megaMillionStats] = await Promise.all([
				BorletteTicket.aggregate([
					{
						$match: {
							lottery: { $in: periodicLotteryIds },
							status: { $ne: 'CANCELLED' },
						},
					},
					{
						$group: {
							_id: null,
							totalPlayed: { $sum: '$totalAmountPlayed' },
							totalWon: { $sum: '$totalAmountWon' },
							ticketCount: { $sum: 1 },
						},
					},
				]),
				MegaMillionTicket.aggregate([
					{
						$match: {
							lottery: { $in: periodicLotteryIds },
							status: { $ne: 'CANCELLED' },
						},
					},
					{
						$group: {
							_id: null,
							totalPlayed: { $sum: '$amountPlayed' },
							totalWon: { $sum: '$amountWon' },
							ticketCount: { $sum: 1 },
						},
					},
				]),
			]);

			return {
				borlette: borletteStats[0] || {
					totalPlayed: 0,
					totalWon: 0,
					ticketCount: 0,
				},
				megaMillion: megaMillionStats[0] || {
					totalPlayed: 0,
					totalWon: 0,
					ticketCount: 0,
				},
				lotteryCount: periodicLotteries.length,
			};
		};

		const [todayStats, weekStats, monthStats] = await Promise.all([
			getPeriodicStats(startOfToday, endOfToday),
			getPeriodicStats(startOfWeek),
			getPeriodicStats(startOfMonth),
		]);

		// Get lottery type distribution
		const typeDistribution = await Lottery.aggregate([
			{
				$group: {
					_id: '$type',
					total: { $sum: 1 },
					scheduled: {
						$sum: {
							$cond: [{ $eq: ['$status', 'SCHEDULED'] }, 1, 0],
						},
					},
					completed: {
						$sum: {
							$cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0],
						},
					},
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				summary: {
					totalLotteries: lotteryStats.reduce(
						(sum, stat) => sum + stat.count,
						0
					),
					scheduledLotteries:
						lotteryStats.find(s => s._id === 'SCHEDULED')?.count ||
						0,
					completedLotteries:
						lotteryStats.find(s => s._id === 'COMPLETED')?.count ||
						0,
					todayScheduled: todayLotteries.length,
					totalRevenue,
					totalPayout,
					totalProfit,
					profitMargin:
						totalRevenue > 0
							? ((totalProfit / totalRevenue) * 100).toFixed(2)
							: 0,
				},
				upcomingLotteries: upcomingWithCountdown,
				recentLotteries,
				stateDistribution,
				typeDistribution,
				periodicStats: {
					today: {
						...todayStats,
						revenue:
							todayStats.borlette.totalPlayed +
							todayStats.megaMillion.totalPlayed,
						payout:
							todayStats.borlette.totalWon +
							todayStats.megaMillion.totalWon,
						profit:
							todayStats.borlette.totalPlayed +
							todayStats.megaMillion.totalPlayed -
							(todayStats.borlette.totalWon +
								todayStats.megaMillion.totalWon),
					},
					thisWeek: {
						...weekStats,
						revenue:
							weekStats.borlette.totalPlayed +
							weekStats.megaMillion.totalPlayed,
						payout:
							weekStats.borlette.totalWon +
							weekStats.megaMillion.totalWon,
						profit:
							weekStats.borlette.totalPlayed +
							weekStats.megaMillion.totalPlayed -
							(weekStats.borlette.totalWon +
								weekStats.megaMillion.totalWon),
					},
					thisMonth: {
						...monthStats,
						revenue:
							monthStats.borlette.totalPlayed +
							monthStats.megaMillion.totalPlayed,
						payout:
							monthStats.borlette.totalWon +
							monthStats.megaMillion.totalWon,
						profit:
							monthStats.borlette.totalPlayed +
							monthStats.megaMillion.totalPlayed -
							(monthStats.borlette.totalWon +
								monthStats.megaMillion.totalWon),
					},
				},
				gameStats: {
					borlette: {
						...borletteData,
						profit:
							borletteData.totalPlayed - borletteData.totalWon,
					},
					megaMillion: {
						...megaMillionData,
						profit:
							megaMillionData.totalPlayed -
							megaMillionData.totalWon,
					},
				},
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

export const lastLottery = async ({ type, metadata, stateId }) => {
	// Added stateId parameter
	try {
		const params = {
			status: 'COMPLETED',
			type: type.toUpperCase(),
		};
		if (metadata) {
			params.metadata = metadata;
		}
		if (stateId) {
			// Filter by state if provided
			params.state = stateId;
		}
		const lottery = await Lottery.findOne(params)
			.sort({
				createdAt: 'desc',
			})
			.populate('state', 'name code') // Populate state information
			.skip(0)
			.exec();
		return {
			status: 200,
			entity: {
				success: true,
				lottery,
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

export const show = async (
	{ id },
	{ _id, role },
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
		const lottery = await Lottery.findById(id)
			.populate('state', 'name code') // Populate state information
			.exec();
		let params = {
			lottery: id,
		};
		if (role !== 'ADMIN') {
			params.user = _id;
		}
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
		let ticketList = [];
		let amount = {};
		let restrictions = {};
		let total = 0;
		switch (lottery.type) {
			case 'BORLETTE':
				ticketList = await BorletteTicket.find(params)
					.limit(limit ? parseInt(limit) : 10)
					.skip(offset ? parseInt(offset) : 0)
					.sort({
						[sortBy]: sortOrder.toLowerCase(),
					})
					.populate('user', 'name email phone')
					.exec();
				restrictions = await LotteryRestriction.findOne({
					lottery: lottery._id.toString(),
				});
				total = await BorletteTicket.count(params).exec();
				amount = await BorletteTicket.aggregate([
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
							_id: null,
							totalAmountPlayed: {
								$sum: '$totalAmountPlayed',
							},
							totalAmountWon: {
								$sum: '$totalAmountWon',
							},
						},
					},
				]);
				break;
			case 'MEGAMILLION':
				ticketList = await MegaMillionTicket.find(params)
					.limit(limit ? parseInt(limit) : 10)
					.skip(offset ? parseInt(offset) : 0)
					.sort({
						[sortBy]: sortOrder.toLowerCase(),
					})
					.populate('user', 'name email phone')
					.exec();
				total = await MegaMillionTicket.count(params).exec();
				amount = await MegaMillionTicket.aggregate([
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
				break;
		}
		return {
			status: 200,
			entity: {
				success: true,
				total,
				ticketList,
				amount: amount.map(item => ({
					...item,
					totalAmountPlayed: parseFloat(
						item.totalAmountPlayed
					).toFixed(2),
					totalAmountWon: parseFloat(item.totalAmountWon).toFixed(2),
				})),
				lottery: {
					...lottery.toJSON(),
					restrictions,
				},
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

export const create = async (body, { _id }) => {
	try {
		body.createdBy = _id;

		// Validate state exists
		if (!body.state) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'State ID is required.',
				},
			};
		}

		const stateExists = await State.findById(body.state);
		if (!stateExists) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid state specified.',
				},
			};
		}

		// Check for existing lotteries of the same type in the same state
		const existingLottery = await Lottery.findOne({
			type: body.type,
			state: body.state,
			status: {
				$ne: 'COMPLETED',
			},
		});

		if (!existingLottery) {
			const lottery = await Lottery.create(body);
			if (lottery._id) {
				if (body.restrictions) {
					await LotteryRestriction.create({
						lottery: lottery._id.toString(),
						...body.restrictions,
					});
				}
				return {
					status: 200,
					entity: {
						success: true,
						lottery: lottery,
					},
				};
			}
		}
		return {
			status: 400,
			entity: {
				success: false,
				existingLottery: existingLottery,
				error: 'Please publish previously created lottery for this state and type first.',
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

export const update = async ({ id }, body) => {
	try {
		const lottery = await Lottery.findById(id);
		if (lottery._id) {
			// If changing state, validate the new state exists
			if (body.state && body.state !== lottery.state) {
				const stateExists = await State.findById(body.state);
				if (!stateExists) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Invalid state specified.',
						},
					};
				}

				// Update lottery state
				lottery.state = body.state;
				await lottery.save();
			}

			if (body.restrictions) {
				const restrictions = await LotteryRestriction.findOneAndUpdate(
					{
						lottery: lottery._id.toString(),
					},
					{
						...body.restrictions,
					},
					{
						new: true,
						upsert: true,
					}
				);
				return {
					status: 200,
					entity: {
						success: true,
						lottery: {
							...lottery.toJSON(),
							restrictions,
						},
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
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

// State-based reports
export const stateReport = async ({ stateId }, { role }) => {
	try {
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
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
					error: 'State not found',
				},
			};
		}

		// Get all lotteries for this state
		const lotteries = await Lottery.find({ state: stateId }).exec();
		const lotteryIds = lotteries.map(lottery => lottery._id.toString());

		// Get Borlette ticket statistics for these lotteries
		const borletteStats = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: '$lottery',
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: { $sum: '$totalAmountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		// Get MegaMillion ticket statistics for these lotteries
		const megaMillionStats = await MegaMillionTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: '$lottery',
					totalAmountPlayed: { $sum: '$amountPlayed' },
					totalAmountWon: { $sum: '$amountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		// Combine the statistics
		const combinedStats = {
			state: state,
			lotteryCount: lotteries.length,
			borlette: {
				totalAmountPlayed: borletteStats.reduce(
					(sum, stat) => sum + stat.totalAmountPlayed,
					0
				),
				totalAmountWon: borletteStats.reduce(
					(sum, stat) => sum + stat.totalAmountWon,
					0
				),
				ticketCount: borletteStats.reduce(
					(sum, stat) => sum + stat.ticketCount,
					0
				),
				profit: borletteStats.reduce(
					(sum, stat) =>
						sum + stat.totalAmountPlayed - stat.totalAmountWon,
					0
				),
			},
			megaMillion: {
				totalAmountPlayed: megaMillionStats.reduce(
					(sum, stat) => sum + stat.totalAmountPlayed,
					0
				),
				totalAmountWon: megaMillionStats.reduce(
					(sum, stat) => sum + stat.totalAmountWon,
					0
				),
				ticketCount: megaMillionStats.reduce(
					(sum, stat) => sum + stat.ticketCount,
					0
				),
				profit: megaMillionStats.reduce(
					(sum, stat) =>
						sum + stat.totalAmountPlayed - stat.totalAmountWon,
					0
				),
			},
		};

		return {
			status: 200,
			entity: {
				success: true,
				report: combinedStats,
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

export const allStatesSummary = async (_, { role }) => {
	try {
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		// Get all states
		const states = await State.find({ isActive: true }).exec();

		const summaryPromises = states.map(async state => {
			// Get all lotteries for this state
			const lotteries = await Lottery.find({ state: state._id }).exec();
			const lotteryIds = lotteries.map(lottery => lottery._id.toString());

			// Get combined statistics for this state
			const borletteStats = await BorletteTicket.aggregate([
				{
					$match: {
						lottery: { $in: lotteryIds },
						status: { $ne: 'CANCELLED' },
					},
				},
				{
					$group: {
						_id: null,
						totalAmountPlayed: { $sum: '$totalAmountPlayed' },
						totalAmountWon: { $sum: '$totalAmountWon' },
						ticketCount: { $sum: 1 },
					},
				},
			]);

			const megaMillionStats = await MegaMillionTicket.aggregate([
				{
					$match: {
						lottery: { $in: lotteryIds },
						status: { $ne: 'CANCELLED' },
					},
				},
				{
					$group: {
						_id: null,
						totalAmountPlayed: { $sum: '$amountPlayed' },
						totalAmountWon: { $sum: '$amountWon' },
						ticketCount: { $sum: 1 },
					},
				},
			]);

			// Extract summary data
			const borletteData =
				borletteStats.length > 0
					? borletteStats[0]
					: {
						totalAmountPlayed: 0,
						totalAmountWon: 0,
						ticketCount: 0,
					};

			const megaMillionData =
				megaMillionStats.length > 0
					? megaMillionStats[0]
					: {
						totalAmountPlayed: 0,
						totalAmountWon: 0,
						ticketCount: 0,
					};

			return {
				state: {
					id: state._id,
					name: state.name,
					code: state.code,
				},
				lotteryCount: lotteries.length,
				totalAmountPlayed:
					borletteData.totalAmountPlayed +
					megaMillionData.totalAmountPlayed,
				totalAmountWon:
					borletteData.totalAmountWon +
					megaMillionData.totalAmountWon,
				ticketCount:
					borletteData.ticketCount + megaMillionData.ticketCount,
				profit:
					borletteData.totalAmountPlayed -
					borletteData.totalAmountWon +
					(megaMillionData.totalAmountPlayed -
						megaMillionData.totalAmountWon),
			};
		});

		const summaries = await Promise.all(summaryPromises);

		return {
			status: 200,
			entity: {
				success: true,
				summaries,
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

export const preview = async (body, user) => {
	try {
		const { id, numbers } = body;
		if (!id) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Lottery ID is required',
				},
			};
		}

		if (!numbers || !Array.isArray(numbers) || numbers.length !== 3) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Three winning numbers are required',
				},
			};
		}

		const lottery = await Lottery.findById(id);
		if (!lottery) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Lottery not found',
				},
			};
		}

		const results = { numbers };
		const preview = await previewResult(lottery, results);

		return {
			status: 200,
			entity: {
				success: true,
				preview,
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

export const publish = async ({ id }, results) => {
	try {
		const publish = await publishResult(id, results);
		return {
			status: 200,
			entity: {
				success: true,
				publish,
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

export const remove = async ({ id }) => {
	try {
		const lottery = await Lottery.findById(id);
		if (lottery._id) {
			const removed = await lottery.remove();
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

const previewResult = async ({ _id, type, jackpotAmount, additionalData }, results) => {
	let ticketList = [];
	if (type === 'MEGAMILLION') {
		ticketList = await MegaMillionTicket.find({
			lottery: _id,
			status: 'ACTIVE',
		}).populate('user');
	} else {
		ticketList = await BorletteTicket.find({
			lottery: _id,
			status: 'ACTIVE',
		}).populate('user');
	}
	let megamillionResult = {
		tickets: [],
		counter: 0,
		totalAmountWon: 0,
		totalAmountReceived: 0,
		matches: {
			'5_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'5_only': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'4_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'4_only': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'3_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'3_only': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'2_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'1_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'0_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
		},
	};
	let borletteResult = {
		totalAmountReceived: 0,
		totalAmountWon: 0,
	};
	let winningNumbers = results.numbers.map(n => n.toString());
	let bonusNumber = null;
	let marriageNumbers = [];

	// Check if marriage numbers are allowed (only when pick3 key exists)
	const hasMarriageNumbers = additionalData?.hasMarriageNumbers !== false;

	if (results.numbers.length === 3) {
		if (winningNumbers[0].length > 2) {
			bonusNumber = winningNumbers[0].substr(0, 1);
			winningNumbers[0] = winningNumbers[0].substr(1, 2);
			borletteResult[`${bonusNumber}${winningNumbers[0]}`] = {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			};
		}
		borletteResult[`${winningNumbers[0]}${winningNumbers[1]}`] = {
			amountReceived: 0,
			amountWon: 0,
			counter: 0,
		};
		borletteResult[`${winningNumbers[1]}${winningNumbers[2]}`] = {
			amountReceived: 0,
			amountWon: 0,
			counter: 0,
		};
		borletteResult[`${winningNumbers[0]}${winningNumbers[2]}`] = {
			amountReceived: 0,
			amountWon: 0,
			counter: 0,
		};

		// Only calculate marriage numbers if allowed
		if (hasMarriageNumbers) {
			marriageNumbers = [
				`${winningNumbers[0]}x${winningNumbers[1]}`,
				`${winningNumbers[1]}x${winningNumbers[0]}`,
				`${winningNumbers[1]}x${winningNumbers[2]}`,
				`${winningNumbers[2]}x${winningNumbers[1]}`,
				`${winningNumbers[0]}x${winningNumbers[2]}`,
				`${winningNumbers[2]}x${winningNumbers[0]}`,
			];
			marriageNumbers.map(number => {
				if (!borletteResult[number]) {
					borletteResult[number] = {
						amountReceived: 0,
						amountWon: 0,
						counter: 0,
					};
				}
			});
		}

		winningNumbers.map(number => {
			if (!borletteResult[number]) {
				borletteResult[number] = {
					amountReceived: 0,
					amountWon: 0,
					counter: 0,
				};
			}
		});
	}
	let ticketsPromise = ticketList.map(
		ticket =>
			// eslint-disable-next-line no-async-promise-executor
			new Promise(async resolve => {
				ticket.amountWon = 0;
				ticket.counter = 0;
				switch (type) {
					case 'BORLETTE':
						// NEW: Process each number with tier-based payout calculations for preview
						for (const number of ticket.numbers) {
							number.amountWon = 0;
							let baseAmountWon = 0;

							if (
								hasMarriageNumbers &&
								marriageNumbers.indexOf(
									number.numberPlayed.toString()
								) !== -1
							) {
								baseAmountWon = number.amountPlayed * 500;
							} else {
								switch (number.numberPlayed.toString()) {
									case `${winningNumbers[0]}${winningNumbers[1]}`:
										baseAmountWon = number.amountPlayed * 800;
										break;
									case `${winningNumbers[1]}${winningNumbers[2]}`:
										baseAmountWon = number.amountPlayed * 800;
										break;
									case `${winningNumbers[0]}${winningNumbers[2]}`:
										baseAmountWon = number.amountPlayed * 800;
										break;
									case `${bonusNumber}${winningNumbers[0]}`:
										baseAmountWon = number.amountPlayed * 300;
										break;
									case `${winningNumbers[0]}`:
										// 1st place: Base 60x (will be adjusted by tier)
										baseAmountWon = number.amountPlayed * 60;
										break;
									case `${winningNumbers[1]}`:
										// 2nd place: Fixed 15x for all tiers (FIXED from 20x to 15x)
										baseAmountWon = number.amountPlayed * 15;
										break;
									case `${winningNumbers[2]}`:
										// 3rd place: Fixed 10x for all tiers (already correct)
										baseAmountWon = number.amountPlayed * 10;
										break;
								}
							}

							// NEW: Apply tier-based adjustment with position-specific logic for preview
							if (baseAmountWon > 0) {
								// Get user tier from ticket or default
								const userTier = ticket.userTierAtPurchase || 'NONE';

								number.amountWon = await applyTierBasedPayoutForPreview(
									baseAmountWon,
									userTier,
									number.numberPlayed.toString(),
									winningNumbers
								);

								// Update result tracking
								if (borletteResult[number.numberPlayed]) {
									borletteResult[number.numberPlayed].amountReceived += number.amountPlayed;
									borletteResult[number.numberPlayed].amountWon += number.amountWon;
									borletteResult[number.numberPlayed].counter += 1;
								}
							}

							borletteResult.totalAmountReceived += number.amountPlayed;
							borletteResult.totalAmountWon += number.amountWon;
						}
						break;
					case 'MEGAMILLION': {
						const matchedNumbers = ticket.numbers
							.map(number => number.toString())
							.filter(
								number =>
									results.numbers.indexOf(
										number.toString()
									) !== -1
							);
						const matchedMegaBall =
							ticket.megaBall === results.megaBall;
						if (matchedNumbers.length === 5 && matchedMegaBall) {
							megamillionResult.matches['5_megaball'].counter +=
								1;
							megamillionResult.matches['5_megaball'].amountWon +=
								jackpotAmount;
							ticket.amountWon = jackpotAmount;
						} else if (
							matchedNumbers.length === 5 &&
							!matchedMegaBall
						) {
							megamillionResult.matches['5_only'].counter += 1;
							megamillionResult.matches['5_only'].amountWon +=
								75 * 1000;
							ticket.amountWon = 75 * 1000;
						} else if (
							matchedNumbers.length === 4 &&
							matchedMegaBall
						) {
							megamillionResult.matches['4_megaball'].counter +=
								1;
							megamillionResult.matches['4_megaball'].amountWon +=
								10 * 1000;
							ticket.amountWon = 10 * 1000;
						} else if (
							matchedNumbers.length === 4 &&
							!matchedMegaBall
						) {
							megamillionResult.matches['4_only'].counter += 1;
							megamillionResult.matches['4_only'].amountWon += 500;
							ticket.amountWon = 500;
						} else if (
							matchedNumbers.length === 3 &&
							matchedMegaBall
						) {
							megamillionResult.matches['3_megaball'].counter +=
								1;
							megamillionResult.matches['3_megaball'].amountWon +=
								200;
							ticket.amountWon = 200;
						} else if (
							matchedNumbers.length === 3 &&
							!matchedMegaBall
						) {
							megamillionResult.matches['3_only'].counter += 1;
							megamillionResult.matches['3_only'].amountWon += 15;
							ticket.amountWon = 15;
						} else if (
							matchedNumbers.length === 2 &&
							matchedMegaBall
						) {
							megamillionResult.matches['2_megaball'].counter +=
								1;
							megamillionResult.matches['2_megaball'].amountWon +=
								10;
							ticket.amountWon = 10;
						} else if (
							matchedNumbers.length === 1 &&
							matchedMegaBall
						) {
							megamillionResult.matches['1_megaball'].counter +=
								1;
							megamillionResult.matches['1_megaball'].amountWon +=
								4;
							ticket.amountWon = 4;
						} else if (
							matchedNumbers.length === 0 &&
							matchedMegaBall
						) {
							megamillionResult.matches['0_megaball'].counter +=
								1;
							megamillionResult.matches['0_megaball'].amountWon +=
								2;
							ticket.amountWon = 2;
						}
						megamillionResult.totalAmountReceived += 2;
						megamillionResult.totalAmountWon += ticket.amountWon;
						break;
					}
				}
				resolve(ticket);
			})
	);
	const tickets = await Promise.all(ticketsPromise);
	return type === 'MEGAMILLION'
		? { ...megamillionResult, tickets }
		: { ...borletteResult, tickets };
};

const applyTierBasedPayoutForPreview = async (baseAmount, userTier, playedNumber, winningNumbers) => {
	try {
		// Map NONE tier to SILVER for payout purposes
		const payoutTier = userTier === 'NONE' ? 'SILVER' : userTier;

		// Check if this is a 1st place win (only 1st place gets tier-based multipliers)
		const isFirstPlace = playedNumber === winningNumbers[0];

		// If not 1st place, return base amount unchanged (2nd and 3rd place are fixed for all tiers)
		if (!isFirstPlace) {
			return baseAmount;
		}

		// Apply tier-based multiplier only for 1st place wins
		const payoutConfig = await PayoutService.getPayoutPercentage(payoutTier, 'BORLETTE');
		const tierMultiplier = payoutConfig.percentage / 60; // 60% is the base (Silver)

		return Math.round(baseAmount * tierMultiplier);
	} catch (error) {
		console.error('Error applying tier-based payout for preview:', error);
		// Return original amount as fallback
		return baseAmount;
	}
};