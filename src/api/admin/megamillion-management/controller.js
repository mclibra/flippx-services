import moment from 'moment';
import { Lottery, LotteryRestriction } from '../../lottery/model';
import { MegaMillionTicket } from '../../megamillion_ticket/model';
import { LotteryDefaultConfig } from '../../lottery-default-config/model';

// ===== LIST MEGAMILLION LOTTERIES =====

export const listMegamillion = async query => {
	try {
		const {
			page = 1,
			limit = 20,
			status,
			stateId,
			type = 'MEGAMILLION',
			startDate,
			endDate,
			search,
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = query;

		// Build filter object
		const filter = {
			type: type.toUpperCase(),
		};

		// Status filter
		if (status) {
			filter.status = status.toUpperCase();
		}

		// State filter
		if (stateId) {
			filter.state = stateId;
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

		// Search functionality (title, metadata)
		if (search) {
			filter.$or = [
				{ title: new RegExp(search, 'i') },
				{ metadata: new RegExp(search, 'i') },
			];
		}

		// Calculate pagination
		const skip = (page - 1) * limit;

		// Get lotteries with populated data
		const lotteries = await Lottery.find(filter)
			.populate('state', 'name code')
			.populate('createdBy', 'name userName email')
			.skip(skip)
			.limit(parseInt(limit))
			.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
			.exec();

		// Get total count
		const total = await Lottery.countDocuments(filter);

		// Enrich with ticket statistics
		const enrichedLotteries = await Promise.all(
			lotteries.map(async lottery => {
				const lotteryId = lottery._id.toString();

				// Get ticket statistics
				const ticketStats = await MegaMillionTicket.aggregate([
					{
						$match: {
							lottery: lotteryId,
							status: { $ne: 'CANCELLED' },
						},
					},
					{
						$group: {
							_id: null,
							totalTickets: { $sum: 1 },
							totalAmountPlayed: { $sum: '$amountPlayed' },
							totalAmountWon: {
								$sum: { $ifNull: ['$amountWon', 0] },
							},
							winningTickets: {
								$sum: {
									$cond: [
										{
											$gt: [
												{ $ifNull: ['$amountWon', 0] },
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
					...lottery.toObject(),
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
				lotteries: enrichedLotteries,
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
		console.error('List megamillion error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch megamillion lotteries',
			},
		};
	}
};

// ===== GET MEGAMILLION DETAILS =====

export const getMegamillionDetails = async lotteryId => {
	try {
		// Get lottery with full details
		const lottery = await Lottery.findById(lotteryId)
			.populate('state', 'name code')
			.populate('createdBy', 'name userName email')
			.exec();

		if (!lottery) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Lottery not found',
				},
			};
		}

		// Get all tickets for this lottery
		const tickets = await MegaMillionTicket.find({
			lottery: lotteryId,
		})
			.populate('user', 'name email phone userName')
			.sort({ createdAt: -1 })
			.exec();

		// Get lottery restrictions
		const restrictions = await LotteryRestriction.findOne({
			lottery: lotteryId.toString(),
		}).exec();

		// Calculate ticket statistics
		const ticketStats = await MegaMillionTicket.aggregate([
			{
				$match: {
					lottery: lotteryId.toString(),
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalAmountPlayed: { $sum: '$amountPlayed' },
					totalAmountWon: {
						$sum: { $ifNull: ['$amountWon', 0] },
					},
					winningTickets: {
						$sum: {
							$cond: [
								{
									$gt: [{ $ifNull: ['$amountWon', 0] }, 0],
								},
								1,
								0,
							],
						},
					},
					activeTickets: {
						$sum: {
							$cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0],
						},
					},
					completedTickets: {
						$sum: {
							$cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0],
						},
					},
					cancelledTickets: {
						$sum: {
							$cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0],
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
						activeTickets: 0,
						completedTickets: 0,
						cancelledTickets: 0,
					};

		// Get winning numbers breakdown
		let winningNumbersBreakdown = null;
		if (lottery.results && lottery.results.numbers) {
			const winningNumbers = lottery.results.numbers.map(n =>
				n.toString()
			);
			const winningMegaBall = lottery.results.megaBall
				? lottery.results.megaBall.toString()
				: null;

			// Calculate breakdown by winning number
			const numberBreakdown = await MegaMillionTicket.aggregate([
				{
					$match: {
						lottery: lotteryId.toString(),
						status: { $ne: 'CANCELLED' },
					},
				},
				{
					$unwind: '$numbers',
				},
				{
					$group: {
						_id: '$numbers',
						totalAmountPlayed: { $sum: '$amountPlayed' },
						totalAmountWon: {
							$sum: { $ifNull: ['$amountWon', 0] },
						},
						ticketCount: { $sum: 1 },
					},
				},
				{
					$sort: { totalAmountWon: -1 },
				},
			]);

			// Calculate mega ball breakdown
			const megaBallBreakdown = await MegaMillionTicket.aggregate([
				{
					$match: {
						lottery: lotteryId.toString(),
						status: { $ne: 'CANCELLED' },
						megaBall: { $ne: null },
					},
				},
				{
					$group: {
						_id: '$megaBall',
						totalAmountPlayed: { $sum: '$amountPlayed' },
						totalAmountWon: {
							$sum: { $ifNull: ['$amountWon', 0] },
						},
						ticketCount: { $sum: 1 },
					},
				},
				{
					$sort: { totalAmountWon: -1 },
				},
			]);

			winningNumbersBreakdown = {
				winningNumbers,
				winningMegaBall,
				numberBreakdown,
				megaBallBreakdown,
			};
		}

		// Get cash type breakdown
		const cashTypeBreakdown = await MegaMillionTicket.aggregate([
			{
				$match: {
					lottery: lotteryId.toString(),
					status: { $ne: 'CANCELLED' },
				},
			},
			{
				$group: {
					_id: '$cashType',
					totalAmountPlayed: { $sum: '$amountPlayed' },
					totalAmountWon: {
						$sum: { $ifNull: ['$amountWon', 0] },
					},
					ticketCount: { $sum: 1 },
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				lotteryDetails: {
					lottery: lottery.toObject(),
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
					restrictions: restrictions || null,
					winningNumbersBreakdown,
					cashTypeBreakdown,
				},
			},
		};
	} catch (error) {
		console.error('Get megamillion details error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch megamillion details',
			},
		};
	}
};

// ===== CREATE LOTTERY RESTRICTIONS =====

export const createLotteryRestriction = async body => {
	try {
		const {
			lotteryId,
			twoDigit,
			threeDigit,
			fourDigit,
			marriageNumber,
			individualNumber,
		} = body;

		// Validate required fields
		if (!lotteryId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Lottery ID is required',
				},
			};
		}

		// Validate lottery exists
		const lottery = await Lottery.findById(lotteryId);
		if (!lottery) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Lottery not found',
				},
			};
		}

		// Validate lottery type is MEGAMILLION
		if (lottery.type !== 'MEGAMILLION') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Restrictions can only be created for MEGAMILLION lotteries',
				},
			};
		}

		// Check if restrictions already exist
		const existingRestriction = await LotteryRestriction.findOne({
			lottery: lotteryId.toString(),
		});

		if (existingRestriction) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'Restrictions already exist for this lottery. Use update endpoint to modify.',
				},
			};
		}

		// Validate individualNumber format if provided
		if (individualNumber && Array.isArray(individualNumber)) {
			for (const item of individualNumber) {
				if (
					!item.number ||
					item.limit === undefined ||
					item.limit === null
				) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Each individualNumber must have both number and limit fields',
						},
					};
				}
			}
		}

		// Create restriction data
		const restrictionData = {
			lottery: lotteryId.toString(),
			...(twoDigit !== undefined && { twoDigit }),
			...(threeDigit !== undefined && { threeDigit }),
			...(fourDigit !== undefined && { fourDigit }),
			...(marriageNumber !== undefined && { marriageNumber }),
			...(individualNumber && { individualNumber }),
		};

		// Create restriction
		const restriction = await LotteryRestriction.create(restrictionData);

		return {
			status: 201,
			entity: {
				success: true,
				message: 'Lottery restriction created successfully',
				restriction,
			},
		};
	} catch (error) {
		console.error('Create lottery restriction error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to create lottery restriction',
			},
		};
	}
};

