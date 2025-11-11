import mongoose from 'mongoose';
import { Message, messageStatuses } from '../../message/model';

const normalizeMedia = media =>
	Array.isArray(media)
		? media
				.filter(item => typeof item === 'string' && item.trim().length)
				.map(item => item.trim())
		: [];

export const listMessages = async query => {
	try {
		const {
			limit = 10,
			offset = 0,
			sortBy = 'createdAt',
			sortOrder = 'desc',
			status,
			userId,
			fromDate,
			toDate,
			search,
		} = query;

		const filter = {};

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

		if (userId) {
			if (!mongoose.Types.ObjectId.isValid(userId)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Invalid user id filter',
					},
				};
			}
			filter.user = userId;
		}

		if (fromDate || toDate) {
			filter.createdAt = {};

			if (fromDate) {
				const from = new Date(fromDate);
				if (Number.isNaN(from.valueOf())) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Invalid fromDate filter',
						},
					};
				}
				filter.createdAt.$gte = from;
			}

			if (toDate) {
				const to = new Date(toDate);
				if (Number.isNaN(to.valueOf())) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Invalid toDate filter',
						},
					};
				}
				filter.createdAt.$lte = to;
			}

			if (!Object.keys(filter.createdAt).length) {
				delete filter.createdAt;
			}
		}

		if (search) {
			filter.$or = [
				{ title: new RegExp(search, 'i') },
				{ body: new RegExp(search, 'i') },
			];
		}

		const sort = {
			[sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1,
		};

		const [messages, total] = await Promise.all([
			Message.find(filter)
				.populate('user', 'name.firstName name.lastName email phone')
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
		console.error('Error listing messages (admin):', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to list messages',
			},
		};
	}
};

export const getMessageDetails = async ({ messageId }) => {
	try {
		if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid message id',
				},
			};
		}

		const message = await Message.findById(messageId)
			.populate('user', 'name.firstName name.lastName email phone role')
			.populate('replies.repliedBy', 'name.firstName name.lastName email role');

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
		console.error('Error getting message details (admin):', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get message details',
			},
		};
	}
};

export const updateMessageStatus = async ({ messageId }, body, admin) => {
	try {
		if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid message id',
				},
			};
		}

		const { status } = body;

		if (!status) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Status is required',
				},
			};
		}

		const normalizedStatus = status.toUpperCase();
		if (!messageStatuses.includes(normalizedStatus)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid status value',
				},
			};
		}

		const updatedMessage = await Message.findByIdAndUpdate(
			messageId,
			{ status: normalizedStatus },
			{ new: true }
		).populate('user', 'name.firstName name.lastName email phone');

		if (!updatedMessage) {
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
				message: updatedMessage,
			},
		};
	} catch (error) {
		console.error('Error updating message status (admin):', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to update message status',
			},
		};
	}
};

export const replyToMessage = async ({ messageId }, body, admin) => {
	try {
		if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid message id',
				},
			};
		}

		if (!admin?._id) {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Authentication required',
				},
			};
		}

		const { reply, media = [], status } = body;

		if (!reply) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Reply body is required',
				},
			};
		}

		const update = {
			$push: {
				replies: {
					body: reply.trim(),
					media: normalizeMedia(media),
					repliedBy: admin._id,
				},
			},
			lastRepliedAt: new Date(),
		};

		if (status) {
			const normalizedStatus = status.toUpperCase();
			if (!messageStatuses.includes(normalizedStatus)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Invalid status value',
					},
				};
			}
			update.status = normalizedStatus;
		} else {
			update.status = 'IN_PROGRESS';
		}

		const updatedMessage = await Message.findByIdAndUpdate(messageId, update, {
			new: true,
		}).populate([
			{ path: 'user', select: 'name.firstName name.lastName email phone' },
			{ path: 'replies.repliedBy', select: 'name.firstName name.lastName email role' },
		]);

		if (!updatedMessage) {
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
				message: updatedMessage,
			},
		};
	} catch (error) {
		console.error('Error replying to message (admin):', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to reply to message',
			},
		};
	}
};

