import mongoose from 'mongoose';
import moment from 'moment';
import {
	DominoGame,
	DominoRoom,
	DominoRoomPrice,
	DominoGameConfig,
} from '../../domino/model';

const { Types } = mongoose;
const DOMINO_ROOM_COLLECTION =
	DominoRoom?.collection?.collectionName || 'dominorooms';

const parseNumber = value => {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	const number = Number(value);
	return Number.isNaN(number) ? null : number;
};

const parseBoolean = value => {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true') {
			return true;
		}
		if (normalized === 'false') {
			return false;
		}
	}
	return null;
};

const parseDateInput = value => {
	if (!value) {
		return null;
	}
	const numeric = Number(value);
	if (!Number.isNaN(numeric)) {
		const date = moment(numeric);
		if (date.isValid()) {
			return date.toDate();
		}
	}
	const date = moment(value);
	return date.isValid() ? date.toDate() : null;
};

const normalizeEnum = (value, allowedValues) => {
	if (!value || typeof value !== 'string') {
		return null;
	}
	const upperCased = value.toUpperCase();
	return allowedValues.includes(upperCased) ? upperCased : null;
};

const getAdminUserId = adminUser => {
	if (!adminUser) {
		return undefined;
	}
	const id = adminUser._id || adminUser.id;
	if (!id) {
		return undefined;
	}
	if (id instanceof Types.ObjectId) {
		return id;
	}
	return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined;
};

const buildLeaderboard = players =>
	players
		.map(player => ({
			position: player.position,
			playerName: player.playerName,
			playerType: player.playerType,
			user: player.user || null,
			score: player.totalScore ?? player.score ?? 0,
		}))
		.sort((a, b) => b.score - a.score);

const buildPlayerSummary = player => ({
	position: player.position,
	playerName: player.playerName,
	playerType: player.playerType,
	user: player.user || null,
	score: player.score ?? null,
	totalScore: player.totalScore ?? null,
	isConnected: player.isConnected ?? null,
	lastAction: player.lastAction || null,
	tilesRemaining: Array.isArray(player.hand) ? player.hand.length : null,
});

const buildGameStatistics = (game, winRule) => {
	const players = Array.isArray(game.players) ? game.players : [];
	const totalPlayers = players.length;
	const humanPlayers = players.filter(
		player => player.playerType === 'HUMAN'
	).length;
	const computerPlayers = players.filter(
		player => player.playerType === 'COMPUTER'
	).length;
	const totalScore = players.reduce(
		(sum, player) => sum + (player.totalScore ?? player.score ?? 0),
		0
	);
	const highestScoringPlayer = players.reduce((highest, player) => {
		const playerScore = player.totalScore ?? player.score ?? 0;
		if (!highest || playerScore > highest.score) {
			return {
				position: player.position,
				playerName: player.playerName,
				playerType: player.playerType,
				score: playerScore,
			};
		}
		return highest;
	}, null);

	const leaderboard = buildLeaderboard(players);

	return {
		mode: winRule,
		totalPlayers,
		humanPlayers,
		computerPlayers,
		totalMoves: game.totalMoves || 0,
		duration: game.duration || 0,
		totalScore,
		averageScore: totalPlayers ? totalScore / totalPlayers : 0,
		totalPot:
			game.totalPot ??
			game.room?.totalPot ??
			(game.room?.players?.length || 0) * (game.room?.entryFee || 0),
		houseEdge: game.houseEdge ?? game.room?.houseEdge ?? 0,
		houseAmount: game.houseAmount ?? 0,
		winnerPosition: game.winner ?? null,
		endReason: game.endReason || null,
		targetPoints: winRule === 'POINTS' ? game.room?.gameSettings?.targetPoints || 0 : 0,
		leaderboard,
		highestScoringPlayer,
	};
};

const syncDominoEntryFees = async () => {
	const activePrices = await DominoRoomPrice.find({ isActive: true })
		.select('entryFee')
		.lean();

	const entryFees = [
		...new Set(
			activePrices
				.map(price => parseNumber(price.entryFee))
				.filter(value => value !== null)
		),
	].sort((a, b) => a - b);

	await DominoGameConfig.findOneAndUpdate(
		{},
		{ $set: { entryFees } },
		{ upsert: true }
	);
};

