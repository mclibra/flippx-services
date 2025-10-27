import cron from 'node-cron';
import moment from 'moment-timezone';
import mongoose from 'mongoose';
import { mongo } from '../../../config';

// Import lottery dependencies
import { Lottery } from '../../api/lottery/model';
import { createLotteriesForState } from '../../api/lottery/controller';
import { State } from '../../api/admin/state-management/model';
import { fetchGameResult } from '../lottery/externalLottery';
import { publishResult } from '../lottery/resultPublisher';

// Import domino dependencies
import {
	DominoRoom,
	DominoGame,
	DominoGameConfig,
} from '../../api/domino/model';
import { DominoGameEngine } from '../domino/gameEngine';
import { makeTransaction } from '../../api/transaction/controller';
import {
	startDominoGame,
	handleTurnTimeout,
	notifyTurnChange,
	sendTurnWarnings,
	removeDisconnectedPlayersFromWaitingRooms,
	handleGameCompletion,
} from '../../api/domino/controller';
import SocketBroadcastService from '../socket/socketBroadcastService';

// Import loyalty dependencies
import {
	processNoWinCashback,
	evaluateUserTier,
	cleanupOrphanedLoyaltyProfiles,
} from '../../api/loyalty/controller';
import InfluencerCommissionService from '../influencer/commissionService';
import { LoyaltyProfile } from '../../api/loyalty/model';
import TierConfigService from '../tier/tierConfigService';

class CronScheduler {
	constructor() {
		this.activeCronJobs = new Set();
		this.processingGames = new Set();
		this.isShuttingDown = false;
	}

	/**
	 * Initialize all cron jobs
	 */
	async initialize() {
		console.log('🔄 Initializing cron scheduler...');

		// Ensure database connection
		await this.ensureDatabaseConnection();

		// Initialize all cron jobs
		this.initializeLotteryCronJobs();
		this.initializeDominoCronJobs();
		this.initializeLoyaltyCronJobs();

		console.log(
			`✅ Cron scheduler initialized with ${this.activeCronJobs.size} jobs`
		);
	}

	/**
	 * Ensure database connection
	 */
	async ensureDatabaseConnection() {
		if (mongoose.connection.readyState === 1) {
			return;
		}

		try {
			await mongoose.connect(mongo.uri, {
				useNewUrlParser: true,
				useUnifiedTopology: true,
			});
			console.log('✅ Database connected for cron scheduler');
		} catch (error) {
			console.error('❌ Failed to connect to database:', error);
			throw error;
		}
	}

	/**
	 * Initialize lottery cron jobs
	 */
	initializeLotteryCronJobs() {
		console.log('📅 Initializing lottery cron jobs...');

		// Check and publish lottery results - every 20 minutes
		this.createCronJob(
			'*/20 * * * *',
			'lottery-check-and-publish-results',
			this.checkAndPublishResults.bind(this)
		);

		// Analyze lottery for each state and create missing lotteries - every 40 minutes
		this.createCronJob(
			'*/40 * * * *',
			'lottery-analyze-and-create-missing-lotteries',
			this.analyzeAndCreateMissingLotteries.bind(this)
		);
	}

	/**
	 * Initialize domino cron jobs
	 */
	initializeDominoCronJobs() {
		console.log('📅 Initializing domino cron jobs...');

		// Fill VIRTUAL waiting rooms with bots - every 3 seconds
		this.createCronJob(
			'*/3 * * * * *',
			'domino-fill-virtual-rooms-with-bots',
			this.fillVirtualRoomsWithBots.bind(this)
		);

		// Handle human timeouts - every 10 seconds
		this.createCronJob(
			'*/10 * * * * *',
			'domino-handle-human-timeouts',
			this.handleHumanTimeouts.bind(this)
		);

		// Process immediate bot turns - every 2 seconds
		this.createCronJob(
			'*/2 * * * * *',
			'domino-process-immediate-bot-turns',
			this.processImmediateBotTurns.bind(this)
		);

		// Start games when rooms are full - every 3 seconds
		this.createCronJob(
			'*/3 * * * * *',
			'domino-start-full-room-games',
			this.startFullRoomGames.bind(this)
		);

		// Send turn warnings via socket - every 3 seconds
		this.createCronJob(
			'*/3 * * * * *',
			'domino-send-turn-warnings',
			this.sendTurnWarningsJob.bind(this)
		);

		// Remove disconnected players from waiting rooms - every 30 seconds
		this.createCronJob(
			'*/30 * * * * *',
			'domino-remove-disconnected-players',
			this.removeDisconnectedPlayersJob.bind(this)
		);

		// Clean up abandoned rooms - every hour at 5 minutes past (avoid midnight collision)
		this.createCronJob(
			'5 * * * *',
			'domino-cleanup-abandoned-rooms',
			this.cleanupAbandonedRooms.bind(this)
		);

		// Clean up orphaned games - every 7 minutes to avoid collision patterns
		this.createCronJob(
			'*/7 * * * *',
			'domino-cleanup-orphaned-games',
			this.cleanupOrphanedGames.bind(this)
		);
	}

