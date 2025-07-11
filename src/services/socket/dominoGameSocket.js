import { jwtVerify } from '../jwt';
import { DominoGameEngine } from '../domino/gameEngine';
import { forceDisconnectFromChat } from './dominoChatSocket';
import { User } from '../../api/user/model';
import { Wallet } from '../../api/wallet/model';
import { makeMove } from '../../api/domino/controller';
import { LoyaltyService } from '../../api/loyalty/service';
import { makeTransaction } from '../../api/transaction/controller';
import { DominoRoom, DominoGameConfig } from '../../api/domino/model';

let dominoNamespace = null;

export const initializeDominoGameSocket = (io) => {
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
            socket.role = decoded.role;
            socket.userName = decoded.userName;
            next();
        } catch (error) {
            console.error('Domino socket authentication error:', error);
            next(new Error('Authentication error: ' + error.message));
        }
    });

    dominoNamespace.on('connection', (socket) => {
        console.log(`User connected to domino: ${socket.userName}`);

        // Join or create room - NEW SOCKET EVENT
        socket.on('join-or-create-room', async (data) => {
            try {
                const {
                    playerCount,
                    entryFee,
                    cashType,
                    winRule = 'STANDARD',
                    roomType = 'PUBLIC',
                    targetPoints = 0,
                } = data;

                const { userId, userName, role } = socket;

                console.log(`User ${userName} requesting to join/create room:`, data);

                const result = await joinOrCreateRoomSocket(socket, {
                    playerCount,
                    entryFee,
                    cashType,
                    winRule,
                    roomType,
                    targetPoints,
                });

                if (result.success) {
                    const { action, room } = result;
                    // Join socket room
                    socket.join(room.roomId);
                    socket.roomId = room.roomId;

                    // Send success response to user
                    socket.emit('room-joined', {
                        success: true,
                        room: room,
                        action: action
                    });

                    // Notify other players in room
                    socket.to(room.roomId).emit('player-joined', {
                        userId,
                        userName,
                        roomState: room,
                        timestamp: new Date()
                    });

                    console.log(`User ${userName} ${action} room ${room.roomId}`);

                    await makeTransaction(
                        userId,
                        role,
                        'DOMINO_ENTRY',
                        room.entryFee,
                        room._id,
                        room.cashType
                    );

                    // Award XP for room joining (consistent with other games)
                    try {
                        // Calculate XP based on entry fee
                        const baseXP = Math.max(5, Math.floor(room.entryFee / 3)); // 1 XP per $3 entry fee, minimum 5 XP
                        const cashTypeMultiplier = room.cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
                        const totalXP = baseXP * cashTypeMultiplier;

                        const xpResult = await LoyaltyService.awardUserXP(
                            userId,
                            totalXP,
                            'GAME_ACTIVITY',
                            `Domino room joined - Entry fee: $${room.entryFee} (${room.cashType})`,
                            {
                                gameType: 'DOMINO',
                                roomId: room._id,
                                entryFee: room.entryFee,
                                cashType: room.cashType,
                                baseXP,
                                multiplier: cashTypeMultiplier,
                                action: 'JOIN_EXISTING_ROOM'
                            }
                        );

                        if (!xpResult.success) {
                            console.warn(`Failed to award XP for user ${userId}:`, xpResult.error);
                        } else {
                            console.log(`Awarded ${totalXP} XP to user ${userId} for joining domino room`);
                        }
                    } catch (xpError) {
                        console.error(`Error awarding XP for user ${userId}:`, xpError);
                        // Don't fail room joining if XP awarding fails
                    }
                } else {
                    socket.emit('room-join-error', {
                        success: false,
                        error: result.error
                    });
                }

            } catch (error) {
                console.error('Error in join-or-create-room:', error);
                socket.emit('room-join-error', {
                    success: false,
                    error: 'Failed to join or create room'
                });
            }
        });

        // Game move
        socket.on('make-move', async (data) => {
            try {
                console.log(`Manual move by ${socket.userName} `, data);
                const result = await makeMove(
                    { gameId: data.gameId },
                    { action: data.action, tile: data.tile, side: data.side },
                    { _id: socket.userId }
                );

                if (!result.entity.success) {
                    console.log(`Error in manual move by ${socket.userName} `, result.entity.error);
                    socket.emit('move-error', { error: result.entity.error });
                }
            } catch (error) {
                console.error('Error processing move:', error);
                socket.emit('move-error', { error: 'Failed to process move' });
            }
        });

        socket.on('leave-room', async () => {
            const { userId, userName, role, roomId } = socket;

            console.log(`User ${userName} requesting to leave room: ${roomId}`);

            // Leave socket room
            socket.leave(roomId);
            socket.roomId = null;

            const result = await leaveRoom(roomId, userId);

            if (result.isRemoved) {
                const room = result.roomState;

                // Send success response to user
                socket.emit('room-left', {
                    success: true,
                    message: result.message,
                    roomId: roomId
                });

                // Broadcast to other players if room still exists
                if (room) {
                    socket.to(roomId).emit('player-left', {
                        userId: socket.userId,
                        roomState: room,
                        timestamp: new Date()
                    });
                }

                // Refund entry fee using DOMINO_REFUND transaction identifier (same as API)
                await makeTransaction(
                    userId,
                    role,
                    'DOMINO_REFUND',
                    room.entryFee,
                    room._id,
                    room.cashType
                );
            } else {
                socket.to(socket.roomId).emit('player-disconnected', {
                    userId: socket.userId,
                    timestamp: new Date()
                });
            }

            console.log(`User ${userName} successfully ${result.isRemoved ? 'left' : 'disconnected'} room ${roomId}`);

            forceDisconnectFromChat(userId);
        });

        // Handle disconnection - EXISTING SOCKET EVENT
        socket.on('disconnect', async () => {
            const { userId, userName, role, roomId } = socket;

            console.log(`User ${userName} disconnected from room: ${roomId}`);

            // Leave socket room
            socket.leave(roomId);
            socket.roomId = null;

            const result = await leaveRoom(roomId, userId);

            if (result.isRemoved) {
                const room = result.roomState;

                // Send success response to user
                socket.emit('room-left', {
                    success: true,
                    message: result.message,
                    roomId: roomId
                });

                // Broadcast to other players if room still exists
                if (room) {
                    socket.to(roomId).emit('player-left', {
                        userId: socket.userId,
                        roomState: room,
                        timestamp: new Date()
                    });
                }

                // Refund entry fee using DOMINO_REFUND transaction identifier (same as API)
                await makeTransaction(
                    userId,
                    role,
                    'DOMINO_REFUND',
                    room.entryFee,
                    room._id,
                    room.cashType
                );
            } else {
                socket.to(socket.roomId).emit('player-disconnected', {
                    userId: socket.userId,
                    timestamp: new Date()
                });
            }

            console.log(`User ${userName} successfully ${result.isRemoved ? 'left' : 'disconnected'} room ${roomId}`);

            forceDisconnectFromChat(userId);
        });

        // Handle reconnection - EXISTING SOCKET EVENT
        socket.on('reconnect-to-room', async (roomId) => {
            try {
                const { userId, userName, role, roomId } = socket;

                console.log(`User ${userName} requesting to re-connect to domino room: ${roomId}`);

                // Validate room and user membership
                const validation = await validateUserInRoom(roomId, userId);

                if (!validation.success) {
                    socket.emit('room-join-error', {
                        success: false,
                        error: 'Failed to reconnect to room'
                    });
                    return;
                }

                socket.join(roomId);
                socket.roomId = roomId;

                // Mark player as reconnected in database
                await DominoRoom.updateOne(
                    { roomId, 'players.user': socket.userId },
                    {
                        $set: {
                            'players.$.isConnected': true,
                            'players.$.lastConnectedAt': new Date(),
                            'players.$.disconnectedAt': null
                        }
                    }
                );

                socket.to(roomId).emit('player-reconnected', {
                    userId: socket.userId,
                    timestamp: new Date()
                });

                console.log(`User ${socket.userName} reconnected to domino room ${roomId}`);

            } catch (error) {
                console.error('Error reconnecting to domino room:', error);
                socket.emit('room-join-error', {
                    success: false,
                    error: 'Failed to reconnect to room'
                });
            }
        });

        // Handle socket errors
        socket.on('error', (error) => {
            console.error(`Socket error for user ${socket.userId}:`, error);
        });
    });
};

