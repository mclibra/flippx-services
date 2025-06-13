import moment from 'moment';
import uuid from 'uuid';
import { Notifcation } from './model';
import { User } from '../user/model';

export const list = async ({
	offset,
	key,
	limit,
	receiverId,
	role,
	startDate,
	status,
	endDate,
	sortBy = 'createdAt',
	sortOrder = 'desc',
}) => {
	try {
		let params = {};
		if (startDate || endDate) {
			params['$and'] = [];
			if (startDate) {
				params['$and'].push({
					createdAt: {
						$gte: moment(parseInt(startDate)).toISOString(),
					},
				});
			}
			if (endDate) {
				params['$and'].push({
					createdAt: {
						$lte: moment(parseInt(endDate)).toISOString(),
					},
				});
			}
		}
		if (receiverId) {
			params.to = receiverId;
		}
		if (key) {
			params['$or'] = [
				{
					messageTitle: new RegExp(key, 'i'),
				},
				{
					messageContent: new RegExp(key, 'i'),
				},
				{
					messageId: new RegExp(key, 'i'),
				},
			];
		}
		const notifcations = await Notifcation.aggregate([
			{
				$match: params,
			},
			{
				$group: {
					_id: '$messageId',
					messageTitle: {
						$first: '$messageTitle',
					},
					messageContent: {
						$first: '$messageContent',
					},
					createdAt: {
						$first: '$createdAt',
					},
				},
			},
			{
				$sort: {
					[sortBy]: sortOrder.toLowerCase() === 'desc' ? -1 : 1,
				},
			},
			{
				$skip: offset ? parseInt(offset) : 0,
			},
			{
				$limit: limit ? parseInt(limit) : 10,
			},
		]);
		const count = await Notifcation.aggregate([
			{
				$match: params,
			},
			{
				$group: {
					_id: '$messageId',
				},
			},
		]);
		return {
			status: 200,
			entity: {
				success: true,
				notifcations,
				total: count.length,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const getSelfNotification = async (
	{ _id },
	{
		read,
		offset,
		key,
		limit,
		receiverId,
		role,
		startDate,
		status,
		endDate,
		sortBy = 'createdAt',
	},
) => {
	try {
		let params = {
			to: _id,
		};
		if (startDate || endDate) {
			params['$and'] = [];
			if (startDate) {
				params['$and'].push({
					createdAt: {
						$gte: moment(parseInt(startDate)).toISOString(),
					},
				});
			}
			if (endDate) {
				params['$and'].push({
					createdAt: {
						$lte: moment(parseInt(endDate)).toISOString(),
					},
				});
			}
		}
		if (read) {
			params.read = read.toString() === 'true' ? true : false;
		}
		if (key) {
			params['$or'] = [
				{
					message: new RegExp(key, 'i'),
				},
				{
					messageId: new RegExp(key, 'i'),
				},
			];
		}
		let notifcations = await Notifcation.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				[sortBy]: 'desc',
			})
			.exec();
		let total = await Notifcation.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				notifcations: notifcations.map(notifcation =>
					notifcation.messageType === 'TEXT'
						? {
								_id: notifcation._id,
								messageType: notifcation.messageType,
								messageTitle: notifcation.messageTitle,
								read: notifcation.read,
								messageId: notifcation.messageId,
								messageContent: notifcation.messageContent,
							}
						: {
								_id: notifcation._id,
								messageType: notifcation.messageType,
								messageTitle: notifcation.messageTitle,
								read: notifcation.read,
								messageId: notifcation.messageId,
							},
				),
				total,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const markNotificationRead = async ({ _id }) => {
	try {
		let params = {
			to: _id,
		};
		const notifcations = await Notifcation.updateMany(params, {
			$set: {
				read: true,
			},
		}).exec();
		return {
			status: 200,
			entity: {
				success: true,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const remove = async ({ messageId }) => {
	try {
		const notifcations = await Notifcation.remove({
			messageId,
		}).exec();
		return {
			status: 200,
			entity: {
				success: true,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const create = async (body, { _id }) => {
	try {
		let userList = [];
		if (body.to.toUpperCase() === 'ALL') {
			userList = await User.find({
				role: body.role.toUpperCase() || 'USER',
			});
		} else {
			userList = await User.find({
				_id: {
					$in: body.to.map(item => item.toString()),
				},
			});
		}
		const messageId = uuid();
		const notificationBody = userList.map(user => ({
			messageType: body.messageType || 'TEXT',
			messageTitle: body.messageTitle,
			messageContent: body.messageContent,
			messageId: messageId,
			to: user._id.toString(),
			from: _id.toString(),
			read: false,
		}));
		const notifcation = await Notifcation.create(notificationBody);
		return {
			status: 200,
			entity: {
				success: true,
				notifcation: notifcation,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const show = async (
	{ id },
	{ _id, role },
	{ offset, limit, receiverId, sortBy = 'createdAt', sortOrder = 'desc' },
) => {
	try {
		// let params = {
		// 	messageId: id
		// }
		// if(receiverId){
		// 	params.to = receiverId.toString()
		// }
		// const notifcation = await Notifcation
		// 						.find(params)
		// 						.limit(limit ? parseInt(limit) : 10)
		// 						.skip(offset ? parseInt(offset) : 0)
		// 						.sort({
		// 							[sortBy]: sortOrder.toLowerCase()
		// 						})
		// 						.exec()
		// const total = await Lottery.count(params).exec()
		const notifcation = await Notifcation.findById(id);
		return {
			status: 200,
			entity: {
				success: true,
				notifcation,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};
