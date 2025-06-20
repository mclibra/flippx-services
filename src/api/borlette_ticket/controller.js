import moment from 'moment';
import { makeTransaction } from '../transaction/controller';
import { Wallet } from '../wallet/model';
import { Lottery, LotteryRestriction } from '../lottery/model';
import { BorletteTicket } from './model';
import { LoyaltyService } from '../loyalty/service';

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
			.populate({
				path: 'lottery',
				populate: {
					path: 'state',
					select: 'name code',
				},
			})
			.populate('user')
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.exec();
		const total = await BorletteTicket.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				borletteTickets,
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

const getAvailableAmount = async (lotteryId, numbers, hasMarriageNumbers) => {
	try {
		const restrictions = await LotteryRestriction.find({
			lottery: lotteryId,
		});

		let individualNumber = {};
		let twoDigit = {};
		let threeDigit = {};
		let fourDigit = {};
		let marriageNumber = {};

		restrictions.forEach(restriction => {
			switch (restriction.type) {
				case 'INDIVIDUAL_NUMBER':
					restriction.numbers.forEach(numRestriction => {
						individualNumber[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'TWO_DIGIT':
					restriction.numbers.forEach(numRestriction => {
						twoDigit[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'THREE_DIGIT':
					restriction.numbers.forEach(numRestriction => {
						threeDigit[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'FOUR_DIGIT':
					restriction.numbers.forEach(numRestriction => {
						fourDigit[numRestriction.number] =
							numRestriction.availableAmount;
					});
					break;
				case 'MARRIAGE_NUMBER':
					if (hasMarriageNumbers) {
						restriction.numbers.forEach(numRestriction => {
							marriageNumber[numRestriction.number] =
								numRestriction.availableAmount;
						});
					}
					break;
			}
		});

		return {
			individualNumber,
			twoDigit,
			threeDigit,
			fourDigit,
			marriageNumber,
		};
	} catch (error) {
		console.error('Error getting available amounts:', error);
		throw error;
	}
};

export const placeBet = async ({ id }, body, user) => {
	try {
		const { cashType = 'VIRTUAL' } = body;

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

		const walletData = await Wallet.findOne({
			user: user._id,
		});

		if (!walletData) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		// Get the appropriate balance based on cash type
		const balanceToCheck =
			cashType === 'REAL'
				? walletData.realBalance
				: walletData.virtualBalance;

		const lottery = await Lottery.findById(id).populate('state');

		if (lottery._id && lottery.scheduledTime > moment.now()) {
			body.user = user._id;
			body.purchasedBy = user.role;
			body.lottery = id;
			body.purchasedOn = moment.now();
			body.cashType = cashType;

			// Check if marriage numbers are allowed
			const hasMarriageNumbers = lottery.additionalData?.hasMarriageNumbers !== false;

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
							error: `Marriage numbers are not allowed for ${lottery.title} (${lottery.state.name})`,
						},
					};
				}
			}

			// Get restrictions for this lottery
			const availableAmount = await getAvailableAmount(
				id,
				body.numbers.map(item => item.numberPlayed),
				hasMarriageNumbers
			);

			body.numbers = body.numbers.map(item => {
				// Check restrictions first
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
					const numberStr = item.numberPlayed.toString();
					const numberLength = numberStr.length;

					if (
						numberLength === 2 &&
						availableAmount.twoDigit[numberStr] !== undefined &&
						parseInt(availableAmount.twoDigit[numberStr]) <
						parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
					if (
						numberLength === 3 &&
						availableAmount.threeDigit[numberStr] !== undefined &&
						parseInt(availableAmount.threeDigit[numberStr]) <
						parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
					if (
						numberLength === 4 &&
						availableAmount.fourDigit[numberStr] !== undefined &&
						parseInt(availableAmount.fourDigit[numberStr]) <
						parseInt(item.amountPlayed)
					) {
						throw new Error(
							`${item.numberPlayed} cannot be played.`
						);
					}
					if (
						hasMarriageNumbers &&
						numberLength === 5 &&
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
					// Process transaction
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

					// **NEW: Record play activity for loyalty tracking**
					try {
						const loyaltyResult = await LoyaltyService.recordUserPlayActivity(user._id);
						if (!loyaltyResult.success) {
							console.warn(`Failed to record play activity for user ${user._id}:`, loyaltyResult.error);
						} else {
							console.log(`Play activity recorded for user ${user._id} - Borlette ticket purchase`);
						}
					} catch (loyaltyError) {
						console.error(`Error recording play activity for user ${user._id}:`, loyaltyError);
						// Don't fail ticket creation if loyalty tracking fails
					}

					// **NEW: Award XP for ticket purchase**
					try {
						// Calculate XP based on amount played (1 XP per $5 played, minimum 5 XP)
						const baseXP = Math.max(5, Math.floor(body.totalAmountPlayed / 5));
						const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
						const totalXP = baseXP * cashTypeMultiplier;

						const xpResult = await LoyaltyService.awardUserXP(
							user._id,
							totalXP,
							'GAME_ACTIVITY',
							`Borlette ticket purchase - Amount: $${body.totalAmountPlayed} (${cashType})`,
							{
								gameType: 'BORLETTE',
								ticketId: borletteTicket._id,
								amountPlayed: body.totalAmountPlayed,
								cashType,
								baseXP,
								multiplier: cashTypeMultiplier
							}
						);

						if (!xpResult.success) {
							console.warn(`Failed to award XP for user ${user._id}:`, xpResult.error);
						} else {
							console.log(`Awarded ${totalXP} XP to user ${user._id} for Borlette ticket purchase`);
						}
					} catch (xpError) {
						console.error(`Error awarding XP for user ${user._id}:`, xpError);
						// Don't fail ticket creation if XP awarding fails
					}

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

export const create = async (body, user) => {
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

				totalAmount += purchaseAmount;

				processedPurchases.push({
					lottery,
					numbers: processedNumbers,
					totalAmountPlayed: purchaseAmount,
				});
			} catch (error) {
				return {
					status: 400,
					entity: {
						success: false,
						error: error.message,
						failedPurchaseIndex: i,
						lottery: lottery.title,
						state: lottery.state.name,
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

			// **NEW: Record play activity for loyalty tracking (once per multi-state purchase)**
			try {
				const loyaltyResult = await LoyaltyService.recordUserPlayActivity(user._id);
				if (!loyaltyResult.success) {
					console.warn(`Failed to record play activity for user ${user._id}:`, loyaltyResult.error);
				} else {
					console.log(`Play activity recorded for user ${user._id} - Multi-state Borlette purchase`);
				}
			} catch (loyaltyError) {
				console.error(`Error recording play activity for user ${user._id}:`, loyaltyError);
			}

			// **NEW: Award XP for multi-state purchase**
			try {
				// Calculate XP based on total amount played across all states
				const baseXP = Math.max(10, Math.floor(totalAmount / 5)); // Higher minimum for multi-state
				const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1;
				const multiStateMultiplier = Math.min(2, 1 + (createdTickets.length - 1) * 0.2); // Bonus for multiple states
				const totalXP = Math.floor(baseXP * cashTypeMultiplier * multiStateMultiplier);

				const xpResult = await LoyaltyService.awardUserXP(
					user._id,
					totalXP,
					'GAME_ACTIVITY',
					`Multi-state Borlette purchase - ${createdTickets.length} states, Total: $${totalAmount} (${cashType})`,
					{
						gameType: 'BORLETTE',
						isMultiState: true,
						stateCount: createdTickets.length,
						totalAmount,
						cashType,
						baseXP,
						multiplier: cashTypeMultiplier * multiStateMultiplier
					}
				);

				if (!xpResult.success) {
					console.warn(`Failed to award XP for user ${user._id}:`, xpResult.error);
				} else {
					console.log(`Awarded ${totalXP} XP to user ${user._id} for multi-state Borlette purchase`);
				}
			} catch (xpError) {
				console.error(`Error awarding XP for user ${user._id}:`, xpError);
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

		// **NEW: Award XP for winning**
		try {
			// Calculate XP based on amount won
			const baseXP = Math.max(20, Math.floor(totalAmountWon / 10)); // Higher XP for wins
			const cashTypeMultiplier = borletteTicket.cashType === 'REAL' ? 2 : 1;
			const winMultiplier = 1.5; // Bonus for winning
			const totalXP = Math.floor(baseXP * cashTypeMultiplier * winMultiplier);

			const xpResult = await LoyaltyService.awardUserXP(
				borletteTicket.user._id,
				totalXP,
				'GAME_REWARD',
				`Borlette win - Amount: $${totalAmountWon} (${borletteTicket.cashType})`,
				{
					gameType: 'BORLETTE',
					ticketId: borletteTicket._id,
					amountWon: totalAmountWon,
					cashType: borletteTicket.cashType,
					baseXP,
					multiplier: cashTypeMultiplier * winMultiplier,
					isWin: true
				}
			);

			if (!xpResult.success) {
				console.warn(`Failed to award win XP for user ${borletteTicket.user._id}:`, xpResult.error);
			} else {
				console.log(`Awarded ${totalXP} XP to user ${borletteTicket.user._id} for Borlette win`);
			}
		} catch (xpError) {
			console.error(`Error awarding win XP for user ${borletteTicket.user._id}:`, xpError);
		}

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
		const borletteTickets = await BorletteTicket.find({
			user: id,
		}).populate('user');
		return {
			status: 200,
			entity: {
				success: true,
				borletteTickets,
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

export const update = async ({ id }, body) => {
	try {
		const borletteTicket = await BorletteTicket.findById(id);
		if (borletteTicket._id) {
			const updateResponse = await Object.assign(
				borletteTicket,
				body
			).save();
			if (updateResponse._id) {
				return {
					status: 200,
					entity: {
						success: true,
						borletteTicket: updateResponse,
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
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
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