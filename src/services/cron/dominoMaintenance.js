import cron from 'node-cron';
import { DominoRoom, DominoGame, DominoGameConfig } from '../../api/domino/model';
import { makeTransaction } from '../../api/transaction/controller';
import { handleTurnTimeout, sendTurnWarnings, fillWithComputerPlayers, removeDisconnectedPlayersFromWaitingRooms } from '../../api/domino/controller';
import { broadcastToRoom } from '../socket/dominoSocket';

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

// Handle VIRTUAL rooms that need bot filling after 30 seconds
cron.schedule('*/10 * * * * *', async () => {
    try {
        const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);

        // Find VIRTUAL rooms that have been waiting for 30+ seconds and are not full
        const virtualRoomsNeedingBots = await DominoRoom.find({
            status: 'WAITING',
            cashType: 'VIRTUAL',
            createdAt: { $lt: thirtySecondsAgo },
            $expr: { $lt: [{ $size: "$players" }, "$playerCount"] }
        });

        for (const room of virtualRoomsNeedingBots) {
            try {
                console.log(`Filling VIRTUAL room ${room.roomId} with bots after 30 second timeout`);

                // Fill room with computer players and start game
                await fillWithComputerPlayers(room);

                // Broadcast to any remaining human players that bots have joined
                broadcastToRoom(room.roomId, 'room-filled-with-bots', {
                    roomState: room,
                    message: 'Room has been filled with computer players and game is starting!'
                });

                console.log(`Successfully filled room ${room.roomId} with bots and started game`);
            } catch (error) {
                console.error(`Error filling room ${room.roomId} with bots:`, error);
            }
        }

    } catch (error) {
        console.error('Error in virtual room bot filling:', error);
    }
});

// Handle disconnected players in WAITING rooms every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
    try {
        await removeDisconnectedPlayersFromWaitingRooms();
    } catch (error) {
        console.error('Error in processing disconnected player cleanup:', error);
    }
});

// Send turn warnings every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
    try {
        await sendTurnWarnings();
    } catch (error) {
        console.error('Error sending turn warnings:', error);
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

// Clean up completed games older than 30 days (for data management)
cron.schedule('0 2 * * *', async () => {
    try {
        console.log('Running domino data cleanup...');

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Count old completed games and rooms
        const oldGames = await DominoGame.countDocuments({
            gameState: 'COMPLETED',
            completedAt: { $lt: thirtyDaysAgo }
        });

        const oldRooms = await DominoRoom.countDocuments({
            status: { $in: ['COMPLETED', 'CANCELLED'] },
            completedAt: { $lt: thirtyDaysAgo }
        });

        console.log(`Found ${oldGames} old games and ${oldRooms} old rooms to potentially clean up`);

        // For now, just log the counts.
        // In production, you might want to archive or delete old data
        // await DominoGame.deleteMany({ gameState: 'COMPLETED', completedAt: { $lt: thirtyDaysAgo } });
        // await DominoRoom.deleteMany({ status: { $in: ['COMPLETED', 'CANCELLED'] }, completedAt: { $lt: thirtyDaysAgo } });

    } catch (error) {
        console.error('Error in domino data cleanup:', error);
    }
});

// Statistics cleanup and optimization every Sunday at 3 AM
cron.schedule('0 3 * * 0', async () => {
    try {
        console.log('Running domino statistics optimization...');

        // Clean up orphaned chat messages from deleted rooms
        const { DominoChat } = require('../../api/domino/model');
        const orphanedChats = await DominoChat.find({
            room: { $exists: false }
        });

        if (orphanedChats.length > 0) {
            await DominoChat.deleteMany({
                room: { $exists: false }
            });
            console.log(`Cleaned up ${orphanedChats.length} orphaned chat messages`);
        }

        // Log some basic statistics
        const totalGames = await DominoGame.countDocuments();
        const activeGames = await DominoGame.countDocuments({ gameState: 'ACTIVE' });
        const totalRooms = await DominoRoom.countDocuments();
        const waitingRooms = await DominoRoom.countDocuments({ status: 'WAITING' });

        console.log('Domino Statistics:', {
            totalGames,
            activeGames,
            totalRooms,
            waitingRooms
        });

    } catch (error) {
        console.error('Error in domino statistics optimization:', error);
    }
});

console.log('Domino maintenance cron jobs initialized successfully');