// Helper function to handle room joining/creation logic with proper validation
const joinOrCreateRoomSocket = async (socket, options) => {
    try {
        const { userId, userName } = socket;
        const {
            playerCount,
            entryFee,
            cashType,
            winRule = 'STANDARD',
            roomType = 'PUBLIC',
            targetPoints = 0,
        } = options;

        // Get game configuration for validation
        const gameConfig = await DominoGameConfig.findOne();
        if (!gameConfig) {
            return { success: false, error: 'Game configuration not found' };
        }

        // Check if domino system is active
        if (!gameConfig.isActive) {
            return { success: false, error: 'Domino games are currently disabled' };
        }

        // Validate player count against configuration
        if (![2, 3, 4].includes(playerCount) || playerCount > gameConfig.maxPlayersPerRoom) {
            return { success: false, error: `Player count must be between 2 and ${gameConfig.maxPlayersPerRoom}` };
        }

        // Validate entry fee against allowed values from configuration
        if (!gameConfig.entryFees.includes(entryFee)) {
            return { success: false, error: `Entry fee must be one of: $${gameConfig.entryFees.join(', $')}` };
        }

        // Validate cash type
        if (!['REAL', 'VIRTUAL'].includes(cashType)) {
            return { success: false, error: 'Cash type must be REAL or VIRTUAL' };
        }

        // Validate win rule
        if (!['STANDARD', 'POINT_BASED'].includes(winRule)) {
            return { success: false, error: 'Win rule must be STANDARD or POINT_BASED' };
        }

        // Validate room type
        if (!['PUBLIC', 'PRIVATE'].includes(roomType)) {
            return { success: false, error: 'Room type must be PUBLIC or PRIVATE' };
        }

        // Validate user balance
        const wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            return { success: false, error: 'User wallet not found' };
        }

        const balance = cashType === 'REAL' ? wallet.realBalance : wallet.virtualBalance;

        if (balance < entryFee) {
            return {
                success: false,
                error: `Insufficient ${cashType.toLowerCase()} balance. Required: $${entryFee}, Available: $${balance}`
            };
        }

        // Check if user is already in any waiting room
        const existingRoom = await DominoRoom.findOne({
            'players.user': userId,
            status: 'WAITING'
        });

        if (existingRoom) {
            return { success: false, error: 'You are already in a waiting room' };
        }

        // First, try to find an existing room with vacancy that matches criteria
        let room = await DominoRoom.findOne({
            status: 'WAITING',
            cashType,
            playerCount,
            entryFee,
            'gameSettings.winRule': winRule,
            $expr: { $lt: [{ $size: "$players" }, "$playerCount"] }
        });

        if (room) {
            // Join existing room
            room.players.push({
                user: userId,
                playerName: userName,
                position: room.players.length,
                isReady: true,
                isConnected: true,
                lastConnectedAt: new Date(),
                disconnectedAt: null
            });

            room.totalPot += room.entryFee;

            await room.save();
        } else {
            const roomId = DominoGameEngine.generateRoomId();

            room = await DominoRoom.create({
                roomId,
                roomType,
                playerCount,
                entryFee,
                cashType,
                gameSettings: {
                    tilesPerPlayer: playerCount <= 2 ? 9 : 7,
                    winRule,
                    targetPoints: targetPoints,
                },
                players: [{
                    user: userId,
                    playerName: userName,
                    position: 0,
                    isReady: true,
                    isConnected: true,
                    lastConnectedAt: new Date(),
                    disconnectedAt: null
                }],
                createdBy: userId,
                totalPot: entryFee
            });
        }

        await room.populate('createdBy', 'name', 'userName');
        await room.populate('players.user', 'name', 'userName');

        return { success: true, room, action: 'joined' };

    } catch (error) {
        console.error('Error in joinOrCreateRoomSocket:', error);
        return { success: false, error: error.message };
    }
};

