let dominoNamespace = null;

export const initializeDominoSocket = (io) => {
    dominoNamespace = io.of('/domino');

    dominoNamespace.on('connection', (socket) => {
        console.log(`User connected to domino: ${socket.userId}`);

        // Join room
        socket.on('join-room', async (roomId) => {
            try {
                socket.join(roomId);
                socket.roomId = roomId;

                console.log(`User ${socket.userId} joined domino room ${roomId}`);

                // Notify other players
                socket.to(roomId).emit('player-joined', {
                    userId: socket.userId,
                    timestamp: new Date()
                });

                // Send current room state
                const { DominoRoom } = await import('../../api/domino/model');
                const room = await DominoRoom.findOne({ roomId })
                    .populate('players.user', 'name');

                if (room) {
                    socket.emit('room-state', { room });
                }

            } catch (error) {
                console.error('Error joining domino room:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        // Leave room
        socket.on('leave-room', async (roomId) => {
            try {
                socket.leave(roomId);
                socket.to(roomId).emit('player-left', {
                    userId: socket.userId,
                    timestamp: new Date()
                });
                socket.roomId = null;
            } catch (error) {
                console.error('Error leaving domino room:', error);
            }
        });

        // Game move
        socket.on('make-move', async (data) => {
            try {
                const { makeMove } = await import('../../api/domino/controller');
                const result = await makeMove(
                    { gameId: data.gameId },
                    { action: data.action, tile: data.tile, side: data.side },
                    { _id: socket.userId }
                );

                if (result.entity.success) {
                    // Broadcast to all players in room
                    socket.emit('move-result', result.entity);
                } else {
                    socket.emit('move-error', result.entity);
                }
            } catch (error) {
                console.error('Error processing domino move:', error);
                socket.emit('move-error', { success: false, error: 'Failed to process move' });
            }
        });

        // Chat message
        socket.on('send-message', async (data) => {
            try {
                const { sendMessage } = await import('../../api/domino/controller');
                const result = await sendMessage(
                    { roomId: data.roomId },
                    { message: data.message },
                    { _id: socket.userId }
                );

                if (!result.entity.success) {
                    socket.emit('message-error', result.entity);
                }
                // Success is handled by broadcastToRoom in the controller
            } catch (error) {
                console.error('Error sending domino message:', error);
                socket.emit('message-error', { success: false, error: 'Failed to send message' });
            }
        });

        // Turn timeout
        socket.on('turn-timeout', async (gameId) => {
            try {
                const { handleTurnTimeout } = await import('../../api/domino/controller');
                await handleTurnTimeout(gameId, socket.userId);
            } catch (error) {
                console.error('Error handling turn timeout:', error);
            }
        });

        // Player ready state
        socket.on('player-ready', async (data) => {
            try {
                socket.to(data.roomId).emit('player-ready-state', {
                    userId: socket.userId,
                    isReady: data.isReady,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('Error updating player ready state:', error);
            }
        });

        // Disconnect handling
        socket.on('disconnect', () => {
            try {
                console.log(`User disconnected from domino: ${socket.userId}`);

                if (socket.roomId) {
                    socket.to(socket.roomId).emit('player-disconnected', {
                        userId: socket.userId,
                        timestamp: new Date()
                    });

                    // Handle disconnection in game logic
                    const { handlePlayerDisconnection } = require('../../api/domino/controller');
                    handlePlayerDisconnection(socket.roomId, socket.userId);
                }
            } catch (error) {
                console.error('Error handling domino disconnect:', error);
            }
        });
    });

    return dominoNamespace;
};

// Helper functions for broadcasting
export const broadcastToRoom = (roomId, event, data) => {
    if (dominoNamespace) {
        dominoNamespace.to(roomId).emit(event, data);
    }
};

export const broadcastGameUpdate = (roomId, data) => {
    if (dominoNamespace) {
        dominoNamespace.to(roomId).emit('game-update', data);
    }
};

export const broadcastToUser = (userId, event, data) => {
    if (dominoNamespace) {
        dominoNamespace.to(userId).emit(event, data);
    }
};