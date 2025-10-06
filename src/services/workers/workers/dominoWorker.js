import BaseWorker from '../baseWorker';
import {
	DominoRoom,
	DominoGame,
	DominoGameConfig,
} from '../../../api/domino/model';
import { DominoGameEngine } from '../../domino/gameEngine';
import { makeTransaction } from '../../../api/transaction/controller';
import {
	startDominoGame,
	handleTurnTimeout,
	notifyTurnChange,
	sendTurnWarnings,
	handleGameCompletion,
	removeDisconnectedPlayersFromWaitingRooms,
} from '../../../api/domino/controller';
import SocketBroadcastService from '../../socket/socketBroadcastService';

class DominoWorker extends BaseWorker {
	constructor() {
		super('domino');
		this.processingGames = new Set();
	}

	/**
	 * Initialize all domino-related cron jobs
	 */
	async initializeCronJobs() {
		// Fill VIRTUAL waiting rooms with bots after 3 seconds - every 3 seconds
		this.createSafeCronJob(
			'*/3 * * * * *',
			'fill-virtual-rooms-with-bots',
			this.fillVirtualRoomsWithBots.bind(this)
		);

		// Handle human timeouts - every 10 seconds
		this.createSafeCronJob(
			'*/10 * * * * *',
			'handle-human-timeouts',
			this.handleHumanTimeouts.bind(this)
		);

		// Process immediate bot turns - every 5 seconds
		this.createSafeCronJob(
			'*/2 * * * * *',
			'process-immediate-bot-turns',
			this.processImmediateBotTurns.bind(this)
		);

		// Start games when rooms are full - every 3 seconds
		this.createSafeCronJob(
			'*/3 * * * * *',
			'start-full-room-games',
			this.startFullRoomGames.bind(this)
		);

		// Send turn warnings via socket - every 13 seconds
		this.createSafeCronJob(
			'*/3 * * * * *',
			'send-turn-warnings',
			this.sendTurnWarningsJob.bind(this)
		);

		// Remove disconnected players from waiting rooms - every 30 seconds
		this.createSafeCronJob(
			'*/30 * * * * *',
			'remove-disconnected-players',
			this.removeDisconnectedPlayersJob.bind(this)
		);

		// Clean up abandoned rooms - every hour
		this.createSafeCronJob(
			'0 * * * *',
			'cleanup-abandoned-rooms',
			this.cleanupAbandonedRooms.bind(this)
		);

		// Clean up orphaned games (games without rooms) - every 5 minutes
		this.createSafeCronJob(
			'*/5 * * * *',
			'cleanup-orphaned-games',
			this.cleanupOrphanedGames.bind(this)
		);
	}

	/**
	 * Fill VIRTUAL waiting rooms with bots after 30 seconds
	 * Original: cron.schedule('*\/3 * * * * *', ...)
	 */
	async fillVirtualRoomsWithBots() {
		try {
			const gameConfig = await DominoGameConfig.findOne();
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
			});

			let roomsProcessed = 0;
			let botsAdded = 0;

