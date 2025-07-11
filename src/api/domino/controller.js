import { DominoRoom, DominoGame, DominoChat, DominoGameConfig } from './model';
import { DominoGameEngine } from '../../services/domino/gameEngine';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';
import { makeTransaction } from '../transaction/controller';
import { LoyaltyService } from '../loyalty/service';
import {
    broadcastDominoGameUpdateToRoom,
    sendDominoGameUpdateToUser
} from '../../services/socket/dominoGameSocket';

export const startDominoGame = async (room) => {
    try {
        const gameNumber = 0;

        const game = await createNewDominoGame(room, gameNumber);

        // Update room status
        room.status = 'IN_PROGRESS';
        room.startedAt = new Date();
        await room.save();

        // Record play activity for all human players using LoyaltyService
        for (const player of room.players) {
            if (player.user && player.playerType === 'HUMAN') {
                try {
                    // Extract user ID string from user object if it's populated
                    const userId = typeof player.user === 'object' ? player.user._id : player.user;
                    const loyaltyResult = await LoyaltyService.recordUserPlayActivity(userId);
                    if (!loyaltyResult.success) {
                        console.warn(`Failed to record play activity for user ${userId}:`, loyaltyResult.error);
                    } else {
                        console.log(`Play activity recorded for user ${userId} - Domino game start`);
                    }
                } catch (error) {
                    console.error(`Error recording play activity for user ${player.user}:`, error);
                    // Don't fail the game start if loyalty tracking fails
                }
            }
        }

        // Broadcast game start
        broadcastDominoGameUpdateToRoom(room.roomId, 'game-started', {
            gameId: game._id,
            roomId: room.roomId,
            gameNumber: gameNumber,
            players: game.players.map(player => ({
                position: player.position,
                user: player.user,
                playerType: player.playerType,
                playerName: player.playerName,
                isConnected: player.isConnected,
            })),
            board: game.board,
            drawPile: game.drawPile,
            currentPlayer: game.currentPlayer,
            targetPoints: room.gameSettings.targetPoints,
            gameType: room.gameSettings.winRule,
            message: 'Game has started!',
        });

        // Send turn notification to first player
        await notifyTurnChange(game.toJSON());

        return game;
    } catch (error) {
        console.error('Error starting domino game:', error);
        throw error;
    }
};

// Enhanced function to notify players about turn changes
export const notifyTurnChange = async (game, previousPlayerIndex) => {
    try {
        const currentPlayer = game.players[game.currentPlayer];
        const previousPlayer = game.players[previousPlayerIndex];

        if (currentPlayer && currentPlayer.user) {
            // Notify current player it's their turn
            sendDominoGameUpdateToUser(currentPlayer.user, 'your-turn', {
                gameId: game._id,
                board: game.board,
                drawPile: game.drawPile,
                ...game.players[game.currentPlayer]
            });
        }

        // Broadcast turn change to all players in room
        broadcastDominoGameUpdateToRoom(game.room.roomId, 'turn-changed', {
            gameId: game._id,
            board: game.board,
            drawPile: game.drawPile,
            currentPlayer: game.currentPlayer,
            currentPlayerName: currentPlayer?.playerName,
            previousPlayer: previousPlayerIndex,
            previousPlayerName: previousPlayer?.playerName,
            turnStartTime: game.turnStartTime,
        });

    } catch (error) {
        console.error('Error notifying turn change:', error);
    }
};

// Enhanced function to send turn reminders/warnings
const sendTurnReminder = async (game, timeRemaining) => {
    const currentPlayer = game.players[game.currentPlayer];
    const roomId = game.room.roomId || game.room;

    console.log('Sending turn-reminder to user ', currentPlayer.user);
    if (currentPlayer && currentPlayer.user) {
        sendDominoGameUpdateToUser(currentPlayer.user, 'turn-reminder', {
            gameId: game._id,
            timeRemaining,
            message: `Hurry up! You have ${timeRemaining} seconds left to make your move.`
        });
    }

    // Notify other players about the time warning
    broadcastDominoGameUpdateToRoom(roomId, 'turn-time-warning', {
        gameId: game._id,
        currentPlayer: game.currentPlayer,
        timeRemaining,
        playerName: currentPlayer?.playerName
    });
};

