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

		const {
			title,
			message: messageBody,
			body: legacyBody,
			media = [],
		} = body;

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

		const now = new Date();

		const newMessage = await Message.create({
			user: user._id,
			title: title.trim(),
			body: resolvedBody.trim(),
			media: normalizeMedia(media),
			statusHistory: [
				{
					status: 'OPEN',
					changedAt: now,
					changedBy: user._id,
				},
			],
		});

		const populatedMessage = await Message.findById(newMessage._id)
			.populate('user', 'name.firstName name.lastName email phone role')
			.populate(
				'statusHistory.changedBy',
				'name.firstName name.lastName email role'
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
		})
			.populate('user', 'name.firstName name.lastName email phone')
			.populate(
				'statusHistory.changedBy',
				'name.firstName name.lastName email role'
			)
			.populate(
				'replies.repliedBy',
				'name.firstName name.lastName email role'
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

		const timeline = [];

		if (message.createdAt) {
			timeline.push({
				type: 'MESSAGE_CREATED',
				at: message.createdAt,
				body: message.body,
				title: message.title,
				media: message.media,
				by: message.user
					? {
							id: message.user.id,
							name: message.user.name,
							email: message.user.email,
							role: message.user.role,
							phone: message.user.phone,
						}
					: null,
			});
		}

		if (Array.isArray(message.statusHistory)) {
			message.statusHistory.forEach((entry, index) => {
				if (index === 0 && message.createdAt) {
					return;
				}

				if (!entry?.changedAt) {
					return;
				}

				timeline.push({
					type: 'STATUS_CHANGED',
					at: entry.changedAt,
					status: entry.status,
					by: entry.changedBy
						? {
								id: entry.changedBy.id,
								name: entry.changedBy.name,
								email: entry.changedBy.email,
								role: entry.changedBy.role,
							}
						: null,
				});
			});
		}

		if (Array.isArray(message.replies)) {
			message.replies.forEach(reply => {
				if (!reply?.createdAt) {
					return;
				}

				timeline.push({
					type: 'REPLY_ADDED',
					at: reply.createdAt,
					body: reply.body,
					media: reply.media,
					by: reply.repliedBy
						? {
								id: reply.repliedBy.id,
								name: reply.repliedBy.name,
								email: reply.repliedBy.email,
								role: reply.repliedBy.role,
							}
						: null,
				});
			});
		}

		timeline.sort((a, b) => {
			const timeA = a.at ? new Date(a.at).getTime() : 0;
			const timeB = b.at ? new Date(b.at).getTime() : 0;
			return timeA - timeB;
		});

		return {
			status: 200,
			entity: {
				success: true,
				message,
				timeline,
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
