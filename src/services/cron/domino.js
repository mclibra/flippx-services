import cron from 'node-cron';
import { DominoRoom, DominoGame, DominoGameConfig } from '../../api/domino/model';
import { DominoGameEngine } from '../domino/gameEngine';
import { makeTransaction } from '../../api/transaction/controller';
import {
    startDominoGame,
    handleTurnTimeout,
    notifyTurnChange,
    sendTurnWarnings,
    handleGameCompletion,
    removeDisconnectedPlayersFromWaitingRooms
} from '../../api/domino/controller';
import { broadcastDominoGameUpdateToRoom } from '../socket/dominoGameSocket';

let processingGames = new Set();

// Fill VIRTUAL waiting rooms with bots after 30 seconds
cron.schedule('*/3 * * * * *', async () => {
    try {
        const gameConfig = await DominoGameConfig.findOne();
        if (!gameConfig) {
            return;
        }

        const maxWaitTime = new Date(Date.now() - 3 * 1000); // 30 seconds ago

        const virtualRoomsNeedingBots = await DominoRoom.find({
            status: 'WAITING',
            cashType: 'VIRTUAL',
            createdAt: {
                $lte: maxWaitTime
            },
            $expr: { $lt: [{ $size: '$players' }, '$playerCount'] }
        });

        let roomsProcessed = 0;
        let botsAdded = 0;

        for (const room of virtualRoomsNeedingBots) {
            try {
                const slotsNeeded = room.playerCount - room.players.length;

                if (slotsNeeded > 0) {
                    console.log(`[CRON] Filling ${slotsNeeded} bot slots in VIRTUAL room ${room.roomId}`);

                    await fillRoomWithBots(room, slotsNeeded, gameConfig);
                    botsAdded += slotsNeeded;
                    roomsProcessed++;
                }
            } catch (error) {
                console.error(`[CRON] Error filling room ${room.roomId} with bots:`, error);
            }
        }

        if (roomsProcessed > 0) {
            console.log(`[CRON] ✅ Added ${botsAdded} bots to ${roomsProcessed} VIRTUAL rooms`);
        }

    } catch (error) {
        console.error('[CRON] Error in bot room filling:', error);
    }
});

// Handle human timeouts
cron.schedule('*/10 * * * * *', async () => {
    try {
        const config = await DominoGameConfig.findOne();
        const timeoutSeconds = config?.turnTimeLimit || 30;
        const timeoutThreshold = new Date(Date.now() - timeoutSeconds * 1000);

        // Find active games with expired turns
        const expiredGames = await DominoGame.find({
            gameState: 'ACTIVE',
            turnStartTime: { $lt: timeoutThreshold }
        }).populate('room');

        for (const game of expiredGames) {
            try {
                const currentPlayer = game.players[game.currentPlayer];

                if (currentPlayer && currentPlayer.playerType === 'HUMAN' && currentPlayer.user) {
                    console.log(`[CRON] Handling turn timeout for human user ${currentPlayer.user} in game ${game._id}`);
                    await handleTurnTimeout(game._id, currentPlayer);
                }
            } catch (error) {
                console.error(`[CRON] Error handling timeout for game ${game._id}:`, error);
            }
        }

    } catch (error) {
        console.error('[CRON] Error handling turn timeouts:', error);
    }
});

// Check for bot turns that need immediate processing (faster response)
cron.schedule('*/3 * * * * *', async () => {
    try {
        // Find active games where current player is a bot and turn just started (< 5 seconds ago)
        const timeoutThreshold = new Date(Date.now() - 3 * 1000); // 5 seconds ago

        const botTurnGames = await DominoGame.find({
            gameState: 'ACTIVE',
            turnStartTime: { $lt: timeoutThreshold },
            'players.playerType': 'COMPUTER',
            _id: { $nin: Array.from(processingGames) }
        }).populate('room');

        if (botTurnGames.length > 0) {
            console.log(`[CRON] Found ${botTurnGames.length} games with expired bot turns`);
        }

        for (const game of botTurnGames) {
            try {
                const currentPlayer = game.players[game.currentPlayer];

                if (currentPlayer && currentPlayer.playerType === 'COMPUTER') {
                    // Check if game is already being processed
                    if (processingGames.has(game._id.toString())) {
                        console.log(`[CRON] Game ${game._id} already being processed - skipping`);
                        continue;
                    }

                    // Mark game as being processed
                    processingGames.add(game._id.toString());

                    console.log(`[CRON] Processing immediate bot turn for ${currentPlayer.playerName} in game ${game._id}`);

                    // Process bot turn with enhanced concurrency control
                    await processBotTurn(game);

                    // Remove from processing set after completion
                    processingGames.delete(game._id.toString());
                }
            } catch (error) {
                // Ensure we remove from processing set even on error
                processingGames.delete(game._id.toString());
                console.error(`[CRON] Error processing immediate bot turn for game ${game._id}:`, error);
            }
        }

    } catch (error) {
        console.error('[CRON] Error checking immediate bot turns:', error);
    }
});

