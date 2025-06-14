import cron from 'node-cron';
import { DominoRoom, DominoGame } from '../../api/domino/model';

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

        for (const room of abandonedRooms) {
            // Refund entry fees to human players
            for (const player of room.players) {
                if (player.user && player.playerType === 'HUMAN') {
                    await makeTransaction(
                        player.user,
                        'USER',
                        'DOMINO_REFUND',
                        room.entryFee,
                        null,
                        null,
                        room._id,
                        room.cashType
                    );
                }
            }

            // Mark room as cancelled
            room.status = 'CANCELLED';
            await room.save();
        }

        console.log(`Cleaned up ${abandonedRooms.length} abandoned domino rooms`);
    } catch (error) {
        console.error('Error in domino room cleanup:', error);
    }
});

// Handle turn timeouts every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
    try {
        const { DominoGameConfig } = require('../../api/domino/model');
        const config = await DominoGameConfig.findOne();
        const timeoutSeconds = config?.turnTimeLimit || 60;

        const timeoutThreshold = new Date(Date.now() - timeoutSeconds * 1000);

        // Find active games with expired turns
        const expiredGames = await DominoGame.find({
            gameState: 'ACTIVE',
            turnStartTime: { $lt: timeoutThreshold }
        }).populate('room');

        for (const game of expiredGames) {
            const currentPlayer = game.players[game.currentPlayer];

            if (currentPlayer.playerType === 'HUMAN' && currentPlayer.isConnected) {
                // Handle timeout for human player
                const { handleTurnTimeout } = require('../../api/domino/controller');
                await handleTurnTimeout(game._id, currentPlayer.user);
            }
        }

    } catch (error) {
        console.error('Error handling turn timeouts:', error);
    }
});