export const makeMove = async ({ gameId }, { action, tile, side }, user) => {
    try {
        const game = await DominoGame.findById(gameId).populate('room');

        if (!game) {
            return {
                status: 404,
                entity: { success: false, error: 'Game not found' }
            };
        }

        if (game.gameState !== 'ACTIVE') {
            return {
                status: 400,
                entity: { success: false, error: 'Game is not active' }
            };
        }

        const playerIndex = game.players.findIndex(p => p.user.toString() === user._id.toString());
        if (playerIndex === -1) {
            return {
                status: 400,
                entity: { success: false, error: 'Player not in this game' }
            };
        }

        if (game.currentPlayer !== playerIndex) {
            return {
                status: 400,
                entity: { success: false, error: 'Not your turn' }
            };
        }

        const moveResult = DominoGameEngine.processMove(game, playerIndex, action, tile, side);

        if (!moveResult.success) {
            return {
                status: 400,
                entity: { success: false, error: moveResult.error }
            };
        }

        // Selectively update game state fields without overwriting populated references
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

        // Only update completion fields if game is completed or blocked
        if (updatedGameState.gameState === 'COMPLETED' || updatedGameState.gameState === 'BLOCKED') {
            game.winner = updatedGameState.winner;
            game.endReason = updatedGameState.endReason;
            game.finalScores = updatedGameState.finalScores;
            game.completedAt = updatedGameState.completedAt;
            game.duration = updatedGameState.duration;
        }

        await game.save();

        // Broadcast move to all players with enhanced data including draw pile count
        broadcastDominoGameUpdateToRoom(game.room.roomId, 'game-update', {
            gameId: game._id,
            players: game.players.map(player => ({
                position: player.position,
                user: player.user,
                playerType: player.playerType,
                playerName: player.playerName,
                isConnected: player.isConnected,
            })),
            lastMove: moveResult.move,
            moveBy: {
                position: playerIndex,
                playerName: game.players[playerIndex].playerName,
                playerType: game.players[playerIndex].playerType,
                action: action
            },
            board: game.board,
            drawPile: game.drawPile,
        });

        // Send turn notifications if game is still active
        if (game.gameState === 'ACTIVE') {
            await notifyTurnChange(game.toJSON(), playerIndex);
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
                drawPileCount: game.drawPile.length
            }
        };

    } catch (error) {
        console.error('Error making move:', error);
        return {
            status: 500,
            entity: { success: false, error: 'Internal server error' }
        };
    }
};