	/**
	 * Initialize loyalty cron jobs
	 */
	initializeLoyaltyCronJobs() {
		console.log('📅 Initializing loyalty cron jobs...');

		// Process no-win cashback daily at 1 AM
		this.createCronJob(
			'0 1 * * *',
			'loyalty-process-no-win-cashback',
			this.processNoWinCashbackJob.bind(this)
		);

		// Reset monthly referral commission caps - Run on the 1st of every month at 12 AM
		this.createCronJob(
			'0 0 1 * *',
			'loyalty-reset-monthly-referral-caps',
			this.resetMonthlyReferralCaps.bind(this)
		);

		// Reset weekly spending tracking - Run every Monday at 12 AM
		this.createCronJob(
			'0 0 * * 1',
			'loyalty-reset-weekly-spending',
			this.resetWeeklySpending.bind(this)
		);

		// Update no-win tracking for VIP users - Run daily at 3 AM
		this.createCronJob(
			'0 3 * * *',
			'loyalty-update-no-win-tracking',
			this.updateNoWinTracking.bind(this)
		);

		// Evaluate all user tiers - Run daily at 5 AM
		this.createCronJob(
			'0 5 * * *',
			'loyalty-evaluate-user-tiers',
			this.evaluateUserTiersJob.bind(this)
		);

		// Refresh tier configuration cache - Run every 6 hours
		this.createCronJob(
			'0 */6 * * *',
			'loyalty-refresh-tier-config-cache',
			this.refreshTierConfigCache.bind(this)
		);

		// Validate tier configuration integrity - Run daily at 1 AM
		this.createCronJob(
			'0 1 * * *',
			'loyalty-validate-tier-config-integrity',
			this.validateTierConfigIntegrity.bind(this)
		);

		// Check VIP daily login requirements - Run daily at 2 AM
		this.createCronJob(
			'0 2 * * *',
			'loyalty-check-vip-daily-login',
			this.checkVipDailyLogin.bind(this)
		);
	}

	/**
	 * Create a cron job with error handling
	 */
	createCronJob(schedule, jobName, jobFunction) {
		try {
			const cronJob = cron.schedule(
				schedule,
				async () => {
					if (this.isShuttingDown) {
						return;
					}

					try {
						await this.executeCronJob(jobName, jobFunction);
					} catch (error) {
						console.error(
							`❌ Error in cron job ${jobName}:`,
							error
						);
					}
				},
				{
					scheduled: true,
				}
			);

			this.activeCronJobs.add(cronJob);
			console.log(`✅ Cron job registered: ${jobName} (${schedule})`);
		} catch (error) {
			console.error(`❌ Failed to create cron job ${jobName}:`, error);
		}
	}

	/**
	 * Execute a cron job with error handling
	 */
	async executeCronJob(jobName, jobFunction) {
		try {
			await jobFunction();
		} catch (error) {
			console.error(`Error in cron job ${jobName}:`, error);
		}
	}

	/**
	 * Graceful shutdown
	 */
	async shutdown() {
		this.isShuttingDown = true;
		console.log('🛑 Shutting down cron scheduler...');

		for (const cronJob of this.activeCronJobs) {
			try {
				if (cronJob && typeof cronJob.destroy === 'function') {
					cronJob.destroy();
				}
			} catch (error) {
				console.error('Error stopping cron job:', error);
			}
		}

		this.activeCronJobs.clear();
		console.log('✅ Cron scheduler shut down successfully');
	}

	// ============================================================================
	// LOTTERY CRON JOBS
	// ============================================================================

