import { GlobalChatMessage, GlobalChatMute } from './model';
import { User } from '../user/model';
import {
	getOnlineUsersCount,
	notifyUserMuted,
} from '../../services/socket/globalChatSocket';

// Get chat history
export const getChatHistory = async ({
	limit = 50,
	offset = 0,
	sortBy = 'createdAt',
	sortOrder = 'desc',
}) => {
	try {
		const messages = await GlobalChatMessage.find({ isDeleted: false })
			.populate('user', 'name')
			.sort({
				[sortBy]: sortOrder.toLowerCase() === 'desc' ? -1 : 1,
			})
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await GlobalChatMessage.countDocuments({
			isDeleted: false,
		});

		return {
			status: 200,
			entity: {
				success: true,
				messages,
				total,
				pagination: {
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: parseInt(offset) + parseInt(limit) < total,
				},
			},
		};
	} catch (error) {
		console.error('Error getting chat history:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error,
			},
		};
	}
};

// Delete message (Admin only)
export const deleteMessage = async ({ messageId }, { _id, role }) => {
	try {
		// Check if user is admin
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Only admins can delete messages',
				},
			};
		}

		// Soft delete the message
		const message = await GlobalChatMessage.findByIdAndUpdate(
			messageId,
			{
				isDeleted: true,
				deletedBy: _id,
				deletedAt: new Date(),
			},
			{ new: true }
		);

		if (!message) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Message not found',
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Message deleted successfully',
			},
		};
	} catch (error) {
		console.error('Error deleting message:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error,
			},
		};
	}
};

// Mute user (Admin only)
export const muteUser = async (
	{ userId, reason = '', expiresAt },
	{ _id, role }
) => {
	try {
		// Check if user is admin
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Only admins can mute users',
				},
			};
		}

		// Validate user exists
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		// Check if user is already muted
		const existingMute = await GlobalChatMute.findOne({
			user: userId,
			isActive: true,
		});

		if (existingMute) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'User is already muted',
				},
			};
		}

		// Create mute record
		const muteData = {
			user: userId,
			mutedBy: _id,
			reason: reason,
			isActive: true,
		};

		if (expiresAt) {
			muteData.expiresAt = new Date(expiresAt);
		}

		const mute = await GlobalChatMute.create(muteData);

		// Notify the user via socket
		notifyUserMuted(userId, {
			reason: mute.reason,
			mutedBy: _id,
			expiresAt: mute.expiresAt,
		});

		return {
			status: 200,
			entity: {
				success: true,
				message: 'User muted successfully',
				mute,
			},
		};
	} catch (error) {
		console.error('Error muting user:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error,
			},
		};
	}
};

// Unmute user (Admin only)
export const unmuteUser = async ({ userId }, { _id, role }) => {
	try {
		// Check if user is admin
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Only admins can unmute users',
				},
			};
		}

		// Find and deactivate the mute
		const mute = await GlobalChatMute.findOneAndUpdate(
			{ user: userId, isActive: true },
			{ isActive: false },
			{ new: true }
		);

		if (!mute) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User is not currently muted',
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: 'User unmuted successfully',
			},
		};
	} catch (error) {
		console.error('Error unmuting user:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error,
			},
		};
	}
};

// Get muted users list (Admin only)
export const getMutedUsers = async (
	{ limit = 50, offset = 0, includeExpired = false },
	{ role }
) => {
	try {
		// Check if user is admin
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Only admins can view muted users',
				},
			};
		}

		const query = includeExpired === 'true' ? {} : { isActive: true };

		const mutedUsers = await GlobalChatMute.find(query)
			.populate('user', 'name email')
			.populate('mutedBy', 'name')
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await GlobalChatMute.countDocuments(query);

		return {
			status: 200,
			entity: {
				success: true,
				mutedUsers,
				total,
				pagination: {
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: parseInt(offset) + parseInt(limit) < total,
				},
			},
		};
	} catch (error) {
		console.error('Error getting muted users:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error,
			},
		};
	}
};

// Get online users count
export const getOnlineUsers = async () => {
	try {
		const count = getOnlineUsersCount();

		return {
			status: 200,
			entity: {
				success: true,
				onlineUsersCount: count,
			},
		};
	} catch (error) {
		console.error('Error getting online users count:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error,
			},
		};
	}
};

