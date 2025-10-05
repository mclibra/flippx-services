import { DominoRoom, DominoGame, DominoChat, DominoGameConfig } from './model';
import { DominoGameEngine } from '../../services/domino/gameEngine';
import { User } from '../user/model';
import { makeTransaction } from '../transaction/controller';
import { LoyaltyService } from '../loyalty/service';
import {
	broadcastDominoGameUpdateToRoom,
	sendDominoGameUpdateToUser,
} from '../../services/socket/dominoGameSocket';
import SocketBroadcastService from '../../services/socket/socketBroadcastService';

// Helper function to send socket messages that works in both main and worker processes
const sendSocketMessage = async (userId, roomId, event, data) => {
	// Check if we're in a worker process (has process.send)
	const isWorkerProcess = process.send !== undefined;

	if (isWorkerProcess) {
		// In worker process, use IPC to send to main process
		await SocketBroadcastService.broadcastToDominoRoom(roomId, event, data);
	} else {
		// In main process, call socket function directly
		sendDominoGameUpdateToUser(userId, roomId, event, data);
	}
};

// Helper function to broadcast socket messages that works in both main and worker processes
const broadcastSocketMessage = async (roomId, event, data) => {
	// Check if we're in a worker process (has process.send)
	const isWorkerProcess = process.send !== undefined;

	if (isWorkerProcess) {
		// In worker process, use IPC to send to main process
		await SocketBroadcastService.broadcastToDominoRoom(roomId, event, data);
	} else {
		// In main process, call socket function directly
		broadcastDominoGameUpdateToRoom(roomId, event, data);
	}
};

export const startDominoGame = async room => {
	try {
		const gameNumber = 0;

		const game = await createNewDominoGame(room, gameNumber);

		// Update room status
		room.status = 'IN_PROGRESS';
		room.startedAt = new Date();
		await room.save();

		// Record play activity for all human players using LoyaltyService
		for (const player of game.players) {
			if (player.user && player.playerType === 'HUMAN') {
				const userId =
					typeof player.user === 'object'
						? player.user._id
						: player.user;
				try {
					// Extract user ID string from user object if it's populated
					const loyaltyResult =
						await LoyaltyService.recordUserPlayActivity(userId);
					if (!loyaltyResult.success) {
						console.warn(
							`Failed to record play activity for user ${userId}:`,
							loyaltyResult.error
						);
					} else {
						console.log(
							`Play activity recorded for user ${userId} - Domino game start`
						);
					}
				} catch (error) {
					console.error(
						`Error recording play activity for user ${player.user}:`,
						error
					);
					// Don't fail the game start if loyalty tracking fails
				}

				sendSocketMessage(userId, room.roomId, 'game-started', {
					gameId: game._id,
					board: game.board,
					drawPile: game.drawPile,
					players: game.players.map(player => ({
						position: player.position,
						playerType: player.playerType,
						playerName: player.playerName,
						isConnected: player.isConnected,
						tileCount: player.hand.length,
					})),
					currentPlayerPosition: game.currentPlayer,
					...player,
				});
			}
		}

		await new Promise(resolve => setTimeout(resolve, 1500));

		// Send turn notification to first player
		await notifyTurnChange(game, room.roomId);

		return game;
	} catch (error) {
		console.error('Error starting domino game:', error);
		throw error;
	}
};

// Enhanced function to notify players about turn changes
export const notifyTurnChange = async (
	game,
	roomId,
	previousPlayerPosition
) => {
	try {
		const previousPlayer = game.players.find(
			player => player.position == previousPlayerPosition
		);
		const currentPlayer = game.players.find(
			player => player.position == game.currentPlayer
		);

		for (const player of game.players) {
			if (player.user && player.playerType === 'HUMAN') {
				if (player.position == game.currentPlayer) {
					sendSocketMessage(player.user, roomId, 'your-turn', {
						gameId: game._id,
						board: game.board,
						drawPile: game.drawPile,
						...player,
					});
				} else {
					sendSocketMessage(player.user, roomId, 'turn-changed', {
						gameId: game._id,
						board: game.board,
						drawPile: game.drawPile,
						currentPlayerPosition: currentPlayer.position,
						currentPlayerName: currentPlayer?.playerName,
						previousPlayerPosition: previousPlayerPosition,
						previousPlayerName: previousPlayer?.playerName,
						turnStartTime: game.turnStartTime,
					});
				}
			}
		}
	} catch (error) {
		console.error('Error notifying turn change:', error);
	}
};

