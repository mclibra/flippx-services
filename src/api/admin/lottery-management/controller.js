import moment from 'moment-timezone';
import { MegaMillionTicket } from '../../megamillion_ticket/model';
import { BorletteTicket } from '../../borlette_ticket/model';
import { Lottery, LotteryRestriction } from '../../lottery/model';
import { State } from '../state-management/model';
import { publishResult } from '../../../services/lottery/resultPublisher';
import PayoutService from '../../../services/payout/payoutService';
import { LotteryDefaultConfig } from '../../lottery-default-config/model';
import { User } from '../../user/model';
import { Wallet, Payment } from '../../wallet/model';
import { Transaction } from '../../transaction/model';
import { Withdrawal } from '../../withdrawal/model';
import { RouletteTicket } from '../../roulette_ticket/model';
import { DominoGame, DominoRoom } from '../../domino/model';
import { LoyaltyProfile } from '../../loyalty/model';

// Helper function to get default jackpot amount for MEGAMILLION
const getDefaultJackpotAmount = async () => {
	try {
		const config = await LotteryDefaultConfig.findOne({
			lotteryType: 'MEGAMILLION',
		});
		return config ? config.jackpotAmount : 1000000; // Default to 1 million if not configured
	} catch (error) {
		console.error('Error getting default jackpot amount:', error);
		return 1000000; // Fallback to 1 million on error
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
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const showAllTickets = async (
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
		const lottery = await Lottery.findById(id)
			.populate('state', 'name code')
			.exec();
		let params = {
			lottery: id,
		};
		// Admin can see all tickets or filter by specific user if needed
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
			// For MEGAMILLION, set default jackpot amount if not provided
			if (
				body.type === 'MEGAMILLION' &&
				(body.jackpotAmount === undefined ||
					body.jackpotAmount === null)
			) {
				body.jackpotAmount = await getDefaultJackpotAmount();
			}

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
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

const previewResult = async (
	{ _id, type, jackpotAmount, additionalData },
	results
) => {
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
										baseAmountWon =
											number.amountPlayed * 800;
										break;
									case `${winningNumbers[1]}${winningNumbers[2]}`:
										baseAmountWon =
											number.amountPlayed * 800;
										break;
									case `${winningNumbers[0]}${winningNumbers[2]}`:
										baseAmountWon =
											number.amountPlayed * 800;
										break;
									case `${bonusNumber}${winningNumbers[0]}`:
										baseAmountWon =
											number.amountPlayed * 300;
										break;
									case `${winningNumbers[0]}`:
										// 1st place: Base 60x (will be adjusted by tier)
										baseAmountWon =
											number.amountPlayed * 60;
										break;
									case `${winningNumbers[1]}`:
										// 2nd place: Fixed 15x for all tiers (FIXED from 20x to 15x)
										baseAmountWon =
											number.amountPlayed * 15;
										break;
									case `${winningNumbers[2]}`:
										// 3rd place: Fixed 10x for all tiers (already correct)
										baseAmountWon =
											number.amountPlayed * 10;
										break;
								}
							}

							// NEW: Apply tier-based adjustment with position-specific logic for preview
							if (baseAmountWon > 0) {
								// Get user tier from ticket or default
								const userTier =
									ticket.userTierAtPurchase || 'NONE';

								number.amountWon =
									await applyTierBasedPayoutForPreview(
										baseAmountWon,
										userTier,
										number.numberPlayed.toString(),
										winningNumbers
									);

								// Update result tracking
								if (borletteResult[number.numberPlayed]) {
									borletteResult[
										number.numberPlayed
									].amountReceived += number.amountPlayed;
									borletteResult[
										number.numberPlayed
									].amountWon += number.amountWon;
									borletteResult[
										number.numberPlayed
									].counter += 1;
								}
							}

							borletteResult.totalAmountReceived +=
								number.amountPlayed;
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
							megamillionResult.matches['4_only'].amountWon +=
								500;
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

const applyTierBasedPayoutForPreview = async (
	baseAmount,
	userTier,
	playedNumber,
	winningNumbers
) => {
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
		const payoutConfig = await PayoutService.getPayoutPercentage(
			payoutTier,
			'BORLETTE'
		);
		const tierMultiplier = payoutConfig.percentage / 60; // 60% is the base (Silver)

		return Math.round(baseAmount * tierMultiplier);
	} catch (error) {
		console.error('Error applying tier-based payout for preview:', error);
		// Return original amount as fallback
		return baseAmount;
	}
};

export const preview = async ({ id }, body) => {
	try {
		const { numbers } = body;
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
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

/**
 * Get comprehensive application dashboard overview
 * Separates all monetary information into Real and Virtual
 */
export const getApplicationDashboard = async (_, { role }) => {
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

		const startOfToday = moment().startOf('day').valueOf();
		const endOfToday = moment().endOf('day').valueOf();
		const startOfWeek = moment().startOf('week').valueOf();
		const startOfMonth = moment().startOf('month').valueOf();

		// ===== USER STATISTICS =====
		const [
			totalUsers,
			activeUsers,
			newUsersToday,
			newUsersThisWeek,
			newUsersThisMonth,
			loyaltyTierDistribution,
		] = await Promise.all([
			User.countDocuments(),
			User.countDocuments({
				lastLoginAt: { $gte: moment().subtract(30, 'days').toDate() },
			}),
			User.countDocuments({
				createdAt: {
					$gte: moment(startOfToday).toDate(),
					$lte: moment(endOfToday).toDate(),
				},
			}),
			User.countDocuments({
				createdAt: { $gte: moment(startOfWeek).toDate() },
			}),
			User.countDocuments({
				createdAt: { $gte: moment(startOfMonth).toDate() },
			}),
			LoyaltyProfile.aggregate([
				{
					$group: {
						_id: '$currentTier',
						count: { $sum: 1 },
					},
				},
			]),
		]);

		// ===== WALLET BALANCES (Real vs Virtual) =====
		const walletStats = await Wallet.aggregate([
			{
				$group: {
					_id: null,
					totalVirtualBalance: { $sum: '$virtualBalance' },
					totalRealBalanceWithdrawable: {
						$sum: '$realBalanceWithdrawable',
					},
					totalRealBalanceNonWithdrawable: {
						$sum: '$realBalanceNonWithdrawable',
					},
					totalPendingWithdrawals: { $sum: '$pendingWithdrawals' },
					walletCount: { $sum: 1 },
				},
			},
		]);

		const walletData = walletStats[0] || {
			totalVirtualBalance: 0,
			totalRealBalanceWithdrawable: 0,
			totalRealBalanceNonWithdrawable: 0,
			totalPendingWithdrawals: 0,
			walletCount: 0,
		};

		// ===== PAYMENTS (Real vs Virtual) =====
		const paymentStats = await Payment.aggregate([
			{
				$match: { status: 'COMPLETED' },
			},
			{
				$group: {
					_id: null,
					totalAmount: { $sum: '$amount' },
					totalRealCash: {
						$sum: { $ifNull: ['$realCashAmount', 0] },
					},
					totalVirtualCash: {
						$sum: { $ifNull: ['$virtualCashAmount', 0] },
					},
					count: { $sum: 1 },
				},
			},
		]);

		const paymentData = paymentStats[0] || {
			totalAmount: 0,
			totalRealCash: 0,
			totalVirtualCash: 0,
			count: 0,
		};

		// Periodic payment stats
		const getPeriodicPayments = async timeQuery => {
			const stats = await Payment.aggregate([
				{
					$match: {
						status: 'COMPLETED',
						createdAt: timeQuery,
					},
				},
				{
					$group: {
						_id: null,
						totalAmount: { $sum: '$amount' },
						totalRealCash: {
							$sum: { $ifNull: ['$realCashAmount', 0] },
						},
						totalVirtualCash: {
							$sum: { $ifNull: ['$virtualCashAmount', 0] },
						},
						count: { $sum: 1 },
					},
				},
			]);
			return (
				stats[0] || {
					totalAmount: 0,
					totalRealCash: 0,
					totalVirtualCash: 0,
					count: 0,
				}
			);
		};

		const [todayPayments, weekPayments, monthPayments] = await Promise.all([
			getPeriodicPayments({
				$gte: moment(startOfToday).toDate(),
				$lte: moment(endOfToday).toDate(),
			}),
			getPeriodicPayments({
				$gte: moment(startOfWeek).toDate(),
			}),
			getPeriodicPayments({
				$gte: moment(startOfMonth).toDate(),
			}),
		]);

		// ===== WITHDRAWALS (Real only) =====
		const completedWithdrawals = await Withdrawal.aggregate([
			{
				$match: { status: 'COMPLETED' },
			},
			{
				$group: {
					_id: null,
					totalAmount: { $sum: '$amount' },
					count: { $sum: 1 },
				},
			},
		]);

		const withdrawalData = completedWithdrawals[0] || {
			totalAmount: 0,
			count: 0,
		};

		// Periodic withdrawal stats
		const getPeriodicWithdrawals = async timeQuery => {
			const stats = await Withdrawal.aggregate([
				{
					$match: {
						status: 'COMPLETED',
						createdAt: timeQuery,
					},
				},
				{
					$group: {
						_id: null,
						totalAmount: { $sum: '$amount' },
						count: { $sum: 1 },
					},
				},
			]);
			return stats[0] || { totalAmount: 0, count: 0 };
		};

		const [todayWithdrawals, weekWithdrawals, monthWithdrawals] =
			await Promise.all([
				getPeriodicWithdrawals({
					$gte: moment(startOfToday).toDate(),
					$lte: moment(endOfToday).toDate(),
				}),
				getPeriodicWithdrawals({
					$gte: moment(startOfWeek).toDate(),
				}),
				getPeriodicWithdrawals({
					$gte: moment(startOfMonth).toDate(),
				}),
			]);

		// ===== TRANSACTIONS (Real vs Virtual) =====
		const transactionStats = await Transaction.aggregate([
			{
				$match: { status: 'COMPLETED' },
			},
			{
				$group: {
					_id: {
						cashType: '$cashType',
						transactionType: '$transactionType',
					},
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
		]);

		// Separate Real and Virtual transactions
		const realTransactions = transactionStats.filter(
			t => t._id.cashType === 'REAL'
		);
		const virtualTransactions = transactionStats.filter(
			t => t._id.cashType === 'VIRTUAL'
		);

		const realCredits = realTransactions
			.filter(t => t._id.transactionType === 'CREDIT')
			.reduce((sum, t) => sum + t.totalAmount, 0);
		const realDebits = realTransactions
			.filter(t => t._id.transactionType === 'DEBIT')
			.reduce((sum, t) => sum + t.totalAmount, 0);
		const virtualCredits = virtualTransactions
			.filter(t => t._id.transactionType === 'CREDIT')
			.reduce((sum, t) => sum + t.totalAmount, 0);
		const virtualDebits = virtualTransactions
			.filter(t => t._id.transactionType === 'DEBIT')
			.reduce((sum, t) => sum + t.totalAmount, 0);

		// ===== LOTTERY STATISTICS (Real vs Virtual) =====
		const completedLotteryIds = await Lottery.find({ status: 'COMPLETED' })
			.select('_id type')
			.lean();
		const lotteryIds = completedLotteryIds.map(l => l._id.toString());

		// Get Borlette ticket stats by cashType
		const borletteStatsByCashType = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: '$cashType',
					totalPlayed: { $sum: '$totalAmountPlayed' },
					totalWon: { $sum: { $ifNull: ['$totalAmountWon', 0] } },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		const borletteReal = borletteStatsByCashType.find(
			s => s._id === 'REAL'
		) || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};
		const borletteVirtual = borletteStatsByCashType.find(
			s => s._id === 'VIRTUAL'
		) || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};

		// Get MegaMillion ticket stats by cashType
		const megaMillionStatsByCashType = await MegaMillionTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: '$cashType',
					totalPlayed: { $sum: '$amountPlayed' },
					totalWon: { $sum: { $ifNull: ['$amountWon', 0] } },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		const megaMillionReal = megaMillionStatsByCashType.find(
			s => s._id === 'REAL'
		) || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};
		const megaMillionVirtual = megaMillionStatsByCashType.find(
			s => s._id === 'VIRTUAL'
		) || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};

		// Calculate totals
		const realLotteryRevenue =
			borletteReal.totalPlayed + megaMillionReal.totalPlayed;
		const virtualLotteryRevenue =
			borletteVirtual.totalPlayed + megaMillionVirtual.totalPlayed;
		const realLotteryWinnings =
			borletteReal.totalWon + megaMillionReal.totalWon;
		const virtualLotteryWinnings =
			borletteVirtual.totalWon + megaMillionVirtual.totalWon;

		// ===== ROULETTE STATISTICS (Real vs Virtual) =====
		const rouletteStats = await RouletteTicket.aggregate([
			{
				$group: {
					_id: '$cashType',
					totalPlayed: { $sum: '$totalAmountPlayed' },
					totalWon: { $sum: { $ifNull: ['$totalAmountWon', 0] } },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		const realRoulette = rouletteStats.find(s => s._id === 'REAL') || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};
		const virtualRoulette = rouletteStats.find(
			s => s._id === 'VIRTUAL'
		) || {
			totalPlayed: 0,
			totalWon: 0,
			ticketCount: 0,
		};

		// ===== DOMINO STATISTICS (Real vs Virtual) =====
		const dominoStats = await DominoRoom.aggregate([
			{
				$match: { status: 'COMPLETED' },
			},
			{
				$group: {
					_id: '$cashType',
					totalPot: { $sum: '$totalPot' },
					roomCount: { $sum: 1 },
				},
			},
		]);

		const realDomino = dominoStats.find(s => s._id === 'REAL') || {
			totalPot: 0,
			roomCount: 0,
		};
		const virtualDomino = dominoStats.find(s => s._id === 'VIRTUAL') || {
			totalPot: 0,
			roomCount: 0,
		};

		// Get domino game count
		const dominoGameCount = await DominoGame.countDocuments();
		const realDominoGames = await DominoRoom.countDocuments({
			cashType: 'REAL',
			status: 'COMPLETED',
		});
		const virtualDominoGames = await DominoRoom.countDocuments({
			cashType: 'VIRTUAL',
			status: 'COMPLETED',
		});

		// ===== CALCULATE TOTALS =====
		const totalRealRevenue =
			realLotteryRevenue + realRoulette.totalPlayed + realDomino.totalPot;
		const totalVirtualRevenue =
			virtualLotteryRevenue +
			virtualRoulette.totalPlayed +
			virtualDomino.totalPot;

		const totalRealPayout = realLotteryWinnings + realRoulette.totalWon;
		const totalVirtualPayout =
			virtualLotteryWinnings + virtualRoulette.totalWon;

		const totalRealProfit = totalRealRevenue - totalRealPayout;
		const totalVirtualProfit = totalVirtualRevenue - totalVirtualPayout;

		// ===== LOTTERY COUNTS =====
		const lotteryCounts = await Lottery.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
				},
			},
		]);

		const totalLotteries = lotteryCounts.reduce(
			(sum, stat) => sum + stat.count,
			0
		);
		const scheduledLotteries =
			lotteryCounts.find(s => s._id === 'SCHEDULED')?.count || 0;
		const completedLotteries =
			lotteryCounts.find(s => s._id === 'COMPLETED')?.count || 0;

		return {
			status: 200,
			entity: {
				success: true,
				dashboard: {
					// User Statistics
					users: {
						total: totalUsers,
						active: activeUsers,
						newUsers: {
							today: newUsersToday,
							thisWeek: newUsersThisWeek,
							thisMonth: newUsersThisMonth,
						},
						loyaltyTierDistribution: loyaltyTierDistribution.map(
							tier => ({
								tier: tier._id,
								count: tier.count,
							})
						),
					},

					// Wallet Balances
					wallets: {
						real: {
							withdrawable:
								walletData.totalRealBalanceWithdrawable,
							nonWithdrawable:
								walletData.totalRealBalanceNonWithdrawable,
							total:
								walletData.totalRealBalanceWithdrawable +
								walletData.totalRealBalanceNonWithdrawable,
							pendingWithdrawals:
								walletData.totalPendingWithdrawals,
						},
						virtual: {
							total: walletData.totalVirtualBalance,
						},
						totalWallets: walletData.walletCount,
					},

					// Financial Overview
					financial: {
						real: {
							deposits: {
								total: paymentData.totalRealCash,
								today: todayPayments.totalRealCash,
								thisWeek: weekPayments.totalRealCash,
								thisMonth: monthPayments.totalRealCash,
							},
							withdrawals: {
								total: withdrawalData.totalAmount,
								today: todayWithdrawals.totalAmount,
								thisWeek: weekWithdrawals.totalAmount,
								thisMonth: monthWithdrawals.totalAmount,
							},
							revenue: {
								total: totalRealRevenue,
								lottery: realLotteryRevenue,
								roulette: realRoulette.totalPlayed,
								domino: realDomino.totalPot,
							},
							payouts: {
								total: totalRealPayout,
								lottery: realLotteryWinnings,
								roulette: realRoulette.totalWon,
							},
							profit: {
								total: totalRealProfit,
								margin:
									totalRealRevenue > 0
										? (
												(totalRealProfit /
													totalRealRevenue) *
												100
											).toFixed(2)
										: 0,
							},
							transactions: {
								credits: realCredits,
								debits: realDebits,
								net: realCredits - realDebits,
								count: realTransactions.reduce(
									(sum, t) => sum + t.count,
									0
								),
							},
						},
						virtual: {
							deposits: {
								total: paymentData.totalVirtualCash,
								today: todayPayments.totalVirtualCash,
								thisWeek: weekPayments.totalVirtualCash,
								thisMonth: monthPayments.totalVirtualCash,
							},
							revenue: {
								total: totalVirtualRevenue,
								lottery: virtualLotteryRevenue,
								roulette: virtualRoulette.totalPlayed,
								domino: virtualDomino.totalPot,
							},
							payouts: {
								total: totalVirtualPayout,
								lottery: virtualLotteryWinnings,
								roulette: virtualRoulette.totalWon,
							},
							profit: {
								total: totalVirtualProfit,
								margin:
									totalVirtualRevenue > 0
										? (
												(totalVirtualProfit /
													totalVirtualRevenue) *
												100
											).toFixed(2)
										: 0,
							},
							transactions: {
								credits: virtualCredits,
								debits: virtualDebits,
								net: virtualCredits - virtualDebits,
								count: virtualTransactions.reduce(
									(sum, t) => sum + t.count,
									0
								),
							},
						},
					},

					// Game Statistics
					games: {
						lottery: {
							total: totalLotteries,
							scheduled: scheduledLotteries,
							completed: completedLotteries,
							borlette: {
								totalPlayed:
									borletteReal.totalPlayed +
									borletteVirtual.totalPlayed,
								totalWon:
									borletteReal.totalWon +
									borletteVirtual.totalWon,
								ticketCount:
									borletteReal.ticketCount +
									borletteVirtual.ticketCount,
								real: {
									revenue: borletteReal.totalPlayed,
									winnings: borletteReal.totalWon,
									ticketCount: borletteReal.ticketCount,
								},
								virtual: {
									revenue: borletteVirtual.totalPlayed,
									winnings: borletteVirtual.totalWon,
									ticketCount: borletteVirtual.ticketCount,
								},
							},
							megaMillion: {
								totalPlayed:
									megaMillionReal.totalPlayed +
									megaMillionVirtual.totalPlayed,
								totalWon:
									megaMillionReal.totalWon +
									megaMillionVirtual.totalWon,
								ticketCount:
									megaMillionReal.ticketCount +
									megaMillionVirtual.ticketCount,
								real: {
									revenue: megaMillionReal.totalPlayed,
									winnings: megaMillionReal.totalWon,
									ticketCount: megaMillionReal.ticketCount,
								},
								virtual: {
									revenue: megaMillionVirtual.totalPlayed,
									winnings: megaMillionVirtual.totalWon,
									ticketCount: megaMillionVirtual.ticketCount,
								},
							},
						},
						roulette: {
							real: {
								revenue: realRoulette.totalPlayed,
								payouts: realRoulette.totalWon,
								profit:
									realRoulette.totalPlayed -
									realRoulette.totalWon,
								ticketCount: realRoulette.ticketCount,
							},
							virtual: {
								revenue: virtualRoulette.totalPlayed,
								payouts: virtualRoulette.totalWon,
								profit:
									virtualRoulette.totalPlayed -
									virtualRoulette.totalWon,
								ticketCount: virtualRoulette.ticketCount,
							},
							total: {
								revenue:
									realRoulette.totalPlayed +
									virtualRoulette.totalPlayed,
								payouts:
									realRoulette.totalWon +
									virtualRoulette.totalWon,
								profit:
									realRoulette.totalPlayed +
									virtualRoulette.totalPlayed -
									(realRoulette.totalWon +
										virtualRoulette.totalWon),
								ticketCount:
									realRoulette.ticketCount +
									virtualRoulette.ticketCount,
							},
						},
						domino: {
							real: {
								revenue: realDomino.totalPot,
								roomCount: realDominoGames,
							},
							virtual: {
								revenue: virtualDomino.totalPot,
								roomCount: virtualDominoGames,
							},
							total: {
								revenue:
									realDomino.totalPot +
									virtualDomino.totalPot,
								roomCount: realDominoGames + virtualDominoGames,
								gameCount: dominoGameCount,
							},
						},
					},

					// Summary
					summary: {
						totalUsers,
						activeUsers,
						real: {
							revenue: totalRealRevenue,
							payout: totalRealPayout,
							profit: totalRealProfit,
							profitMargin:
								totalRealRevenue > 0
									? (
											(totalRealProfit /
												totalRealRevenue) *
											100
										).toFixed(2)
									: 0,
						},
						virtual: {
							revenue: totalVirtualRevenue,
							payout: totalVirtualPayout,
							profit: totalVirtualProfit,
							profitMargin:
								totalVirtualRevenue > 0
									? (
											(totalVirtualProfit /
												totalVirtualRevenue) *
											100
										).toFixed(2)
									: 0,
						},
						total: {
							revenue: totalRealRevenue + totalVirtualRevenue,
							payout: totalRealPayout + totalVirtualPayout,
							profit: totalRealProfit + totalVirtualProfit,
							profitMargin:
								totalRealRevenue + totalVirtualRevenue > 0
									? (
											((totalRealProfit +
												totalVirtualProfit) /
												(totalRealRevenue +
													totalVirtualRevenue)) *
											100
										).toFixed(2)
									: 0,
						},
					},
				},
			},
		};
	} catch (error) {
		console.error('Dashboard error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error.errors || error,
			},
		};
	}
};
