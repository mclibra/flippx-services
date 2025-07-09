import cron from 'node-cron';
import { DominoRoom, DominoGame, DominoGameConfig } from '../../api/domino/model';
import { makeTransaction } from '../../api/transaction/controller';
import { handleTurnTimeout, sendTurnWarnings, removeDisconnectedPlayersFromWaitingRooms } from '../../api/domino/controller';

// Start games when rooms are full - runs every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
    try {
        const { startDominoGame } = await import('../../api/domino/controller');
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

// Handle turn timeouts every 10 seconds (EXISTING - WORKING CORRECTLY)
cron.schedule('*/10 * * * * *', async () => {
    try {
        const config = await DominoGameConfig.findOne();
        const timeoutSeconds = config?.turnTimeLimit || 30; // CORRECT: 30 seconds

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
                    console.log(`[CRON] Handling turn timeout for user ${currentPlayer.user} in game ${game._id}`);
                    await handleTurnTimeout(game._id, currentPlayer.user);
                }
            } catch (error) {
                console.error(`[CRON] Error handling timeout for game ${game._id}:`, error);
            }
        }

    } catch (error) {
        console.error('[CRON] Error handling turn timeouts:', error);
    }
});

// Send turn warnings via socket - runs every 5 seconds (INCREASED FREQUENCY for 30s timeout)
cron.schedule('*/5 * * * * *', async () => {
    try {
        const config = await DominoGameConfig.findOne();
        const timeoutSeconds = config?.turnTimeLimit || 30;

        console.log(`[CRON] Running socket-based turn warnings check (${timeoutSeconds}s timeout)...`);

        // Check if there are any active games first
        const activeGamesCount = await DominoGame.countDocuments({ gameState: 'ACTIVE' });

        if (activeGamesCount === 0) {
            console.log('[CRON] No active games, skipping turn warnings');
            return;
        }

        console.log(`[CRON] Found ${activeGamesCount} active games, checking for warnings needed`);
        await sendTurnWarnings();
        console.log('[CRON] ✅ Socket-based turn warnings processed successfully');

    } catch (error) {
        console.error('[CRON] ❌ Error in socket-based turn warnings:', error);
    }
});

// Remove disconnected players from waiting rooms via socket - runs every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
    try {
        console.log('[CRON] Running socket-based disconnected player cleanup...');

        // Check if there are any waiting rooms first
        const waitingRoomsCount = await DominoRoom.countDocuments({ status: 'WAITING' });

        if (waitingRoomsCount === 0) {
            console.log('[CRON] No waiting rooms, skipping cleanup');
            return;
        }

        console.log(`[CRON] Found ${waitingRoomsCount} waiting rooms, checking for disconnected players`);

        const result = await removeDisconnectedPlayersFromWaitingRooms();

        if (result.entity.removedPlayers > 0) {
            console.log(`[CRON] ✅ Socket-based cleanup: Removed ${result.entity.removedPlayers} disconnected players from ${result.entity.roomsProcessed} waiting rooms`);
        } else {
            console.log('[CRON] ✅ Socket-based cleanup: No disconnected players to remove');
        }

    } catch (error) {
        console.error('[CRON] ❌ Error in socket-based disconnected player cleanup:', error);
    }
});

// Clean up abandoned rooms every hour
cron.schedule('0 * * * *', async () => {
    try {
        console.log('[CRON] Running domino room cleanup...');

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Find rooms that have been waiting for more than 1 hour
        const abandonedRooms = await DominoRoom.find({
            status: 'WAITING',
            createdAt: { $lt: oneHourAgo }
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

console.log('🚀 Domino maintenance cron jobs initialized successfully');
console.log('📋 Cron Schedule (30-second timeout configuration):');
console.log('  - Game start check: Every 10 seconds');
console.log('  - Turn timeout handling: Every 10 seconds (30s timeout)');
console.log('  - Turn warnings: Every 5 seconds (15s warning for 30s timeout)');
console.log('  - Disconnected player cleanup: Every 30 seconds');
console.log('  - Room cleanup: Every hour');
console.log('💡 Look for [CRON] prefixed logs to monitor execution');