const transformRoom = room =>
	room
		? {
				id: room._id,
				roomId: room.roomId,
				status: room.status,
				roomType: room.roomType,
				playerCount: room.playerCount,
				entryFee: room.entryFee,
				cashType: room.cashType,
				opponentType: room.opponentType,
				totalPot: room.totalPot ?? 0,
				houseEdge: room.houseEdge ?? 0,
				gameSettings: room.gameSettings || {},
				createdAt: room.createdAt,
				updatedAt: room.updatedAt,
				startedAt: room.startedAt || null,
				completedAt: room.completedAt || null,
			}
		: null;

export const listDominoGames = async query => {
	try {
		const {
			page = 1,
			limit = 20,
			gameState,
			winRule,
			roomType,
			cashType,
			playerCount,
			opponentType,
			roomStatus,
			entryFee,
			minEntryFee,
			maxEntryFee,
			targetPoints,
			search,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = query;

		const pageNumber = Math.max(parseNumber(page) || 1, 1);
		const limitNumber = Math.min(Math.max(parseNumber(limit) || 20, 1), 100);
		const skip = (pageNumber - 1) * limitNumber;

		const basePipeline = [];

		const gameMatch = {};
		const normalizedGameState = normalizeEnum(gameState, [
			'ACTIVE',
			'COMPLETED',
			'BLOCKED',
			'CANCELLED',
		]);
		if (normalizedGameState) {
			gameMatch.gameState = normalizedGameState;
		}

		const startDateValue = parseDateInput(startDate);
		const endDateValue = parseDateInput(endDate);
		if (startDateValue || endDateValue) {
			gameMatch.createdAt = {};
			if (startDateValue) {
				gameMatch.createdAt.$gte = startDateValue;
			}
			if (endDateValue) {
				gameMatch.createdAt.$lte = endDateValue;
			}
		}

		if (Object.keys(gameMatch).length > 0) {
			basePipeline.push({ $match: gameMatch });
		}

		basePipeline.push({
			$lookup: {
				from: DOMINO_ROOM_COLLECTION,
				localField: 'room',
				foreignField: '_id',
				as: 'room',
			},
		});

		basePipeline.push({
			$unwind: { path: '$room', preserveNullAndEmptyArrays: true },
		});

		const roomFilters = [];

		const normalizedWinRule = normalizeEnum(winRule, ['STANDARD', 'POINTS']);
		if (normalizedWinRule) {
			roomFilters.push({
				'room.gameSettings.winRule': normalizedWinRule,
			});
		}

		const normalizedRoomType = normalizeEnum(roomType, ['PUBLIC', 'PRIVATE']);
		if (normalizedRoomType) {
			roomFilters.push({
				'room.roomType': normalizedRoomType,
			});
		}

		const normalizedCashType = normalizeEnum(cashType, ['REAL', 'VIRTUAL']);
		if (normalizedCashType) {
			roomFilters.push({
				'room.cashType': normalizedCashType,
			});
		}

		const normalizedOpponentType = normalizeEnum(opponentType, ['HUMAN', 'AI']);
		if (normalizedOpponentType) {
			roomFilters.push({
				'room.opponentType': normalizedOpponentType,
			});
		}

		const normalizedRoomStatus = normalizeEnum(roomStatus, [
			'WAITING',
			'IN_PROGRESS',
			'COMPLETED',
			'CANCELLED',
		]);
		if (normalizedRoomStatus) {
			roomFilters.push({
				'room.status': normalizedRoomStatus,
			});
		}

		const playerCountNumber = parseNumber(playerCount);
		if (playerCountNumber !== null) {
			roomFilters.push({
				'room.playerCount': playerCountNumber,
			});
		}

		const entryFeeNumber = parseNumber(entryFee);
		const minEntryFeeNumber = parseNumber(minEntryFee);
		const maxEntryFeeNumber = parseNumber(maxEntryFee);

		if (entryFeeNumber !== null) {
			roomFilters.push({
				'room.entryFee': entryFeeNumber,
			});
		} else if (minEntryFeeNumber !== null || maxEntryFeeNumber !== null) {
			const entryFeeRange = {};
			if (minEntryFeeNumber !== null) {
				entryFeeRange.$gte = minEntryFeeNumber;
			}
			if (maxEntryFeeNumber !== null) {
				entryFeeRange.$lte = maxEntryFeeNumber;
			}
			roomFilters.push({
				'room.entryFee': entryFeeRange,
			});
		}

		const targetPointsNumber = parseNumber(targetPoints);
		if (targetPointsNumber !== null) {
			roomFilters.push({
				'room.gameSettings.targetPoints': targetPointsNumber,
			});
		}

		if (roomFilters.length > 0) {
			basePipeline.push({
				$match: {
					$and: roomFilters,
				},
			});
		}

		if (search) {
			const trimmedSearch = search.trim();
			const regex = new RegExp(trimmedSearch, 'i');
			const searchConditions = [
				{ 'room.roomId': regex },
				{ 'players.playerName': regex },
			];

			if (Types.ObjectId.isValid(trimmedSearch)) {
				const objectId = new Types.ObjectId(trimmedSearch);
				searchConditions.push({ _id: objectId });
				searchConditions.push({ 'room._id': objectId });
			}

			const numericSearch = parseNumber(trimmedSearch);
			if (numericSearch !== null) {
				searchConditions.push({ 'room.entryFee': numericSearch });
				searchConditions.push({ totalPot: numericSearch });
			}

			basePipeline.push({
				$match: {
					$or: searchConditions,
				},
			});
		}

		const countPipeline = [...basePipeline, { $count: 'total' }];

		const sortFieldMap = {
			createdAt: 'createdAt',
			updatedAt: 'updatedAt',
			completedAt: 'completedAt',
			totalMoves: 'totalMoves',
			duration: 'duration',
			entryFee: 'room.entryFee',
			totalPot: 'room.totalPot',
		};

		const sortField = sortFieldMap[sortBy] || 'createdAt';
		const sortDirection = sortOrder === 'asc' ? 1 : -1;
		const sortStage = {
			[sortField]: sortDirection,
			_id: sortDirection,
		};

		const dataPipeline = [
			...basePipeline,
			{ $sort: sortStage },
			{ $skip: skip },
			{ $limit: limitNumber },
		];

		const [games, totalResult] = await Promise.all([
			DominoGame.aggregate(dataPipeline),
			DominoGame.aggregate(countPipeline),
		]);

		const total = totalResult.length > 0 ? totalResult[0].total : 0;

		const normalizedGames = games.map(game => {
			const winRuleValue =
				game.room?.gameSettings?.winRule || 'STANDARD';
			const players = Array.isArray(game.players)
				? game.players.map(buildPlayerSummary).sort((a, b) => a.position - b.position)
				: [];

			const statistics = buildGameStatistics(game, winRuleValue);

			return {
				id: game._id,
				gameNumber: game.gameNumber,
				gameState: game.gameState,
				currentPlayer: game.currentPlayer,
				createdAt: game.createdAt,
				updatedAt: game.updatedAt,
				completedAt: game.completedAt || null,
				duration: game.duration || 0,
				winRule: winRuleValue,
				targetPoints: game.room?.gameSettings?.targetPoints || 0,
				room: transformRoom(game.room),
				players,
				statistics,
			};
		});

		return {
			status: 200,
			entity: {
				success: true,
				games: normalizedGames,
				pagination: {
					page: pageNumber,
					limit: limitNumber,
					total,
					pages: Math.ceil(total / limitNumber),
					hasMore: pageNumber * limitNumber < total,
				},
			},
		};
	} catch (error) {
		console.error('List domino games error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch domino games',
			},
		};
	}
};

