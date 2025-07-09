import { jwtVerify } from '../jwt';
import { LoyaltyService } from '../../api/loyalty/service';
import { DominoRoom, DominoGameConfig } from '../../api/domino/model';
import { DominoGameEngine } from '../domino/gameEngine';
import { User } from '../../api/user/model';
import { Wallet } from '../../api/wallet/model';
import { makeTransaction } from '../../api/transaction/controller';
import { startDominoGame, makeMove } from '../../api/domino/controller';

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

        // Join or create room - NEW SOCKET EVENT
        socket.on('join-or-create-room', async (data) => {
            try {
                const {
                    playerCount,
                    entryFee,
                    cashType,
                    winRule = 'STANDARD',
                    roomType = 'PUBLIC'
                } = data;

                console.log(`User ${socket.userId} requesting to join/create room:`, data);

                const result = await joinOrCreateRoomSocket(socket.userId, {
                    playerCount,
                    entryFee,
                    cashType,
                    winRule,
                    roomType
                });

                if (result.success) {
                    // Join socket room
                    socket.join(result.room.roomId);
                    socket.roomId = result.room.roomId;

                    // Mark player as connected in database
                    await DominoRoom.updateOne(
                        { roomId: result.room.roomId, 'players.user': socket.userId },
                        {
                            $set: {
                                'players.$.isConnected': true,
                                'players.$.lastConnectedAt': new Date(),
                                'players.$.disconnectedAt': null
                            }
                        }
                    );

                    // Send success response to user
                    socket.emit('room-joined', {
                        success: true,
                        room: result.room,
                        action: result.action
                    });

                    // Notify other players in room
                    socket.to(result.room.roomId).emit('player-joined', {
                        userId: socket.userId,
                        roomState: result.room,
                        timestamp: new Date()
                    });

                    console.log(`User ${socket.userId} ${result.action} room ${result.room.roomId}`);
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
                // Mark player as disconnected with timestamp in database
                markPlayerDisconnected(socket.userId, socket.roomId);

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

// Helper function to handle room joining/creation logic with proper validation
const joinOrCreateRoomSocket = async (userId, options) => {
    try {
        const {
            playerCount,
            entryFee,
            cashType,
            winRule = 'STANDARD',
            roomType = 'PUBLIC'
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
        const availableRoom = await DominoRoom.findOne({
            status: 'WAITING',
            cashType,
            playerCount,
            entryFee,
            'gameSettings.winRule': winRule,
            $expr: { $lt: [{ $size: "$players" }, "$playerCount"] }
        });

        if (availableRoom) {
            // Join existing room
            return await joinExistingRoomSocket(availableRoom, userId);
        } else {
            // Create new room
            return await createNewRoomSocket(options, userId);
        }

    } catch (error) {
        console.error('Error in joinOrCreateRoomSocket:', error);
        return { success: false, error: error.message };
    }
};

const joinExistingRoomSocket = async (room, userId) => {
    try {
        // Check user balance and deduct entry fee
        const wallet = await Wallet.findOne({ user: userId });
        const balance = room.cashType === 'REAL' ? wallet.realBalance : wallet.virtualBalance;

        if (balance < room.entryFee) {
            return {
                success: false,
                error: `Insufficient ${room.cashType.toLowerCase()} balance. Required: $${room.entryFee}, Available: $${balance}`
            };
        }

        // Get user details
        const userData = await User.findById(userId);

        // Add player to room
        room.players.push({
            user: userId,
            playerName: `${userData.name.firstName} ${userData.name.lastName}`,
            position: room.players.length,
            isReady: true,
            isConnected: true,
            lastConnectedAt: new Date(),
            disconnectedAt: null
        });

        room.totalPot += room.entryFee;

        // Deduct entry fee using DOMINO_ENTRY transaction identifier
        await makeTransaction(
            userId,
            'USER',
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

        await room.save();
        await room.populate('createdBy', 'name');

        return { success: true, room, action: 'joined' };

    } catch (error) {
        console.error('Error joining existing room:', error);
        return { success: false, error: error.message };
    }
};

const createNewRoomSocket = async (options, userId) => {
    try {
        const {
            playerCount,
            entryFee,
            cashType,
            winRule = 'STANDARD',
            roomType = 'PUBLIC'
        } = options;

        // Get user details
        const userData = await User.findById(userId);

        // Generate room ID using game engine
        const roomId = DominoGameEngine.generateRoomId();

        // Create room
        const room = await DominoRoom.create({
            roomId,
            roomType,
            playerCount,
            entryFee,
            cashType,
            gameSettings: {
                tilesPerPlayer: playerCount <= 2 ? 9 : 7,
                winRule,
                targetPoints: 100
            },
            players: [{
                user: userId,
                playerName: `${userData.name.firstName} ${userData.name.lastName}`,
                position: 0,
                isReady: true,
                isConnected: true,
                lastConnectedAt: new Date(),
                disconnectedAt: null
            }],
            createdBy: userId,
            totalPot: entryFee
        });

        // Deduct entry fee using DOMINO_ENTRY transaction identifier
        await makeTransaction(
            userId,
            'USER',
            'DOMINO_ENTRY',
            entryFee,
            room._id,
            cashType
        );

        // Award XP for room creation (consistent with other games)
        try {
            // Calculate XP based on entry fee
            const baseXP = Math.max(5, Math.floor(entryFee / 3)); // 1 XP per $3 entry fee, minimum 5 XP
            const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
            const totalXP = baseXP * cashTypeMultiplier;

            const xpResult = await LoyaltyService.awardUserXP(
                userId,
                totalXP,
                'GAME_ACTIVITY',
                `Domino room created - Entry fee: $${entryFee} (${cashType})`,
                {
                    gameType: 'DOMINO',
                    roomId: room._id,
                    entryFee: entryFee,
                    cashType: cashType,
                    baseXP,
                    multiplier: cashTypeMultiplier,
                    action: 'CREATE_NEW_ROOM'
                }
            );

            if (!xpResult.success) {
                console.warn(`Failed to award XP for user ${userId}:`, xpResult.error);
            } else {
                console.log(`Awarded ${totalXP} XP to user ${userId} for creating domino room`);
            }
        } catch (xpError) {
            console.error(`Error awarding XP for user ${userId}:`, xpError);
            // Don't fail room creation if XP awarding fails
        }

        await room.populate('players.user', 'name');
        await room.populate('createdBy', 'name');

        return { success: true, room, action: 'created' };

    } catch (error) {
        console.error('Error creating new room:', error);
        return { success: false, error: error.message };
    }
};

// Helper function to mark player as disconnected
const markPlayerDisconnected = async (userId, roomId) => {
    try {
        await DominoRoom.updateOne(
            { roomId, 'players.user': userId },
            {
                $set: {
                    'players.$.isConnected': false,
                    'players.$.disconnectedAt': new Date()
                }
            }
        );
    } catch (error) {
        console.error('Error marking player as disconnected:', error);
    }
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
    console.log(`Sending ${event} to user ${userId}`);
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