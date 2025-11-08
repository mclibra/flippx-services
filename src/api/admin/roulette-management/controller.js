import moment from 'moment';
import { Roulette } from '../../roulette/model';
import { RouletteTicket } from '../../roulette_ticket/model';

const validateWinningNumber = value =>
	Number.isInteger(value) && value >= 0 && value <= 36;

export const setTemporaryWinningNumber = async (
	rouletteId,
	{ winningNumber, expiresAt, expiresInSeconds },
	adminUser = {}
) => {
	try {
		const roulette = await Roulette.findById(rouletteId).exec();

		if (!roulette) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Roulette game not found',
				},
			};
		}

		if (roulette.status !== 'SCHEDULED') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Temporary winning number can only be set for scheduled roulettes',
				},
			};
		}

		const now = new Date();
		let message = 'Temporary winning number cleared';

		if (winningNumber === null || winningNumber === undefined) {
			roulette.temporaryWinningNumber = null;
			roulette.temporaryWinningNumberExpiresAt = null;
			roulette.temporaryWinningNumberSetBy = null;
			roulette.temporaryWinningNumberSetAt = null;
		} else {
			const parsedWinningNumber = Number(winningNumber);
			if (!validateWinningNumber(parsedWinningNumber)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'winningNumber must be an integer between 0 and 36',
					},
				};
			}

			let expiresAtDate = null;

			if (expiresAt) {
				const expiresAtParsed = new Date(expiresAt);
				if (Number.isNaN(expiresAtParsed.getTime())) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'expiresAt must be a valid date string or timestamp',
						},
					};
				}
				if (expiresAtParsed <= now) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'expiresAt must be in the future',
						},
					};
				}
				expiresAtDate = expiresAtParsed;
			} else if (expiresInSeconds !== undefined && expiresInSeconds !== null) {
				const parsedDuration = Number(expiresInSeconds);
				if (Number.isNaN(parsedDuration) || parsedDuration <= 0) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'expiresInSeconds must be a positive number',
						},
					};
				}
				expiresAtDate = new Date(now.getTime() + parsedDuration * 1000);
			}

			roulette.temporaryWinningNumber = parsedWinningNumber;
			roulette.temporaryWinningNumberExpiresAt = expiresAtDate;
			roulette.temporaryWinningNumberSetBy =
				adminUser?._id || adminUser?.id || null;
			roulette.temporaryWinningNumberSetAt = now;
			message = 'Temporary winning number set';
		}

		await roulette.save();

		return {
			status: 200,
			entity: {
				success: true,
				message,
				temporaryWinningNumber: roulette.temporaryWinningNumber,
				temporaryWinningNumberExpiresAt:
					roulette.temporaryWinningNumberExpiresAt,
				temporaryWinningNumberSetAt: roulette.temporaryWinningNumberSetAt,
				temporaryWinningNumberSetBy: roulette.temporaryWinningNumberSetBy,
			},
		};
	} catch (error) {
		console.error('Set temporary winning number error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					error.message || 'Failed to update temporary winning number for roulette',
			},
		};
	}
};

// ===== LIST ROULETTE =====

