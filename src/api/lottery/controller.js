import moment from 'moment-timezone';
import { MegaMillionTicket } from '../megamillion_ticket/model';
import { BorletteTicket } from '../borlette_ticket/model';
import { Lottery, LotteryRestriction, PopularNumbers } from './model';
import { State } from '../admin/state-management/model';
import { LotteryDefaultConfig } from '../lottery-default-config/model';

// Helper function to get default jackpot amount for MEGAMILLION
const getDefaultJackpotAmount = async () => {
	try {
		const config = await LotteryDefaultConfig.findOne({
			lotteryType: 'MEGAMILLION',
		});

		if (!config || !config.jackpotAmount) {
			throw new Error(
				'Default jackpot amount is not configured for MEGAMILLION'
			);
		}

		return config.jackpotAmount;
	} catch (error) {
		console.error('Error getting default jackpot amount:', error);
		throw error;
	}
};

// Helper function to get the next draw date for a specific lottery configuration
const getNextDrawDate = lotteryConfig => {
	// Start checking from today to handle lotteries published near midnight
	// This prevents skipping today's lottery when published at 11:55 PM and runs at 00:00 AM
	const now = moment();

	// Find the next valid draw day starting from today
	let checkDate = now.clone().startOf('day');
	const maxDaysToCheck = 7; // Don't check more than a week ahead

	for (let i = 0; i < maxDaysToCheck; i++) {
		const dayName = checkDate.format('dddd');
		if (lotteryConfig.drawDays?.[dayName]) {
			// Calculate the actual draw time for this date
			const drawDateTime = moment.tz(
				`${checkDate.format('YYYY-MM-DD')} ${lotteryConfig.drawTime}`,
				lotteryConfig.drawTimezone
			);

			// Only return this date if the draw time is in the future
			if (drawDateTime.isAfter(now)) {
				return checkDate;
			}
		}
		checkDate.add(1, 'day');
	}

	// If no valid draw day found, return tomorrow as fallback
	return now.clone().add(1, 'day').startOf('day');
};