	/**
	 * Check and publish lottery results
	 */
	async checkAndPublishResults() {
		try {
			console.log('Checking and publishing lottery results');
			const now = moment();
			const query = {
				status: {
					$in: ['SCHEDULED', 'ERROR', 'WAITING'],
				},
				scheduledTime: {
					$lt: now.subtract(15, 'minutes').valueOf(),
				},
			};
			const lotteries = await Lottery.find(query).limit(100).lean();

			if (lotteries.length > 0) {
				console.log(`Found ${lotteries.length} lotteries to publish`);

				for (const lotteryData of lotteries) {
					try {
						const lottery = await Lottery.findById(lotteryData._id);
						if (!lottery) continue;

						lottery.status = 'WAITING';
						await lottery.save();
						await this.fetchAndPublishResults(lottery);
						console.log(`Published lottery ${lottery.id}`);
					} catch (lotteryError) {
						console.error(
							`Error processing lottery ${lotteryData._id}:`,
							lotteryError
						);
					}
				}
			}
		} catch (error) {
			console.error('Error in publishResults cron job:', error);
		}
	}

	/**
	 * Analyze lottery for each state and create missing lotteries
	 */
	async analyzeAndCreateMissingLotteries() {
		try {
			console.log('Analyzing and creating missing lotteries');
			const activeStates = await State.find({ isActive: true })
				.select('name code externalLotteries megaMillions')
				.lean();

			if (activeStates.length === 0) {
				console.log('No active states found');
				return;
			}

			const today = moment().format('dddd');
			const tomorrow = moment().add(1, 'day').format('dddd');

			for (const state of activeStates) {
				try {
					console.log(`Analyzing state ${state.name}`);

					let hasUpcomingDrawDays = false;

					if (
						state.externalLotteries &&
						state.externalLotteries.length > 0
					) {
						for (const lotteryConfig of state.externalLotteries) {
							if (
								lotteryConfig.drawDays?.[today] ||
								lotteryConfig.drawDays?.[tomorrow]
							) {
								hasUpcomingDrawDays = true;
								break;
							}
						}
					}

					if (!hasUpcomingDrawDays && state.megaMillions?.drawDays) {
						if (
							state.megaMillions.drawDays[today] ||
							state.megaMillions.drawDays[tomorrow]
						) {
							hasUpcomingDrawDays = true;
						}
					}

					if (!hasUpcomingDrawDays) {
						continue;
					}

					await createLotteriesForState(state);
				} catch (stateError) {
					console.error(
						`Error analyzing state ${state.name} (${state.code}):`,
						stateError
					);
				}
			}
		} catch (error) {
			console.error('Error in lottery analysis cron job:', error);
		}
	}