export const getDominoGameDetails = async gameId => {
	try {
		if (!Types.ObjectId.isValid(gameId)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid game ID',
				},
			};
		}

		const game = await DominoGame.findById(gameId)
			.populate({
				path: 'room',
				select:
					'roomId roomType status playerCount entryFee cashType totalPot houseEdge opponentType gameSettings startedAt completedAt createdAt updatedAt players',
			})
			.lean();

		if (!game) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Domino game not found',
				},
			};
		}

		const winRuleValue =
			game.room?.gameSettings?.winRule || 'STANDARD';
		const targetPointsValue =
			winRuleValue === 'POINTS'
				? game.room?.gameSettings?.targetPoints || 0
				: 0;

		const players = Array.isArray(game.players)
			? game.players
					.map(player => ({
						...buildPlayerSummary(player),
						hand: Array.isArray(player.hand) ? player.hand : [],
						totalScore: player.totalScore ?? player.score ?? 0,
						consecutivePasses: player.consecutivePasses ?? 0,
					}))
					.sort((a, b) => a.position - b.position)
			: [];

		const scoring = {
			mode: winRuleValue,
			targetPoints: targetPointsValue,
			leaderboard: buildLeaderboard(Array.isArray(game.players) ? game.players : []),
		};

		const statistics = buildGameStatistics(game, winRuleValue);

		return {
			status: 200,
			entity: {
				success: true,
				gameDetails: {
					id: game._id,
					gameNumber: game.gameNumber,
					gameState: game.gameState,
					currentPlayer: game.currentPlayer,
					createdAt: game.createdAt,
					updatedAt: game.updatedAt,
					completedAt: game.completedAt || null,
					duration: game.duration || 0,
					winRule: winRuleValue,
					targetPoints: targetPointsValue,
					room: transformRoom(game.room),
					players,
					moves: Array.isArray(game.moves) ? game.moves : [],
					finalScores: Array.isArray(game.finalScores) ? game.finalScores : [],
					rewards: {
						totalPot:
							game.totalPot ??
							game.room?.totalPot ??
							(players.length * (game.room?.entryFee || 0)),
						houseEdge: game.houseEdge ?? game.room?.houseEdge ?? 0,
						houseAmount: game.houseAmount ?? 0,
						winnerPayout: game.winnerPayout ?? 0,
					},
					statistics,
					scoring,
				},
			},
		};
	} catch (error) {
		console.error('Get domino game details error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch domino game details',
			},
		};
	}
};

