import moment from 'moment';
import {
	Lottery,
	LotteryRestriction,
	PopularNumbers,
} from '../../lottery/model';
import { BorletteTicket } from '../../borlette_ticket/model';
import { State } from '../state-management/model';

// ===== LIST BORLETTE LOTTERIES =====

export const listBorlette = async query => {
	try {
		const {
			page = 1,
			limit = 20,
			status,
			stateId,
			type = 'BORLETTE',
			startDate,
			endDate,
			search,
			sortBy = 'createdAt',
			sortOrder = 'desc',
			minAmount,
			maxAmount,
			cashType,
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

		// Check if any ticket filters are applied
		const hasTicketFilters = 
			(minAmount !== undefined && minAmount !== null && minAmount !== '' && minAmount !== 'undefined') ||
			(maxAmount !== undefined && maxAmount !== null && maxAmount !== '' && maxAmount !== 'undefined') ||
			(cashType && cashType.trim() !== '' && cashType !== 'undefined') ||
			(startDate && startDate !== 'undefined' && startDate !== null && startDate !== '') ||
			(endDate && endDate !== 'undefined' && endDate !== null && endDate !== '');

		// If ticket filters are applied, we need to filter lotteries by tickets first
		// Otherwise, we can paginate normally
		let lotteries;
		let total;

		if (hasTicketFilters) {
			// Get all lotteries matching the lottery filter (without pagination)
			const allLotteries = await Lottery.find(filter)
				.populate('state', 'name code')
				.populate('createdBy', 'name userName email')
				.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
				.exec();

			// Build ticket match filter template (without lottery ID)
			const ticketMatchFilterTemplate = {
				status: { $ne: 'CANCELLED' },
			};

			// Add date filters for tickets
			if ((startDate && startDate !== 'undefined') || (endDate && endDate !== 'undefined')) {
				const dateFilter = {};
				let hasDateFilter = false;
				
				if (startDate && startDate !== 'undefined' && startDate !== null && startDate !== '') {
					const startTimestamp = parseInt(startDate);
					if (!isNaN(startTimestamp) && startTimestamp > 0) {
						dateFilter.$gte = startTimestamp;
						hasDateFilter = true;
					}
				}
				if (endDate && endDate !== 'undefined' && endDate !== null && endDate !== '') {
					const endTimestamp = parseInt(endDate);
					if (!isNaN(endTimestamp) && endTimestamp > 0) {
						dateFilter.$lte = endTimestamp;
						hasDateFilter = true;
					}
				}
				
				if (hasDateFilter && Object.keys(dateFilter).length > 0) {
					ticketMatchFilterTemplate.purchasedOn = dateFilter;
				}
			}

			// Add amount filters
			if (minAmount !== undefined && minAmount !== null && minAmount !== '' && minAmount !== 'undefined') {
				const min = parseFloat(minAmount);
				if (!isNaN(min) && min >= 0) {
					if (!ticketMatchFilterTemplate.totalAmountPlayed) {
						ticketMatchFilterTemplate.totalAmountPlayed = {};
					}
					ticketMatchFilterTemplate.totalAmountPlayed.$gte = min;
				}
			}
			if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '' && maxAmount !== 'undefined') {
				const max = parseFloat(maxAmount);
				if (!isNaN(max) && max >= 0) {
					if (!ticketMatchFilterTemplate.totalAmountPlayed) {
						ticketMatchFilterTemplate.totalAmountPlayed = {};
					}
					ticketMatchFilterTemplate.totalAmountPlayed.$lte = max;
				}
			}

			// Add cashType filter
			if (cashType && cashType.trim() !== '' && cashType !== 'undefined') {
				const upperCashType = cashType.toUpperCase().trim();
				if (upperCashType === 'REAL' || upperCashType === 'VIRTUAL') {
					ticketMatchFilterTemplate.cashType = upperCashType;
				}
			}

			// Filter lotteries that have at least one ticket matching the criteria
			const lotteriesWithTickets = await Promise.all(
				allLotteries.map(async lottery => {
					const ticketCount = await BorletteTicket.countDocuments({
						...ticketMatchFilterTemplate,
						lottery: lottery._id.toString(),
					});
					return ticketCount > 0 ? lottery : null;
				})
			);

			// Remove null entries (lotteries with no matching tickets)
			const filteredLotteries = lotteriesWithTickets.filter(l => l !== null);

			// Apply pagination
			const skip = (page - 1) * limit;
			lotteries = filteredLotteries.slice(skip, skip + parseInt(limit));
			total = filteredLotteries.length;
		} else {
			// No ticket filters, paginate normally
			const skip = (page - 1) * limit;
			lotteries = await Lottery.find(filter)
				.populate('state', 'name code')
				.populate('createdBy', 'name userName email')
				.skip(skip)
				.limit(parseInt(limit))
				.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
				.exec();
			total = await Lottery.countDocuments(filter);
		}

		// Enrich with ticket statistics
		const enrichedLotteriesPromises = lotteries.map(async lottery => {
			const lotteryId = lottery._id.toString();

			// Build ticket match filter
			const ticketMatchFilter = {
				lottery: lotteryId,
				status: { $ne: 'CANCELLED' },
			};

			// Add date filters for tickets (filter by purchasedOn timestamp)
			if ((startDate && startDate !== 'undefined') || (endDate && endDate !== 'undefined')) {
				const dateFilter = {};
				let hasDateFilter = false;
				
				if (startDate && startDate !== 'undefined' && startDate !== null && startDate !== '') {
					const startTimestamp = parseInt(startDate);
					if (!isNaN(startTimestamp) && startTimestamp > 0) {
						dateFilter.$gte = startTimestamp;
						hasDateFilter = true;
					}
				}
				if (endDate && endDate !== 'undefined' && endDate !== null && endDate !== '') {
					const endTimestamp = parseInt(endDate);
					if (!isNaN(endTimestamp) && endTimestamp > 0) {
						dateFilter.$lte = endTimestamp;
						hasDateFilter = true;
					}
				}
				
				if (hasDateFilter && Object.keys(dateFilter).length > 0) {
					ticketMatchFilter.purchasedOn = dateFilter;
				}
			}

			// Add amount filters
			if (minAmount !== undefined && minAmount !== null && minAmount !== '' && minAmount !== 'undefined') {
				const min = parseFloat(minAmount);
				if (!isNaN(min) && min >= 0) {
					if (!ticketMatchFilter.totalAmountPlayed) {
						ticketMatchFilter.totalAmountPlayed = {};
					}
					ticketMatchFilter.totalAmountPlayed.$gte = min;
				}
			}
			if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '' && maxAmount !== 'undefined') {
				const max = parseFloat(maxAmount);
				if (!isNaN(max) && max >= 0) {
					if (!ticketMatchFilter.totalAmountPlayed) {
						ticketMatchFilter.totalAmountPlayed = {};
					}
					ticketMatchFilter.totalAmountPlayed.$lte = max;
				}
			}

			// Add cashType filter
			if (cashType && cashType.trim() !== '' && cashType !== 'undefined') {
				const upperCashType = cashType.toUpperCase().trim();
				if (upperCashType === 'REAL' || upperCashType === 'VIRTUAL') {
					ticketMatchFilter.cashType = upperCashType;
				}
			}

			// Get ticket statistics with separate real and virtual amounts
			const ticketStats = await BorletteTicket.aggregate([
					{
						$match: ticketMatchFilter,
					},
					{
						$group: {
							_id: null,
							totalTickets: { $sum: 1 },
							totalAmountPlayed: { $sum: '$totalAmountPlayed' },
							totalAmountWon: {
								$sum: { $ifNull: ['$totalAmountWon', 0] },
							},
							totalRealAmountPlayed: {
								$sum: {
									$cond: [
										{ $eq: ['$cashType', 'REAL'] },
										'$totalAmountPlayed',
										0,
									],
								},
							},
							totalVirtualAmountPlayed: {
								$sum: {
									$cond: [
										{ $eq: ['$cashType', 'VIRTUAL'] },
										'$totalAmountPlayed',
										0,
									],
								},
							},
							totalRealAmountWon: {
								$sum: {
									$cond: [
										{ $eq: ['$cashType', 'REAL'] },
										{ $ifNull: ['$totalAmountWon', 0] },
										0,
									],
								},
							},
							totalVirtualAmountWon: {
								$sum: {
									$cond: [
										{ $eq: ['$cashType', 'VIRTUAL'] },
										{ $ifNull: ['$totalAmountWon', 0] },
										0,
									],
								},
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
							totalRealAmountPlayed: 0,
							totalVirtualAmountPlayed: 0,
							totalRealAmountWon: 0,
							totalVirtualAmountWon: 0,
							winningTickets: 0,
						};

			const profit = stats.totalAmountPlayed - stats.totalAmountWon;
			const profitReal = stats.totalRealAmountPlayed - stats.totalRealAmountWon;
			const profitVirtual = stats.totalVirtualAmountPlayed - stats.totalVirtualAmountWon;

			return {
				...lottery.toObject(),
				statistics: {
					...stats,
					profit,
					profitReal,
					profitVirtual,
					profitMargin:
						stats.totalAmountPlayed > 0
							? (profit / stats.totalAmountPlayed) * 100
							: 0,
					profitMarginReal:
						stats.totalRealAmountPlayed > 0
							? (profitReal / stats.totalRealAmountPlayed) * 100
							: 0,
					profitMarginVirtual:
						stats.totalVirtualAmountPlayed > 0
							? (profitVirtual / stats.totalVirtualAmountPlayed) * 100
							: 0,
				},
			};
		});

		// Wait for all promises to resolve
		const enrichedLotteries = await Promise.all(enrichedLotteriesPromises);

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
		console.error('List borlette error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch borlette lotteries',
			},
		};
	}
};

// ===== GET BORLETTE DETAILS =====

export const getBorletteDetails = async lotteryId => {
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
		const ticketsRaw = await BorletteTicket.find({
			lottery: lotteryId,
		})
			.populate('user', 'name email phone userName')
			.sort({ createdAt: -1 })
			.exec();

		// Transform tickets to separate real and virtual cash
		const tickets = ticketsRaw.map(ticket => {
			const ticketObj = ticket.toObject();
			const isReal = ticketObj.cashType === 'REAL';
			const isVirtual = ticketObj.cashType === 'VIRTUAL';

			return {
				...ticketObj,
				totalAmountPlayedReal: isReal ? ticketObj.totalAmountPlayed : 0,
				totalAmountPlayedVirtual: isVirtual ? ticketObj.totalAmountPlayed : 0,
				totalAmountWonReal: isReal ? (ticketObj.totalAmountWon || 0) : 0,
				totalAmountWonVirtual: isVirtual ? (ticketObj.totalAmountWon || 0) : 0,
				numbers: ticketObj.numbers.map(num => ({
					...num,
					amountPlayedReal: isReal ? num.amountPlayed : 0,
					amountPlayedVirtual: isVirtual ? num.amountPlayed : 0,
					amountWonReal: isReal ? (num.amountWon || 0) : 0,
					amountWonVirtual: isVirtual ? (num.amountWon || 0) : 0,
				})),
			};
		});

		// Get lottery restrictions
		const restrictions = await LotteryRestriction.findOne({
			lottery: lotteryId.toString(),
		}).exec();

		// Calculate ticket statistics - separate by cash type
		const ticketStats = await BorletteTicket.aggregate([
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
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: {
						$sum: { $ifNull: ['$totalAmountWon', 0] },
					},
					totalAmountPlayedReal: {
						$sum: {
							$cond: [{ $eq: ['$cashType', 'REAL'] }, '$totalAmountPlayed', 0],
						},
					},
					totalAmountPlayedVirtual: {
						$sum: {
							$cond: [{ $eq: ['$cashType', 'VIRTUAL'] }, '$totalAmountPlayed', 0],
						},
					},
					totalAmountWonReal: {
						$sum: {
							$cond: [
								{ $eq: ['$cashType', 'REAL'] },
								{ $ifNull: ['$totalAmountWon', 0] },
								0,
							],
						},
					},
					totalAmountWonVirtual: {
						$sum: {
							$cond: [
								{ $eq: ['$cashType', 'VIRTUAL'] },
								{ $ifNull: ['$totalAmountWon', 0] },
								0,
							],
						},
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
						totalAmountPlayedReal: 0,
						totalAmountPlayedVirtual: 0,
						totalAmountWonReal: 0,
						totalAmountWonVirtual: 0,
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

			// Calculate breakdown by winning number - separate by cash type
			const numberBreakdown = await BorletteTicket.aggregate([
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
						_id: {
							numberPlayed: '$numbers.numberPlayed',
							cashType: '$cashType',
						},
						totalAmountPlayed: { $sum: '$numbers.amountPlayed' },
						totalAmountWon: {
							$sum: { $ifNull: ['$numbers.amountWon', 0] },
						},
						ticketCount: { $sum: 1 },
					},
				},
				{
					$group: {
						_id: '$_id.numberPlayed',
						totalAmountPlayed: { $sum: '$totalAmountPlayed' },
						totalAmountWon: { $sum: '$totalAmountWon' },
						ticketCount: { $sum: '$ticketCount' },
						totalAmountPlayedReal: {
							$sum: {
								$cond: [
									{ $eq: ['$_id.cashType', 'REAL'] },
									'$totalAmountPlayed',
									0,
								],
							},
						},
						totalAmountPlayedVirtual: {
							$sum: {
								$cond: [
									{ $eq: ['$_id.cashType', 'VIRTUAL'] },
									'$totalAmountPlayed',
									0,
								],
							},
						},
						totalAmountWonReal: {
							$sum: {
								$cond: [
									{ $eq: ['$_id.cashType', 'REAL'] },
									'$totalAmountWon',
									0,
								],
							},
						},
						totalAmountWonVirtual: {
							$sum: {
								$cond: [
									{ $eq: ['$_id.cashType', 'VIRTUAL'] },
									'$totalAmountWon',
									0,
								],
							},
						},
						ticketCountReal: {
							$sum: {
								$cond: [
									{ $eq: ['$_id.cashType', 'REAL'] },
									'$ticketCount',
									0,
								],
							},
						},
						ticketCountVirtual: {
							$sum: {
								$cond: [
									{ $eq: ['$_id.cashType', 'VIRTUAL'] },
									'$ticketCount',
									0,
								],
							},
						},
					},
				},
				{
					$project: {
						_id: 1,
						totalAmountPlayed: 1,
						totalAmountWon: 1,
						ticketCount: 1,
						realCash: {
							totalAmountPlayed: '$totalAmountPlayedReal',
							totalAmountWon: '$totalAmountWonReal',
							ticketCount: '$ticketCountReal',
						},
						virtualCash: {
							totalAmountPlayed: '$totalAmountPlayedVirtual',
							totalAmountWon: '$totalAmountWonVirtual',
							ticketCount: '$ticketCountVirtual',
						},
					},
				},
				{
					$sort: { totalAmountWon: -1 },
				},
			]);

			winningNumbersBreakdown = {
				winningNumbers,
				numberBreakdown,
			};
		}

		// Get cash type breakdown
		const cashTypeBreakdown = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: lotteryId.toString(),
					status: { $ne: 'CANCELLED' },
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
						profitReal: stats.totalAmountPlayedReal - stats.totalAmountWonReal,
						profitVirtual: stats.totalAmountPlayedVirtual - stats.totalAmountWonVirtual,
						profitMarginReal:
							stats.totalAmountPlayedReal > 0
								? ((stats.totalAmountPlayedReal -
										stats.totalAmountWonReal) /
										stats.totalAmountPlayedReal) *
									100
								: 0,
						profitMarginVirtual:
							stats.totalAmountPlayedVirtual > 0
								? ((stats.totalAmountPlayedVirtual -
										stats.totalAmountWonVirtual) /
										stats.totalAmountPlayedVirtual) *
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
		console.error('Get borlette details error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch borlette details',
			},
		};
	}
};