	/**
	 * Fetch and publish results for a lottery
	 */
	async fetchAndPublishResults(lottery) {
		try {
			if (lottery.type === 'BORLETTE') {
				const pick4Id = lottery.externalGameIds.pick4;
				const pick3Id = lottery.externalGameIds.pick3;

				const pick4Result = await fetchGameResult(pick4Id);

				if (!pick4Result?.data?.winningNumbers) {
					console.error(
						'Invalid pick4 result data for BORLETTE lottery:',
						lottery._id
					);
					return;
				}

				const state = await State.findById(lottery.state);
				if (!state) {
					console.error('State not found for lottery:', lottery._id);
					return;
				}

				let lotteryTimezone = 'America/New_York';
				if (
					state.externalLotteries &&
					state.externalLotteries.length > 0
				) {
					const lotteryConfig = state.externalLotteries.find(
						config => config.pick4GameId === pick4Id
					);
					if (lotteryConfig?.drawTimezone) {
						lotteryTimezone = lotteryConfig.drawTimezone;
					}
				}

				const lotteryDate = moment(lottery.scheduledTime)
					.tz(lotteryTimezone)
					.format('YYYY-MM-DD');
				const apiDrawDate = pick4Result.data.drawDate;

				if (apiDrawDate !== lotteryDate) {
					console.log(
						`API draw date (${apiDrawDate}) does not match lottery date (${lotteryDate}) for lottery ${lottery._id}. Skipping.`
					);
					return;
				}

				const drawNumber = pick4Result.data.drawNumber;
				const existingDrawNumber = await Lottery.findOne({
					drawNumber: drawNumber,
					state: lottery.state,
					type: 'BORLETTE',
					status: 'COMPLETED',
				});

				if (existingDrawNumber) {
					return;
				}

				let pick3Result = null;
				let pick3Numbers = null;

				if (pick3Id) {
					pick3Result = await fetchGameResult(pick3Id);
					if (pick3Result?.data?.winningNumbers) {
						pick3Numbers = pick3Result.data.winningNumbers;
					}
				}

				const pick4Numbers = pick4Result.data.winningNumbers;

				if (!pick3Numbers) {
					pick3Numbers = pick4Numbers.slice(0, 3);
				}

				const firstNumber = pick3Numbers.join('');
				const secondNumber = pick4Numbers.slice(0, 2).join('');
				const thirdNumber = pick4Numbers.slice(2, 4).join('');

				const results = {
					numbers: [firstNumber, secondNumber, thirdNumber],
					hasMarriageNumbers:
						lottery.additionalData?.hasMarriageNumbers || false,
					drawNumber: drawNumber,
					drawDate: apiDrawDate,
				};

				await this.processTicketsForLottery(lottery._id, results);
			} else if (lottery.type === 'MEGAMILLION') {
				const megaId = lottery.externalGameIds.megaMillions;
				const megaResult = await fetchGameResult(megaId);

				if (
					!megaResult?.data?.winningNumbers ||
					!megaResult?.data?.additionalNumbers
				) {
					console.error(
						'Invalid result data for MEGAMILLION lottery:',
						lottery.id
					);
					return;
				}

				const state = await State.findById(lottery.state);
				if (!state) {
					console.error(
						'State not found for MEGAMILLION lottery:',
						lottery._id
					);
					return;
				}

				let megaTimezone = 'America/Detroit';
				if (state.megaMillions?.drawTimezone) {
					megaTimezone = state.megaMillions.drawTimezone;
				}

				const megaLotteryDate = moment(lottery.scheduledTime)
					.tz(megaTimezone)
					.format('YYYY-MM-DD');
				const megaApiDrawDate = megaResult.data.drawDate;

				if (megaApiDrawDate !== megaLotteryDate) {
					console.log(
						`API draw date (${megaApiDrawDate}) does not match lottery date (${megaLotteryDate}) for MEGAMILLION lottery ${lottery._id}. Skipping.`
					);
					return;
				}

				const megaDrawNumber = megaResult.data.drawNumber;
				const existingMegaDrawNumber = await Lottery.findOne({
					drawNumber: megaDrawNumber,
					type: 'MEGAMILLION',
					status: 'COMPLETED',
				});

				if (existingMegaDrawNumber) {
					return;
				}

				const mainNumbers = megaResult.data.winningNumbers;
				const megaBall = megaResult.data.additionalNumbers[0];

				const results = {
					numbers: mainNumbers,
					megaBall: megaBall,
					drawNumber: megaDrawNumber,
					drawDate: megaApiDrawDate,
				};

				await this.processTicketsForLottery(lottery._id, results);
			}
		} catch (error) {
			lottery.status = 'ERROR';
			await lottery.save();
			console.error(
				`Error publishing results for lottery ${lottery.id}:`,
				error
			);
		}
	}

	/**
	 * Process tickets for lottery
	 */
	async processTicketsForLottery(lotteryId, results) {
		try {
			await publishResult(lotteryId, results);
		} catch (error) {
			console.error(
				`Error processing tickets for lottery ${lotteryId}:`,
				error
			);
		}
	}

	// ============================================================================
	// DOMINO CRON JOBS
	// ============================================================================

	/**
	 * Fill VIRTUAL waiting rooms with bots after 3 seconds
	 */
	async fillVirtualRoomsWithBots() {
		try {
			const gameConfig = await DominoGameConfig.findOne().lean();
			if (!gameConfig) {
				return;
			}

			const maxWaitTime = new Date(Date.now() - 3 * 1000);

			const virtualRoomsNeedingBots = await DominoRoom.find({
				status: 'WAITING',
				cashType: 'VIRTUAL',
				createdAt: {
					$lte: maxWaitTime,
				},
				$expr: { $lt: [{ $size: '$players' }, '$playerCount'] },
			}).limit(10);

			for (const room of virtualRoomsNeedingBots) {
				try {
					const slotsNeeded = room.playerCount - room.players.length;

					if (slotsNeeded > 0) {
						await this.fillRoomWithBots(
							room,
							slotsNeeded,
							gameConfig
						);
					}
				} catch (error) {
					console.error(
						`Error filling room ${room.roomId} with bots:`,
						error
					);
				}
			}
		} catch (error) {
			console.error('Error in bot room filling:', error);
		}
	}