// Enhanced function to send turn reminders/warnings
const sendTurnReminder = async (game, timeRemaining) => {
	const currentPlayer = game.players[game.currentPlayer];

	if (!game.room) {
		console.error(
			`Game ${game._id} has no room associated for turn reminder`
		);
		return;
	}

	const roomId = game.room.roomId || game.room;

	console.log('Sending turn-reminder to user ', currentPlayer.user);
	if (currentPlayer && currentPlayer.user) {
		sendSocketMessage(currentPlayer.user, roomId, 'turn-reminder', {
			gameId: game._id,
			timeRemaining,
			message: `Hurry up! You have ${timeRemaining} seconds left to make your move.`,
		});
	}

	// Notify other players about the time warning
	broadcastSocketMessage(roomId, 'turn-time-warning', {
		gameId: game._id,
		currentPlayer: game.currentPlayer,
		timeRemaining,
		playerName: currentPlayer?.playerName,
	});
};

export const makeMove = async ({ gameId }, { tile, side, drawnTile }, user) => {
	try {
		const game = await DominoGame.findById(gameId).populate('room');

		if (!game) {
			return {
				status: 404,
				entity: { success: false, error: 'Game not found' },
			};
		}

		if (game.gameState !== 'ACTIVE') {
			return {
				status: 400,
				entity: { success: false, error: 'Game is not active' },
			};
		}

		const currentPlayer = game.players.find(
			p => p.user.toString() === user._id.toString()
		);
		const currentPlayerPosition = currentPlayer.position;

		if (currentPlayerPosition === -1) {
			return {
				status: 400,
				entity: { success: false, error: 'Player not in this game' },
			};
		}

		if (game.currentPlayer !== currentPlayerPosition) {
			return {
				status: 400,
				entity: { success: false, error: 'Not your turn' },
			};
		}

		const move = {
			tile,
			side,
			drawnTile,
		};

		const moveResult = DominoGameEngine.processMove(game, move);

		if (!moveResult.success) {
			return {
				status: 400,
				entity: { success: false, error: moveResult.error },
			};
		}

		// Selectively update game state fields without overwriting populated references
		const updatedGameState = moveResult.gameState;

		console.log(
			`Updated gameState => ${JSON.stringify(moveResult.gameState)}`
		);

		// Update specific fields from the game state result
		game.currentPlayer = updatedGameState.currentPlayer;
		game.gameState = updatedGameState.gameState;
		game.players = updatedGameState.players;
		game.board = updatedGameState.board;
		game.drawPile = updatedGameState.drawPile;
		game.moves = updatedGameState.moves;
		game.totalMoves = updatedGameState.totalMoves;
		game.turnStartTime = updatedGameState.turnStartTime;

		// Only update completion fields if game is completed or blocked
		if (
			updatedGameState.gameState === 'COMPLETED' ||
			updatedGameState.gameState === 'BLOCKED'
		) {
			game.winner = updatedGameState.winner;
			game.endReason = updatedGameState.endReason;
			game.finalScores = updatedGameState.finalScores;
			game.completedAt = updatedGameState.completedAt;
			game.duration = updatedGameState.duration;
		}

		await game.save();

		console.log(
			`Make move game has been updated. The updated board is ${game.board}`
		);

		for (const player of game.players) {
			if (player.user && player.playerType === 'HUMAN') {
				if (player.position != currentPlayerPosition) {
					sendSocketMessage(
						player.user,
						game.room.roomId,
						'game-update',
						{
							gameId: game._id,
							players: game.players.map(gamePlayer => ({
								position: gamePlayer.position,
								playerType: gamePlayer.playerType,
								playerName: gamePlayer.playerName,
								isConnected: gamePlayer.isConnected,
								tileCount: gamePlayer.hand.length,
							})),
							lastMove: moveResult.move,
							moveBy: {
								position: currentPlayer.position,
								playerName: currentPlayer.playerName,
								playerType: currentPlayer.playerType,
							},
							board: game.board,
							drawPile: game.drawPile,
						}
					);
				}
			}
		}

		// Send turn notifications if game is still active
		if (game.gameState === 'ACTIVE') {
			await notifyTurnChange(
				game.toJSON(),
				game.room.roomId,
				currentPlayerPosition
			);
		}

		// Check if game is completed or blocked
		if (game.gameState === 'COMPLETED' || game.gameState === 'BLOCKED') {
			await handleGameCompletion(game);
		}

		return {
			status: 200,
			entity: {
				success: true,
				gameState: game,
				move: moveResult.move,
				drawPileCount: game.drawPile.length,
			},
		};
	} catch (error) {
		console.error('Error making move:', error);
		return {
			status: 500,
			entity: { success: false, error: 'Internal server error' },
		};
	}
};