			for (const room of virtualRoomsNeedingBots) {
				try {
					const slotsNeeded = room.playerCount - room.players.length;

					if (slotsNeeded > 0) {
						await this.fillRoomWithBots(
							room,
							slotsNeeded,
							gameConfig
						);
						botsAdded += slotsNeeded;
						roomsProcessed++;
					}
				} catch (error) {
					this.logError(
						`[CRON] Error filling room ${room.roomId} with bots:`,
						error
					);
				}
			}
		} catch (error) {
			this.logError('[CRON] Error in bot room filling:', error);
		}
	}

	/**
	 * Handle human timeouts
	 * Original: cron.schedule('*\/10 * * * * * ', ...)
	 */
	async handleHumanTimeouts() {
		try {
			const config = await DominoGameConfig.findOne();
			const timeoutSeconds = config?.turnTimeLimit || 30;
			const timeoutThreshold = new Date(
				Date.now() - timeoutSeconds * 1000
			);

			// Find games where human players have timed out
			const timedOutGames = await DominoGame.find({
				gameState: 'ACTIVE',
				turnStartTime: { $lt: timeoutThreshold },
			}).populate('room');

			for (const game of timedOutGames) {
				try {
					// Skip if already being processed
					if (this.processingGames.has(game._id.toString())) {
						continue;
					}

					// Skip games without valid rooms
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
					this.logError(
						`[CRON] Error handling timeout for game ${game._id}:`,
						error
					);
				} finally {
					this.processingGames.delete(game._id.toString());
				}
			}
		} catch (error) {
			this.logError('[CRON] Error checking human timeouts:', error);
		}
	}

	/**
	 * Process immediate bot turns
	 * Original: cron.schedule('*\/3 * * * * * ', ...)
	 */
	async processImmediateBotTurns() {
		try {
			// Find active games where it's a bot's turn (within 2 seconds)
			const timeoutThreshold = new Date(Date.now() - 2 * 1000); // 5 seconds ago

			const botTurnGames = await DominoGame.find({
				gameState: 'ACTIVE',
				turnStartTime: { $lt: timeoutThreshold },
				'players.playerType': 'COMPUTER',
				_id: { $nin: Array.from(this.processingGames) },
			}).populate('room');

			for (const game of botTurnGames) {
				try {
					// Skip if already being processed
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

					// Add to processing set
					this.processingGames.add(game._id.toString());

					// Process bot turn with enhanced concurrency control
					await this.processBotTurn(game);
				} catch (error) {
					this.logError(
						`[CRON] Error processing immediate bot turn for game ${game._id}:`,
						error
					);
				} finally {
					this.processingGames.delete(game._id.toString());
				}
			}
		} catch (error) {
			this.logError('[CRON] Error checking immediate bot turns:', error);
		}
	}

	/**
	 * Start games when rooms are full
	 * Original: cron.schedule('*\/3 * * * * * ', ...)
	 */
	async startFullRoomGames() {
		try {
			const tenSecondsAgo = new Date(Date.now() - 10 * 1000); // 10 seconds ago

			// Find waiting rooms that are full
			const fullRooms = await DominoRoom.find({
				status: 'WAITING',
				$expr: { $eq: ['$playerCount', { $size: '$players' }] },
				createdAt: { $lt: tenSecondsAgo },
			});

			for (const room of fullRooms) {
				try {
					await startDominoGame(room);
				} catch (error) {
					this.logError(
						`[CRON] Error starting game for room ${room.roomId}:`,
						error
					);
				}
			}
		} catch (error) {
			this.logError('[CRON] Error checking for full rooms:', error);
		}
	}

	/**
	 * Send turn warnings via socket
	 * Original: cron.schedule('*\/5 * * * * * ', ...)
	 */
	async sendTurnWarningsJob() {
		try {
			// Check if there are any active games first
			const activeGamesCount = await DominoGame.countDocuments({
				gameState: 'ACTIVE',
			});

			if (activeGamesCount === 0) {
				return;
			}

			await sendTurnWarnings();
		} catch (error) {
			this.logError('[CRON] Error checking for turn warnings:', error);
		}
	}

	/**
	 * Remove disconnected players from waiting rooms
	 * Original: cron.schedule('*\/30 * * * * * ', ...)
	 */
	async removeDisconnectedPlayersJob() {
		try {
			await removeDisconnectedPlayersFromWaitingRooms();
		} catch (error) {
			this.logError('[CRON] Error removing disconnected players:', error);
		}
	}

	/**
	 * Clean up abandoned rooms
	 * Original: cron.schedule('0 * * * *', ...)
	 */
	async cleanupAbandonedRooms() {
		try {
			// Find rooms that have been waiting for more than 2 hours
			const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

			const abandonedRooms = await DominoRoom.find({
				status: 'WAITING',
				createdAt: { $lt: twoHoursAgo },
			});

			for (const room of abandonedRooms) {
				try {
					// Refund entry fees to human players using DOMINO_REFUND
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

					// Mark room as cancelled
					room.status = 'CANCELLED';
					room.completedAt = new Date();
					await room.save();
				} catch (error) {
					this.logError(
						`[CRON] Error cleaning up room ${room.roomId}:`,
						error
					);
				}
			}
		} catch (error) {
			this.logError('[CRON] Error in domino room cleanup:', error);
		}
	}

	/**
	 * Clean up orphaned games (games without valid rooms)
	 */
	async cleanupOrphanedGames() {
		try {
			// Find games that are ACTIVE but have no room or invalid room
			const activeGames = await DominoGame.find({
				gameState: 'ACTIVE',
			}).populate('room');

			// Filter games where room is null after population
			const orphanedGames = activeGames.filter(game => !game.room);

			for (const game of orphanedGames) {
				try {
					// Mark game as completed with a special end reason
					game.gameState = 'COMPLETED';
					game.endReason = 'BLOCKED_NO_MOVES';
					game.completedAt = new Date();
					game.winner = null; // No winner for orphaned games
					game.finalScores = [];

					await game.save();
				} catch (error) {
					this.logError(
						`[CRON] Error cleaning up orphaned game ${game._id}:`,
						error
					);
				}
			}
		} catch (error) {
			this.logError('[CRON] Error in orphaned games cleanup:', error);
		}
	}

	/**
	 * Fill room with bots helper function
	 * Extracted from original domino.js
	 */
	async fillRoomWithBots(room, slotsNeeded, gameConfig) {
		try {
			const botNames = gameConfig.computerPlayerNames;
			const usedNames = room.players.map(p => p.playerName);
			const availableNames = botNames.filter(
				name => !usedNames.includes(name)
			);

			// If we need more bots than available names, generate numbered variants
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
				// Update total pot (bots contribute to pot in VIRTUAL games)
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
			this.logError(
				`[BOT-FILL] Error filling room ${room.roomId} with bots:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Process bot turn helper function
	 * Extracted from original domino.js
	 */
	async processBotTurn(game) {
		try {
			const currentPlayer = game.players[game.currentPlayer];

			if (!currentPlayer || currentPlayer.playerType !== 'COMPUTER') {
				return;
			}

			// Use the existing autoPlay logic to determine bot's move
			const move = DominoGameEngine.autoPlay(game);

			// Process the bot's move using existing game engine
			const moveResult = DominoGameEngine.processMove(game, move, true);

			if (!moveResult.success) {
				this.logError(
					`[BOT-TURN] Bot move failed for ${currentPlayer.playerName}:`,
					moveResult.error
				);
				return;
			}

			const updatedGameState = moveResult.gameState;

			// Build update object for atomic operation
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

			// Add completion fields if game is completed
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

			// Use findOneAndUpdate with version check to prevent concurrent modifications
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

			if (!updatedGame) {
				return;
			}

			// Check if room is properly populated
			if (!updatedGame.room) {
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

			// Send turn notifications if game is still active
			if (updatedGame.gameState === 'ACTIVE' && updatedGame.room) {
				await notifyTurnChange(
					updatedGame.toJSON(),
					updatedGame.room.roomId,
					updatedGame.currentPlayer - 1
				);
			}

			// Check if game is completed
			if (
				updatedGame.gameState === 'COMPLETED' ||
				updatedGame.gameState === 'BLOCKED'
			) {
				await handleGameCompletion(updatedGame);
			}

		} catch (error) {
			this.logError(
				`[BOT-TURN] Error processing bot turn for game ${game._id}:`,
				error
			);
		}
	}
}

// Export for testing purposes
export default DominoWorker;
