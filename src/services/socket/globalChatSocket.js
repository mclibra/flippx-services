import { jwtVerify } from '../jwt';
import {
	GlobalChatMessage,
	GlobalChatMute,
	GlobalChatSettings,
} from '../../api/global_chat/model';

let globalChatNamespace = null;

export const initializeGlobalChatSocket = io => {
	globalChatNamespace = io.of('/global-chat');

	// Add authentication middleware for the namespace
	globalChatNamespace.use(async (socket, next) => {
		try {
			const token = socket.handshake.auth.token;

			if (!token) {
				return next(
					new Error('Authentication error: No token provided')
				);
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
			console.error('Global chat authentication error:', error);
			next(new Error('Authentication error: ' + error.message));
		}
	});

	globalChatNamespace.on('connection', socket => {
		console.log(`User ${socket.userName} connected to global chat`);

		// Join global chat
		socket.on('join-global-chat', async () => {
			try {
				const { userId, userName } = socket;

				// Join the global chat room
				socket.join('global-chat-room');

				// Send success response to user
				socket.emit('global-chat-joined', {
					success: true,
					message: 'Successfully joined global chat',
					userId: userId,
				});

				// Broadcast to other users
				socket.to('global-chat-room').emit('user-joined', {
					userId: userId,
					userName: userName,
					timestamp: new Date(),
				});

				// Broadcast updated online users count
				broadcastOnlineUsersCount();
			} catch (error) {
				console.error('Error joining global chat:', error);
				socket.emit('join-error', {
					success: false,
					error: 'Failed to join global chat',
				});
			}
		});

		// Send message
		socket.on('send-message', async data => {
			try {
				const {
					message,
					messageType = 'TEXT',
					mediaUrl,
					mediaWidth,
					mediaHeight,
				} = data;
				const { userId, userName } = socket;

				// Check if chat is disabled
				const settings = await GlobalChatSettings.getSettings();
				if (settings.isChatDisabled) {
					socket.emit('message-error', {
						success: false,
						error:
							settings.disabledReason ||
							'Global chat is currently disabled',
						chatDisabled: true,
						disabledAt: settings.disabledAt,
					});
					return;
				}

				// Check if user is muted
				const muteCheck = await checkIfUserMuted(userId);
				if (muteCheck.isMuted) {
					socket.emit('message-error', {
						success: false,
						error: 'You are muted from global chat',
						muteInfo: muteCheck.muteInfo,
					});
					return;
				}

				// Validate message based on type
				if (messageType === 'TEXT') {
					if (!message || typeof message !== 'string') {
						socket.emit('message-error', {
							success: false,
							error: 'Message is required for text messages',
						});
						return;
					}

					if (message.trim().length === 0) {
						socket.emit('message-error', {
							success: false,
							error: 'Message cannot be empty',
						});
						return;
					}

					if (message.length > 500) {
						socket.emit('message-error', {
							success: false,
							error: 'Message too long (max 500 characters)',
						});
						return;
					}
				} else {
					// For media messages, validate URL
					if (!mediaUrl || typeof mediaUrl !== 'string') {
						socket.emit('message-error', {
							success: false,
							error: 'Media URL is required for media messages',
						});
						return;
					}

					const widthValid =
						typeof mediaWidth === 'number' && mediaWidth > 0;
					const heightValid =
						typeof mediaHeight === 'number' && mediaHeight > 0;

					if (!widthValid || !heightValid) {
						socket.emit('message-error', {
							success: false,
							error: 'Media width and height must be positive numbers',
						});
						return;
					}
				}

				// Create chat message in database
				const chatMessage = await GlobalChatMessage.create({
					user: userId,
					userName: userName,
					message: messageType === 'TEXT' ? message.trim() : '',
					messageType: messageType,
					mediaUrl: messageType !== 'TEXT' ? mediaUrl : undefined,
					mediaWidth: messageType !== 'TEXT' ? mediaWidth : undefined,
					mediaHeight:
						messageType !== 'TEXT' ? mediaHeight : undefined,
				});

				// Broadcast message to all users in global chat (including sender)
				const messageData = {
					messageId: chatMessage.id,
					user: userId,
					userName: userName,
					message: chatMessage.message,
					messageType: chatMessage.messageType,
					mediaUrl: chatMessage.mediaUrl,
					mediaWidth: chatMessage.mediaWidth,
					mediaHeight: chatMessage.mediaHeight,
					timestamp: chatMessage.createdAt,
				};

				// Send to all users in global chat room including sender
				globalChatNamespace
					.to('global-chat-room')
					.emit('new-message', messageData);
			} catch (error) {
				console.error('Error sending message:', error);
				socket.emit('message-error', {
					success: false,
					error: 'Failed to send message',
				});
			}
		});

		// Get chat history
		socket.on('get-chat-history', async data => {
			try {
				const { limit = 50, offset = 0 } = data;

				// Get chat messages (excluding deleted ones)
				const messages = await GlobalChatMessage.find({
					isDeleted: false,
				})
					.populate('user', 'name')
					.sort({ createdAt: -1 })
					.limit(parseInt(limit))
					.skip(parseInt(offset));

				const total = await GlobalChatMessage.countDocuments({
					isDeleted: false,
				});

				socket.emit('chat-history', {
					success: true,
					messages: messages.reverse(), // Reverse to show oldest first
					total,
					pagination: {
						limit: parseInt(limit),
						offset: parseInt(offset),
						hasMore: parseInt(offset) + parseInt(limit) < total,
					},
				});
			} catch (error) {
				console.error('Error getting chat history:', error);
				socket.emit('chat-history-error', {
					success: false,
					error: 'Failed to get chat history',
				});
			}
		});

		// Delete message (admin only)
		socket.on('delete-message', async data => {
			try {
				const { messageId } = data;
				const { userId, role } = socket;

				// Check if user is admin
				if (role !== 'ADMIN') {
					socket.emit('delete-message-error', {
						success: false,
						error: 'Only admins can delete messages',
					});
					return;
				}

				// Soft delete the message
				const message = await GlobalChatMessage.findByIdAndUpdate(
					messageId,
					{
						isDeleted: true,
						deletedBy: userId,
						deletedAt: new Date(),
					},
					{ new: true }
				);

				if (!message) {
					socket.emit('delete-message-error', {
						success: false,
						error: 'Message not found',
					});
					return;
				}

				// Broadcast message deletion to all users
				globalChatNamespace
					.to('global-chat-room')
					.emit('message-deleted', {
						messageId: messageId,
						deletedBy: userId,
						timestamp: new Date(),
					});
			} catch (error) {
				console.error('Error deleting message:', error);
				socket.emit('delete-message-error', {
					success: false,
					error: 'Failed to delete message',
				});
			}
		});

		// Typing indicators
		socket.on('typing-start', () => {
			const { userId, userName } = socket;

			socket.to('global-chat-room').emit('user-typing', {
				userId: userId,
				userName: userName,
			});
		});

		socket.on('typing-stop', () => {
			const { userId, userName } = socket;

			socket.to('global-chat-room').emit('user-stopped-typing', {
				userId: userId,
				userName: userName,
			});
		});

		// Leave global chat
		socket.on('leave-global-chat', async () => {
			try {
				const { userId, userName } = socket;

				// Leave socket room
				socket.leave('global-chat-room');

				// Send success response to user
				socket.emit('global-chat-left', {
					success: true,
					message: 'Successfully left global chat',
				});

				// Broadcast to other users
				socket.to('global-chat-room').emit('user-left', {
					userId: userId,
					userName: userName,
					timestamp: new Date(),
				});

				// Broadcast updated online users count
				broadcastOnlineUsersCount();
			} catch (error) {
				console.error('Error leaving global chat:', error);
				socket.emit('leave-error', {
					success: false,
					error: 'Failed to leave global chat',
				});
			}
		});

		// Handle disconnection
		socket.on('disconnect', async () => {
			const { userId, userName } = socket;

			console.log(`User ${userName} disconnected from global chat`);

			// Broadcast to other users
			socket.to('global-chat-room').emit('user-left', {
				userId: userId,
				userName: userName,
				timestamp: new Date(),
			});

			// Broadcast updated online users count
			broadcastOnlineUsersCount();
		});

		// Handle socket errors
		socket.on('error', error => {
			console.error(
				`Global chat socket error for user ${socket.userId}:`,
				error
			);
		});
	});
};

// Helper function to broadcast online users count
const broadcastOnlineUsersCount = () => {
	if (globalChatNamespace) {
		const count = getOnlineUsersCount();
		globalChatNamespace.to('global-chat-room').emit('online-users-count', {
			count: count,
			timestamp: new Date(),
		});
	}
};

// Helper function to check if user is muted
const checkIfUserMuted = async userId => {
	try {
		const mute = await GlobalChatMute.findOne({
			user: userId,
			isActive: true,
		});

		if (!mute) {
			return { isMuted: false };
		}

		// Check if mute has expired
		if (mute.expiresAt && new Date() > mute.expiresAt) {
			// Deactivate expired mute
			await GlobalChatMute.findByIdAndUpdate(mute._id, {
				isActive: false,
			});
			return { isMuted: false };
		}

		return {
			isMuted: true,
			muteInfo: {
				reason: mute.reason,
				mutedBy: mute.mutedBy,
				expiresAt: mute.expiresAt,
			},
		};
	} catch (error) {
		console.error('Error checking mute status:', error);
		return { isMuted: false };
	}
};

// Broadcast message to all users in global chat
export const broadcastToGlobalChat = (event, data) => {
	if (globalChatNamespace) {
		globalChatNamespace.to('global-chat-room').emit(event, data);
	}
};

// Get online users count
export const getOnlineUsersCount = () => {
	if (globalChatNamespace) {
		const room = globalChatNamespace.adapter.rooms.get('global-chat-room');
		return room ? room.size : 0;
	}
	return 0;
};

// Notify specific user (for mute notifications)
export const notifyUserMuted = (userId, muteInfo) => {
	if (globalChatNamespace) {
		const userSockets = Array.from(
			globalChatNamespace.sockets.values()
		).filter(socket => socket.userId === userId);

		userSockets.forEach(socket => {
			socket.emit('user-muted', {
				success: true,
				message: 'You have been muted from global chat',
				muteInfo: muteInfo,
			});
		});
	}
};