export const handleTurnTimeout = async (gameId, currentPlayer) => {
	try {
		const game = await DominoGame.findById(gameId).populate('room');

		if (!game || game.gameState !== 'ACTIVE') {
			return;
		}

		if (!game.room) {
			console.error(`Game ${gameId} has no room associated`);
			return;
		}

		const timedOutPlayer = game.players[game.currentPlayer];
		const timedOutPlayerPosition = currentPlayer.position;

		// Use the existing autoPlay logic to determine bot's move
		const move = DominoGameEngine.autoPlay(game);

		const modifiedMov = {
			drawnTile: move.drawnTile,
		};

		console.log(
			`[AUTO-MOVE] ${timedOutPlayer.playerName} decided to play:`,
			modifiedMov
		);

		// Process the bot's move using existing game engine
		const moveResult = DominoGameEngine.processMove(
			game,
			modifiedMov,
			true
		);

		console.log(`[AUTO-MOVE] completed for ${timedOutPlayer.playerName}`);

		if (!moveResult.success) {
			console.error(
				`[AUTO-MOVE] Auto move failed for ${timedOutPlayer.playerName}:`,
				moveResult.error
			);
			return;
		}

		if (moveResult.success) {
			// Selectively update game state fields without overwriting the room reference
			const updatedGameState = moveResult.gameState;

			// Update specific fields from the game state result
			game.currentPlayer = updatedGameState.currentPlayer;
			game.gameState = updatedGameState.gameState;
			game.players = updatedGameState.players;
			game.board = updatedGameState.board;
			game.drawPile = updatedGameState.drawPile;
			game.moves = updatedGameState.moves;
			game.totalMoves = updatedGameState.totalMoves;
			game.turnStartTime = updatedGameState.turnStartTime;

			// Only update completion fields if game is completed
			if (
				game.gameState === 'COMPLETED' ||
				game.gameState === 'BLOCKED'
			) {
				game.winner = updatedGameState.winner;
				game.endReason = updatedGameState.endReason;
				game.finalScores = updatedGameState.finalScores;
				game.completedAt = updatedGameState.completedAt;
				game.duration = updatedGameState.duration;
			}

			console.log(
				`Saving game after auto move by ${timedOutPlayer.playerName}`
			);

			await game.save();

			// Send timeout notification to all players
			broadcastSocketMessage(game.room.roomId, 'turn-timeout', {
				gameId: game._id,
				position: timedOutPlayerPosition,
				playerName: timedOutPlayer.playerName,
				playerType: timedOutPlayer.playerType,
				currentPlayerPosition: game.currentPlayer,
				message: `${timedOutPlayer.playerName} timed out`,
			});

			for (const player of game.players) {
				if (player.user && player.playerType === 'HUMAN') {
					sendSocketMessage(
						player.user,
						game.room.roomId,
						'game-update',
						{
							gameId: game._id,
							players: game.players.map(gamePlayer => ({
								position: gamePlayer.position,
								playerType: gamePlayer.playerType,
								playerName: gamePlayer.playerName,
								isConnected: gamePlayer.isConnected,
								tileCount: gamePlayer.hand.length,
							})),
							lastMove: moveResult.move,
							moveBy: {
								position: timedOutPlayer.position,
								playerName: timedOutPlayer.playerName,
								playerType: timedOutPlayer.playerType,
							},
							board: game.board,
							drawPile: game.drawPile,
						}
					);
				}
			}

			// Send turn notifications if game is still active
			if (game.gameState === 'ACTIVE') {
				console.log(
					`Game is still active. Sending turn change notifications.`
				);
				await notifyTurnChange(
					game.toJSON(),
					game.room.roomId,
					timedOutPlayerPosition
				);
			}

			// Check if game is completed or blocked
			if (
				game.gameState === 'COMPLETED' ||
				game.gameState === 'BLOCKED'
			) {
				console.log(
					`Game is still COMPLETED or BLOCKED: ${game.gameState}`
				);
				await handleGameCompletion(game);
			}
		}
	} catch (error) {
		console.error('Error handling turn timeout:', error);
	}
};

export const sendTurnWarnings = async () => {
	try {
		const warningThreshold = 15; // 15 seconds remaining
		const now = new Date();
		const warningTime = new Date(now.getTime() - warningThreshold * 1000);

		// Find games where turn started 45 seconds ago (15 seconds remaining)
		const gamesNeedingWarning = await DominoGame.find({
			gameState: 'ACTIVE',
			turnStartTime: {
				$gte: new Date(warningTime.getTime() - 5000), // 5 second buffer
				$lte: warningTime,
			},
		}).populate('room');

		for (const game of gamesNeedingWarning) {
			console.log('Sending turn warnings for game ', game._id);
			await sendTurnReminder(game, warningThreshold);
		}
	} catch (error) {
		console.error('Error sending turn warnings:', error);
	}
};

export const sendMessage = async ({ roomId }, { message }, user) => {
	try {
		if (!message || message.trim().length === 0) {
			return {
				status: 400,
				entity: { success: false, error: 'Message cannot be empty' },
			};
		}

		const room = await DominoRoom.findOne({ roomId });

		if (!room) {
			return {
				status: 404,
				entity: { success: false, error: 'Room not found' },
			};
		}

		// Check if user is in room
		const playerInRoom = room.players.find(
			p => p.user && p.user.toString() === user._id.toString()
		);

		if (!playerInRoom) {
			return {
				status: 403,
				entity: { success: false, error: 'You are not in this room' },
			};
		}

		if (message.trim().length > 200) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Message too long (max 200 characters)',
				},
			};
		}

		// Create chat message
		const chatMessage = await DominoChat.create({
			room: room._id,
			user: user._id,
			playerName: playerInRoom.playerName,
			message: message.trim(),
			messageType: 'TEXT',
		});

		// Broadcast to room
		broadcastSocketMessage(roomId, 'new-message', {
			messageId: chatMessage._id,
			user: user._id,
			playerName: playerInRoom.playerName,
			message: chatMessage.message,
			messageType: chatMessage.messageType,
			timestamp: chatMessage.createdAt,
		});

		return {
			status: 200,
			entity: { success: true, message: chatMessage },
		};
	} catch (error) {
		console.error('Error sending message:', error);
		return {
			status: 500,
			entity: { success: false, error: error.message },
		};
	}
};