	/**
	 * Handle human timeouts
	 */
	async handleHumanTimeouts() {
		try {
			const config = await DominoGameConfig.findOne().lean();
			const timeoutSeconds = config?.turnTimeLimit || 30;
			const timeoutThreshold = new Date(
				Date.now() - timeoutSeconds * 1000
			);

			const timedOutGames = await DominoGame.find({
				gameState: 'ACTIVE',
				turnStartTime: { $lt: timeoutThreshold },
			})
				.limit(50)
				.populate('room');

			for (const game of timedOutGames) {
				try {
					if (this.processingGames.has(game._id.toString())) {
						continue;
					}

					if (!game.room) {
						continue;
					}

					this.processingGames.add(game._id.toString());

					const currentPlayer = game.players[game.currentPlayer];

					if (
						currentPlayer &&
						currentPlayer.playerType === 'HUMAN' &&
						currentPlayer.user
					) {
						await handleTurnTimeout(game._id, currentPlayer);
					}
				} catch (error) {
					console.error(
						`Error handling timeout for game ${game._id}:`,
						error
					);
				} finally {
					this.processingGames.delete(game._id.toString());
				}
			}
		} catch (error) {
			console.error('Error checking human timeouts:', error);
		}
	}

	/**
	 * Process immediate bot turns
	 */
	async processImmediateBotTurns() {
		try {
			const timeoutThreshold = new Date(Date.now() - 2 * 1000);

			const botTurnGames = await DominoGame.find({
				gameState: 'ACTIVE',
				turnStartTime: { $lt: timeoutThreshold },
				'players.playerType': 'COMPUTER',
				_id: { $nin: Array.from(this.processingGames) },
			})
				.limit(20)
				.populate('room');

			for (const game of botTurnGames) {
				try {
					if (this.processingGames.has(game._id.toString())) {
						continue;
					}

					const currentPlayer = game.players[game.currentPlayer];

					if (
						!currentPlayer ||
						currentPlayer.playerType !== 'COMPUTER'
					) {
						continue;
					}

					this.processingGames.add(game._id.toString());

					await this.processBotTurn(game);
				} catch (error) {
					console.error(
						`Error processing immediate bot turn for game ${game._id}:`,
						error
					);
				} finally {
					this.processingGames.delete(game._id.toString());
				}
			}
		} catch (error) {
			console.error('Error checking immediate bot turns:', error);
		}
	}

	/**
	 * Start games when rooms are full
	 */
	async startFullRoomGames() {
		try {
			const tenSecondsAgo = new Date(Date.now() - 10 * 1000);

			const fullRooms = await DominoRoom.find({
				status: 'WAITING',
				$expr: { $eq: ['$playerCount', { $size: '$players' }] },
				createdAt: { $lt: tenSecondsAgo },
			});

			for (const room of fullRooms) {
				try {
					await startDominoGame(room);
				} catch (error) {
					console.error(
						`Error starting game for room ${room.roomId}:`,
						error
					);
				}
			}
		} catch (error) {
			console.error('Error checking for full rooms:', error);
		}
	}

	/**
	 * Send turn warnings via socket
	 */
	async sendTurnWarningsJob() {
		try {
			const activeGamesCount = await DominoGame.countDocuments({
				gameState: 'ACTIVE',
			});

			if (activeGamesCount === 0) {
				return;
			}

			await sendTurnWarnings();
		} catch (error) {
			console.error('Error checking for turn warnings:', error);
		}
	}

	/**
	 * Remove disconnected players from waiting rooms
	 */
	async removeDisconnectedPlayersJob() {
		try {
			await removeDisconnectedPlayersFromWaitingRooms();
		} catch (error) {
			console.error('Error removing disconnected players:', error);
		}
	}