// Start games when rooms are full - runs every 10 seconds (EXISTING)
cron.schedule('*/3 * * * * *', async () => {
    try {
        const tenSecondsAgo = new Date(Date.now() - 3 * 1000);

        // Find waiting rooms that are full
        const fullRooms = await DominoRoom.find({
            status: 'WAITING',
            $expr: { $eq: ['$playerCount', { $size: '$players' }] },
            createdAt: { $lt: tenSecondsAgo }
        });

        for (const room of fullRooms) {
            try {
                console.log(`[CRON] Starting game for full room ${room.roomId} with ${room.players.length}/${room.playerCount} players`);
                await startDominoGame(room);
            } catch (error) {
                console.error(`[CRON] Error starting game for room ${room.roomId}:`, error);
            }
        }

    } catch (error) {
        console.error('[CRON] Error checking for full rooms:', error);
    }
});

// Send turn warnings via socket - runs every 5 seconds (EXISTING)
cron.schedule('*/5 * * * * *', async () => {
    try {
        const config = await DominoGameConfig.findOne();
        const timeoutSeconds = config?.turnTimeLimit || 30;

        // Check if there are any active games first
        const activeGamesCount = await DominoGame.countDocuments({ gameState: 'ACTIVE' });

        if (activeGamesCount === 0) {
            return;
        }

        console.log(`[CRON] Found ${activeGamesCount} active games, checking for warnings needed`);
        await sendTurnWarnings();
        console.log('[CRON] ✅ Socket-based turn warnings completed');

    } catch (error) {
        console.error('[CRON] Error in turn warnings:', error);
    }
});

// Remove disconnected players from waiting rooms - runs every 30 seconds (EXISTING)
cron.schedule('*/30 * * * * *', async () => {
    try {
        await removeDisconnectedPlayersFromWaitingRooms();
    } catch (error) {
        console.error('[CRON] Error removing disconnected players:', error);
    }
});

// Clean up abandoned rooms - runs every hour (EXISTING)
cron.schedule('0 * * * *', async () => {
    try {
        console.log('[CRON] Cleaning up abandoned domino rooms...');

        // Find rooms that have been waiting for more than 2 hours
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

        const abandonedRooms = await DominoRoom.find({
            status: 'WAITING',
            createdAt: { $lt: twoHoursAgo }
        });

        let cleanedCount = 0;

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

                cleanedCount++;
            } catch (error) {
                console.error(`[CRON] Error cleaning up room ${room.roomId}:`, error);
            }
        }

        if (cleanedCount > 0) {
            console.log(`[CRON] ✅ Cleaned up ${cleanedCount} abandoned domino rooms`);
        } else {
            console.log('[CRON] ✅ No abandoned rooms to clean up');
        }
    } catch (error) {
        console.error('[CRON] Error in domino room cleanup:', error);
    }
});

/**
 * Fill a VIRTUAL room with bot players
 */
