import {
	GlobalChatMessage,
	GlobalChatSettings,
} from '../../global_chat/model';
import {
	deleteMessage as deleteGlobalChatMessage,
	muteUser as muteGlobalChatUser,
	unmuteUser as unmuteGlobalChatUser,
} from '../../global_chat/controller';
import { broadcastToGlobalChat } from '../../../services/socket/globalChatSocket';

const MESSAGE_TYPES = ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO'];

const parseBoolean = value =>
	value === true ||
	value === false ||
	value === 'true' ||
	value === 'false'
		? value === true || value === 'true'
		: false;

const sanitizeSortOrder = sortOrder =>
	['asc', 'ascending', '1'].includes(String(sortOrder).toLowerCase())
		? 1
		: -1;

const buildDateRangeFilter = (startDate, endDate) => {
	const range = {};

	if (startDate) {
		const parsedStart = new Date(startDate);
		if (!Number.isNaN(parsedStart.getTime())) {
			range.$gte = parsedStart;
		}
	}

	if (endDate) {
		const parsedEnd = new Date(endDate);
		if (!Number.isNaN(parsedEnd.getTime())) {
			range.$lte = parsedEnd;
		}
	}

	return Object.keys(range).length ? range : null;
};

export const listChatMessages = async query => {
	try {
		const {
			limit = 50,
			offset = 0,
			sortBy = 'createdAt',
			sortOrder = 'desc',
			includeDeleted = 'false',
			userId,
			search,
			startDate,
			endDate,
			messageType,
		} = query;

		const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
		const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);
		const sortDirection = sanitizeSortOrder(sortOrder);

		const filter = {};

		if (!parseBoolean(includeDeleted)) {
			filter.isDeleted = false;
		}

		if (userId) {
			filter.user = userId;
		}

		if (messageType) {
			const normalizedType = messageType.toUpperCase();
			if (MESSAGE_TYPES.includes(normalizedType)) {
				filter.messageType = normalizedType;
			}
		}

		if (search) {
			filter.message = { $regex: search, $options: 'i' };
		}

		const dateRange = buildDateRangeFilter(startDate, endDate);
		if (dateRange) {
			filter.createdAt = dateRange;
		}

		const [messages, total] = await Promise.all([
			GlobalChatMessage.find(filter)
				.populate('user', 'name email userName role')
				.sort({ [sortBy]: sortDirection })
				.skip(parsedOffset)
				.limit(parsedLimit),
			GlobalChatMessage.countDocuments(filter),
		]);

		return {
			status: 200,
			entity: {
				success: true,
				messages,
				pagination: {
					limit: parsedLimit,
					offset: parsedOffset,
					total,
					hasMore: parsedOffset + parsedLimit < total,
				},
			},
		};
	} catch (error) {
		console.error('List global chat messages (admin) error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					error.message ||
					'Failed to fetch global chat messages for admin',
			},
		};
	}
};

export const deleteChatMessage = async ({ messageId }, adminUser) => {
	try {
		if (!messageId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'messageId is required',
				},
			};
		}

		return await deleteGlobalChatMessage({ messageId }, adminUser);
	} catch (error) {
		console.error('Delete global chat message (admin) error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to delete global chat message',
			},
		};
	}
};

export const muteChatUser = async (payload, adminUser) => {
	try {
		if (!payload?.userId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'userId is required',
				},
			};
		}

		return await muteGlobalChatUser(payload, adminUser);
	} catch (error) {
		console.error('Mute global chat user (admin) error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to mute user in global chat',
			},
		};
	}
};

export const unmuteChatUser = async ({ userId }, adminUser) => {
	try {
		if (!userId) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'userId is required',
				},
			};
		}

		return await unmuteGlobalChatUser({ userId }, adminUser);
	} catch (error) {
		console.error('Unmute global chat user (admin) error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to unmute user in global chat',
			},
		};
	}
};

const mapSettingsToResponse = settings => ({
	isDisabled: settings.isChatDisabled,
	disabledReason: settings.disabledReason,
	disabledBy: settings.disabledBy,
	disabledAt: settings.disabledAt,
	updatedAt: settings.updatedAt,
	createdAt: settings.createdAt,
});

export const getChatStatus = async () => {
	try {
		const settings = await GlobalChatSettings.getSettings();

		return {
			status: 200,
			entity: {
				success: true,
				status: mapSettingsToResponse(settings),
			},
		};
	} catch (error) {
		console.error('Get global chat status (admin) error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch global chat status',
			},
		};
	}
};

export const updateChatStatus = async (
	{ isDisabled, reason = null },
	adminUser
) => {
	try {
		if (typeof isDisabled !== 'boolean') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'isDisabled must be a boolean',
				},
			};
		}

		const settings = await GlobalChatSettings.getSettings();

		if (isDisabled) {
			settings.isChatDisabled = true;
			settings.disabledReason = reason || null;
			settings.disabledBy = adminUser?._id || adminUser?.id || null;
			settings.disabledAt = new Date();
		} else {
			settings.isChatDisabled = false;
			settings.disabledReason = null;
			settings.disabledBy = null;
			settings.disabledAt = null;
		}

		await settings.save();

		const status = mapSettingsToResponse(settings);

		broadcastToGlobalChat('chat-status-changed', {
			success: true,
			status,
		});

		return {
			status: 200,
			entity: {
				success: true,
				message: isDisabled
					? 'Global chat disabled successfully'
					: 'Global chat enabled successfully',
				status,
			},
		};
	} catch (error) {
		console.error('Update global chat status (admin) error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to update global chat status',
			},
		};
	}
};