// ===== UPDATE LOTTERY RESTRICTIONS =====

export const updateLotteryRestriction = async (lotteryId, body) => {
	try {
		const {
			twoDigit,
			threeDigit,
			fourDigit,
			marriageNumber,
			individualNumber,
		} = body;

		// Validate lottery exists
		const lottery = await Lottery.findById(lotteryId);
		if (!lottery) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Lottery not found',
				},
			};
		}

		// Validate lottery type is MEGAMILLION
		if (lottery.type !== 'MEGAMILLION') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Restrictions can only be updated for MEGAMILLION lotteries',
				},
			};
		}

		// Check if restrictions exist
		const existingRestriction = await LotteryRestriction.findOne({
			lottery: lotteryId.toString(),
		});

		if (!existingRestriction) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Restrictions not found for this lottery. Use create endpoint to create restrictions.',
				},
			};
		}

		// Validate individualNumber format if provided
		if (individualNumber && Array.isArray(individualNumber)) {
			for (const item of individualNumber) {
				if (
					!item.number ||
					item.limit === undefined ||
					item.limit === null
				) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Each individualNumber must have both number and limit fields',
						},
					};
				}
			}
		}

		// Prepare update data (only include fields that are provided)
		const updateData = {};
		if (twoDigit !== undefined) updateData.twoDigit = twoDigit;
		if (threeDigit !== undefined) updateData.threeDigit = threeDigit;
		if (fourDigit !== undefined) updateData.fourDigit = fourDigit;
		if (marriageNumber !== undefined)
			updateData.marriageNumber = marriageNumber;
		if (individualNumber !== undefined)
			updateData.individualNumber = individualNumber;

		// Update restriction
		const restriction = await LotteryRestriction.findOneAndUpdate(
			{
				lottery: lotteryId.toString(),
			},
			updateData,
			{
				new: true,
				runValidators: true,
			}
		);

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Lottery restriction updated successfully',
				restriction,
			},
		};
	} catch (error) {
		console.error('Update lottery restriction error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to update lottery restriction',
			},
		};
	}
};

