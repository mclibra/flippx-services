import { jwtVerify } from '../jwt';

let dominoNamespace = null;

export const initializeDominoSocket = (io) => {
    dominoNamespace = io.of('/domino');

    // Add authentication middleware for the namespace
    dominoNamespace.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            // Verify JWT token
            const decoded = jwtVerify(token);

            if (!decoded || !decoded.id) {
                return next(new Error('Authentication error: Invalid token'));
            }

            // Attach user ID to socket
            socket.userId = decoded.id;
            next();
        } catch (error) {
            console.error('Domino socket authentication error:', error);
            next(new Error('Authentication error: ' + error.message));
        }
    });

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

                if (!result.entity.success) {
                    socket.emit('move-error', { error: result.entity.error });
                }
            } catch (error) {
                console.error('Error processing move:', error);
                socket.emit('move-error', { error: 'Failed to process move' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User disconnected from domino: ${socket.userId}`);

            if (socket.roomId) {
                socket.to(socket.roomId).emit('player-disconnected', {
                    userId: socket.userId,
                    timestamp: new Date()
                });
            }
        });

        // Handle reconnection
        socket.on('reconnect-to-room', async (roomId) => {
            try {
                socket.join(roomId);
                socket.roomId = roomId;

                // Mark player as reconnected in database
                const { DominoRoom } = await import('../../api/domino/model');
                await DominoRoom.updateOne(
                    { roomId, 'players.user': socket.userId },
                    { $set: { 'players.$.isConnected': true } }
                );

                socket.to(roomId).emit('player-reconnected', {
                    userId: socket.userId,
                    timestamp: new Date()
                });

                console.log(`User ${socket.userId} reconnected to domino room ${roomId}`);

            } catch (error) {
                console.error('Error reconnecting to domino room:', error);
                socket.emit('error', { message: 'Failed to reconnect to room' });
            }
        });

        // Handle socket errors
        socket.on('error', (error) => {
            console.error(`Socket error for user ${socket.userId}:`, error);
        });
    });
};

// Broadcast message to all players in a room
export const broadcastToRoom = (roomId, event, data) => {
    if (dominoNamespace) {
        dominoNamespace.to(roomId).emit(event, data);
    }
};

// Broadcast game update to all players in a room
export const broadcastGameUpdate = (roomId, event, data) => {
    if (dominoNamespace) {
        dominoNamespace.to(roomId).emit(event, data);
    }
};

// Send message to specific user
export const sendToUser = (userId, event, data) => {
    if (dominoNamespace) {
        const userSockets = Array.from(dominoNamespace.sockets.values())
            .filter(socket => socket.userId === userId);

        userSockets.forEach(socket => {
            socket.emit(event, data);
        });
    }
};

// Get online players count in a room
export const getRoomPlayerCount = (roomId) => {
    if (dominoNamespace) {
        const room = dominoNamespace.adapter.rooms.get(roomId);
        return room ? room.size : 0;
    }
    return 0;
};