export const listRoulette = async query => {
	try {
		const {
			page = 1,
			limit = 20,
			status,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = query;

		// Build filter object
		const filter = {
			// Skip roulette with winningNumber null
			winningNumber: { $ne: null },
		};

		// Status filter
		if (status) {
			filter.status = status.toUpperCase();
		}

		// Date range filters
		if (startDate || endDate) {
			filter.createdAt = {};
			if (startDate) {
				filter.createdAt.$gte = moment(parseInt(startDate)).toDate();
			}
			if (endDate) {
				filter.createdAt.$lte = moment(parseInt(endDate)).toDate();
			}
		}

		// Calculate pagination
		const skip = (page - 1) * limit;

		// Handle sorting by ticket statistics
		let rouletteList = [];
		let total = 0;

		if (sortBy === 'totalAmountPlayed' || sortBy === 'totalAmountWon') {
			// First, get all roulettes matching the filter
			const allFilteredRoulettes = await Roulette.find(filter).exec();
			const filteredRouletteIds = allFilteredRoulettes.map(r =>
				r._id.toString()
			);

			// Aggregate by roulette to get ticket statistics (only for filtered roulettes)
			const rouletteStats = await RouletteTicket.aggregate([
				{
					$match: {
						roulette: { $in: filteredRouletteIds },
					},
				},
				{
					$group: {
						_id: '$roulette',
						totalAmountPlayed: { $sum: '$totalAmountPlayed' },
						totalAmountWon: {
							$sum: { $ifNull: ['$totalAmountWon', 0] },
						},
					},
				},
			]);

			// Create a map of roulette ID to stats
			const statsMap = {};
			rouletteStats.forEach(stat => {
				statsMap[stat._id] = stat;
			});

			// Add stats to roulettes and sort by the requested field
			const roulettesWithStats = allFilteredRoulettes.map(roulette => {
				const stats = statsMap[roulette._id.toString()] || {
					totalAmountPlayed: 0,
					totalAmountWon: 0,
				};
				return {
					roulette,
					stats,
				};
			});

			roulettesWithStats.sort((a, b) => {
				const aValue = a.stats[sortBy] || 0;
				const bValue = b.stats[sortBy] || 0;
				if (sortOrder === 'desc') {
					return bValue - aValue;
				}
				return aValue - bValue;
			});

			// Apply pagination
			total = roulettesWithStats.length;
			rouletteList = roulettesWithStats
				.slice(skip, skip + parseInt(limit))
				.map(item => item.roulette);
		} else {
			// Standard query with filters
			rouletteList = await Roulette.find(filter)
				.skip(skip)
				.limit(parseInt(limit))
				.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
				.exec();

			total = await Roulette.countDocuments(filter);
		}

		// Enrich with ticket statistics
		const enrichedRoulettes = await Promise.all(
			rouletteList.map(async roulette => {
				const rouletteId = roulette._id.toString();

				// Get ticket statistics
				const ticketStats = await RouletteTicket.aggregate([
					{
						$match: {
							roulette: rouletteId,
						},
					},
					{
						$group: {
							_id: null,
							totalTickets: { $sum: 1 },
							totalAmountPlayed: { $sum: '$totalAmountPlayed' },
							totalAmountWon: {
								$sum: { $ifNull: ['$totalAmountWon', 0] },
							},
							winningTickets: {
								$sum: {
									$cond: [
										{
											$gt: [
												{
													$ifNull: [
														'$totalAmountWon',
														0,
													],
												},
												0,
											],
										},
										1,
										0,
									],
								},
							},
						},
					},
				]);

				const stats =
					ticketStats.length > 0
						? ticketStats[0]
						: {
								totalTickets: 0,
								totalAmountPlayed: 0,
								totalAmountWon: 0,
								winningTickets: 0,
							};

				return {
					...roulette.toObject(),
					statistics: {
						...stats,
						profit: stats.totalAmountPlayed - stats.totalAmountWon,
						profitMargin:
							stats.totalAmountPlayed > 0
								? ((stats.totalAmountPlayed -
										stats.totalAmountWon) /
										stats.totalAmountPlayed) *
									100
								: 0,
					},
				};
			})
		);

		return {
			status: 200,
			entity: {
				success: true,
				roulettes: enrichedRoulettes,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
					hasMore: parseInt(page) * parseInt(limit) < total,
				},
			},
		};
	} catch (error) {
		console.error('List roulette error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch roulette games',
			},
		};
	}
};

// ===== GET ROULETTE DETAILS =====