export const handleTurnTimeout = async (gameId, currentPlayer) => {
    try {
        const game = await DominoGame.findById(gameId).populate('room');

        if (!game || game.gameState !== 'ACTIVE') {
            return;
        }

        const previousPlayer = game.currentPlayer;
        const timedOutPlayer = game.players[game.currentPlayer];

        // Check if the player has any playable tiles
        const hasPlayableTiles = DominoGameEngine.hasValidMoves(
            timedOutPlayer.hand,
            game.board
        );

        let moveResult;
        let autoAction;

        if (hasPlayableTiles) {
            // Player has playable tiles, so PASS
            moveResult = DominoGameEngine.processMove(game, game.currentPlayer, 'PASS');
            autoAction = 'PASS';
        } else {
            // Check if there are tiles to draw
            if (game.drawPile.length > 0) {
                // Player has no playable tiles but can draw
                moveResult = DominoGameEngine.processMove(game, game.currentPlayer, 'DRAW');
                autoAction = 'DRAW';
            } else {
                // No tiles to draw and no playable tiles, so PASS
                moveResult = DominoGameEngine.processMove(game, game.currentPlayer, 'PASS');
                autoAction = 'PASS';
            }
        }

        console.log(`Auto move for ${currentPlayer.playerName} => `, moveResult.move);

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
            if (updatedGameState.gameState === 'COMPLETED' || updatedGameState.gameState === 'BLOCKED') {
                game.winner = updatedGameState.winner;
                game.endReason = updatedGameState.endReason;
                game.finalScores = updatedGameState.finalScores;
                game.completedAt = updatedGameState.completedAt;
                game.duration = updatedGameState.duration;
            }

            await game.save();

            // Notify the timed-out player
            if (timedOutPlayer && timedOutPlayer.user) {
                sendDominoGameUpdateToUser(timedOutPlayer.user, 'turn-timeout-notification', {
                    gameId: game._id,
                    message: `Your turn timed out and you automatically ${autoAction.toLowerCase()}ed.`,
                    autoAction: autoAction
                });
            }

            // Broadcast timeout and move with draw pile count
            broadcastDominoGameUpdateToRoom(game.room.roomId, 'turn-timeout', {
                gameState: game,
                timedOutPlayer: previousPlayer,
                timedOutPlayerName: timedOutPlayer?.playerName,
                autoAction: autoAction,
                drawPileCount: game.drawPile.length
            });

            // Send turn notifications if game is still active
            if (game.gameState === 'ACTIVE') {
                await notifyTurnChange(game.toJSON(), previousPlayer);
            }

            // Check if game is completed or blocked
            if (game.gameState === 'COMPLETED' || updatedGameState.gameState === 'BLOCKED') {
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
        const warningTime = new Date(now.getTime() - (warningThreshold * 1000));

        // Find games where turn started 45 seconds ago (15 seconds remaining)
        const gamesNeedingWarning = await DominoGame.find({
            gameState: 'ACTIVE',
            turnStartTime: {
                $gte: new Date(warningTime.getTime() - 5000), // 5 second buffer
                $lte: warningTime
            }
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
                entity: { success: false, error: 'Message cannot be empty' }
            };
        }

        const room = await DominoRoom.findOne({ roomId });

        if (!room) {
            return {
                status: 404,
                entity: { success: false, error: 'Room not found' }
            };
        }

        // Check if user is in room
        const playerInRoom = room.players.find(p =>
            p.user && p.user.toString() === user._id.toString()
        );

        if (!playerInRoom) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this room' }
            };
        }

        if (message.trim().length > 200) {
            return {
                status: 400,
                entity: { success: false, error: 'Message too long (max 200 characters)' }
            };
        }

        // Create chat message
        const chatMessage = await DominoChat.create({
            room: room._id,
            user: user._id,
            playerName: playerInRoom.playerName,
            message: message.trim(),
            messageType: 'TEXT'
        });

        // Broadcast to room
        broadcastDominoGameUpdateToRoom(roomId, 'new-message', {
            messageId: chatMessage._id,
            user: user._id,
            playerName: playerInRoom.playerName,
            message: chatMessage.message,
            messageType: chatMessage.messageType,
            timestamp: chatMessage.createdAt
        });

        return {
            status: 200,
            entity: { success: true, message: chatMessage }
        };

    } catch (error) {
        console.error('Error sending message:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
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
                entity: { success: false, error: 'Room not found' }
            };
        }

        // Check if user is in room
        const playerInRoom = room.players.find(p =>
            p.user && p.user.toString() === user._id.toString()
        );

        if (!playerInRoom) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this room' }
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
                    hasMore: (parseInt(offset) + parseInt(limit)) < total
                }
            }
        };

    } catch (error) {
        console.error('Error getting chat history:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

// ===================== ADMIN CONFIGURATION =====================

export const updateGameConfig = async (body, user) => {
    try {
        const config = await DominoGameConfig.findOneAndUpdate(
            {},
            body,
            { new: true, upsert: true }
        );

        return {
            status: 200,
            entity: { success: true, config }
        };

    } catch (error) {
        console.error('Error updating game config:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const getGameConfig = async () => {
    try {
        const config = await DominoGameConfig.findOne();

        return {
            status: 200,
            entity: { success: true, config }
        };

    } catch (error) {
        console.error('Error getting game config:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
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
                    user: { $ne: null }
                }
            }
        });

        for (const room of roomsWithDisconnectedPlayers) {
            try {
                // Find all disconnected players who have exceeded the timeout
                const playersToRemove = room.players.filter(player =>
                    !player.isConnected &&
                    player.disconnectedAt &&
                    player.disconnectedAt < thirtySecondsAgo &&
                    player.playerType === 'HUMAN' &&
                    player.user
                );

                const removedUserIds = [];

                for (const player of playersToRemove) {
                    console.log(`Removing disconnected player ${player.user} from waiting room ${room.roomId} after 30 second timeout`);

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
                    const playerIndex = room.players.findIndex(p => p.user && p.user.toString() === player.user.toString());
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
                room.totalPot -= (room.entryFee * playersToRemove.length);

                // If room is empty after removing disconnected players, delete it
                if (room.players.length === 0) {
                    await DominoRoom.findByIdAndDelete(room._id);
                    console.log(`Deleted empty room ${room.roomId} after removing all disconnected players`);
                } else {
                    // Save the updated room
                    await room.save();

                    // Broadcast the updated room state to remaining players
                    broadcastDominoGameUpdateToRoom(room.roomId, 'player-removed-timeout', {
                        removedPlayers: removedUserIds,
                        roomState: room,
                        reason: 'DISCONNECTION_TIMEOUT'
                    });
                }

                roomsProcessed++;

            } catch (error) {
                console.error(`Error removing disconnected players from room ${room.roomId}:`, error);
            }
        }

        return {
            status: 200,
            entity: {
                success: true,
                removedPlayers: totalRemovedPlayers,
                roomsProcessed: roomsProcessed,
                message: `Removed ${totalRemovedPlayers} disconnected players from ${roomsProcessed} waiting rooms`
            }
        };

    } catch (error) {
        console.error('Error in removeDisconnectedPlayersFromWaitingRooms:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
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

//         broadcastDominoGameUpdateToRoom(room.roomId, 'game-completed', {
//             gameState: game,
//             winner: game.winner,
//             finalScores: game.finalScores,
//             roomState: room
//         });

//     } catch (error) {
//         console.error('Error handling game completion:', error);
//     }
// };

export const handleGameCompletion = async (game) => {
    try {
        console.log(`[GAME-COMPLETION] Processing completion for game ${game._id} in room ${game.room.roomId}`);

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
        } else if (winRule === 'POINT_BASED') {
            await handlePointBasedGameCompletion(game, room, targetPoints, newGameDelay);
        }

        console.log(`[GAME-COMPLETION] ✅ Completed processing for game ${game._id}`);

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error handling game completion for ${game._id}:`, error);
    }
};

// Helper function to update player total scores in the room
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
                    'players.position': scoreData.position
                },
                {
                    $inc: { 'players.$.totalScore': roundScore }
                }
            );
        }

        console.log(`[GAME-COMPLETION] Updated player total scores for room ${room.roomId}`);

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error updating player total scores:`, error);
    }
};

const handleStandardGameCompletion = async (game, room) => {
    try {
        room.status = 'COMPLETED';
        room.completedAt = new Date();
        await room.save();

        // Distribute prizes and handle transactions
        await distributePrizes(game, room);

        // Broadcast final game completion
        broadcastDominoGameUpdateToRoom(room.roomId, 'game-completed', {
            gameId: game._id,
            roomId: room.roomId,
            winner: game.winner,
            endReason: game.endReason,
            finalScores: game.finalScores,
            gameType: 'STANDARD'
        });

        console.log(`[GAME-COMPLETION] STANDARD game completed for room ${room.roomId}`);

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error in STANDARD game completion:`, error);
    }
};

// Handle POINT_BASED game completion
const handlePointBasedGameCompletion = async (game, room, targetPoints, newGameDelay) => {
    try {
        // Get updated room with current player scores
        const updatedRoom = await DominoRoom.findById(room._id);

        // Check if any player has reached the target points
        const winnerPlayer = updatedRoom.players.find(player =>
            (player.totalScore || 0) >= targetPoints
        );

        if (winnerPlayer) {
            // Someone reached target points - complete the entire challenge
            await completePointBasedChallenge(game, updatedRoom, winnerPlayer);
        } else {
            // No one reached target points - start countdown for new game
            await startNewGameCountdown(game, updatedRoom, newGameDelay);
        }

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error in POINT_BASED game completion:`, error);
    }
};

// Complete the entire POINT_BASED challenge
const completePointBasedChallenge = async (game, room, winnerPlayer) => {
    try {
        // Mark room as completed
        room.status = 'COMPLETED';
        room.completedAt = new Date();
        await room.save();

        // Distribute prizes to the challenge winner
        await distributePrizes(game, room, winnerPlayer);

        // Broadcast challenge completion
        broadcastDominoGameUpdateToRoom(room.roomId, 'challenge-completed', {
            gameId: game._id,
            roomId: room.roomId,
            challengeWinner: {
                position: winnerPlayer.position,
                playerName: winnerPlayer.playerName,
                totalScore: winnerPlayer.totalScore
            },
            endReason: 'TARGET_POINTS_REACHED',
            finalScores: room.players.map(p => ({
                position: p.position,
                playerName: p.playerName,
                totalScore: p.totalScore || 0
            })),
            gameType: 'POINT_BASED'
        });

        console.log(`[GAME-COMPLETION] POINT_BASED challenge completed! Winner: ${winnerPlayer.playerName} with ${winnerPlayer.totalScore} points`);

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error completing POINT_BASED challenge:`, error);
    }
};

// Start countdown for new game in POINT_BASED mode
const startNewGameCountdown = async (game, room, delaySeconds) => {
    try {
        console.log(`[GAME-COMPLETION] Starting ${delaySeconds}s countdown for new game in room ${room.roomId}`);

        // Broadcast round completion with countdown
        broadcastDominoGameUpdateToRoom(room.roomId, 'round-completed', {
            gameId: game._id,
            roomId: room.roomId,
            roundNumber: game.gameNumber,
            roundWinner: game.winner,
            roundScores: game.finalScores,
            playerTotalScores: room.players.map(p => ({
                position: p.position,
                playerName: p.playerName,
                totalScore: p.totalScore || 0
            })),
            nextGameCountdown: delaySeconds,
            targetPoints: room.gameSettings.targetPoints,
            gameType: 'POINT_BASED'
        });

        // Start countdown with periodic updates
        await startCountdownWithUpdates(room, delaySeconds);

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error starting new game countdown:`, error);
    }
};

// Handle countdown with periodic updates and start new game
const startCountdownWithUpdates = async (room, totalSeconds) => {
    let remainingSeconds = totalSeconds;

    // Send countdown updates every 5 seconds for the first part, then every second for last 5 seconds
    const sendCountdownUpdate = () => {
        if (remainingSeconds > 0) {
            broadcastDominoGameUpdateToRoom(room.roomId, 'new-game-countdown', {
                roomId: room.roomId,
                remainingSeconds,
                message: `Next game starts in ${remainingSeconds} seconds...`
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
            console.log(`[GAME-COMPLETION] Starting new game for room ${room.roomId}`);
            await startNewGameInRoom(room);
        } catch (error) {
            console.error(`[GAME-COMPLETION] Error starting new game after countdown:`, error);
        }
    }, totalSeconds * 1000);
};

// Start a new game in the same room (for POINT_BASED challenges)
const startNewGameInRoom = async (room) => {
    try {
        // Increment game number for the new round
        const nextGameNumber = await DominoGame.countDocuments({ room: room._id }) + 1;

        // Create and start the new game
        const newGame = await createNewDominoGame(room, nextGameNumber);

        // Broadcast new game started
        broadcastDominoGameUpdateToRoom(room.roomId, 'game-started', {
            gameId: newGame._id,
            roomId: room.roomId,
            gameNumber: nextGameNumber,
            players: newGame.players.map(player => ({
                position: player.position,
                user: player.user,
                playerType: player.playerType,
                playerName: player.playerName,
                isConnected: player.isConnected,
            })),
            board: newGame.board,
            drawPile: newGame.drawPile,
            currentPlayer: newGame.currentPlayer,
            targetPoints: room.gameSettings.targetPoints,
            gameType: room.gameSettings.winRule,
            message: 'Game has started!',
        });

        // Send turn notification to first player
        await notifyTurnChange(newGame.toJSON());

        console.log(`[GAME-COMPLETION] ✅ New game ${newGame._id} started for room ${room.roomId} (Round ${nextGameNumber})`);

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error creating new game in room:`, error);
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
        const { players: gamePlayersWithTiles, drawPile } = DominoGameEngine.dealTiles(room.players.length, tilesPerPlayer);

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
            consecutivePasses: 0
        }));

        // Create game document
        const newGame = await DominoGame.create({
            room: room._id,
            gameNumber,
            currentPlayer: 0,
            gameState: 'ACTIVE',
            board: [],
            players: gamePlayers,
            drawPile,
            moves: [],
            turnStartTime: new Date(),
            turnTimeLimit: gameConfig?.turnTimeLimit || 60,
            totalPot: room.totalPot,
            houseEdge,
            houseAmount,
            winnerPayout,
            startedAt: new Date()
        });

        return newGame;

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error creating new domino game:`, error);
        throw error;
    }
};

// Distribute prizes (implementation depends on existing transaction system)
const distributePrizes = async (game, room, challengeWinner = null) => {
    try {
        // For STANDARD games, use the game winner
        // For POINT_BASED games, use the challenge winner if provided
        const winner = challengeWinner || room.players.find(p => p.position === game.winner);

        if (winner && winner.user && winner.playerType === 'HUMAN') {
            // Distribute winner payout using existing transaction system
            await makeTransaction(
                winner.user,
                'USER', // Assuming winner role
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
                const totalXP = Math.floor(baseXP * cashTypeMultiplier * winMultiplier);

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
                        isWin: true
                    }
                );

                if (!xpResult.success) {
                    console.warn(`Failed to award win XP for user ${winner.playerName}:`, xpResult.error);
                } else {
                    console.log(`Awarded ${totalXP} XP to user ${winner.playerName} for domino win`);
                }
            } catch (xpError) {
                console.error(`Error awarding win XP for user ${winner.playerName}:`, xpError);
                // Don't fail game completion if XP awarding fails
            }

            console.log(`[GAME-COMPLETION] Prize of ${game.winnerPayout} distributed to ${winner.playerName}`);
        }

    } catch (error) {
        console.error(`[GAME-COMPLETION] Error distributing prizes:`, error);
    }
};