// ===== CREATE LOTTERY RESTRICTIONS =====

// eslint-disable-next-line no-unused-vars
export const createLotteryRestriction = async (body, adminUser) => {
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

		// Validate lottery type is BORLETTE
		if (lottery.type !== 'BORLETTE') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Restrictions can only be created for BORLETTE lotteries',
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

		// Validate lottery type is BORLETTE
		if (lottery.type !== 'BORLETTE') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Restrictions can only be updated for BORLETTE lotteries',
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

// ===== CREATE POPULAR NUMBERS =====

export const createPopularNumbers = async (body, adminUser) => {
	try {
		const { stateId, numbers } = body;

		// Validate numbers array
		if (!numbers || !Array.isArray(numbers)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Numbers array is required',
				},
			};
		}

		// If stateId is provided, validate state exists
		// If stateId is null/undefined, it means global popular numbers
		let state = null;
		if (stateId) {
			state = await State.findById(stateId);
			if (!state) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'State not found',
					},
				};
			}
		}

		// Validate numbers format (2 or 3 digits)
		for (const number of numbers) {
			if (typeof number !== 'string' && typeof number !== 'number') {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Each number must be a string or number',
					},
				};
			}
			const numberStr = number.toString();
			if (!/^\d{2,3}$/.test(numberStr)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Number "${numberStr}" must be 2 or 3 digits`,
					},
				};
			}
		}

		// Check if popular numbers already exist
		const existingPopularNumbers = await PopularNumbers.findOne({
			state: stateId ? stateId.toString() : null,
		});

		if (existingPopularNumbers) {
			const errorMessage = stateId
				? 'Popular numbers already exist for this state. Use update endpoint to modify.'
				: 'Global popular numbers already exist. Use update endpoint to modify.';
			return {
				status: 409,
				entity: {
					success: false,
					error: errorMessage,
				},
			};
		}

		// Convert all numbers to strings and remove duplicates
		const uniqueNumbers = [...new Set(numbers.map(num => num.toString()))];

		// Create popular numbers
		const popularNumbers = await PopularNumbers.create({
			state: stateId ? stateId.toString() : null,
			numbers: uniqueNumbers,
			updatedBy: adminUser._id.toString(),
		});

		const successMessage = stateId
			? 'Popular numbers created successfully'
			: 'Global popular numbers created successfully';

		return {
			status: 201,
			entity: {
				success: true,
				message: successMessage,
				popularNumbers,
			},
		};
	} catch (error) {
		console.error('Create popular numbers error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to create popular numbers',
			},
		};
	}
};

// ===== UPDATE POPULAR NUMBERS =====

export const updatePopularNumbers = async (stateId, body, adminUser) => {
	try {
		const { numbers } = body;

		// Handle global popular numbers (stateId is "global" or null)
		const isGlobal = !stateId || stateId === 'global' || stateId === 'null';
		let state = null;

		if (!isGlobal) {
			// Validate state exists
			state = await State.findById(stateId);
			if (!state) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'State not found',
					},
				};
			}
		}

		// Check if popular numbers exist
		const existingPopularNumbers = await PopularNumbers.findOne({
			state: isGlobal ? null : stateId.toString(),
		});

		if (!existingPopularNumbers) {
			const errorMessage = isGlobal
				? 'Global popular numbers not found. Use create endpoint to create popular numbers.'
				: 'Popular numbers not found for this state. Use create endpoint to create popular numbers.';
			return {
				status: 404,
				entity: {
					success: false,
					error: errorMessage,
				},
			};
		}

		// Validate numbers if provided
		if (numbers !== undefined) {
			if (!Array.isArray(numbers)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Numbers must be an array',
					},
				};
			}

			// Validate numbers format (2 or 3 digits)
			for (const number of numbers) {
				if (typeof number !== 'string' && typeof number !== 'number') {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Each number must be a string or number',
						},
					};
				}
				const numberStr = number.toString();
				if (!/^\d{2,3}$/.test(numberStr)) {
					return {
						status: 400,
						entity: {
							success: false,
							error: `Number "${numberStr}" must be 2 or 3 digits`,
						},
					};
				}
			}

			// Convert all numbers to strings and remove duplicates
			const uniqueNumbers = [
				...new Set(numbers.map(num => num.toString())),
			];

			// Update popular numbers
			existingPopularNumbers.numbers = uniqueNumbers;
			existingPopularNumbers.updatedBy = adminUser._id.toString();
			await existingPopularNumbers.save();

			const successMessage = isGlobal
				? 'Global popular numbers updated successfully'
				: 'Popular numbers updated successfully';

			return {
				status: 200,
				entity: {
					success: true,
					message: successMessage,
					popularNumbers: existingPopularNumbers,
				},
			};
		}

		return {
			status: 400,
			entity: {
				success: false,
				error: 'Numbers array is required for update',
			},
		};
	} catch (error) {
		console.error('Update popular numbers error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to update popular numbers',
			},
		};
	}
};

// ===== REMOVE POPULAR NUMBERS =====

// eslint-disable-next-line no-unused-vars
export const removePopularNumbers = async (stateId, adminUser) => {
	try {
		// Handle global popular numbers (stateId is "global" or null)
		const isGlobal = !stateId || stateId === 'global' || stateId === 'null';
		let state = null;

		if (!isGlobal) {
			// Validate state exists
			state = await State.findById(stateId);
			if (!state) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'State not found',
					},
				};
			}
		}

		// Find and remove popular numbers
		const popularNumbers = await PopularNumbers.findOneAndDelete({
			state: isGlobal ? null : stateId.toString(),
		});

		if (!popularNumbers) {
			const errorMessage = isGlobal
				? 'Global popular numbers not found'
				: 'Popular numbers not found for this state';
			return {
				status: 404,
				entity: {
					success: false,
					error: errorMessage,
				},
			};
		}

		const successMessage = isGlobal
			? 'Global popular numbers removed successfully'
			: 'Popular numbers removed successfully';

		return {
			status: 200,
			entity: {
				success: true,
				message: successMessage,
			},
		};
	} catch (error) {
		console.error('Remove popular numbers error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to remove popular numbers',
			},
		};
	}
};
