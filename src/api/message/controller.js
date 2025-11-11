import mongoose from 'mongoose';
import { Message, messageStatuses } from './model';

const normalizeMedia = media =>
	Array.isArray(media)
		? media
				.filter(item => typeof item === 'string' && item.trim().length)
				.map(item => item.trim())
		: [];

export const createMessage = async (body, user) => {
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

		const { title, message: messageBody, body: legacyBody, media = [] } = body;

		const resolvedBody = messageBody || legacyBody;

		if (!title || !resolvedBody) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Title and message body are required',
				},
			};
		}

		const newMessage = await Message.create({
			user: user._id,
			title: title.trim(),
			body: resolvedBody.trim(),
			media: normalizeMedia(media),
		});

		const populatedMessage = await Message.findById(newMessage._id).populate(
			'user',
			'name.firstName name.lastName email phone'
		);

		return {
			status: 201,
			entity: {
				success: true,
				message: populatedMessage,
			},
		};
	} catch (error) {
		console.error('Error creating message:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to create message',
			},
		};
	}
};

export const listMessages = async (query, user) => {
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

		const {
			limit = 10,
			offset = 0,
			sortBy = 'createdAt',
			sortOrder = 'desc',
			status,
		} = query;

		const filter = { user: user._id };

		if (status) {
			const normalizedStatus = status.toUpperCase();
			if (!messageStatuses.includes(normalizedStatus)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Invalid status filter',
					},
				};
			}

			filter.status = normalizedStatus;
		}

		const sort = {
			[sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1,
		};

		const [messages, total] = await Promise.all([
			Message.find(filter)
				.sort(sort)
				.limit(parseInt(limit))
				.skip(parseInt(offset)),
			Message.countDocuments(filter),
		]);

		return {
			status: 200,
			entity: {
				success: true,
				messages,
				pagination: {
					total,
					limit: parseInt(limit),
					offset: parseInt(offset),
					hasMore: parseInt(offset) + parseInt(limit) < total,
				},
			},
		};
	} catch (error) {
		console.error('Error listing messages:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to list messages',
			},
		};
	}
};

export const getMessageById = async ({ messageId }, user) => {
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

		if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid message id',
				},
			};
		}

		const message = await Message.findOne({
			_id: messageId,
			user: user._id,
		}).populate('user', 'name.firstName name.lastName email phone');

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
				message,
			},
		};
	} catch (error) {
		console.error('Error fetching message:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch message',
			},
		};
	}
};

