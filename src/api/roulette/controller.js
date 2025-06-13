import moment from 'moment';
import { Roulette } from './model';
import { RouletteTicket } from '../roulette_ticket/model';
import {
	updatePlacedBet,
	getTotalWinningAmount,
} from '../roulette_ticket/controller';

export const list = async ({
	offset,
	limit,
	startDate,
	endDate,
	status,
	sortBy = 'createdAt',
	sortOrder = 'desc',
}) => {
	try {
		let params = {},
			roulettePromise = [];
		if (startDate || endDate) {
			params['$and'] = [];
			if (startDate) {
				params['$and'].push({
					createdAt: {
						$gte: new Date(parseInt(startDate)),
					},
				});
			}
			if (endDate) {
				params['$and'].push({
					createdAt: {
						$lte: new Date(parseInt(endDate)),
					},
				});
			}
		}
		if (status) {
			params['status'] = status.toUpperCase();
		}
		if (sortBy === 'totalAmountPlayed' || sortBy === 'totalAmountWon') {
			const rouletteTickets = await RouletteTicket.aggregate([
				{
					$match: params,
				},
				{
					$group: {
						_id: '$roulette',
						totalAmountPlayed: {
							$sum: '$totalAmountPlayed',
						},
						totalAmountWon: {
							$sum: '$totalAmountWon',
						},
					},
				},
				{
					$lookup: {
						from: 'Roulette',
						localField: 'rouletteId',
						foreignField: '_id',
						as: 'roulette_doc',
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
			roulettePromise = rouletteTickets.map(
				ticket =>
					new Promise(async (resolve, reject) => {
						let roulette = await Roulette.findById(
							ticket._id,
						).exec();
						resolve({
							...roulette._doc,
							amount: [ticket],
						});
					}),
			);
		} else {
			const rouletteList = await Roulette.find(params)
				.limit(limit ? parseInt(limit) : 10)
				.skip(offset ? parseInt(offset) : 0)
				.sort({
					[sortBy]: sortOrder.toLowerCase(),
				})
				.exec();
			roulettePromise = rouletteList.map(
				roulette =>
					new Promise(async (resolve, reject) => {
						let amount = await RouletteTicket.aggregate([
							{
								$match: {
									roulette: roulette.id,
								},
							},
							{
								$group: {
									_id: null,
									totalAmountPlayed: {
										$sum: '$totalAmountPlayed',
									},
									totalAmountWon: {
										$sum: '$totalAmountWon',
									},
								},
							},
						]);
						resolve({
							...roulette._doc,
							amount,
						});
					}),
			);
		}
		const roulette = await Promise.all(roulettePromise);
		const total = await Roulette.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				roulette,
				total,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const show = async (
	{ id },
	{ offset, limit, sortBy = 'createdAt', sortOrder = 'desc' },
) => {
	try {
		const roulette = await Roulette.findById(id).exec();
		const rouletteTicket = await RouletteTicket.find({
			roulette: id,
		})
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.populate('user', 'name email phone')
			.exec();
		const total = await RouletteTicket.count({
			roulette: id,
		}).exec();
		const amount = await RouletteTicket.aggregate([
			{
				$match: {
					roulette: id,
				},
			},
			{
				$group: {
					_id: null,
					totalAmountPlayed: {
						$sum: '$totalAmountPlayed',
					},
					totalAmountWon: {
						$sum: '$totalAmountWon',
					},
				},
			},
		]);
		return {
			status: 200,
			entity: {
				success: true,
				roulette,
				rouletteTicket,
				amount: amount.map(item => ({
					...item,
					totalAmountPlayed: parseFloat(
						item.totalAmountPlayed,
					).toFixed(2),
					totalAmountWon: parseFloat(item.totalAmountWon).toFixed(2),
				})),
				total,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const nextSpin = async () => {
	try {
		let currentTime = moment.now();
		let nextRoulette = await Roulette.findOne({
			status: 'SCHEDULED',
		});
		if (
			nextRoulette &&
			nextRoulette.status === 'SCHEDULED' &&
			nextRoulette.spinSchedlue <= currentTime
		) {
			nextRoulette = await generateRouletteResult(nextRoulette);
		}
		if (!nextRoulette || nextRoulette.status === 'COMPLETED') {
			nextRoulette = await Roulette.create({
				spinSchedlue: moment().add(30, 'seconds'),
			});
		}
		const countdown = parseInt(
			(nextRoulette.spinSchedlue - currentTime) / 1000,
		);
		return {
			status: 200,
			entity: {
				success: true,
				id: nextRoulette._id,
				countdown: countdown > 0 ? countdown : 0,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const winningNumber = async ({ id }, { userId }) => {
	try {
		let currentTime = moment.now();
		let nextRoulette = await Roulette.findById(id);
		if (
			nextRoulette.status === 'SCHEDULED' &&
			nextRoulette.spinSchedlue <= currentTime
		) {
			nextRoulette = await generateRouletteResult(nextRoulette);
		}
		if (nextRoulette.status === 'COMPLETED') {
			return {
				status: 200,
				entity: {
					success: true,
					number: nextRoulette.winningNumber,
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: 'The number not out yet.',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

const generateRouletteResult = async roulette => {
	roulette.status = 'COMPLETED';
	roulette.winningNumber = Math.floor(Math.random() * 37);
	// let winningNumber1 = Math.floor(Math.random() * 37),
	// 	winningNumber2 = Math.floor(Math.random() * 37);
	// if (winningNumber2 === winningNumber1) {
	// 	winningNumber2 = Math.floor(Math.random() * 37);
	// }
	// let totalAmountWonWithNumber1 = await getTotalWinningAmount(
	// 	roulette.id,
	// 	winningNumber1,
	// );
	// let totalAmountWonWithNumber2 = await getTotalWinningAmount(
	// 	roulette.id,
	// 	winningNumber2,
	// );
	// console.log('totalAmountWonWithNumber1 ', totalAmountWonWithNumber1);
	// if (totalAmountWonWithNumber1 > totalAmountWonWithNumber2) {
	// 	roulette.winningNumber = winningNumber2;
	// } else {
	// 	roulette.winningNumber = winningNumber1;
	// }
	// console.log(
	// 	`winning amount for number 01 => ${winningNumber1} = ${totalAmountWonWithNumber1}`,
	// );
	// console.log(
	// 	`winning amount for number 02 => ${winningNumber2} = ${totalAmountWonWithNumber2}`,
	// );
	await roulette.save();
	await updatePlacedBet(roulette);
	return roulette;
};
