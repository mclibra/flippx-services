import { State } from './model';
import { fetchGameListByState } from '../../services/lottery/externalLottery';
import { createLotteriesForState } from '../../services/cron/lottery';

export const list = async ({
	offset,
	limit,
	key,
	sortBy = 'createdAt',
	sortOrder = 'desc',
}) => {
	try {
		let params = { isActive: true };

		if (key) {
			params['$or'] = [
				{ name: new RegExp(key, 'i') },
				{ code: new RegExp(key, 'i') },
			];
		}

		const states = await State.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.exec();

		const total = await State.count(params).exec();

		return {
			status: 200,
			entity: {
				success: true,
				states,
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

export const create = async body => {
	try {
		if (body.lotteryConfiguration && Array.isArray(body.lotteryConfiguration)) {
			body.externalLotteries = [];

			// Process the provided lottery configuration
			for (const config of body.lotteryConfiguration) {
				if (!config.name || !config.pick4Key) {
					throw new Error('Each lottery configuration must have a name and pick4Key');
				}

				body.externalLotteries.push({
					name: config.name,
					pick3Key: config.pick3Key || null,
					pick4Key: config.pick4Key,
					hasMarriageNumbers: !!config.pick3Key
				});
			}
		}

		const state = await State.create(body);
		if (state._id) {
			// Fetch lottery games for this state
			await fetchAndStoreLotteryGames(state);

			// Create initial lotteries for this state
			const lotteryCreationResult = await createLotteriesForState(state);

			console.log(
				`Lottery creation result for ${state.name}:`,
				lotteryCreationResult
			);

			return {
				status: 200,
				entity: {
					success: true,
					state,
					lotteryCreation: lotteryCreationResult,
				},
			};
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
		if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'State code already exists.',
				},
			};
		}
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
		const state = await State.findById(id);
		if (state._id) {
			if (body.lotteryConfiguration && Array.isArray(body.lotteryConfiguration)) {
				body.externalLotteries = [];

				for (const config of body.lotteryConfiguration) {
					if (!config.name || !config.pick4Key) {
						throw new Error('Each lottery configuration must have a name and pick4Key');
					}

					body.externalLotteries.push({
						name: config.name,
						pick3Key: config.pick3Key || null,
						pick4Key: config.pick4Key,
						hasMarriageNumbers: !!config.pick3Key
					});
				}
			}

			const updatedState = await Object.assign(state, body).save();
			if (updatedState._id && body.lotteryConfiguration) {
				// Fetch lottery games for this state
				await fetchAndStoreLotteryGames(state);

				// Create initial lotteries for this state
				await createLotteriesForState(state);
			}

			return {
				status: 200,
				entity: {
					success: true,
					state: updatedState,
				},
			};
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

export const remove = async ({ id }) => {
	try {
		const state = await State.findById(id);
		if (state._id) {
			// Instead of removing, we set it to inactive
			state.isActive = false;
			await state.save();
			return {
				status: 200,
				entity: {
					success: true,
				},
			};
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

export const show = async ({ id }) => {
	try {
		const state = await State.findById(id);
		if (state) {
			return {
				status: 200,
				entity: {
					success: true,
					state,
				},
			};
		}
		return {
			status: 404,
			entity: {
				success: false,
				error: 'State not found',
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

const fetchAndStoreLotteryGames = async state => {
	try {
		const gameList = await fetchGameListByState(state.code);
		console.log(`Fetched game list for ${state.name} [${state.code}] =============`);
		console.log(gameList);

		if (!gameList?.data || !Array.isArray(gameList.data)) {
			console.error('Invalid game list response', gameList);
			return;
		}

		// Create a map of all games by their name (normalized to lowercase)
		const gameMap = {};
		gameList.data.forEach(game => {
			const normalizedName = game.gameName.toLowerCase().trim();
			gameMap[normalizedName] = game;
		});

		// Update external lottery configurations with actual game data
		if (state.externalLotteries && state.externalLotteries.length > 0) {
			const updatedLotteries = state.externalLotteries.map(lotteryConfig => {
				const updated = {
					...lotteryConfig.toObject ? lotteryConfig.toObject() : lotteryConfig
				};

				// Find pick 4 game (required)
				const pick4Game = gameMap[lotteryConfig.pick4Key.toLowerCase()];
				if (pick4Game) {
					updated.pick4GameId = pick4Game.id;
					updated.drawTime = pick4Game.drawTime;
					updated.drawTimezone = pick4Game.drawTimezone;
					updated.drawDays = pick4Game.drawDays;
				} else {
					console.warn(`Pick 4 game not found for key: ${lotteryConfig.pick4Key}`);
				}

				// Find pick 3 game (optional)
				if (lotteryConfig.pick3Key) {
					const pick3Game = gameMap[lotteryConfig.pick3Key.toLowerCase()];
					if (pick3Game) {
						updated.pick3GameId = pick3Game.id;
						// If pick3 has different draw time/days, we might need to handle this
						// For now, we'll use pick4's schedule as the primary
					} else {
						console.warn(`Pick 3 game not found for key: ${lotteryConfig.pick3Key}`);
					}
				}

				return updated;
			});

			state.externalLotteries = updatedLotteries;
		}

		// Handle Mega Millions separately if it exists
		const megaMillionsGame = gameMap['mega millions'];
		if (megaMillionsGame) {
			state.megaMillions = {
				gameId: megaMillionsGame.id,
				drawTime: megaMillionsGame.drawTime,
				drawTimezone: megaMillionsGame.drawTimezone,
				drawDays: megaMillionsGame.drawDays,
			};
		}

		await state.save();
		console.log(
			`External lottery information updated for state: ${state.name}`
		);
	} catch (error) {
		console.error(
			`Error fetching lottery games for state ${state.code}:`,
			error
		);
	}
};