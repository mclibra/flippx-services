import mongoose from 'mongoose';
import {
	GlobalChatMessage,
	GlobalChatMessageReport,
	GlobalChatUserReport,
} from './model';
import { User } from '../user/model';
import { getOnlineUsersCount } from '../../services/socket/globalChatSocket';

// Get chat history
export const getChatHistory = async (
	{ limit = 50, offset = 0, sortBy = 'createdAt', sortOrder = 'desc' },
	user = null
) => {
	try {
		let hiddenMessageIds = [];

		if (user?._id) {
			hiddenMessageIds = await GlobalChatMessageReport.find({
				reportedBy: user._id,
			}).distinct('message');
		}

		const filter = {
			isDeleted: false,
		};

		if (hiddenMessageIds.length) {
			filter._id = {
				$nin: hiddenMessageIds.map(
					id => new mongoose.Types.ObjectId(id.toString())
				),
			};
		}

		const messages = await GlobalChatMessage.find(filter)
			.populate('user', 'name')
			.sort({
				[sortBy]: sortOrder.toLowerCase() === 'desc' ? -1 : 1,
			})
			.limit(parseInt(limit))
			.skip(parseInt(offset));

		const total = await GlobalChatMessage.countDocuments(filter);

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

// Report message (Authenticated users)
export const reportMessage = async ({ messageId, reason = '' }, user) => {
	try {
		if (!user?._id) {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Authentication required',
				},
			};
		}

		const message = await GlobalChatMessage.findOne({
			_id: messageId,
			isDeleted: false,
		});

		if (!message) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Message not found',
				},
			};
		}

		await GlobalChatMessageReport.findOneAndUpdate(
			{ message: messageId, reportedBy: user._id },
			{ reason },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Message reported successfully',
			},
		};
	} catch (error) {
		console.error('Error reporting message:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || error,
			},
		};
	}
};

// Report user (Authenticated users)
export const reportUser = async (
	{ reportedUserId, messageId = null, reason = '' },
	user
) => {
	try {
		if (!user?._id) {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Authentication required',
				},
			};
		}

		if (reportedUserId === user._id) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'You cannot report yourself',
				},
			};
		}

		const reportedUser = await User.findById(reportedUserId);
		if (!reportedUser) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Reported user not found',
				},
			};
		}

		if (messageId) {
			const message = await GlobalChatMessage.findOne({
				_id: messageId,
				isDeleted: false,
			});

			if (!message) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'Associated message not found',
					},
				};
			}

			if (message.user?.toString() !== reportedUserId) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Message does not belong to reported user',
					},
				};
			}
		}

		const query = {
			reportedUser: reportedUserId,
			reportedBy: user._id,
		};

		if (messageId) {
			query.message = messageId;
		}

		await GlobalChatUserReport.findOneAndUpdate(
			query,
			{
				reason,
			},
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);

		return {
			status: 200,
			entity: {
				success: true,
				message: 'User reported successfully',
			},
		};
	} catch (error) {
		console.error('Error reporting user:', error);
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