const leaveRoom = async (roomId, userId) => {
    try {
        const room = await DominoRoom.findOne({ roomId: roomId });

        if (!room) {
            throw new Error('Room not found');
        }

        const removeResult = await DominoRoom.updateOne(
            {
                roomId: roomId,
                status: 'WAITING'
            },
            {
                $pull: {
                    players: { user: userId }
                },
                $inc: {
                    totalPot: -room.entryFee
                }
            }
        );

        if (removeResult.modifiedCount === 0) {
            await DominoRoom.updateOne(
                {
                    roomId: roomId,
                    'players.user': userId
                },
                {
                    $set: {
                        'players.$.isConnected': false,
                        'players.$.disconnectedAt': new Date()
                    }
                }
            );
        }

        return {
            success: true,
            roomState: room,
            isRemoved: removeResult.modifiedCount > 0,
        };

    } catch (error) {
        console.error('Error in leaveRoomSocket:', error);
        return {
            success: false,
            error: error.message || 'Failed to leave room'
        };
    }
};

// Broadcast game update to all players in a room
export const broadcastDominoGameUpdateToRoom = (roomId, event, data) => {
    if (dominoNamespace) {
        dominoNamespace.to(roomId).emit(event, data);
    }
};

// Send message to specific user
export const sendDominoGameUpdateToUser = (userId, event, data) => {
    console.log(`Sending ${event} to user ${userId}`);
    if (dominoNamespace) {
        const userSockets = Array.from(dominoNamespace.sockets.values())
            .filter(socket => socket.userId === userId);

        userSockets.forEach(socket => {
            socket.emit(event, data);
        });
    }
};

const validateUserInRoom = async (roomId, userId) => {
    try {
        // Find the room
        const room = await DominoRoom.findOne({ roomId });

        if (!room) {
            return {
                success: false,
                error: 'Room not found'
            };
        }

        // Check if user is in the room
        const playerInRoom = room.players.find(p =>
            p.user && p.user.toString() === userId.toString()
        );

        if (!playerInRoom) {
            return {
                success: false,
                error: 'You are not a player in this room'
            };
        }

        return {
            success: true,
            room,
            playerInRoom
        };

    } catch (error) {
        console.error('Error validating user in room:', error);
        return {
            success: false,
            error: 'Validation failed'
        };
    }
};