export const getChatHistory = async ({ roomId }, query, user) => {
	try {
		const { limit = 50, offset = 0 } = query;

		const room = await DominoRoom.findOne({ roomId });

		if (!room) {
			return {
				status: 404,
				entity: { success: false, error: 'Room not found' },
			};
		}

		// Check if user is in room
		const playerInRoom = room.players.find(
			p => p.user && p.user.toString() === user._id.toString()
		);

		if (!playerInRoom) {
			return {
				status: 403,
				entity: { success: false, error: 'You are not in this room' },
			};
		}

		const messages = await DominoChat.find({ room: room._id })
			.populate('user', 'name')
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await DominoChat.countDocuments({ room: room._id });

		return {
			status: 200,
			entity: {
				success: true,
				messages: messages.reverse(), // Reverse to show oldest first
				total,
				pagination: {
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: parseInt(offset) + parseInt(limit) < total,
				},
			},
		};
	} catch (error) {
		console.error('Error getting chat history:', error);
		return {
			status: 500,
			entity: { success: false, error: error.message },
		};
	}
};

// ===================== ADMIN CONFIGURATION =====================

export const updateGameConfig = async body => {
	try {
		const config = await DominoGameConfig.findOneAndUpdate({}, body, {
			new: true,
			upsert: true,
		});

		return {
			status: 200,
			entity: { success: true, config },
		};
	} catch (error) {
		console.error('Error updating game config:', error);
		return {
			status: 500,
			entity: { success: false, error: error.message },
		};
	}
};

export const getGameConfig = async () => {
	try {
		const config = await DominoGameConfig.findOne();

		return {
			status: 200,
			entity: { success: true, config },
		};
	} catch (error) {
		console.error('Error getting game config:', error);
		return {
			status: 500,
			entity: { success: false, error: error.message },
		};
	}
};

// ===================== DISCONNECTION HANDLING =====================

export const removeDisconnectedPlayersFromWaitingRooms = async () => {
	try {
		const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
		let totalRemovedPlayers = 0;
		let roomsProcessed = 0;

		// Find WAITING rooms with disconnected players who haven't reconnected in 30+ seconds
		const roomsWithDisconnectedPlayers = await DominoRoom.find({
			status: 'WAITING',
			players: {
				$elemMatch: {
					isConnected: false,
					disconnectedAt: { $lt: thirtySecondsAgo },
					playerType: 'HUMAN',
					user: { $ne: null },
				},
			},
		});

		for (const room of roomsWithDisconnectedPlayers) {
			try {
				// Find all disconnected players who have exceeded the timeout
				const playersToRemove = room.players.filter(
					player =>
						!player.isConnected &&
						player.disconnectedAt &&
						player.disconnectedAt < thirtySecondsAgo &&
						player.playerType === 'HUMAN' &&
						player.user
				);

				const removedUserIds = [];

				for (const player of playersToRemove) {
					console.log(
						`Removing disconnected player ${player.user} from waiting room ${room.roomId} after 30 second timeout`
					);

					// Refund entry fee using DOMINO_REFUND transaction identifier
					await makeTransaction(
						player.user,
						'USER',
						'DOMINO_REFUND',
						room.entryFee,
						room._id,
						room.cashType
					);

					removedUserIds.push(player.user);

					// Remove player from room
					const playerIndex = room.players.findIndex(
						p =>
							p.user &&
							p.user.toString() === player.user.toString()
					);
					if (playerIndex !== -1) {
						room.players.splice(playerIndex, 1);
						totalRemovedPlayers++;
					}
				}

				// Update positions for remaining players
				room.players.forEach((remainingPlayer, index) => {
					remainingPlayer.position = index;
				});

				// Update total pot
				room.totalPot -= room.entryFee * playersToRemove.length;

				// If room is empty after removing disconnected players, delete it
				if (room.players.length === 0) {
					await DominoRoom.findByIdAndDelete(room._id);
					console.log(
						`Deleted empty room ${room.roomId} after removing all disconnected players`
					);
				} else {
					// Save the updated room
					await room.save();

					// Broadcast the updated room state to remaining players
					broadcastSocketMessage(
						room.roomId,
						'player-removed-timeout',
						{
							removedPlayers: removedUserIds,
							roomState: room,
							reason: 'DISCONNECTION_TIMEOUT',
						}
					);
				}

				roomsProcessed++;
			} catch (error) {
				console.error(
					`Error removing disconnected players from room ${room.roomId}:`,
					error
				);
			}
		}

		return {
			status: 200,
			entity: {
				success: true,
				removedPlayers: totalRemovedPlayers,
				roomsProcessed: roomsProcessed,
				message: `Removed ${totalRemovedPlayers} disconnected players from ${roomsProcessed} waiting rooms`,
			},
		};
	} catch (error) {
		console.error(
			'Error in removeDisconnectedPlayersFromWaitingRooms:',
			error
		);
		return {
			status: 500,
			entity: { success: false, error: error.message },
		};
	}
};