// Helper function to get the next valid draw time for a lottery config
// Returns the draw time (moment object) if valid (>1 hour away), null otherwise
const getNextValidDrawTime = lotteryConfig => {
	const now = moment();
	const oneHourFromNow = now.clone().add(1, 'hours');
	const maxDaysToCheck = 7; // Check up to 7 days ahead

	// Start checking from today in the lottery's timezone
	// This ensures we check the correct day based on the lottery's local time
	const nowInLotteryTz = moment.tz(lotteryConfig.drawTimezone);
	let checkDate = nowInLotteryTz.clone().startOf('day');

	for (let i = 0; i < maxDaysToCheck; i++) {
		const dayName = checkDate.format('dddd');
		if (lotteryConfig.drawDays?.[dayName]) {
			// Calculate the actual draw time for this date in the config's timezone
			const drawDateTime = moment.tz(
				`${checkDate.format('YYYY-MM-DD')} ${lotteryConfig.drawTime}`,
				lotteryConfig.drawTimezone
			);

			// Check if draw time is more than 1 hour away
			if (drawDateTime.isAfter(oneHourFromNow)) {
				return drawDateTime;
			}
		}
		checkDate.add(1, 'day');
	}

	// If no valid draw time found within 7 days, return null
	return null;
};

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
			// For MEGAMILLION, don't filter by state since it's shared across all states
			// For other lottery types, filter by state as usual
			if (!type || type.toUpperCase() !== 'MEGAMILLION') {
				params.state = stateId;
			}
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
			// For MEGAMILLION, don't filter by state since it's shared across all states
			// For other lottery types, filter by state as usual
			if (type && type.toUpperCase() !== 'MEGAMILLION') {
				params.state = stateId;
			}
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
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const closestUpcomingByState = async type => {
	try {
		const currentTime = moment.now();

		// Validate type parameter
		if (!type || !['BORLETTE', 'MEGAMILLION'].includes(type)) {
			return {
				status: 400,
				entity: {
					success: false,
					message:
						'Invalid type. Must be either BORLETTE or MEGAMILLION',
				},
			};
		}

		// Get all active states
		const activeStates = await State.find({ isActive: true })
			.select('_id name code')
			.lean();

		if (!activeStates.length) {
			return {
				status: 200,
				entity: {
					success: true,
					states: [],
					message: 'No active states found',
				},
			};
		}

		const stateIds = activeStates.map(state => state._id.toString());

		// Build match conditions for Lottery aggregation
		const matchConditions = {
			status: 'SCHEDULED',
			type: type,
			scheduledTime: { $gt: currentTime },
		};

		// For BORLETTE, filter by state. For MEGAMILLION, don't filter by state since it's shared
		if (type === 'BORLETTE') {
			matchConditions.state = { $in: stateIds };
		}

		let closestLotteries;

		if (type === 'MEGAMILLION') {
			// For MEGAMILLION, find the single shared lottery and return it for all states
			const sharedMegaMillionLottery = await Lottery.findOne(
				matchConditions
			)
				.sort({ scheduledTime: 1 })
				.populate('state', 'name code')
				.lean();

			if (sharedMegaMillionLottery) {
				// Return the same lottery for all active states
				closestLotteries = activeStates.map(state => ({
					state: {
						id: state._id,
						name: state.name,
						code: state.code,
					},
					lottery: {
						id: sharedMegaMillionLottery._id,
						title: sharedMegaMillionLottery.title,
						type: sharedMegaMillionLottery.type,
						scheduledTime: sharedMegaMillionLottery.scheduledTime,
						jackpotAmount: sharedMegaMillionLottery.jackpotAmount,
						metadata: sharedMegaMillionLottery.metadata,
						status: sharedMegaMillionLottery.status,
						countdown:
							sharedMegaMillionLottery.scheduledTime -
							currentTime,
					},
				}));
			} else {
				closestLotteries = [];
			}
		} else {
			// For BORLETTE, use the original aggregation logic
			closestLotteries = await Lottery.aggregate([
				{
					$match: matchConditions,
				},
				{
					$sort: { scheduledTime: 1 },
				},
				{
					$group: {
						_id: '$state',
						closestLottery: { $first: '$$ROOT' },
					},
				},
				{
					$lookup: {
						from: 'states',
						let: { stateId: '$_id' },
						pipeline: [
							{
								$match: {
									$expr: {
										$eq: [
											'$_id',
											{ $toObjectId: '$$stateId' },
										],
									},
								},
							},
						],
						as: 'stateInfo',
					},
				},
				{
					$unwind: '$stateInfo',
				},
				{
					$project: {
						state: {
							id: '$stateInfo._id',
							name: '$stateInfo.name',
							code: '$stateInfo.code',
						},
						lottery: {
							id: '$closestLottery._id',
							title: '$closestLottery.title',
							type: '$closestLottery.type',
							scheduledTime: '$closestLottery.scheduledTime',
							jackpotAmount: '$closestLottery.jackpotAmount',
							metadata: '$closestLottery.metadata',
							status: '$closestLottery.status',
							countdown: {
								$subtract: [
									'$closestLottery.scheduledTime',
									currentTime,
								],
							},
						},
					},
				},
				{
					$sort: { 'lottery.countdown': 1 }, // Sort by countdown (closest first)
				},
			]);
		}

		// Get the last winning numbers for each state
		const lastWinningsPromises = stateIds.map(async stateId => {
			// Build match conditions for last winning lottery
			const lastWinningMatch = {
				status: 'COMPLETED',
				results: { $ne: null }, // Only lotteries with results
			};

			// Add type filter if provided
			if (type) {
				lastWinningMatch.type = type;
			}

			// For BORLETTE, filter by state. For MEGAMILLION, don't filter by state since it's shared
			if (type === 'BORLETTE') {
				lastWinningMatch.state = stateId;
			}

			const lastWinningLottery = await Lottery.findOne(lastWinningMatch)
				.sort({ drawTime: -1 }) // Sort by most recent draw time
				.select('_id title type results drawTime metadata')
				.lean();

			return {
				stateId,
				lastWinning: lastWinningLottery,
			};
		});

		const lastWinningsData = await Promise.all(lastWinningsPromises);

		// Create a map for quick lookup
		const lastWinningsMap = {};
		lastWinningsData.forEach(({ stateId, lastWinning }) => {
			lastWinningsMap[stateId] = lastWinning;
		});

		// Enhance results with last winning numbers for states with upcoming lotteries
		const enhancedResults = closestLotteries.map(item => {
			const stateId = item.state.id.toString();
			const lastWinning = lastWinningsMap[stateId];

			return {
				...item,
				lastWinning: lastWinning
					? {
							lotteryId: lastWinning._id,
							title: lastWinning.title,
							type: lastWinning.type,
							metadata: lastWinning.metadata,
							drawTime: lastWinning.drawTime,
							results: lastWinning.results,
						}
					: null,
			};
		});

		const statesWithLotteries = closestLotteries.map(item =>
			item.state.id.toString()
		);

		const statesWithoutLotteries = activeStates
			.filter(
				state => !statesWithLotteries.includes(state._id.toString())
			)
			.map(state => {
				const stateId = state._id.toString();
				const lastWinning = lastWinningsMap[stateId];

				return {
					state: {
						id: state._id,
						name: state.name,
						code: state.code,
					},
					lottery: null,
					lastWinning: lastWinning
						? {
								lotteryId: lastWinning._id,
								title: lastWinning.title,
								type: lastWinning.type,
								metadata: lastWinning.metadata,
								drawTime: lastWinning.drawTime,
								results: lastWinning.results,
							}
						: null,
					message: 'No upcoming lotteries scheduled',
				};
			});

		const results = [...enhancedResults, ...statesWithoutLotteries];

		return {
			status: 200,
			entity: {
				success: true,
				states: results,
				total: results.length,
				summary: {
					totalStates: activeStates.length,
					statesWithUpcomingLotteries: closestLotteries.length,
					statesWithoutUpcomingLotteries:
						statesWithoutLotteries.length,
					statesWithLastWinnings: lastWinningsData.filter(
						item => item.lastWinning
					).length,
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

export const lastLottery = async ({
	type,
	metadata,
	stateId,
	offset = 0,
	count = 1,
	startDate,
	endDate,
}) => {
	try {
		const params = {
			status: 'COMPLETED',
			type: type.toUpperCase(),
		};
		if (metadata) {
			params.metadata = metadata;
		}
		if (stateId) {
			// For MEGAMILLION, don't filter by state since it's shared across all states
			// For other lottery types, filter by state as usual
			if (type.toUpperCase() !== 'MEGAMILLION') {
				params.state = stateId;
			}
		}
		if (startDate || endDate) {
			params['$and'] = params['$and'] || [];
			if (startDate) {
				params['$and'].push({
					scheduledTime: {
						$gte: parseInt(startDate),
					},
				});
			}
			if (endDate) {
				params['$and'].push({
					scheduledTime: {
						$lte: parseInt(endDate),
					},
				});
			}
		}

		// If count > 1, return multiple lotteries
		const lotteries = await Lottery.find(params)
			.sort({
				drawTime: -1,
			})
			.populate('state', 'name code') // Populate state information
			.skip(parseInt(offset))
			.limit(parseInt(count))
			.exec();

		// Get total count for pagination info
		const total = await Lottery.countDocuments(params);

		return {
			status: 200,
			entity: {
				success: true,
				lotteries,
				pagination: {
					offset: parseInt(offset),
					count: parseInt(count),
					total,
					hasMore: parseInt(offset) + parseInt(count) < total,
				},
			},
		};
	} catch (error) {
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const showUserTickets = async (
	{ id },
	{ _id },
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
			user: _id, // Always filter by user for user access
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
							user: _id, // Filter by user for user access
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
							user: _id, // Filter by user for user access
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

export const getPopularNumbers = async ({ stateId }) => {
	try {
		// If stateId is not provided, return global popular numbers
		if (!stateId) {
			const globalPopularNumbers = await PopularNumbers.findOne({
				state: null,
			}).exec();

			return {
				status: 200,
				entity: {
					success: true,
					popularNumbers: {
						state: null,
						numbers: globalPopularNumbers?.numbers || [],
						isGlobal: true,
					},
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

		// Get popular numbers for the state first
		let popularNumbers = await PopularNumbers.findOne({
			state: stateId.toString(),
		})
			.populate('state', 'name code')
			.exec();

		// If no state-specific popular numbers exist, fallback to global (state: null)
		if (!popularNumbers) {
			popularNumbers = await PopularNumbers.findOne({
				state: null,
			}).exec();

			if (!popularNumbers) {
				// No popular numbers at all (neither state-specific nor global)
				return {
					status: 200,
					entity: {
						success: true,
						popularNumbers: {
							state: {
								id: state._id,
								name: state.name,
								code: state.code,
							},
							numbers: [],
							isGlobal: false,
						},
					},
				};
			}

			// Return global popular numbers with state info
			return {
				status: 200,
				entity: {
					success: true,
					popularNumbers: {
						state: {
							id: state._id,
							name: state.name,
							code: state.code,
						},
						numbers: popularNumbers.numbers || [],
						isGlobal: true,
					},
				},
			};
		}

		// Return state-specific popular numbers
		return {
			status: 200,
			entity: {
				success: true,
				popularNumbers: {
					state: {
						id: popularNumbers.state._id || state._id,
						name: popularNumbers.state.name || state.name,
						code: popularNumbers.state.code || state.code,
					},
					numbers: popularNumbers.numbers || [],
					isGlobal: false,
				},
			},
		};
	} catch (error) {
		console.error('Get popular numbers error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch popular numbers',
			},
		};
	}
};

export const createLotteriesForState = async state => {
	try {
		console.log(`Creating lotteries for state ${state.name}`);
		const { externalLotteries, megaMillions } = state;
		let lotteriesCreated = 0;

		// Check if any pending BORLETTE lottery exists (SCHEDULED or WAITING)
		const existingPendingLottery = await Lottery.findOne({
			state: state._id,
			type: 'BORLETTE',
			status: { $in: ['SCHEDULED', 'WAITING'] },
		});

		if (!existingPendingLottery) {
			// Create BORLETTE lottery based on flexible configuration
			// Only create ONE lottery - the one with closest upcoming schedule time
			if (externalLotteries && externalLotteries.length > 0) {
				const validCandidates = [];

				// Collect all valid candidates (>1 hour away)
				for (const lotteryConfig of externalLotteries) {
					// Skip if missing required game IDs
					if (!lotteryConfig.pick4GameId) {
						console.log(
							`BORLETTE lottery ${lotteryConfig.name} for ${state.name} missing pick4GameId`
						);
						continue;
					}

					// Get the next valid draw time (>1 hour away)
					const drawTime = getNextValidDrawTime(lotteryConfig);

					if (!drawTime) {
						console.log(
							`BORLETTE lottery ${lotteryConfig.name} for ${state.name} has no valid draw time within 7 days`
						);
						continue;
					}

					// Check for duplicate (unique index constraint)
					// Only check for duplicates in SCHEDULED/WAITING status, not COMPLETED ones
					let duplicateCheck = null;
					if (lotteryConfig.pick3GameId) {
						duplicateCheck = await Lottery.findOne({
							state: state._id,
							'externalGameIds.pick3': lotteryConfig.pick3GameId,
							scheduledTime: drawTime.valueOf(),
							status: { $in: ['SCHEDULED', 'WAITING'] },
						});
					}

					// Also check pick4GameId constraint (required field)
					if (!duplicateCheck) {
						duplicateCheck = await Lottery.findOne({
							state: state._id,
							'externalGameIds.pick4': lotteryConfig.pick4GameId,
							scheduledTime: drawTime.valueOf(),
							status: { $in: ['SCHEDULED', 'WAITING'] },
						});
					}

					if (!duplicateCheck) {
						validCandidates.push({
							config: lotteryConfig,
							drawTime: drawTime,
							scheduledTime: drawTime.valueOf(),
						});
					} else {
						const duplicateType =
							duplicateCheck.externalGameIds?.pick4 ===
							lotteryConfig.pick4GameId
								? 'pick4'
								: 'pick3';
						console.log(
							`BORLETTE lottery for ${state.name} ${
								lotteryConfig.name
							} would violate unique constraint (state: ${
								state._id
							}, ${duplicateType}: ${
								duplicateType === 'pick4'
									? lotteryConfig.pick4GameId
									: lotteryConfig.pick3GameId
							}, time: ${drawTime.valueOf()})`
						);
					}
				}

				// Select the candidate with closest scheduledTime to current time
				if (validCandidates.length > 0) {
					validCandidates.sort((a, b) => {
						return a.scheduledTime - b.scheduledTime;
					});

					const selectedCandidate = validCandidates[0];
					const { config: lotteryConfig, drawTime } =
						selectedCandidate;

					// Create only the selected lottery
					const externalGameIds = {
						pick4: lotteryConfig.pick4GameId,
						pick3: lotteryConfig.pick3GameId || null,
					};

					try {
						await Lottery.create({
							title: lotteryConfig.name,
							type: 'BORLETTE',
							scheduledTime: selectedCandidate.scheduledTime,
							metadata: lotteryConfig.name.toLowerCase(),
							state: state._id,
							status: 'SCHEDULED',
							createdBy: null,
							externalGameIds,
							// Store whether this lottery supports marriage numbers
							additionalData: {
								hasMarriageNumbers:
									lotteryConfig.hasMarriageNumbers,
							},
						});

						console.log(
							`Created new BORLETTE lottery for ${state.name} ${
								lotteryConfig.name
							} at ${drawTime.format('YYYY-MM-DD HH:mm:ss z')}`
						);
						lotteriesCreated++;
					} catch (createError) {
						if (createError.code === 11000) {
							console.log(
								`Duplicate lottery creation prevented for ${state.name} ${lotteryConfig.name}:`,
								createError.keyValue
							);
						} else {
							console.error(
								`Error creating lottery for ${state.name} ${lotteryConfig.name}:`,
								createError
							);
							throw createError;
						}
					}
				} else {
					console.log(
						`No valid BORLETTE lottery candidates found for ${state.name}`
					);
				}
			}
		} else {
			console.log(
				`Pending BORLETTE lottery already exists for ${state.name}, skipping creation`
			);
		}

		// Create for Mega Millions
		if (megaMillions?.gameId && megaMillions?.drawDays) {
			// Check if there's already a SCHEDULED Mega Millions lottery for ANY state
			// Since MegaMillions is a multi-state lottery, there should only be one SCHEDULED at any time
			const existingScheduledMegaMillionLottery = await Lottery.findOne({
				type: 'MEGAMILLION',
				status: 'SCHEDULED',
			});

			if (!existingScheduledMegaMillionLottery) {
				// Get the next valid draw date for MegaMillions
				const nextMegaDrawDate = getNextDrawDate(megaMillions);
				const nextMegaDrawDayName = nextMegaDrawDate.format('dddd');

				// Check if MegaMillions runs on this day
				if (megaMillions.drawDays[nextMegaDrawDayName]) {
					// Create a new lottery for next draw date
					const drawTime = moment.tz(
						`${nextMegaDrawDate.format('YYYY-MM-DD')} ${
							megaMillions.drawTime
						}`,
						megaMillions.drawTimezone
					);

					// Get the configured default jackpot amount
					const defaultJackpotAmount =
						await getDefaultJackpotAmount();

					await Lottery.create({
						title: 'Mega Millions',
						type: 'MEGAMILLION',
						scheduledTime: drawTime.valueOf(),
						jackpotAmount: defaultJackpotAmount,
						state: state._id,
						status: 'SCHEDULED',
						createdBy: null,
						externalGameIds: {
							megaMillions: megaMillions.gameId,
						},
					});

					console.log(
						`Created new MEGAMILLION lottery (shared across all states)`
					);
					lotteriesCreated++;
				} else {
					console.log(
						`MEGAMILLION lottery does not run on ${nextMegaDrawDayName}`
					);
				}
			} else {
				console.log(
					`MEGAMILLION lottery already exists (shared across all states)`
				);
			}
		}

		return {
			success: true,
			lotteriesCreated,
			message:
				lotteriesCreated > 0
					? `Lotteries created for state: ${state.name} (${lotteriesCreated} new lotteries)`
					: `No new lotteries needed for state: ${state.name}`,
		};
	} catch (error) {
		console.error(
			`Error creating lotteries for state ${state.name}:`,
			error
		);
		return {
			success: false,
			error: error.message,
		};
	}
};