export const listDominoRoomPrices = async query => {
	try {
		const {
			page = 1,
			limit = 20,
			winRule,
			roomType,
			cashType,
			playerCount,
			isActive,
			targetPoints,
			sortBy = 'displayOrder',
			sortOrder = 'asc',
		} = query;

		const filter = {};

		const normalizedWinRule = normalizeEnum(winRule, ['STANDARD', 'POINTS']);
		if (normalizedWinRule) {
			filter.winRule = normalizedWinRule;
		}

		const normalizedRoomType = normalizeEnum(roomType, ['PUBLIC', 'PRIVATE']);
		if (normalizedRoomType) {
			filter.roomType = normalizedRoomType;
		}

		const normalizedCashType = normalizeEnum(cashType, ['REAL', 'VIRTUAL']);
		if (normalizedCashType) {
			filter.cashType = normalizedCashType;
		}

		const playerCountNumber = parseNumber(playerCount);
		if (playerCountNumber !== null) {
			filter.playerCount = playerCountNumber;
		}

		const targetPointsNumber = parseNumber(targetPoints);
		if (targetPointsNumber !== null) {
			filter.targetPoints = targetPointsNumber;
		}

		const isActiveValue = parseBoolean(isActive);
		if (isActiveValue !== null) {
			filter.isActive = isActiveValue;
		}

		const pageNumber = Math.max(parseNumber(page) || 1, 1);
		const limitNumber = Math.min(Math.max(parseNumber(limit) || 20, 1), 100);
		const skip = (pageNumber - 1) * limitNumber;

		const sortFieldMap = {
			displayOrder: 'displayOrder',
			entryFee: 'entryFee',
			createdAt: 'createdAt',
			updatedAt: 'updatedAt',
		};
		const sortField = sortFieldMap[sortBy] || 'displayOrder';
		const sortDirection = sortOrder === 'desc' ? -1 : 1;
		const sortStage = {
			[sortField]: sortDirection,
			_id: sortDirection,
		};

		const [prices, total] = await Promise.all([
			DominoRoomPrice.find(filter)
				.sort(sortStage)
				.skip(skip)
				.limit(limitNumber)
				.populate('createdBy', 'name email userName')
				.populate('updatedBy', 'name email userName')
				.lean(),
			DominoRoomPrice.countDocuments(filter),
		]);

		return {
			status: 200,
			entity: {
				success: true,
				prices,
				pagination: {
					page: pageNumber,
					limit: limitNumber,
					total,
					pages: Math.ceil(total / limitNumber),
					hasMore: pageNumber * limitNumber < total,
				},
			},
		};
	} catch (error) {
		console.error('List domino room prices error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch domino room prices',
			},
		};
	}
};