// export const handleGameCompletion = async (game) => {
//     try {
//         const room = game.room;

//         // Process payouts and loyalty for winner
//         if (game.winner !== undefined) {
//             const winnerPlayer = game.players[game.winner];

//             // Check if winner is a bot (computer player) in a VIRTUAL room
//             const isBotWinnerInVirtualRoom = winnerPlayer.playerType === 'COMPUTER' &&
//                 room.cashType === 'VIRTUAL' &&
//                 !winnerPlayer.user;

//             if (isBotWinnerInVirtualRoom) {
//                 // Bot wins in VIRTUAL room - send winnings to system account
//                 console.log(`Bot ${winnerPlayer.playerName} won in VIRTUAL room ${room.roomId}, sending winnings to system account`);

//                 // Get system account
//                 const systemUser = await User.findOne({ role: 'SYSTEM' });

//                 if (systemUser) {
//                     // Credit system account with bot's winnings
//                     await makeTransaction(
//                         systemUser._id,
//                         'SYSTEM',
//                         'WON_DOMINO',
//                         game.winnerPayout,
//                         game._id,
//                         room.cashType
//                     );

//                     console.log(`Credited $${game.winnerPayout} VIRTUAL winnings to system account for bot win in room ${room.roomId}`);
//                 } else {
//                     console.error('System account not found for bot winning transaction');
//                 }
//             } else if (winnerPlayer.user) {
//                 // Human player wins - existing logic
//                 // Credit winner with payout using DOMINO_WIN transaction
//                 await makeTransaction(
//                     winnerPlayer.user,
//                     'USER',
//                     'WON_DOMINO',
//                     game.winnerPayout,
//                     game._id,
//                     room.cashType
//                 );

//                 // Award XP for winning (consistent with other games)
//                 try {
//                     // Calculate XP based on winnings
//                     const baseXP = Math.max(10, Math.floor(game.winnerPayout / 2)); // 1 XP per $2 won, minimum 10 XP
//                     const cashTypeMultiplier = room.cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
//                     const winMultiplier = 1.5; // Bonus for winning
//                     const totalXP = Math.floor(baseXP * cashTypeMultiplier * winMultiplier);

//                     const xpResult = await LoyaltyService.awardUserXP(
//                         winnerPlayer.user,
//                         totalXP,
//                         'GAME_REWARD',
//                         `Domino game won - Winnings: ${game.winnerPayout} (${room.cashType})`,
//                         {
//                             gameType: 'DOMINO',
//                             gameId: game._id,
//                             roomId: room._id,
//                             winnings: game.winnerPayout,
//                             cashType: room.cashType,
//                             baseXP,
//                             multiplier: cashTypeMultiplier * winMultiplier,
//                             position: game.winner,
//                             endReason: game.endReason,
//                             isWin: true
//                         }
//                     );

//                     if (!xpResult.success) {
//                         console.warn(`Failed to award win XP for user ${winnerPlayer.user}:`, xpResult.error);
//                     } else {
//                         console.log(`Awarded ${totalXP} XP to user ${winnerPlayer.user} for domino win`);
//                     }
//                 } catch (xpError) {
//                     console.error(`Error awarding win XP for user ${winnerPlayer.user}:`, xpError);
//                     // Don't fail game completion if XP awarding fails
//                 }
//             }
//         }

//         room.status = 'COMPLETED';
//         room.completedAt = new Date();
//         await room.save();

//         broadcastSocketMessage(room.roomId, 'game-completed', {
//             gameState: game,
//             winner: game.winner,
//             finalScores: game.finalScores,
//             roomState: room
//         });

//     } catch (error) {
//         console.error('Error handling game completion:', error);
//     }
// };