	/**
	 * Clean up abandoned rooms
	 */
	async cleanupAbandonedRooms() {
		try {
			const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

			const abandonedRooms = await DominoRoom.find({
				status: 'WAITING',
				createdAt: { $lt: twoHoursAgo },
			});

			for (const room of abandonedRooms) {
				try {
					for (const player of room.players) {
						if (player.user && player.playerType === 'HUMAN') {
							await makeTransaction(
								player.user,
								'USER',
								'DOMINO_REFUND',
								room.entryFee,
								room._id,
								room.cashType
							);
						}
					}

					room.status = 'CANCELLED';
					room.completedAt = new Date();
					await room.save();
				} catch (error) {
					console.error(
						`Error cleaning up room ${room.roomId}:`,
						error
					);
				}
			}
		} catch (error) {
			console.error('Error in domino room cleanup:', error);
		}
	}

	/**
	 * Clean up orphaned games
	 */
	async cleanupOrphanedGames() {
		try {
			const activeGames = await DominoGame.find({
				gameState: 'ACTIVE',
			}).populate('room');

			const orphanedGames = activeGames.filter(game => !game.room);

			for (const game of orphanedGames) {
				try {
					game.gameState = 'COMPLETED';
					game.endReason = 'BLOCKED_NO_MOVES';
					game.completedAt = new Date();
					game.winner = null;
					game.finalScores = [];

					await game.save();
				} catch (error) {
					console.error(
						`Error cleaning up orphaned game ${game._id}:`,
						error
					);
				}
			}
		} catch (error) {
			console.error('Error in orphaned games cleanup:', error);
		}
	}