export const getRouletteDetails = async rouletteId => {
	try {
		// Get roulette with full details
		const roulette = await Roulette.findById(rouletteId).exec();

		if (!roulette) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Roulette game not found',
				},
			};
		}

		// Get all tickets for this roulette
		const tickets = await RouletteTicket.find({
			roulette: rouletteId,
		})
			.populate('user', 'name email phone userName')
			.sort({ createdAt: -1 })
			.exec();

		// Calculate ticket statistics
		const ticketStats = await RouletteTicket.aggregate([
			{
				$match: {
					roulette: rouletteId.toString(),
				},
			},
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: {
						$sum: { $ifNull: ['$totalAmountWon', 0] },
					},
					winningTickets: {
						$sum: {
							$cond: [
								{
									$gt: [
										{ $ifNull: ['$totalAmountWon', 0] },
										0,
									],
								},
								1,
								0,
							],
						},
					},
				},
			},
		]);

		const stats =
			ticketStats.length > 0
				? ticketStats[0]
				: {
						totalTickets: 0,
						totalAmountPlayed: 0,
						totalAmountWon: 0,
						winningTickets: 0,
					};

		// Get winning number breakdown by bet type
		let winningNumberBreakdown = null;
		if (
			roulette.winningNumber !== null &&
			roulette.winningNumber !== undefined
		) {
			const winningNumber = roulette.winningNumber;

			// Calculate breakdown by bet type
			const betTypeBreakdown = await RouletteTicket.aggregate([
				{
					$match: {
						roulette: rouletteId.toString(),
					},
				},
				{
					$unwind: '$bet',
				},
				{
					$group: {
						_id: '$bet.blockPlayed',
						totalAmountPlayed: { $sum: '$bet.amountPlayed' },
						totalAmountWon: {
							$sum: { $ifNull: ['$bet.amountWon', 0] },
						},
						ticketCount: { $sum: 1 },
						winningTicketCount: {
							$sum: {
								$cond: [
									{
										$gt: [
											{ $ifNull: ['$bet.amountWon', 0] },
											0,
										],
									},
									1,
									0,
								],
							},
						},
					},
				},
				{
					$sort: { totalAmountWon: -1 },
				},
			]);

			winningNumberBreakdown = {
				winningNumber,
				betTypeBreakdown,
			};
		}

		// Get cash type breakdown
		const cashTypeBreakdown = await RouletteTicket.aggregate([
			{
				$match: {
					roulette: rouletteId.toString(),
				},
			},
			{
				$group: {
					_id: '$cashType',
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: {
						$sum: { $ifNull: ['$totalAmountWon', 0] },
					},
					ticketCount: { $sum: 1 },
					winningTicketCount: {
						$sum: {
							$cond: [
								{
									$gt: [
										{ $ifNull: ['$totalAmountWon', 0] },
										0,
									],
								},
								1,
								0,
							],
						},
					},
				},
			},
		]);

		// Get user breakdown (top players)
		const userBreakdown = await RouletteTicket.aggregate([
			{
				$match: {
					roulette: rouletteId.toString(),
				},
			},
			{
				$group: {
					_id: '$user',
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: {
						$sum: { $ifNull: ['$totalAmountWon', 0] },
					},
					ticketCount: { $sum: 1 },
					winningTicketCount: {
						$sum: {
							$cond: [
								{
									$gt: [
										{ $ifNull: ['$totalAmountWon', 0] },
										0,
									],
								},
								1,
								0,
							],
						},
					},
				},
			},
			{
				$sort: { totalAmountPlayed: -1 },
			},
			{
				$limit: 10,
			},
			{
				$lookup: {
					from: 'users',
					localField: '_id',
					foreignField: '_id',
					as: 'userInfo',
				},
			},
			{
				$unwind: {
					path: '$userInfo',
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$project: {
					userId: '$_id',
					userName: '$userInfo.userName',
					email: '$userInfo.email',
					totalAmountPlayed: 1,
					totalAmountWon: 1,
					ticketCount: 1,
					winningTicketCount: 1,
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				rouletteDetails: {
					roulette: roulette.toObject(),
					tickets,
					ticketStatistics: {
						...stats,
						profit: stats.totalAmountPlayed - stats.totalAmountWon,
						profitMargin:
							stats.totalAmountPlayed > 0
								? ((stats.totalAmountPlayed -
										stats.totalAmountWon) /
										stats.totalAmountPlayed) *
									100
								: 0,
					},
					winningNumberBreakdown,
					cashTypeBreakdown,
					userBreakdown,
				},
			},
		};
	} catch (error) {
		console.error('Get roulette details error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch roulette details',
			},
		};
	}
};