export const createDominoRoomPrice = async (body, adminUser = {}) => {
	try {
		const normalizedWinRule =
			normalizeEnum(body.winRule, ['STANDARD', 'POINTS']) || 'STANDARD';
		const normalizedRoomType =
			normalizeEnum(body.roomType, ['PUBLIC', 'PRIVATE']) || 'PUBLIC';
		const normalizedCashType = normalizeEnum(body.cashType, ['REAL', 'VIRTUAL']);
		const playerCountNumber = parseNumber(body.playerCount);
		const entryFeeNumber = parseNumber(body.entryFee);
		const houseEdgeNumber = parseNumber(body.houseEdge) ?? 0;
		const targetPointsNumber = parseNumber(body.targetPoints) ?? 0;
		const displayOrderNumber = parseNumber(body.displayOrder) ?? 0;
		const isActiveValue = parseBoolean(
			body.isActive !== undefined ? body.isActive : true
		);

		if (!normalizedCashType) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'cashType must be REAL or VIRTUAL',
				},
			};
		}

		if (!playerCountNumber || ![2, 3, 4].includes(playerCountNumber)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'playerCount must be 2, 3, or 4',
				},
			};
		}

		if (entryFeeNumber === null || entryFeeNumber <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'entryFee must be a positive number',
				},
			};
		}

		if (houseEdgeNumber < 0 || houseEdgeNumber > 100) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'houseEdge must be between 0 and 100',
				},
			};
		}

		if (normalizedWinRule === 'POINTS' && targetPointsNumber <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'targetPoints must be greater than 0 for POINTS win rule',
				},
			};
		}

		const adminUserId = getAdminUserId(adminUser);

		const price = await DominoRoomPrice.create({
			winRule: normalizedWinRule,
			roomType: normalizedRoomType,
			playerCount: playerCountNumber,
			cashType: normalizedCashType,
			entryFee: entryFeeNumber,
			houseEdge: houseEdgeNumber,
			targetPoints: normalizedWinRule === 'POINTS' ? targetPointsNumber : 0,
			isActive: isActiveValue === null ? true : isActiveValue,
			displayOrder: displayOrderNumber,
			createdBy: adminUserId,
			updatedBy: adminUserId,
		});

		await syncDominoEntryFees();

		const populatedPrice = await DominoRoomPrice.findById(price._id)
			.populate('createdBy', 'name email userName')
			.populate('updatedBy', 'name email userName')
			.lean();

		return {
			status: 201,
			entity: {
				success: true,
				price: populatedPrice,
			},
		};
	} catch (error) {
		if (error.code === 11000) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'A room price with the same configuration already exists',
				},
			};
		}

		console.error('Create domino room price error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to create domino room price',
			},
		};
	}
};