export const handleGameCompletion = async game => {
	try {
		console.log(
			`[GAME-COMPLETION] Processing completion for game ${game._id} in room ${game.room.roomId}`
		);

		// Get game configuration for newGameDelay
		const gameConfig = await DominoGameConfig.findOne();
		const newGameDelay = gameConfig?.newGameDelay || 30; // Default 30 seconds

		const room = game.room;
		const winRule = room.gameSettings.winRule;
		const targetPoints = room.gameSettings.targetPoints;

		// Update player total scores from the current game
		await updatePlayerTotalScores(game, room);

		if (winRule === 'STANDARD') {
			await handleStandardGameCompletion(game, room);
		} else if (winRule === 'POINTS') {
			await handlePointBasedGameCompletion(
				game,
				room,
				targetPoints,
				newGameDelay
			);
		}

		console.log(
			`[GAME-COMPLETION] ✅ Completed processing for game ${game._id}`
		);
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error handling game completion for ${game._id}:`,
			error
		);
	}
};

// Helper function to update player total scores in the room and track last tile player
const updatePlayerTotalScores = async (game, room) => {
	try {
		// Get the final scores from the completed game
		const finalScores = game.finalScores || [];

		// Update each player's total score in the room
		for (const scoreData of finalScores) {
			const roundScore = scoreData.roundScore || 0;

			await DominoRoom.updateOne(
				{
					_id: room._id,
					'players.position': scoreData.position,
				},
				{
					$inc: { 'players.$.totalScore': roundScore },
				}
			);
		}

		// Track the last tile player for next game's first turn
		// For points-based games, the winner is typically the player who played the last tile
		if (game.winner !== null && game.winner !== undefined) {
			await DominoRoom.updateOne(
				{ _id: room._id },
				{ $set: { lastTilePlayerPosition: game.winner } }
			);

			console.log(
				`[GAME-COMPLETION] Set lastTilePlayerPosition to ${game.winner} for room ${room.roomId}`
			);
		}

		console.log(
			`[GAME-COMPLETION] Updated player total scores for room ${room.roomId}`
		);
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error updating player total scores:`,
			error
		);
	}
};

const handleStandardGameCompletion = async (game, room) => {
	try {
		room.status = 'COMPLETED';
		room.completedAt = new Date();
		await room.save();

		// Distribute prizes and handle transactions
		await distributePrizes(game, room);

		// Get winner player details
		const winnerPlayer = game.players.find(p => p.position === game.winner);

		// Broadcast final game completion
		const gameCompletedData = {
			gameId: game._id,
			roomId: room.roomId,
			winner: game.winner,
			winnerPayout: game.winnerPayout,
			winnerDetails: winnerPlayer
				? {
						position: winnerPlayer.position,
						playerName: winnerPlayer.playerName,
						playerType: winnerPlayer.playerType,
						user: winnerPlayer.user,
					}
				: null,
			endReason: game.endReason,
			finalScores: game.finalScores,
			gameType: 'STANDARD',
		};
		broadcastSocketMessage(
			room.roomId,
			'game-completed',
			gameCompletedData
		);

		console.log(
			`[GAME-COMPLETION] STANDARD game completed for room ${room.roomId}`
		);
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error in STANDARD game completion:`,
			error
		);
	}
};

// Handle POINTS game completion
const handlePointBasedGameCompletion = async (
	game,
	room,
	targetPoints,
	newGameDelay
) => {
	try {
		// Get updated room with current player scores
		const updatedRoom = await DominoRoom.findById(room._id);

		// Check if any player has reached the target points
		const winnerPlayer = updatedRoom.players.find(
			player => (player.totalScore || 0) >= targetPoints
		);

		if (winnerPlayer) {
			// Someone reached target points - complete the entire challenge
			await completePointBasedChallenge(game, updatedRoom, winnerPlayer);
		} else {
			// No one reached target points - start countdown for new game
			await startNewGameCountdown(game, updatedRoom, newGameDelay);
		}
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error in POINTS game completion:`,
			error
		);
	}
};

// Complete the entire POINTS challenge
const completePointBasedChallenge = async (game, room, winnerPlayer) => {
	try {
		// Mark room as completed
		room.status = 'COMPLETED';
		room.completedAt = new Date();
		await room.save();

		// Distribute prizes to the challenge winner
		await distributePrizes(game, room, winnerPlayer);

		// Broadcast challenge completion
		const challengeCompletedData = {
			gameId: game._id,
			roomId: room.roomId,
			winner: {
				position: winnerPlayer.position,
				playerName: winnerPlayer.playerName,
				totalScore: winnerPlayer.totalScore,
			},
			winnerPayout: game.winnerPayout,
			endReason: 'TARGET_POINTS_REACHED',
			allPlayersScore: room.players.map(p => ({
				position: p.position,
				playerName: p.playerName,
				totalScore: p.totalScore || 0,
			})),
			gameType: 'POINTS',
		};
		broadcastSocketMessage(
			room.roomId,
			'challenge-completed',
			challengeCompletedData
		);

		console.log(
			`[GAME-COMPLETION] POINTS challenge completed! Winner: ${winnerPlayer.playerName} with ${winnerPlayer.totalScore} points`
		);
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error completing POINTS challenge:`,
			error
		);
	}
};

// Start countdown for new game in POINTS mode
const startNewGameCountdown = async (game, room, delaySeconds) => {
	try {
		console.log(
			`[GAME-COMPLETION] Starting ${delaySeconds}s countdown for new game in room ${room.roomId}`
		);

		// Get round winner details
		const roundWinner = game.players.find(p => p.position === game.winner);

		// Broadcast round completion with countdown
		broadcastSocketMessage(room.roomId, 'round-completed', {
			gameId: game._id,
			roomId: room.roomId,
			roundNumber: game.gameNumber,
			finalScores: game.finalScores,
			roundWinnerIndex: game.winner,
			winnerPayout: game.winnerPayout,
			roundWinnerDetails: roundWinner
				? {
						position: roundWinner.position,
						playerName: roundWinner.playerName,
						playerType: roundWinner.playerType,
						user: roundWinner.user,
					}
				: null,
			nextGameCountdown: delaySeconds,
			targetPoints: room.gameSettings.targetPoints,
			gameType: 'POINTS',
		});

		// Start countdown with periodic updates
		await startCountdownWithUpdates(room, delaySeconds);
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error starting new game countdown:`,
			error
		);
	}
};

