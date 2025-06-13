import moment from 'moment';
import { makeTransaction } from '../transaction/controller';
import { Wallet } from '../wallet/model';
import { Lottery, LotteryRestriction } from '../lottery/model';
import { BorletteTicket } from './model';
import { User } from '../user/model';
import { State } from '../state/model';

const config = {
	depositCommissionAgent: 0.01,
	depositCommissionAdmin: 0.02,
	userTransferComissionAdmin: 0.03,
	ticketBorletteComissionAgent: 0.15,
	withdrawCommissionAgent: 0.01,
	withdrawCommissionAdmin: 0.02,
};

export const listAllByLottery = async (
	{ id },
	{
		offset,
		limit,
		startDate,
		endDate,
		sortBy = 'purchasedOn',
		sortOrder = 'desc',
	}
) => {
	try {
		let params = {
			lottery: id,
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
		const borletteTickets = await BorletteTicket.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.populate('lottery')
			.exec();
		const amount = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: id,
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
		const total = await BorletteTicket.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				tickets: borletteTickets,
				total,
				amount,
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

export const listByState = async (
	{ stateId },
	{
		offset,
		limit,
		startDate,
		endDate,
		sortBy = 'purchasedOn',
		sortOrder = 'desc',
	},
	{ role }
) => {
	try {
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		// Verify state exists
		const state = await State.findById(stateId);
		if (!state) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'State not found',
				},
			};
		}

		// Get all lotteries for this state
		const stateLotteries = await Lottery.find({ state: stateId }).exec();
		const lotteryIds = stateLotteries.map(lottery =>
			lottery._id.toString()
		);

		if (lotteryIds.length === 0) {
			return {
				status: 200,
				entity: {
					success: true,
					tickets: [],
					total: 0,
					amount: [],
					state,
				},
			};
		}

		// Build params for tickets query
		let params = {
			lottery: { $in: lotteryIds },
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

		// Get tickets for these lotteries
		const borletteTickets = await BorletteTicket.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.populate('user', 'name email phone')
			.exec();

		// Get aggregate amounts
		const amount = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
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

		const total = await BorletteTicket.count(params).exec();

		return {
			status: 200,
			entity: {
				success: true,
				tickets: borletteTickets,
				total,
				amount,
				state,
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

export const stateCommissionSummary = async ({ stateId }, user) => {
	try {
		if (!['ADMIN'].includes(user.role)) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'You are not authorized to access this data.',
				},
			};
		}

		// Verify state exists
		const state = await State.findById(stateId);
		if (!state) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'State not found',
				},
			};
		}

		// Get all lotteries for this state
		const stateLotteries = await Lottery.find({
			state: stateId,
			status: 'COMPLETED',
		}).exec();

		const lotteryIds = stateLotteries.map(lottery =>
			lottery._id.toString()
		);

		if (lotteryIds.length === 0) {
			return {
				status: 200,
				entity: {
					success: true,
					data: [],
					state,
				},
			};
		}

		// Get commission summary across all lotteries in the state
		const summary = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: { $in: lotteryIds },
					status: {
						$ne: 'CANCELLED',
					},
				},
			},
			{
				$group: {
					_id: '$user',
					sales: {
						$sum: '$totalAmountPlayed',
					},
					rewards: {
						$sum: '$totalAmountWon',
					},
				},
			},
		]);

		const summaryPopulated = await User.populate(summary, {
			path: '_id',
			select: 'name role',
		});

		const data = summaryPopulated
			.filter(item => item._id.role === 'AGENT')
			.map(item => ({
				...item,
				sales: parseFloat(item.sales),
				rewards: parseFloat(item.rewards),
				commission: parseFloat(
					config.ticketBorletteComissionAgent * item.sales
				),
			}));

		return {
			status: 200,
			entity: {
				success: true,
				data: data,
				state,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const list = async ({ offset, limit }, { _id }) => {
	try {
		const borletteTickets = await BorletteTicket.find({
			user: _id,
		})
			.limit(limit || 50)
			.skip(offset || 0)
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.sort({
				purchasedOn: 'desc',
			})
			.exec();
		return {
			status: 200,
			entity: {
				success: true,
				tickets: borletteTickets,
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

export const show = async ({ id }, { role }) => {
	try {
		const borletteTicket = await BorletteTicket.findOne({
			_id: id,
			purchasedBy: role,
		})
			.populate('user', 'name email phone')
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			});

		return {
			status: 200,
			entity: {
				success: true,
				borletteTicket,
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

export const ticketByLottery = async ({ id }, { _id }) => {
	try {
		const tickets = await BorletteTicket.find({
			user: _id,
			lottery: id,
		})
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.exec();
		return {
			status: 200,
			entity: {
				success: true,
				tickets,
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

export const create = async ({ id }, body, user) => {
	try {
		const walletData = await Wallet.findOne({
			user: user._id,
		});
		const lottery = await Lottery.findById(id).populate(
			'state',
			'name code'
		);

		if (!lottery) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Lottery not found',
				},
			};
		}

		// Validate cash type
		const cashType = body.cashType || 'VIRTUAL';
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid cash type. Must be REAL or VIRTUAL',
				},
			};
		}

		// Get the appropriate balance based on cash type
		const balanceToCheck =
			cashType === 'REAL'
				? walletData.realBalance
				: walletData.virtualBalance;

		if (lottery._id && lottery.scheduledTime > moment.now()) {
			// Check if marriage numbers are allowed for this lottery
			const hasMarriageNumbers = lottery.additionalData?.hasMarriageNumbers !== false;

			// Validate that no marriage numbers are included if not allowed
			if (!hasMarriageNumbers) {
				const hasMarriageNumberInTicket = body.numbers.some(item => {
					const numberStr = item.numberPlayed.toString();
					return numberStr.includes('x');
				});

				if (hasMarriageNumberInTicket) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'Marriage numbers are not allowed for this lottery',
						},
					};
				}
			}

			const availableAmount = await getAvailableAmount(
				id,
				body.numbers.map(item => item.numberPlayed),
				hasMarriageNumbers
			);
			body.user = user._id;
			body.purchasedBy = user.role;
			body.lottery = id;
			body.purchasedOn = moment.now();
			body.totalAmountPlayed = 0;
			body.cashType = cashType;

			body.numbers = body.numbers.map(item => {
				if (
					availableAmount.individualNumber[
					item.numberPlayed.toString()
					] !== undefined
				) {
					if (
						parseInt(
							availableAmount.individualNumber[
							item.numberPlayed.toString()
							]
						) < parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
				} else {
					if (
						item.numberPlayed.toString().length === 2 &&
						availableAmount.twoDigit[
						item.numberPlayed.toString()
						] !== undefined &&
						parseInt(
							availableAmount.twoDigit[
							item.numberPlayed.toString()
							]
						) < parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					} else if (
						item.numberPlayed.toString().length === 3 &&
						availableAmount.threeDigit[
						item.numberPlayed.toString()
						] !== undefined &&
						parseInt(
							availableAmount.threeDigit[
							item.numberPlayed.toString()
							]
						) < parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					} else if (
						item.numberPlayed.toString().length === 4 &&
						availableAmount.fourDigit[
						item.numberPlayed.toString()
						] !== undefined &&
						parseInt(
							availableAmount.fourDigit[
							item.numberPlayed.toString()
							]
						) < parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					} else if (
						hasMarriageNumbers &&
						item.numberPlayed.toString().length === 5 &&
						availableAmount.marriageNumber[
						item.numberPlayed.toString()
						] !== undefined &&
						parseInt(
							availableAmount.marriageNumber[
							item.numberPlayed.toString()
							]
						) < parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
				}

				body.totalAmountPlayed += parseInt(item.amountPlayed);
				return {
					numberPlayed: item.numberPlayed,
					amountPlayed: item.amountPlayed,
				};
			});

			if (balanceToCheck >= body.totalAmountPlayed) {
				const borletteTicket = await BorletteTicket.create(body);
				if (borletteTicket._id) {
					await makeTransaction(
						user._id,
						user.role,
						'TICKET_BORLETTE',
						body.totalAmountPlayed,
						null,
						null,
						borletteTicket._id,
						cashType // Pass cash type to transaction function
					);
					return {
						status: 200,
						entity: {
							success: true,
							borletteTicket: {
								...borletteTicket.toObject(),
								lottery: lottery,
							},
						},
					};
				}
			} else {
				return {
					status: 500,
					entity: {
						success: false,
						error: `Insufficient ${cashType.toLowerCase()} balance.`,
					},
				};
			}
		} else {
			return {
				status: 500,
				entity: {
					success: false,
					error: lottery._id
						? 'Lottery is closed.'
						: 'Invalid lottery ID.',
				},
			};
		}
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

export const createMultiState = async (body, user) => {
	try {
		const { cashType = 'VIRTUAL', purchases } = body;

		// Validate input structure
		if (!purchases || !Array.isArray(purchases) || purchases.length === 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Purchases array is required and must not be empty',
				},
			};
		}

		// Validate cash type
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid cash type. Must be REAL or VIRTUAL',
				},
			};
		}

		// Validate each purchase has required fields
		for (let i = 0; i < purchases.length; i++) {
			const purchase = purchases[i];
			if (
				!purchase.lotteryId ||
				!purchase.numbers ||
				!Array.isArray(purchase.numbers) ||
				purchase.numbers.length === 0
			) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Purchase at index ${i} is missing required fields (lotteryId, numbers)`,
					},
				};
			}
		}

		// Get user wallet
		const walletData = await Wallet.findOne({ user: user._id });
		if (!walletData) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		const balanceToCheck =
			cashType === 'REAL'
				? walletData.realBalance
				: walletData.virtualBalance;

		// Extract unique lottery IDs
		const lotteryIds = [...new Set(purchases.map(p => p.lotteryId))];

		// Fetch all lotteries and validate they exist
		const lotteries = await Lottery.find({
			_id: { $in: lotteryIds },
		}).populate('state', 'name code');

		if (lotteries.length !== lotteryIds.length) {
			const foundIds = lotteries.map(l => l._id.toString());
			const missingIds = lotteryIds.filter(id => !foundIds.includes(id));
			return {
				status: 400,
				entity: {
					success: false,
					error: 'One or more lottery IDs are invalid',
					missingLotteryIds: missingIds,
				},
			};
		}

		// Check all lotteries are active (scheduled time is in the future)
		const now = moment.now();
		const inactiveLotteries = lotteries.filter(
			lottery => lottery.scheduledTime <= now
		);

		if (inactiveLotteries.length > 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'One or more lotteries are no longer active for ticket purchases',
					inactiveLotteries: inactiveLotteries.map(l => ({
						id: l._id,
						title: l.title,
						state: l.state.name,
						scheduledTime: l.scheduledTime,
					})),
				},
			};
		}

		// Create lottery lookup map
		const lotteryMap = {};
		lotteries.forEach(lottery => {
			lotteryMap[lottery._id.toString()] = lottery;
		});

		// Process each purchase and validate restrictions
		let totalAmount = 0;
		const processedPurchases = [];

		for (let i = 0; i < purchases.length; i++) {
			const purchase = purchases[i];
			const lottery = lotteryMap[purchase.lotteryId];

			try {
				const hasMarriageNumbers = lottery.additionalData?.hasMarriageNumbers !== false;

				if (!hasMarriageNumbers) {
					const hasMarriageNumberInTicket = purchase.numbers.some(item => {
						const numberStr = item.numberPlayed.toString();
						return numberStr.includes('x');
					});

					if (hasMarriageNumberInTicket) {
						throw new Error(
							`Marriage numbers are not allowed for ${lottery.title} (${lottery.state.name})`
						);
					}
				}

				// Check restrictions for this lottery
				const availableAmount = await getAvailableAmount(
					purchase.lotteryId,
					purchase.numbers.map(item => item.numberPlayed),
					hasMarriageNumbers
				);

				let purchaseAmount = 0;
				const processedNumbers = [];

				for (const item of purchase.numbers) {
					// Validate number and amount
					if (
						!item.numberPlayed ||
						!item.amountPlayed ||
						item.amountPlayed <= 0
					) {
						throw new Error(
							`Invalid number or amount in purchase ${i}`
						);
					}

					const numberStr = item.numberPlayed.toString();
					const amountPlayed = parseInt(item.amountPlayed);

					// Check individual number restrictions first
					if (
						availableAmount.individualNumber[numberStr] !==
						undefined
					) {
						if (
							availableAmount.individualNumber[numberStr] <
							amountPlayed
						) {
							throw new Error(
								`${numberStr} cannot be played with amount ${amountPlayed} in ${lottery.title} (${lottery.state.name}). Available limit: ${availableAmount.individualNumber[numberStr]}`
							);
						}
					} else {
						// Check digit-based restrictions
						const numberLength = numberStr.length;

						if (
							numberLength === 2 &&
							availableAmount.twoDigit[numberStr] !== undefined
						) {
							if (
								availableAmount.twoDigit[numberStr] <
								amountPlayed
							) {
								throw new Error(
									`${numberStr} cannot be played with amount ${amountPlayed} in ${lottery.title} (${lottery.state.name}). Available limit: ${availableAmount.twoDigit[numberStr]}`
								);
							}
						} else if (
							numberLength === 3 &&
							availableAmount.threeDigit[numberStr] !== undefined
						) {
							if (
								availableAmount.threeDigit[numberStr] <
								amountPlayed
							) {
								throw new Error(
									`${numberStr} cannot be played with amount ${amountPlayed} in ${lottery.title} (${lottery.state.name}). Available limit: ${availableAmount.threeDigit[numberStr]}`
								);
							}
						} else if (
							numberLength === 4 &&
							availableAmount.fourDigit[numberStr] !== undefined
						) {
							if (
								availableAmount.fourDigit[numberStr] <
								amountPlayed
							) {
								throw new Error(
									`${numberStr} cannot be played with amount ${amountPlayed} in ${lottery.title} (${lottery.state.name}). Available limit: ${availableAmount.fourDigit[numberStr]}`
								);
							}
						} else if (
							hasMarriageNumbers &&
							numberLength === 5 &&
							availableAmount.marriageNumber[numberStr] !==
							undefined
						) {
							if (
								availableAmount.marriageNumber[numberStr] <
								amountPlayed
							) {
								throw new Error(
									`${numberStr} cannot be played with amount ${amountPlayed} in ${lottery.title} (${lottery.state.name}). Available limit: ${availableAmount.marriageNumber[numberStr]}`
								);
							}
						}
					}

					purchaseAmount += amountPlayed;
					processedNumbers.push({
						numberPlayed: item.numberPlayed,
						amountPlayed: amountPlayed,
					});
				}

				processedPurchases.push({
					lottery,
					numbers: processedNumbers,
					totalAmountPlayed: purchaseAmount,
				});

				totalAmount += purchaseAmount;
			} catch (error) {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Error in purchase ${i}: ${error.message}`,
						purchaseIndex: i,
					},
				};
			}
		}

		// Check if user has sufficient balance for all purchases
		if (balanceToCheck < totalAmount) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Insufficient ${cashType.toLowerCase()} balance. Required: ${totalAmount}, Available: ${balanceToCheck}`,
					totalRequired: totalAmount,
					availableBalance: balanceToCheck,
				},
			};
		}

		// Create all tickets and process transactions
		const createdTickets = [];
		const purchaseTime = moment.now();

		try {
			for (const processedPurchase of processedPurchases) {
				const ticketData = {
					user: user._id,
					purchasedBy: user.role,
					lottery: processedPurchase.lottery._id,
					purchasedOn: purchaseTime,
					totalAmountPlayed: processedPurchase.totalAmountPlayed,
					cashType,
					numbers: processedPurchase.numbers,
				};

				const borletteTicket = await BorletteTicket.create(ticketData);

				// Process transaction for this ticket
				await makeTransaction(
					user._id,
					user.role,
					'TICKET_BORLETTE',
					processedPurchase.totalAmountPlayed,
					null,
					null,
					borletteTicket._id,
					cashType
				);

				createdTickets.push({
					...borletteTicket.toObject(),
					lottery: processedPurchase.lottery,
				});
			}

			return {
				status: 200,
				entity: {
					success: true,
					tickets: createdTickets,
					summary: {
						totalAmount,
						purchaseCount: createdTickets.length,
						statesInvolved: [
							...new Set(
								createdTickets.map(t => t.lottery.state.name)
							),
						],
						cashType,
						purchaseTime,
					},
				},
			};
		} catch (error) {
			// If any ticket creation fails, we should ideally rollback previous tickets
			// For now, we'll return an error - in production you might want to implement proper transaction rollback
			console.error('Error creating tickets:', error);
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Failed to create one or more tickets. Some tickets may have been created.',
					createdTicketsCount: createdTickets.length,
				},
			};
		}
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					error.message || 'Failed to process multi-state purchase',
			},
		};
	}
};

export const cancelTicket = async ({ id }, user) => {
	try {
		const criteria = {
			_id: id,
		};
		if (user.role !== 'ADMIN') {
			criteria.user = user._id;
		}
		const borletteTicket = await BorletteTicket.findById(criteria)
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.populate('user');

		if (!borletteTicket._id) {
			throw new Error('Ticket ID is invalid.');
		}
		if (!borletteTicket.status === 'CANCELLED') {
			throw new Error('This ticket has already been cancelled.');
		}
		if (!borletteTicket.status === 'COMPLETED') {
			throw new Error(
				'This result for this ticket has already been rolled out.'
			);
		}
		if (
			moment(borletteTicket.lottery.scheduledTime)
				.subtract(2, 'minute')
				.isBefore(moment())
		) {
			throw new Error('The ticket can not be cancelled now.');
		}
		if (borletteTicket._id) {
			await Object.assign(borletteTicket, {
				status: 'CANCELLED',
			}).save();

			await makeTransaction(
				borletteTicket.user._id,
				borletteTicket.user.role,
				'TICKET_BORLETTE_CANCELLED',
				borletteTicket.totalAmountPlayed,
				null,
				null,
				borletteTicket._id
			);
			return {
				status: 200,
				entity: {
					success: true,
				},
			};
		}
	} catch (error) {
		console.log('error', error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const cashoutTicket = async ({ id }, user) => {
	try {
		if (!['ADMIN', 'DEALER'].includes(user.role)) {
			throw new Error('You are not authorized to cashout ticket.');
		}
		const borletteTicket = await BorletteTicket.findById(id)
			.populate('user')
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			});

		if (!borletteTicket._id) {
			throw new Error('This ticket does not exist.');
		}
		if (borletteTicket.user.role !== 'AGENT') {
			throw new Error('You are not authorized to cashout this ticket.');
		}
		if (borletteTicket.isAmountDisbursed) {
			throw new Error('This ticket has already been claimed.');
		}
		const totalAmountWon = borletteTicket.totalAmountWon;
		const amountTransferred = await makeTransaction(
			user._id,
			user.role,
			'WON_BORLETTE',
			totalAmountWon
		);
		await Object.assign(borletteTicket, {
			isAmountDisbursed: true,
		}).save();

		return {
			status: 200,
			entity: {
				success: true,
				amountTransferred: amountTransferred,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const commissionSummary = async ({ id }, user) => {
	try {
		if (!['ADMIN'].includes(user.role)) {
			throw new Error('You are not authorized to view commission data.');
		}

		const lottery = await Lottery.findById(id).populate(
			'state',
			'name code'
		);
		if (!lottery) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Lottery not found',
				},
			};
		}

		const summary = await BorletteTicket.aggregate([
			{
				$match: {
					lottery: id,
					status: {
						$ne: 'CANCELLED',
					},
				},
			},
			{
				$group: {
					_id: '$user',
					sales: {
						$sum: '$totalAmountPlayed',
					},
					rewards: {
						$sum: '$totalAmountWon',
					},
				},
			},
		]);
		const summaryPopulated = await User.populate(summary, {
			path: '_id',
			select: 'name role',
		});
		const data = summaryPopulated
			.filter(item => item._id.role === 'AGENT')
			.map(item => ({
				...item,
				sales: parseFloat(item.sales),
				rewards: parseFloat(item.rewards),
				commission: parseFloat(
					config.ticketBorletteComissionAgent * item.sales
				),
			}));
		return {
			status: 200,
			entity: {
				success: true,
				data: data,
				lottery: lottery,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const remove = async ({ id }) => {
	try {
		const borletteTicket = await BorletteTicket.findById(id);
		if (borletteTicket._id) {
			const removed = await borletteTicket.remove();
			if (removed) {
				return {
					status: 200,
					entity: {
						success: true,
					},
				};
			}
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid parameters.',
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

const getAvailableAmount = async (lotteryId, numberPlayed, hasMarriageNumbers = true) => {
	const tickets = await BorletteTicket.find({
		lottery: lotteryId,
		status: 'ACTIVE',
	});
	const lotteryRestriction = await LotteryRestriction.findOne({
		lottery: lotteryId,
	});

	let individualNumberPlayedAmount = {};

	let availableAmount = {
		twoDigit: {},
		threeDigit: {},
		fourDigit: {},
		marriageNumber: {},
		individualNumber: {},
	};

	numberPlayed.map(number => {
		if (number.toString().length === 2) {
			availableAmount.twoDigit[number.toString()] = parseInt(
				lotteryRestriction.twoDigit
			);
		}
		if (number.toString().length === 3) {
			availableAmount.threeDigit[number.toString()] = parseInt(
				lotteryRestriction.threeDigit
			);
		}
		if (number.toString().length === 4) {
			availableAmount.fourDigit[number.toString()] = parseInt(
				lotteryRestriction.fourDigit
			);
		}
		// Only process marriage numbers if they are allowed
		if (hasMarriageNumbers && number.toString().length === 5) {
			availableAmount.marriageNumber[number.toString()] = parseInt(
				lotteryRestriction.marriageNumber
			);
		}
	});

	tickets.map(ticket => {
		ticket.numbers.map(ticketNumber => {
			if (
				ticketNumber.numberPlayed.toString().length === 2 &&
				lotteryRestriction.twoDigit !== null
			) {
				if (
					availableAmount.twoDigit[
					ticketNumber.numberPlayed.toString()
					] === undefined
				) {
					availableAmount.twoDigit[
						ticketNumber.numberPlayed.toString()
					] = parseInt(lotteryRestriction.twoDigit);
				}
				availableAmount.twoDigit[
					ticketNumber.numberPlayed.toString()
				] -= parseInt(ticketNumber.amountPlayed);
			}

			if (
				ticketNumber.numberPlayed.toString().length === 3 &&
				lotteryRestriction.threeDigit !== null
			) {
				if (
					availableAmount.threeDigit[
					ticketNumber.numberPlayed.toString()
					] === undefined
				) {
					availableAmount.threeDigit[
						ticketNumber.numberPlayed.toString()
					] = parseInt(lotteryRestriction.threeDigit);
				}
				availableAmount.threeDigit[
					ticketNumber.numberPlayed.toString()
				] -= parseInt(ticketNumber.amountPlayed);
			}

			if (
				ticketNumber.numberPlayed.toString().length === 4 &&
				lotteryRestriction.fourDigit !== null
			) {
				if (
					availableAmount.fourDigit[
					ticketNumber.numberPlayed.toString()
					] === undefined
				) {
					availableAmount.fourDigit[
						ticketNumber.numberPlayed.toString()
					] = parseInt(lotteryRestriction.fourDigit);
				}
				availableAmount.fourDigit[
					ticketNumber.numberPlayed.toString()
				] -= parseInt(ticketNumber.amountPlayed);
			}

			if (
				hasMarriageNumbers &&
				ticketNumber.numberPlayed.toString().length === 5 &&
				lotteryRestriction.marriageNumber !== null
			) {
				if (
					availableAmount.marriageNumber[
					ticketNumber.numberPlayed.toString()
					] === undefined
				) {
					availableAmount.marriageNumber[
						ticketNumber.numberPlayed.toString()
					] = parseInt(lotteryRestriction.marriageNumber);
				}
				availableAmount.marriageNumber[
					ticketNumber.numberPlayed.toString()
				] -= parseInt(ticketNumber.amountPlayed);
			}

			if (
				individualNumberPlayedAmount[ticketNumber.numberPlayed] ===
				undefined
			) {
				individualNumberPlayedAmount[
					ticketNumber.numberPlayed.toString()
				] = 0;
			}
			individualNumberPlayedAmount[ticketNumber.numberPlayed] += parseInt(
				ticketNumber.amountPlayed
			);
		});
	});

	lotteryRestriction.individualNumber.map(individualNumber => {
		availableAmount.individualNumber[individualNumber.number.toString()] =
			parseInt(individualNumber.limit) -
			parseInt(
				individualNumberPlayedAmount[
				individualNumber.number.toString()
				] || 0
			);
	});
	console.log('lotteryRestriction => ', lotteryRestriction);
	console.log(
		'individualNumberPlayedAmount => ',
		individualNumberPlayedAmount
	);
	console.log('availableAmount => ', availableAmount);
	return availableAmount;
};