async function fillRoomWithBots(room, slotsNeeded, gameConfig) {
    try {
        const botNames = gameConfig.computerPlayerNames;
        const usedNames = room.players.map(p => p.playerName);
        const availableNames = botNames.filter(name => !usedNames.includes(name));

        // If we need more bots than available names, generate numbered variants
        const allBotNames = [...availableNames];
        if (slotsNeeded > availableNames.length) {
            for (let i = 1; i <= slotsNeeded - availableNames.length; i++) {
                allBotNames.push(`${i + botNames.length}`);
            }
        }

        const bots = [];

        for (let i = 0; i < slotsNeeded; i++) {
            const botName = allBotNames[i] || `${room.players.length + i + 1}`;
            bots.push({
                user: null,
                playerType: 'COMPUTER',
                playerName: botName,
                position: room.players.length + i,
                isReady: true,
                isConnected: true,
                lastConnectedAt: new Date(),
                disconnectedAt: null,
                joinedAt: new Date()
            })
            // Update total pot (bots contribute to pot in VIRTUAL games)
            room.totalPot += room.entryFee;
        }

        room.players.push(...bots);
        await room.save();

        for (const bot in bots) {
            broadcastDominoGameUpdateToRoom(room.roomId, 'player-joined', {
                user: bot.user,
                playerName: bot.playerName,
                room: room.toJSON(),
            });
        }
        console.log(`[BOT-FILL] Added ${slotsNeeded} bots to room ${room.roomId}`);

    } catch (error) {
        console.error(`[BOT-FILL] Error filling room ${room.roomId} with bots:`, error);
        throw error;
    }
}

/**
 * Process a bot's turn automatically
 */
async function processBotTurn(game) {
    try {
        const currentPlayer = game.players[game.currentPlayer];

        if (!currentPlayer || currentPlayer.playerType !== 'COMPUTER') {
            return;
        }

        console.log(`[BOT-TURN] Processing turn for bot ${currentPlayer.playerName} in game ${game._id} and board ${game.board}`);

        // Use the existing autoPlay logic to determine bot's move
        const move = DominoGameEngine.autoPlay(game);

        console.log(`[BOT-TURN] Bot ${currentPlayer.playerName} decided to:`, move);

        // Process the bot's move using existing game engine
        const moveResult = DominoGameEngine.processMove(game, move);

        if (!moveResult.success) {
            console.error(`[BOT-TURN] Bot move failed for ${currentPlayer.playerName}:`, moveResult.error);
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
            turnStartTime: updatedGameState.turnStartTime
        };

        // Add completion fields if game is completed
        if (updatedGameState.gameState === 'COMPLETED' || updatedGameState.gameState === 'BLOCKED') {
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
                populate: 'room'
            }
        );

        if (!updatedGame) {
            console.log(`[BOT-TURN] Game ${game._id} was already updated by another process - skipping bot turn for ${currentPlayer.playerName}`);
            return;
        }

        console.log(`[BOT-TURN] Successfully updated game ${game._id} for bot ${currentPlayer.playerName}`);

        broadcastDominoGameUpdateToRoom(updatedGame.room.roomId, 'game-update', {
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
        });

        // Send turn notifications if game is still active
        if (updatedGame.gameState === 'ACTIVE') {
            await notifyTurnChange(updatedGame.toJSON(), updatedGame.room.roomId, updatedGame.currentPlayer - 1);
        }

        // Check if game is completed
        if (updatedGame.gameState === 'COMPLETED' || updatedGame.gameState === 'BLOCKED') {
            await handleGameCompletion(updatedGame);
        }

        console.log(`[BOT-TURN] ✅ Bot ${currentPlayer.playerName} completed ${JSON.stringify(moveResult.move)} in game ${updatedGame._id}`);

    } catch (error) {
        // Enhanced error logging for debugging
        if (error.name === 'VersionError') {
            console.log(`[BOT-TURN] Version conflict for game ${game._id} - another process updated the game concurrently`);
        } else {
            console.error(`[BOT-TURN] Error processing bot turn for game ${game._id}:`, error);
        }
    }
}

console.log('🚀 Enhanced Domino maintenance with bot support initialized successfully');
console.log('📋 Enhanced Cron Schedule:');
console.log('  - Bot room filling (VIRTUAL): Every 15 seconds (30-45s wait)');
console.log('  - Immediate bot turns: Every 3 seconds (1-3s delay)');
console.log('  - Game start check: Every 10 seconds');
console.log('  - Turn timeout handling: Every 10 seconds (humans + bots)');
console.log('  - Turn warnings: Every 5 seconds');
console.log('  - Disconnected player cleanup: Every 30 seconds');
console.log('  - Room cleanup: Every hour');
console.log('💡 Look for [CRON], [BOT-FILL], and [BOT-TURN] prefixed logs to monitor execution');