// Handle countdown with periodic updates and start new game
const startCountdownWithUpdates = async (room, totalSeconds) => {
	let remainingSeconds = totalSeconds;

	// Send countdown updates every 5 seconds for the first part, then every second for last 5 seconds
	const sendCountdownUpdate = () => {
		if (remainingSeconds > 0) {
			broadcastSocketMessage(room.roomId, 'new-game-countdown', {
				roomId: room.roomId,
				remainingSeconds,
				message: `Next game starts in ${remainingSeconds} seconds...`,
			});
		}
	};

	// Initial countdown update
	sendCountdownUpdate();

	// Set up countdown intervals
	const countdownInterval = setInterval(() => {
		remainingSeconds--;

		// Send updates every 5 seconds, or every second for last 5 seconds
		if (remainingSeconds <= 5 || remainingSeconds % 5 === 0) {
			sendCountdownUpdate();
		}

		if (remainingSeconds <= 0) {
			clearInterval(countdownInterval);
		}
	}, 1000);

	// After the delay, start the new game
	setTimeout(async () => {
		try {
			console.log(
				`[GAME-COMPLETION] Starting new game for room ${room.roomId}`
			);
			await startNewGameInRoom(room);
		} catch (error) {
			console.error(
				`[GAME-COMPLETION] Error starting new game after countdown:`,
				error
			);
		}
	}, totalSeconds * 1000);
};

