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
                console.log(`Starting game for full room ${room.roomId} with ${room.players.length}/${room.playerCount} players`);
                await startDominoGame(room);
            } catch (error) {
                console.error(`Error starting game for room ${room.roomId}:`, error);
            }
        }

    } catch (error) {
        console.error('Error checking for full rooms:', error);
    }
});

// Send turn warnings via socket - runs every 15 seconds
cron.schedule('*/15 * * * * *', async () => {
    try {
        await sendTurnWarnings();
    } catch (error) {
        console.error('Error in socket-based turn warnings:', error);
    }
});

// Remove disconnected players from waiting rooms via socket - runs every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
    try {
        const result = await removeDisconnectedPlayersFromWaitingRooms();
        if (result.entity.removedPlayers > 0) {
            console.log(`Socket-based cleanup: Removed ${result.entity.removedPlayers} disconnected players from ${result.entity.roomsProcessed} waiting rooms`);
        }
    } catch (error) {
        console.error('Error in socket-based disconnected player cleanup:', error);
    }
});

// Clean up abandoned rooms every hour
cron.schedule('0 * * * *', async () => {
    try {
        console.log('Running domino room cleanup...');

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
                console.error(`Error cleaning up room ${room.roomId}:`, error);
            }
        }

        if (cleanedCount > 0) {
            console.log(`Cleaned up ${cleanedCount} abandoned domino rooms`);
        }
    } catch (error) {
        console.error('Error in domino room cleanup:', error);
    }
});

// Handle turn timeouts every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
    try {
        const config = await DominoGameConfig.findOne();
        const timeoutSeconds = config?.turnTimeLimit || 60;

        const timeoutThreshold = new Date(Date.now() - (timeoutSeconds + 5) * 1000); // Add 5 second buffer

        // Find active games with expired turns
        const expiredGames = await DominoGame.find({
            gameState: 'ACTIVE',
            turnStartTime: { $lt: timeoutThreshold }
        }).populate('room');

        for (const game of expiredGames) {
            try {
                const currentPlayer = game.players[game.currentPlayer];

                if (currentPlayer && currentPlayer.playerType === 'HUMAN' && currentPlayer.user) {
                    console.log(`Handling turn timeout for user ${currentPlayer.user} in game ${game._id}`);
                    await handleTurnTimeout(game._id, currentPlayer.user);
                }
            } catch (error) {
                console.error(`Error handling timeout for game ${game._id}:`, error);
            }
        }

    } catch (error) {
        console.error('Error handling turn timeouts:', error);
    }
});

console.log('Domino maintenance cron jobs initialized successfully');