// ===== GET DEFAULT JACKPOT AMOUNT =====

export const getDefaultJackpotAmount = async () => {
	try {
		const config = await LotteryDefaultConfig.findOne({
			lotteryType: 'MEGAMILLION',
		});

		// If no config exists, return default value
		const defaultJackpotAmount = config
			? config.defaultJackpotAmount
			: 1000000; // Default to 1 million

		return {
			status: 200,
			entity: {
				success: true,
				defaultJackpotAmount,
				config: config || null,
			},
		};
	} catch (error) {
		console.error('Get default jackpot amount error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					error.message || 'Failed to retrieve default jackpot amount',
			},
		};
	}
};

// ===== SET DEFAULT JACKPOT AMOUNT =====

export const setDefaultJackpotAmount = async (body, user) => {
	try {
		const { defaultJackpotAmount, description } = body;

		// Validation
		if (
			defaultJackpotAmount === undefined ||
			defaultJackpotAmount === null
		) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Default jackpot amount is required',
				},
			};
		}

		if (
			typeof defaultJackpotAmount !== 'number' ||
			defaultJackpotAmount < 0
		) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Default jackpot amount must be a positive number',
				},
			};
		}

		// Find or create configuration
		const config = await LotteryDefaultConfig.findOneAndUpdate(
			{ lotteryType: 'MEGAMILLION' },
			{
				defaultJackpotAmount,
				updatedBy: user._id,
				description:
					description ||
					`Default jackpot amount set to $${defaultJackpotAmount.toLocaleString()}`,
			},
			{
				new: true,
				upsert: true,
				runValidators: true,
			}
		);

		return {
			status: 200,
			entity: {
				success: true,
				message: `Default jackpot amount for MEGAMILLION set to $${defaultJackpotAmount.toLocaleString()}`,
				config,
			},
		};
	} catch (error) {
		console.error('Set default jackpot amount error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to set default jackpot amount',
			},
		};
	}
};