// Start a new game in the same room (for POINTS challenges)
const startNewGameInRoom = async room => {
	try {
		// Increment game number for the new round
		const nextGameNumber =
			(await DominoGame.countDocuments({ room: room._id })) + 1;

		// Create and start the new game
		const game = await createNewDominoGame(room, nextGameNumber);

		// Record play activity for all human players using LoyaltyService
		for (const player of game.players) {
			if (player.user && player.playerType === 'HUMAN') {
				const userId =
					typeof player.user === 'object'
						? player.user._id
						: player.user;
				try {
					// Extract user ID string from user object if it's populated
					const loyaltyResult =
						await LoyaltyService.recordUserPlayActivity(userId);
					if (!loyaltyResult.success) {
						console.warn(
							`Failed to record play activity for user ${userId}:`,
							loyaltyResult.error
						);
					} else {
						console.log(
							`Play activity recorded for user ${userId} - Domino game start`
						);
					}
				} catch (error) {
					console.error(
						`Error recording play activity for user ${player.user}:`,
						error
					);
					// Don't fail the game start if loyalty tracking fails
				}

				sendSocketMessage(userId, room.roomId, 'game-started', {
					gameId: game._id,
					board: game.board,
					drawPile: game.drawPile,
					players: game.players.map(player => ({
						position: player.position,
						playerType: player.playerType,
						playerName: player.playerName,
						isConnected: player.isConnected,
						tileCount: player.hand.length,
					})),
					currentPlayerPosition: game.currentPlayer,
					...player,
				});
			}
		}

		// Send turn notification to first player
		await notifyTurnChange(game, room.roomId);

		console.log(
			`[GAME-COMPLETION] ✅ New game ${game._id} started for room ${room.roomId} (Round ${nextGameNumber})`
		);
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error creating new game in room:`,
			error
		);
	}
};

// Create a new domino game for the room
const createNewDominoGame = async (room, gameNumber) => {
	try {
		const gameConfig = await DominoGameConfig.findOne();
		const houseEdge = gameConfig?.houseEdge || 0;

		// Calculate house amount and winner payout
		const houseAmount = Math.floor(room.totalPot * (houseEdge / 100));
		const winnerPayout = room.totalPot - houseAmount;

		// Deal tiles to players
		const tilesPerPlayer = room.gameSettings.tilesPerPlayer;
		const { players: gamePlayersWithTiles, drawPile } =
			DominoGameEngine.dealTiles(room.players.length, tilesPerPlayer);

		// Map room players to game players with tiles
		const gamePlayers = room.players.map((player, index) => ({
			position: index,
			user: player.user,
			playerType: player.playerType || 'HUMAN',
			playerName: player.playerName,
			hand: gamePlayersWithTiles[index].hand,
			score: 0, // Reset for new game
			totalScore: player.totalScore || 0, // Preserve cumulative score
			isConnected: player.isConnected,
			lastAction: new Date(),
			consecutivePasses: 0,
		}));

		// Create game document
		// For points-based games, start with the player who played the last tile in previous game
		// For the first game (gameNumber === 1), start with position 0
		let startingPlayer = 0;
		if (gameNumber === 1) {
			startingPlayer = 0; // First game always starts with position 0
		} else {
			// For subsequent games, use the last tile player, but validate the position
			const lastTilePlayer = room.lastTilePlayerPosition || 0;
			startingPlayer =
				lastTilePlayer >= 0 && lastTilePlayer < room.players.length
					? lastTilePlayer
					: 0; // Fallback to 0 if invalid position
		}

		const newGame = await DominoGame.create({
			room: room._id,
			gameNumber,
			currentPlayer: startingPlayer,
			gameState: 'ACTIVE',
			board: [],
			players: gamePlayers,
			drawPile,
			moves: [],
			turnStartTime: new Date(),
			turnTimeLimit: gameConfig?.turnTimeLimit || 15,
			totalPot: room.totalPot,
			houseEdge,
			houseAmount,
			winnerPayout,
			startedAt: new Date(),
		});

		console.log(
			`[GAME-COMPLETION] Created new game ${newGame._id} with starting player at position ${startingPlayer} (gameNumber: ${gameNumber}, lastTilePlayerPosition: ${room.lastTilePlayerPosition})`
		);

		return newGame.toJSON();
	} catch (error) {
		console.error(
			`[GAME-COMPLETION] Error creating new domino game:`,
			error
		);
		throw error;
	}
};

// Distribute prizes (implementation depends on existing transaction system)
const distributePrizes = async (game, room, challengeWinner = null) => {
	try {
		// For STANDARD games, use the game winner
		// For POINTS games, use the challenge winner if provided
		const winner =
			challengeWinner ||
			room.players.find(p => p.position === game.winner);

		if (winner && winner.user && winner.playerType === 'HUMAN') {
			// Distribute winner payout using existing transaction system
			await makeTransaction(
				winner.user,
				'USER',
				'WON_DOMINO',
				game.winnerPayout,
				room._id,
				room.cashType
			);

			// Award XP for winning (consistent with other games)
			try {
				// Calculate XP based on winnings
				const baseXP = Math.max(10, Math.floor(game.winnerPayout / 2)); // 1 XP per $2 won, minimum 10 XP
				const cashTypeMultiplier = room.cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
				const winMultiplier = 1.5; // Bonus for winning
				const totalXP = Math.floor(
					baseXP * cashTypeMultiplier * winMultiplier
				);

				const xpResult = await LoyaltyService.awardUserXP(
					winner.user,
					totalXP,
					'GAME_REWARD',
					`Domino game won - Winnings: ${game.winnerPayout} (${room.cashType})`,
					{
						gameType: 'DOMINO',
						gameId: game._id,
						roomId: room._id,
						winnings: game.winnerPayout,
						cashType: room.cashType,
						baseXP,
						multiplier: cashTypeMultiplier * winMultiplier,
						position: winner.position,
						endReason: game.endReason,
						isWin: true,
					}
				);

				if (!xpResult.success) {
					console.warn(
						`Failed to award win XP for user ${winner.playerName}:`,
						xpResult.error
					);
				} else {
					console.log(
						`Awarded ${totalXP} XP to user ${winner.playerName} for domino win`
					);
				}
			} catch (xpError) {
				console.error(
					`Error awarding win XP for user ${winner.playerName}:`,
					xpError
				);
				// Don't fail game completion if XP awarding fails
			}

			console.log(
				`[GAME-COMPLETION] Prize of ${game.winnerPayout} distributed to ${winner.playerName}`
			);
		} else if (
			winner &&
			winner.playerType === 'COMPUTER' &&
			room.cashType === 'VIRTUAL' &&
			!winner.user
		) {
			console.log(
				`Bot ${winner.playerName} won in VIRTUAL room ${room.roomId}, sending winnings to system account`
			);

			// Get system account
			const systemUser = await User.findOne({ role: 'SYSTEM' });

			if (systemUser) {
				// Credit system account with bot's winnings - READ FROM ROOM
				await makeTransaction(
					systemUser._id,
					'SYSTEM',
					'WON_DOMINO',
					game.winnerPayout,
					room._id,
					room.cashType
				);

				console.log(
					`Credited $${game.winnerPayout} VIRTUAL winnings to system account for bot win in room ${room.roomId}`
				);
			} else {
				console.error(
					'System account not found for bot winning transaction'
				);
			}
		}
	} catch (error) {
		console.error(`[GAME-COMPLETION] Error distributing prizes:`, error);
	}
};
