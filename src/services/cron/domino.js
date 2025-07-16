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

// Fill VIRTUAL waiting rooms with bots after 30 seconds
cron.schedule('*/15 * * * * *', async () => {
    try {
        const gameConfig = await DominoGameConfig.findOne();
        if (!gameConfig) {
            return;
        }

        const maxWaitTime = new Date(Date.now() - 30 * 1000); // 30 seconds ago

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

// Handle both human timeouts AND bot turn processing
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

        if (expiredGames.length > 0) {
            console.log(`[CRON] Found ${expiredGames.length} games with expired turns (${timeoutSeconds}s timeout)`);
        }

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
cron.schedule('*/5 * * * * *', async () => {
    try {
        // Find active games where current player is a bot and turn just started (< 5 seconds ago)
        const recentTurnStart = new Date(Date.now() - 5 * 1000); // 5 seconds ago

        const botTurnGames = await DominoGame.find({
            gameState: 'ACTIVE',
            turnStartTime: { $gte: recentTurnStart },
            'players.playerType': 'COMPUTER'
        }).populate('room');

        for (const game of botTurnGames) {
            try {
                const currentPlayer = game.players[game.currentPlayer];

                if (currentPlayer && currentPlayer.playerType === 'COMPUTER') {
                    console.log(`[CRON] Processing immediate bot turn for ${currentPlayer.playerName} in game ${game._id}`);

                    // Add small 1-3 second delay to make bot moves feel natural
                    await processBotTurn(game);
                }
            } catch (error) {
                console.error(`[CRON] Error processing immediate bot turn for game ${game._id}:`, error);
            }
        }

    } catch (error) {
        console.error('[CRON] Error checking immediate bot turns:', error);
    }
});

// Start games when rooms are full - runs every 10 seconds (EXISTING)
cron.schedule('*/10 * * * * *', async () => {
    try {
        const tenSecondsAgo = new Date(Date.now() - 10 * 1000);

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
                position: room.players.length,
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
            for (const player of room.players) {
                if (player.user && player.playerType === 'HUMAN') {
                    sendDominoGameUpdateToUser(player.user, room.roomId, 'player-joined', {
                        userId: bot.user,
                        playerName: bot.playerName,
                        timestamp: new Date()
                    });
                }
            }
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

        console.log(`[BOT-TURN] Processing turn for bot ${currentPlayer.playerName} in game ${game._id}`);

        // Use the existing autoPlay logic to determine bot's move
        const botMove = DominoGameEngine.autoPlay(
            currentPlayer.hand,
            game.board,
            game.drawPile,
            'COMPUTER'
        );

        console.log(`[BOT-TURN] Bot ${currentPlayer.playerName} decided to:`, botMove);

        // Process the bot's move using existing game engine
        const moveResult = DominoGameEngine.processMove(
            game,
            game.currentPlayer,
            botMove.action,
            botMove.tile,
            botMove.side
        );

        if (!moveResult.success) {
            console.error(`[BOT-TURN] Bot move failed for ${currentPlayer.playerName}:`, moveResult.error);
            return;
        }

        // Update game state (same logic as human moves)
        const updatedGameState = moveResult.gameState;

        game.currentPlayer = updatedGameState.currentPlayer;
        game.gameState = updatedGameState.gameState;
        game.players = updatedGameState.players;
        game.board = updatedGameState.board;
        game.drawPile = updatedGameState.drawPile;
        game.moves = updatedGameState.moves;
        game.totalMoves = updatedGameState.totalMoves;
        game.turnStartTime = updatedGameState.turnStartTime;

        // Handle game completion
        if (updatedGameState.gameState === 'COMPLETED' || updatedGameState.gameState === 'BLOCKED') {
            game.winner = updatedGameState.winner;
            game.endReason = updatedGameState.endReason;
            game.finalScores = updatedGameState.finalScores;
            game.completedAt = updatedGameState.completedAt;
            game.duration = updatedGameState.duration;
        }

        await game.save();

        // Broadcast bot move to all players
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
                position: game.currentPlayer,
                playerName: currentPlayer.playerName,
                playerType: currentPlayer.playerType,
                action: botMove.action
            },
            board: game.board,
            drawPile: game.drawPile,
        });

        // Send turn notifications if game is still active
        if (game.gameState === 'ACTIVE') {
            await notifyTurnChange(game.toJSON(), game.room.roomId, game.currentPlayer - 1);
        }

        // Check if game is completed
        if (game.gameState === 'COMPLETED' || game.gameState === 'BLOCKED') {
            await handleGameCompletion(game);
        }

        console.log(`[BOT-TURN] ✅ Bot ${currentPlayer.playerName} completed ${botMove.action} in game ${game._id}`);

    } catch (error) {
        console.error(`[BOT-TURN] Error processing bot turn for game ${game._id}:`, error);
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