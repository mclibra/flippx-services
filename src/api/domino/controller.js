import { DominoRoom, DominoGame, DominoChat, DominoGameConfig } from './model';
import { DominoGameEngine } from '../../services/domino/gameEngine';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';
import { makeTransaction } from '../transaction/controller';
import { LoyaltyService } from '../loyalty/service';
import { broadcastToRoom, broadcastGameUpdate, sendToUser } from '../../services/socket/dominoSocket';

export const leaveRoom = async ({ roomId }, user) => {
    try {
        const room = await DominoRoom.findOne({ roomId });

        if (!room) {
            return {
                status: 404,
                entity: { success: false, error: 'Room not found' }
            };
        }

        if (room.status !== 'WAITING') {
            return {
                status: 400,
                entity: { success: false, error: 'Cannot leave room after game has started' }
            };
        }

        // Find and remove player
        const playerIndex = room.players.findIndex(p => p.user && p.user.toString() === user._id.toString());

        if (playerIndex === -1) {
            return {
                status: 400,
                entity: { success: false, error: 'You are not in this room' }
            };
        }

        // Refund entry fee using DOMINO_REFUND transaction identifier
        await makeTransaction(
            user._id,
            user.role,
            'DOMINO_REFUND',
            room.entryFee,
            room._id,
            room.cashType
        );

        // Remove player and update positions
        room.players.splice(playerIndex, 1);
        room.players.forEach((player, index) => {
            player.position = index;
        });

        room.totalPot -= room.entryFee;

        // If room is empty, delete it
        if (room.players.length === 0) {
            await DominoRoom.findByIdAndDelete(room._id);
        } else {
            await room.save();
        }

        // Broadcast player left
        broadcastToRoom(roomId, 'player-left', {
            userId: user._id,
            roomState: room
        });

        return {
            status: 200,
            entity: { success: true, message: 'Left room successfully' }
        };
    } catch (error) {
        console.error('Error leaving room:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

// ===================== GAME LOGIC =====================

export const startDominoGame = async (room) => {
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
            score: 0,
            totalScore: 0,
            isConnected: player.isConnected,
            lastAction: new Date(),
            consecutivePasses: 0
        }));

        // Create game document
        const game = await DominoGame.create({
            room: room._id,
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
        broadcastToRoom(room.roomId, 'game-started', {
            gameId: game._id,
            gameState: game,
            roomState: room,
            message: 'Game has started!'
        });

        // Send turn notification to first player
        await notifyTurnChange(game);

        return game;
    } catch (error) {
        console.error('Error starting domino game:', error);
        throw error;
    }
};

export const fillWithComputerPlayers = async (room) => {
    try {
        const config = await DominoGameConfig.findOne();
        const computerNames = config?.computerPlayerNames || ['Bot_Alpha', 'Bot_Beta', 'Bot_Gamma'];

        while (room.players.length < room.playerCount) {
            const botName = computerNames[room.players.length - 1];

            room.players.push({
                user: null,
                playerName: botName,
                playerType: 'COMPUTER',
                position: room.players.length,
                isReady: true,
                isConnected: true
            });
        }

        await room.save();

        return room;
    } catch (error) {
        console.error('Error filling with computer players:', error);
        throw error;
    }
};

// Enhanced function to notify players about turn changes
const notifyTurnChange = async (game, previousPlayerIndex) => {
    try {
        const currentPlayer = game.players[game.currentPlayer];
        const previousPlayer = game.players[previousPlayerIndex];

        if (currentPlayer && currentPlayer.user) {
            // Notify current player it's their turn
            sendToUser(currentPlayer.user, 'your-turn', {
                gameId: game._id,
                position: currentPlayer.position,
                timeLimit: game.turnTimeLimit,
                turnStartTime: game.turnStartTime,
                drawPileCount: game.drawPile.length,
                availableTiles: game.drawPile.length
            });
        }

        // Broadcast turn change to all players in room
        broadcastGameUpdate(game.room.roomId, 'turn-changed', {
            gameId: game._id,
            currentPlayer: game.currentPlayer,
            currentPlayerName: currentPlayer?.playerName,
            previousPlayer: previousPlayerIndex,
            previousPlayerName: previousPlayer?.playerName,
            turnStartTime: game.turnStartTime,
            drawPileCount: game.drawPile.length,
            availableTiles: game.drawPile.length
        });

    } catch (error) {
        console.error('Error notifying turn change:', error);
    }
};

// Enhanced function to send turn reminders/warnings
const sendTurnReminder = async (game, timeRemaining) => {
    const currentPlayer = game.players[game.currentPlayer];
    const roomId = game.room.roomId || game.room;

    if (currentPlayer && currentPlayer.user) {
        sendToUser(currentPlayer.user, 'turn-reminder', {
            gameId: game._id,
            timeRemaining,
            message: `Hurry up! You have ${timeRemaining} seconds left to make your move.`
        });
    }

    // Notify other players about the time warning
    broadcastToRoom(roomId, 'turn-time-warning', {
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
        broadcastGameUpdate(game.room.roomId, 'game-update', {
            gameState: game,
            lastMove: moveResult.move,
            moveBy: {
                position: playerIndex,
                playerName: game.players[playerIndex].playerName,
                action: action
            },
            drawPileCount: game.drawPile.length,
            availableTiles: game.drawPile.length // For client tracking
        });

        // Send turn notifications if game is still active
        if (game.gameState === 'ACTIVE') {
            await notifyTurnChange(game, playerIndex);
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

export const handleTurnTimeout = async (gameId, userId) => {
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

        console.log(`hasPlayableTiles => ${hasPlayableTiles}`);

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

        console.log(`Move result => `, moveResult.move);
        console.log(`Game State => `, moveResult.gameState.gameState);
        console.log(`All moves => `, moveResult.gameState.moves);

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
                sendToUser(timedOutPlayer.user, 'turn-timeout-notification', {
                    gameId: game._id,
                    message: `Your turn timed out and you automatically ${autoAction.toLowerCase()}ed.`,
                    autoAction: autoAction
                });
            }

            // Broadcast timeout and move with draw pile count
            broadcastGameUpdate(game.room.roomId, 'turn-timeout', {
                gameState: game,
                timedOutPlayer: previousPlayer,
                timedOutPlayerName: timedOutPlayer?.playerName,
                autoAction: autoAction,
                drawPileCount: game.drawPile.length
            });

            // Send turn notifications if game is still active
            if (game.gameState === 'ACTIVE') {
                await notifyTurnChange(game, previousPlayer);
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

// New function to send turn warnings (call this from a cron job)
export const sendTurnWarnings = async () => {
    try {
        const warningThreshold = 15; // 15 seconds remaining
        const now = new Date();
        const warningTime = new Date(now.getTime() - (45 * 1000)); // 45 seconds ago (60-15=45)

        // Find games where turn started 45 seconds ago (15 seconds remaining)
        const gamesNeedingWarning = await DominoGame.find({
            gameState: 'ACTIVE',
            turnStartTime: {
                $gte: new Date(warningTime.getTime() - 5000), // 5 second buffer
                $lte: warningTime
            }
        }).populate('room');

        for (const game of gamesNeedingWarning) {
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
        broadcastToRoom(roomId, 'new-message', {
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
                    broadcastToRoom(room.roomId, 'player-removed-timeout', {
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


const handleGameCompletion = async (game) => {
    try {
        const room = game.room;

        // Process payouts and loyalty for winner
        if (game.winner !== undefined) {
            const winnerPlayer = game.players[game.winner];

            // Check if winner is a bot (computer player) in a VIRTUAL room
            const isBotWinnerInVirtualRoom = winnerPlayer.playerType === 'COMPUTER' &&
                room.cashType === 'VIRTUAL' &&
                !winnerPlayer.user;

            if (isBotWinnerInVirtualRoom) {
                // Bot wins in VIRTUAL room - send winnings to system account
                console.log(`Bot ${winnerPlayer.playerName} won in VIRTUAL room ${room.roomId}, sending winnings to system account`);

                // Get system account
                const systemUser = await User.findOne({ role: 'SYSTEM' });

                if (systemUser) {
                    // Credit system account with bot's winnings
                    await makeTransaction(
                        systemUser._id,
                        'SYSTEM',
                        'WON_DOMINO',
                        game.winnerPayout,
                        game._id,
                        room.cashType
                    );

                    console.log(`Credited $${game.winnerPayout} VIRTUAL winnings to system account for bot win in room ${room.roomId}`);
                } else {
                    console.error('System account not found for bot winning transaction');
                }
            } else if (winnerPlayer.user) {
                // Human player wins - existing logic
                // Credit winner with payout using DOMINO_WIN transaction
                await makeTransaction(
                    winnerPlayer.user,
                    'USER',
                    'WON_DOMINO',
                    game.winnerPayout,
                    game._id,
                    room.cashType
                );

                // Award XP for winning (consistent with other games)
                try {
                    const { LoyaltyService } = await import('../loyalty/service');

                    // Calculate XP based on winnings
                    const baseXP = Math.max(10, Math.floor(game.winnerPayout / 2)); // 1 XP per $2 won, minimum 10 XP
                    const cashTypeMultiplier = room.cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
                    const winMultiplier = 1.5; // Bonus for winning
                    const totalXP = Math.floor(baseXP * cashTypeMultiplier * winMultiplier);

                    const xpResult = await LoyaltyService.awardUserXP(
                        winnerPlayer.user,
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
                            position: game.winner,
                            endReason: game.endReason,
                            isWin: true
                        }
                    );

                    if (!xpResult.success) {
                        console.warn(`Failed to award win XP for user ${winnerPlayer.user}:`, xpResult.error);
                    } else {
                        console.log(`Awarded ${totalXP} XP to user ${winnerPlayer.user} for domino win`);
                    }
                } catch (xpError) {
                    console.error(`Error awarding win XP for user ${winnerPlayer.user}:`, xpError);
                    // Don't fail game completion if XP awarding fails
                }
            }
        }

        room.status = 'COMPLETED';
        room.completedAt = new Date();
        await room.save();

        broadcastToRoom(room.roomId, 'game-completed', {
            gameState: game,
            winner: game.winner,
            finalScores: game.finalScores,
            roomState: room
        });

    } catch (error) {
        console.error('Error handling game completion:', error);
    }
};