export const updateDominoRoomPrice = async (
	priceId,
	body,
	adminUser = {}
) => {
	try {
		if (!Types.ObjectId.isValid(priceId)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid room price ID',
				},
			};
		}

		const price = await DominoRoomPrice.findById(priceId);
		if (!price) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Domino room price not found',
				},
			};
		}

		const updates = {};

		const normalizedWinRule = normalizeEnum(body.winRule, [
			'STANDARD',
			'POINTS',
		]);
		if (normalizedWinRule) {
			updates.winRule = normalizedWinRule;
		}

		const normalizedRoomType = normalizeEnum(body.roomType, [
			'PUBLIC',
			'PRIVATE',
		]);
		if (normalizedRoomType) {
			updates.roomType = normalizedRoomType;
		}

		const normalizedCashType = normalizeEnum(body.cashType, [
			'REAL',
			'VIRTUAL',
		]);
		if (normalizedCashType) {
			updates.cashType = normalizedCashType;
		}

		if (body.playerCount !== undefined) {
			const playerCountNumber = parseNumber(body.playerCount);
			if (!playerCountNumber || ![2, 3, 4].includes(playerCountNumber)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'playerCount must be 2, 3, or 4',
					},
				};
			}
			updates.playerCount = playerCountNumber;
		}

		if (body.entryFee !== undefined) {
			const entryFeeNumber = parseNumber(body.entryFee);
			if (entryFeeNumber === null || entryFeeNumber <= 0) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'entryFee must be a positive number',
					},
				};
			}
			updates.entryFee = entryFeeNumber;
		}

		if (body.houseEdge !== undefined) {
			const houseEdgeNumber = parseNumber(body.houseEdge);
			if (houseEdgeNumber === null || houseEdgeNumber < 0 || houseEdgeNumber > 100) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'houseEdge must be between 0 and 100',
					},
				};
			}
			updates.houseEdge = houseEdgeNumber;
		}

		if (body.displayOrder !== undefined) {
			const displayOrderNumber = parseNumber(body.displayOrder);
			updates.displayOrder = displayOrderNumber ?? 0;
		}

		if (body.isActive !== undefined) {
			const isActiveValue = parseBoolean(body.isActive);
			if (isActiveValue === null) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'isActive must be a boolean value',
					},
				};
			}
			updates.isActive = isActiveValue;
		}

		if (body.targetPoints !== undefined) {
			const targetPointsNumber = parseNumber(body.targetPoints);
			if (targetPointsNumber === null) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'targetPoints must be a number',
					},
				};
			}
			updates.targetPoints = targetPointsNumber;
		}

		const effectiveWinRule = updates.winRule || price.winRule;
		const effectiveTargetPoints =
			updates.targetPoints !== undefined
				? updates.targetPoints
				: price.targetPoints;

		if (effectiveWinRule === 'POINTS' && effectiveTargetPoints <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'targetPoints must be greater than 0 for POINTS win rule',
				},
			};
		}

		if (effectiveWinRule === 'STANDARD') {
			updates.targetPoints = 0;
		}

		const adminUserId = getAdminUserId(adminUser);
		if (adminUserId) {
			updates.updatedBy = adminUserId;
		}

		price.set(updates);
		await price.save();

		await syncDominoEntryFees();

		const updatedPrice = await DominoRoomPrice.findById(priceId)
			.populate('createdBy', 'name email userName')
			.populate('updatedBy', 'name email userName')
			.lean();

		return {
			status: 200,
			entity: {
				success: true,
				price: updatedPrice,
			},
		};
	} catch (error) {
		if (error.code === 11000) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'A room price with the same configuration already exists',
				},
			};
		}

		console.error('Update domino room price error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to update domino room price',
			},
		};
	}
};

export const deleteDominoRoomPrice = async priceId => {
	try {
		if (!Types.ObjectId.isValid(priceId)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid room price ID',
				},
			};
		}

		const price = await DominoRoomPrice.findById(priceId);
		if (!price) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Domino room price not found',
				},
			};
		}

		await price.deleteOne();
		await syncDominoEntryFees();

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Domino room price deleted successfully',
			},
		};
	} catch (error) {
		console.error('Delete domino room price error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to delete domino room price',
			},
		};
	}
};

