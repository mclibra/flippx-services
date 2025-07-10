import { jwtVerify } from '../jwt';
import { DominoRoom, DominoChat } from '../../api/domino/model';

let chatNamespace = null;

export const initializeDominoChatSocket = (io) => {
    chatNamespace = io.of('/domino-chat');

    // Add authentication middleware for the namespace
    chatNamespace.use(async (socket, next) => {
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
            console.error('Domino chat authentication error:', error);
            next(new Error('Authentication error: ' + error.message));
        }
    });

    chatNamespace.on('connection', (socket) => {
        console.log(`User connected to domino chat: ${socket.userName}`);

        // Join chat room when user joins domino room
        socket.on('join-chat-room', async (data) => {
            try {
                const { roomId } = data;
                const { userId, userName } = socket;

                console.log(`User ${userName} requesting to join chat room: ${roomId}`);

                // Validate room and user membership
                const validation = await validateUserInRoom(roomId, userId);

                if (!validation.success) {
                    socket.emit('join-chat-room-error', {
                        success: false,
                        error: validation.error
                    });
                    return;
                }

                // Join socket room
                socket.join(roomId);
                socket.roomId = roomId;

                // Send success response to user
                socket.emit('chat-room-joined', {
                    success: true,
                    roomId: roomId,
                    message: 'Successfully joined chat room'
                });

                // Broadcast to other players in the room
                socket.to(roomId).emit('player-joined-chat', {
                    userId: userId,
                    userName: userName,
                    timestamp: new Date()
                });

                console.log(`User ${userName} successfully joined chat room ${roomId}`);

            } catch (error) {
                console.error('Error joining chat room:', error);
                socket.emit('join-chat-room-error', {
                    success: false,
                    error: 'Failed to join chat room'
                });
            }
        });

        // Real-time chat messaging
        socket.on('send-message', async (data) => {
            try {
                const { roomId, message } = data;
                const { userId, userName } = socket;

                console.log(`User ${userName} sending message in room ${roomId}:`, message);

                // Validate message
                if (!message || typeof message !== 'string') {
                    socket.emit('message-error', {
                        success: false,
                        error: 'Message is required'
                    });
                    return;
                }

                if (message.trim().length === 0) {
                    socket.emit('message-error', {
                        success: false,
                        error: 'Message cannot be empty'
                    });
                    return;
                }

                if (message.length > 200) {
                    socket.emit('message-error', {
                        success: false,
                        error: 'Message too long (max 200 characters)'
                    });
                    return;
                }

                // Validate room and user membership
                const validation = await validateUserInRoom(roomId, userId);

                if (!validation.success) {
                    socket.emit('message-error', {
                        success: false,
                        error: validation.error
                    });
                    return;
                }

                const { room, playerInRoom } = validation;

                // Create chat message in database
                const chatMessage = await DominoChat.create({
                    room: room._id,
                    user: userId,
                    playerName: playerInRoom.playerName,
                    message: message.trim(),
                    messageType: 'TEXT'
                });

                // Broadcast message to all players in the room (including sender)
                const messageData = {
                    messageId: chatMessage._id,
                    user: userId,
                    playerName: playerInRoom.playerName,
                    message: chatMessage.message,
                    messageType: chatMessage.messageType,
                    timestamp: chatMessage.createdAt
                };

                // Send to room including sender
                chatNamespace.to(roomId).emit('new-message', messageData);

                console.log(`Message sent successfully by ${userName} in room ${roomId}`);

            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('message-error', {
                    success: false,
                    error: 'Failed to send message'
                });
            }
        });

        // Get chat history
        socket.on('get-chat-history', async (data) => {
            try {
                const { roomId, limit = 50, offset = 0 } = data;
                const { userId } = socket;

                // Validate room and user membership
                const validation = await validateUserInRoom(roomId, userId);

                if (!validation.success) {
                    socket.emit('chat-history-error', {
                        success: false,
                        error: validation.error
                    });
                    return;
                }

                const { room } = validation;

                // Get chat messages
                const messages = await DominoChat.find({ room: room._id })
                    .populate('user', 'name')
                    .sort({ createdAt: -1 })
                    .limit(parseInt(limit))
                    .skip(parseInt(offset));

                const total = await DominoChat.countDocuments({ room: room._id });

                socket.emit('chat-history', {
                    success: true,
                    messages: messages.reverse(), // Reverse to show oldest first
                    total,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        hasMore: (parseInt(offset) + parseInt(limit)) < total
                    }
                });

            } catch (error) {
                console.error('Error getting chat history:', error);
                socket.emit('chat-history-error', {
                    success: false,
                    error: 'Failed to get chat history'
                });
            }
        });

        // Leave chat room
        socket.on('leave-chat-room', async (data) => {
            try {
                const { roomId } = data;
                const { userId, userName } = socket;

                console.log(`User ${userName} leaving chat room: ${roomId}`);

                // Leave socket room
                socket.leave(roomId);
                socket.roomId = null;

                // Send success response to user
                socket.emit('chat-room-left', {
                    success: true,
                    roomId: roomId,
                    message: 'Successfully left chat room'
                });

                // Broadcast to other players in the room
                socket.to(roomId).emit('player-left-chat', {
                    userId: userId,
                    userName: userName,
                    timestamp: new Date()
                });

                console.log(`User ${userName} successfully left chat room ${roomId}`);

            } catch (error) {
                console.error('Error leaving chat room:', error);
                socket.emit('leave-chat-room-error', {
                    success: false,
                    error: 'Failed to leave chat room'
                });
            }
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            const { roomId, userId, userName } = socket;

            console.log(`User disconnected from domino chat: ${userName}`);

            if (roomId) {
                // Broadcast to other players in the room
                socket.to(roomId).emit('player-disconnected-chat', {
                    userId: userId,
                    userName: userName,
                    timestamp: new Date()
                });

                console.log(`User ${userName} disconnected from chat room ${roomId}`);
            }
        });

        // Handle socket errors
        socket.on('error', (error) => {
            console.error(`Chat socket error for user ${socket.userId}:`, error);
        });
    });
};

// Broadcast chat message to all players in a room
export const broadcastChatToRoom = (roomId, event, data) => {
    if (chatNamespace) {
        chatNamespace.to(roomId).emit(event, data);
    }
};

// Send chat message to specific user
export const sendChatToUser = (userId, event, data) => {
    console.log(`Sending chat ${event} to user ${userId}`);
    if (chatNamespace) {
        const userSockets = Array.from(chatNamespace.sockets.values())
            .filter(socket => socket.userId === userId);

        userSockets.forEach(socket => {
            socket.emit(event, data);
        });
    }
};

// Get online chat users count in a room
export const getChatRoomPlayerCount = (roomId) => {
    if (chatNamespace) {
        const room = chatNamespace.adapter.rooms.get(roomId);
        return room ? room.size : 0;
    }
    return 0;
};

// Force disconnect user from chat when they leave domino room
export const forceDisconnectFromChat = (userId) => {
    console.log(`Force disconnecting user ${userId} from chat`);
    if (chatNamespace) {
        const userSockets = Array.from(chatNamespace.sockets.values())
            .filter(socket => socket.userId === userId);

        userSockets.forEach(socket => {
            socket.disconnect(true);
        });
    }
};

// Helper function to validate if user is in the domino room
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