	/**
	 * Fill room with bots helper function
	 */
	async fillRoomWithBots(room, slotsNeeded, gameConfig) {
		try {
			const botNames = gameConfig.computerPlayerNames;
			const usedNames = room.players.map(p => p.playerName);
			const availableNames = botNames.filter(
				name => !usedNames.includes(name)
			);

			const allBotNames = [...availableNames];
			if (slotsNeeded > availableNames.length) {
				for (let i = 1; i <= slotsNeeded - availableNames.length; i++) {
					allBotNames.push(`${i + botNames.length}`);
				}
			}

			const bots = [];

			for (let i = 0; i < slotsNeeded; i++) {
				const botName =
					allBotNames[i] || `${room.players.length + i + 1}`;
				bots.push({
					user: null,
					playerType: 'COMPUTER',
					playerName: botName,
					position: room.players.length + i,
					isReady: true,
					isConnected: true,
					lastConnectedAt: new Date(),
					disconnectedAt: null,
					joinedAt: new Date(),
				});
				room.totalPot += room.entryFee;
			}

			room.players.push(...bots);
			await room.save();

			for (const bot of bots) {
				await SocketBroadcastService.broadcastToDominoRoom(
					room.roomId,
					'player-joined',
					{
						user: bot.user,
						playerName: bot.playerName,
						room: room.toJSON(),
					}
				);
			}
		} catch (error) {
			console.error(
				`Error filling room ${room.roomId} with bots:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Process bot turn helper function
	 */
	async processBotTurn(game) {
		try {
			const currentPlayer = game.players[game.currentPlayer];

			if (!currentPlayer || currentPlayer.playerType !== 'COMPUTER') {
				return;
			}

			const move = DominoGameEngine.autoPlay(game);
			const moveResult = DominoGameEngine.processMove(game, move, true);

			if (!moveResult.success) {
				console.error(
					`Bot move failed for ${currentPlayer.playerName}:`,
					moveResult.error
				);
				return;
			}

			const updatedGameState = moveResult.gameState;

			const updateFields = {
				currentPlayer: updatedGameState.currentPlayer,
				gameState: updatedGameState.gameState,
				players: updatedGameState.players,
				board: updatedGameState.board,
				drawPile: updatedGameState.drawPile,
				moves: updatedGameState.moves,
				totalMoves: updatedGameState.totalMoves,
				turnStartTime: updatedGameState.turnStartTime,
			};

			if (
				updatedGameState.gameState === 'COMPLETED' ||
				updatedGameState.gameState === 'BLOCKED'
			) {
				updateFields.winner = updatedGameState.winner;
				updateFields.endReason = updatedGameState.endReason;
				updateFields.finalScores = updatedGameState.finalScores;
				updateFields.completedAt = updatedGameState.completedAt;
				updateFields.duration = updatedGameState.duration;
			}

			const updatedGame = await DominoGame.findOneAndUpdate(
				{
					_id: game._id,
					gameState: 'ACTIVE',
					currentPlayer: game.currentPlayer,
				},
				{ $set: updateFields },
				{
					new: true,
					runValidators: true,
					populate: 'room',
				}
			);

			if (!updatedGame || !updatedGame.room) {
				return;
			}

			await SocketBroadcastService.broadcastToDominoRoom(
				updatedGame.room.roomId,
				'game-update',
				{
					gameId: updatedGame._id,
					players: updatedGame.players.map(player => ({
						position: player.position,
						user: player.user,
						playerType: player.playerType,
						playerName: player.playerName,
						isConnected: player.isConnected,
						tileCount: player.hand.length,
					})),
					lastMove: moveResult.move,
					moveBy: {
						position: currentPlayer.position,
						playerName: currentPlayer.playerName,
						playerType: currentPlayer.playerType,
					},
					board: updatedGame.board,
					drawPile: updatedGame.drawPile,
				}
			);

			if (updatedGame.gameState === 'ACTIVE' && updatedGame.room) {
				await notifyTurnChange(
					updatedGame.toJSON(),
					updatedGame.room.roomId,
					updatedGame.currentPlayer - 1
				);
			}

			if (
				updatedGame.gameState === 'COMPLETED' ||
				updatedGame.gameState === 'BLOCKED'
			) {
				await handleGameCompletion(updatedGame);
			}
		} catch (error) {
			console.error(
				`Error processing bot turn for game ${game._id}:`,
				error
			);
		}
	}

	// ============================================================================
	// LOYALTY CRON JOBS
	// ============================================================================

	/**
	 * Process no-win cashback job
	 */
	async processNoWinCashbackJob() {
		try {
			await processNoWinCashback();
		} catch (error) {
			console.error('Error in no-win cashback job:', error);
		}
	}

	/**
	 * Reset monthly referral commission caps
	 */
	async resetMonthlyReferralCaps() {
		try {
			const loyalties = await LoyaltyProfile.find({
				currentTier: { $in: ['GOLD', 'VIP'] },
			});

			for (const loyalty of loyalties) {
				loyalty.referralCommissions.monthly = {
					borlette: { earned: 0, plays: 0 },
					roulette: { earned: 0, spins: 0 },
					dominoes: { earned: 0, wagered: 0 },
					totalEarned: 0,
					resetDate: moment().endOf('month').toDate(),
				};
				await loyalty.save();
			}

			await InfluencerCommissionService.resetMonthlyInfluencerCaps();
		} catch (error) {
			console.error('Error resetting referral commission caps:', error);
		}
	}

	/**
	 * Reset weekly spending tracking
	 */
	async resetWeeklySpending() {
		try {
			await LoyaltyProfile.updateMany(
				{},
				{
					$set: {
						'tierProgress.weeklySpending': 0,
						'tierProgress.weeklySpendingResetDate': moment()
							.endOf('week')
							.toDate(),
						'tierProgress.daysPlayedThisWeek': 0,
					},
				}
			);
		} catch (error) {
			console.error('Error resetting weekly spending tracking:', error);
		}
	}

	/**
	 * Check VIP daily login requirements
	 */
	async checkVipDailyLogin() {
		try {
			// const vipConfig = await TierConfigService.getTierConfig('VIP');
			// if (!vipConfig || !vipConfig.requirements.dailyLoginRequired) {
			// 	return;
			// }
			// const vipUsers = await User.find({}).populate({
			// 	path: 'loyaltyProfile',
			// 	match: { currentTier: 'VIP' },
			// });
			// const filteredVipUsers = vipUsers.filter(
			// 	user => user.loyaltyProfile
			// );
			// for (const user of filteredVipUsers) {
			// 	const yesterday = moment().subtract(1, 'day').startOf('day');
			// 	const loggedInYesterday =
			// 		user.sessionTracking?.lastLoginDate &&
			// 		moment(user.sessionTracking.lastLoginDate).isBetween(
			// 			yesterday,
			// 			moment().startOf('day')
			// 		);
			// 	const requiredSessionMinutes =
			// 		vipConfig.requirements.dailySessionMinutes || 5;
			// 	const metSessionRequirement =
			// 		user.sessionTracking?.totalSessionTimeToday &&
			// 		user.sessionTracking.totalSessionTimeToday >=
			// 			requiredSessionMinutes * 60;
			// }
		} catch (error) {
			console.error(
				'Error checking VIP daily login requirements:',
				error
			);
		}
	}

	/**
	 * Update no-win tracking for VIP users
	 */
	async updateNoWinTracking() {
		try {
			const tierConfigs = await TierConfigService.getTierRequirements();
			const eligibleTiers = Object.keys(tierConfigs).filter(
				tier =>
					tierConfigs[tier].noWinCashbackPercentage > 0 &&
					tierConfigs[tier].noWinCashbackDays > 0
			);

			if (eligibleTiers.length === 0) {
				return;
			}

			const loyalties = await LoyaltyProfile.find({
				currentTier: { $in: eligibleTiers },
			});

			for (const loyalty of loyalties) {
				const tierConfig = tierConfigs[loyalty.currentTier];
				if (!tierConfig) continue;

				if (!loyalty.tierProgress.lastWinDate) {
					if (loyalty.tierProgress.lastPlayDate) {
						const daysSinceFirstPlay = moment().diff(
							moment(loyalty.tierProgress.lastPlayDate),
							'days'
						);
						loyalty.tierProgress.consecutiveDaysNoWin =
							daysSinceFirstPlay;
						if (
							daysSinceFirstPlay >= tierConfig.noWinCashbackDays
						) {
							loyalty.tierProgress.eligibleForNoWinCashback = true;
						}
					}
				} else {
					const daysSinceLastWin = moment().diff(
						moment(loyalty.tierProgress.lastWinDate),
						'days'
					);
					loyalty.tierProgress.consecutiveDaysNoWin =
						daysSinceLastWin;
					if (daysSinceLastWin >= tierConfig.noWinCashbackDays) {
						loyalty.tierProgress.eligibleForNoWinCashback = true;
					}
				}

				await loyalty.save();
			}
		} catch (error) {
			console.error('Error updating no-win tracking:', error);
		}
	}

	/**
	 * Evaluate all user tiers job
	 */
	async evaluateUserTiersJob() {
		try {
			TierConfigService.clearCache();
			await cleanupOrphanedLoyaltyProfiles();

			const users = await LoyaltyProfile.find({});

			for (const loyalty of users) {
				try {
					if (
						!loyalty.user ||
						!mongoose.Types.ObjectId.isValid(loyalty.user)
					) {
						console.error(
							`Skipping loyalty profile with invalid user ID: ${loyalty.user}`
						);
						continue;
					}

					await evaluateUserTier(loyalty.user);
				} catch (userError) {
					console.error(
						`Error evaluating tier for user ${loyalty.user}:`,
						userError
					);
				}
			}
		} catch (error) {
			console.error('Error in tier evaluation job:', error);
		}
	}

	/**
	 * Refresh tier configuration cache
	 */
	async refreshTierConfigCache() {
		try {
			TierConfigService.clearCache();
			await TierConfigService.getTierRequirements();
		} catch (error) {
			console.error('Error refreshing tier configuration cache:', error);
		}
	}

	/**
	 * Validate tier configuration integrity
	 */
	async validateTierConfigIntegrity() {
		try {
			const tierConfigs = await TierConfigService.getTierRequirements();
			const issues = [];

			const requiredTiers = ['NONE', 'SILVER', 'GOLD', 'VIP'];
			for (const tier of requiredTiers) {
				if (!tierConfigs[tier]) {
					issues.push(`Missing tier configuration: ${tier}`);
				}
			}

			const tierOrder = ['NONE', 'SILVER', 'GOLD', 'VIP'];
			for (let i = 1; i < tierOrder.length; i++) {
				const currentTier = tierConfigs[tierOrder[i]];
				const previousTier = tierConfigs[tierOrder[i - 1]];

				if (currentTier && previousTier) {
					if (
						currentTier.weeklyWithdrawalLimit <
						previousTier.weeklyWithdrawalLimit
					) {
						issues.push(
							`${tierOrder[i]} withdrawal limit (${
								currentTier.weeklyWithdrawalLimit
							}) is less than ${tierOrder[i - 1]} (${
								previousTier.weeklyWithdrawalLimit
							})`
						);
					}

					if (
						currentTier.withdrawalTime > previousTier.withdrawalTime
					) {
						issues.push(
							`${tierOrder[i]} withdrawal time (${
								currentTier.withdrawalTime
							}h) is slower than ${tierOrder[i - 1]} (${
								previousTier.withdrawalTime
							}h)`
						);
					}
				}
			}
		} catch (error) {
			console.error(
				'Error validating tier configuration integrity:',
				error
			);
		}
	}
}

export default CronScheduler;
