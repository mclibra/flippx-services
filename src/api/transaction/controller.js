import moment from 'moment';
import { BorletteTicket } from '../borlette_ticket/model';
import { MegaMillionTicket } from '../megamillion_ticket/model';
import { generateRandomDigits } from '../../services/helper/utils';
import { jwtSign } from '../../services/jwt/';
import { getAdminUserId } from '../user/controller';
import { sendMessage } from '../text/controller';
import { Transaction } from './model';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';

import { otpExpiresIn, transactionText } from '../../../config';

const tokenReference = {};

const config = {
	depositCommissionAgent: 0.01,
	depositCommissionAdmin: 0.02,
	userTransferComissionAdmin: 0.03,
	ticketBorletteComissionAgent: 0.15,
	ticketMegamillionComissionAgent: 0.015,
	withdrawCommissionAgent: 0.01,
	withdrawCommissionAdmin: 0.02,
	dominoComissionAgent: 0.02, // 2% commission for agents on domino games
	dominoSystemCommission: 0.04, // 4% system commission on domino winnings
	dominoAgentWinCommission: 0.015, // 1.5% agent commission on domino winnings
};

export const transactionSummary = async (
	{ _id, role },
	{ userId, startDate, endDate }
) => {
	try {
		let params = {
			user: _id.toString(),
		};
		if (role === 'ADMIN' && userId) {
			params.user = userId.toString();
		}
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
		const transactions = await Transaction.aggregate([
			{
				$match: params,
			},
			{
				$group: {
					_id: {
						transactionType: '$transactionType',
						transactionIdentifier: '$transactionIdentifier',
					},
					transactionAmount: {
						$sum: '$transactionAmount',
					},
				},
			},
		]);
		return {
			status: 200,
			entity: {
				success: true,
				transactions: transactions.map(transaction => ({
					...transaction,
					transactionAmount: parseFloat(
						transaction.transactionAmount
					).toFixed(2),
				})),
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

export const selfTransaction = async (
	{ _id },
	{ startDate, endData, limit, offset }
) => {
	try {
		let criteria = {
			user: _id,
		};
		if (startDate) {
			criteria.createdAt = {
				$gte: moment(startDate).toISOString(),
			};
		}
		if (endData) {
			criteria.createdAt = {
				$lte: moment(endData).toISOString(),
			};
		}
		const transactions = await Transaction.find(criteria)
			.limit(limit ? parseInt(limit) : 50)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				createdAt: 'desc',
			})
			.lean();
		const transactionList = await Promise.all(
			transactions.map(async transaction => {
				let item = {
					...transaction,
				};
				switch (item.referenceType) {
					case 'USER': {
						let user = await User.findById(
							item.referenceIndex,
							'name phone'
						);
						item.referenceUser = user;
						break;
					}
					case 'AGENT': {
						let user = await User.findById(
							item.referenceIndex,
							'name phone'
						);
						item.referenceUser = user;
						break;
					}
				}
				return item;
			})
		);
		return {
			status: 200,
			entity: {
				success: true,
				transactions: transactionList,
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

export const list = async (
	{ _id, role },
	{
		userId,
		offset,
		key,
		limit,
		startDate,
		status,
		endDate,
		transactionType,
		sortBy = 'createdAt',
		sortOrder = 'desc',
	}
) => {
	try {
		console.log('_id.toString() => ', _id.toString());
		console.log('role => ', role);
		let params = {};
		if (userId) {
			params.user = userId;
		}
		if (role !== 'ADMIN') {
			params.user = _id.toString();
		}
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
		if (transactionType) {
			params.transactionType = transactionType.toUpperCase();
		}
		if (status) {
			params.status = status.toUpperCase();
		}
		// if(key){
		// 	params['$or'] = [{
		// 		'transactionIdentifier': new RegExp(key, "i")
		// 	}]
		// }
		if (key) {
			params.transactionIdentifier = key;
		}
		console.log('params => ', params);
		const transactions = await Transaction.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.populate('user', 'name phone')
			.sort({
				[sortBy]: sortOrder.toLowerCase(),
			})
			.lean();
		const transactionList = await Promise.all(
			transactions.map(async transaction => {
				let item = {
					...transaction,
				};
				switch (item.referenceType) {
					case 'USER': {
						let user = await User.findById(
							item.referenceIndex,
							'name phone'
						);
						item.referenceUser = user;
						break;
					}
					case 'AGENT': {
						let user = await User.findById(
							item.referenceIndex,
							'name phone'
						);
						item.referenceUser = user;
						break;
					}
				}
				if (item.transactionIdentifier === 'TRANSFER_COMMISION') {
					let transferFrom = await User.findById(
						item.transactionData.transferFrom,
						'name phone'
					);
					let transferTo = await User.findById(
						item.transactionData.transferTo,
						'name phone'
					);
					item.transactionData = {
						transferFrom,
						transferTo,
					};
				}
				return item;
			})
		);
		const total = await Transaction.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				transactions: transactionList,
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

/**
 * Make a transaction with dual cash type support
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 * @param {string} transactionIdentifier - Transaction type identifier
 * @param {number} transactionAmount - Amount of transaction
 * @param {string} referenceType - Reference type (optional)
 * @param {string} referenceIndex - Reference index (optional)
 * @param {string} ticketId - Ticket ID (optional)
 * @param {string} cashType - 'REAL' or 'VIRTUAL'
 * @returns {Promise<number>} Amount transferred
 */
export const makeTransaction = async (
	userId,
	userRole,
	transactionIdentifier,
	transactionAmount,
	referenceType = null,
	referenceIndex = null,
	ticketId = null,
	cashType = 'VIRTUAL' // Default to VIRTUAL for backward compatibility
) => {
	try {
		// Get user's wallet
		let walletData = await Wallet.findOne({
			user: userId,
		});

		if (!walletData) {
			throw new Error(`Wallet not found for user ${userId}`);
		}

		// Get system account (replacing ADMIN)
		const systemAccount = await User.findOne({ role: 'SYSTEM' });
		if (!systemAccount && transactionIdentifier !== 'WIRE_TRANSFER') {
			throw new Error('System account not found');
		}

		// Initialize return amount
		let returnAmount = 0;

		// Get the balance field to update based on cash type
		const balanceField =
			cashType === 'REAL' ? 'realBalance' : 'virtualBalance';
		const previousBalance = walletData[balanceField];

		// Parse transactionAmount to ensure it's a number
		transactionAmount = parseFloat(transactionAmount);

		// Process transaction based on identifier
		switch (transactionIdentifier) {
			// PROMOTIONAL_CREDIT for new user registration
			case 'PROMOTIONAL_CREDIT': {
				// Credit promotional balance to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionType: 'CREDIT',
					transactionIdentifier: 'PROMOTIONAL_CREDIT',
					transactionAmount: transactionAmount.toFixed(2),
					previousBalance,
					newBalance: (previousBalance + transactionAmount).toFixed(
						2
					),
					status: 'COMPLETED',
				});

				// Debit from system account if tracking is needed
				if (systemAccount) {
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionType: 'DEBIT',
						transactionIdentifier: 'PROMOTIONAL_CREDIT',
						transactionAmount: transactionAmount.toFixed(2),
						previousBalance: 0, // System account balance can go negative
						newBalance: 0, // System account balance isn't tracked traditionally
						referenceType: 'USER',
						referenceIndex: userId,
						status: 'COMPLETED',
					});
				}

				// Update wallet balance
				walletData[balanceField] = previousBalance + transactionAmount;
				returnAmount = transactionAmount;
				break;
			}

			// REFER_BONUS for referral program
			case 'REFER_BONUS': {
				// Credit referral bonus to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionType: 'CREDIT',
					transactionIdentifier: 'REFER_BONUS',
					transactionAmount: transactionAmount.toFixed(2),
					previousBalance,
					newBalance: (previousBalance + transactionAmount).toFixed(
						2
					),
					referenceType,
					referenceIndex,
					status: 'COMPLETED',
				});

				// Debit from system account
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionType: 'DEBIT',
					transactionIdentifier: 'REFER_BONUS',
					transactionAmount: transactionAmount.toFixed(2),
					previousBalance: 0,
					newBalance: 0,
					referenceType: 'USER',
					referenceIndex: userId,
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance + transactionAmount;
				returnAmount = transactionAmount;
				break;
			}

			// JOINING_BONUS for new user bonus
			case 'JOINING_BONUS': {
				// Credit joining bonus to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionType: 'CREDIT',
					transactionIdentifier: 'JOINING_BONUS',
					transactionAmount: transactionAmount.toFixed(2),
					previousBalance,
					newBalance: (previousBalance + transactionAmount).toFixed(
						2
					),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					status: 'COMPLETED',
				});

				// Debit from system account
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionType: 'DEBIT',
					transactionIdentifier: 'JOINING_BONUS',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance + transactionAmount;
				returnAmount = transactionAmount;
				break;
			}

			// WIRE_TRANSFER for adding funds directly
			case 'WIRE_TRANSFER': {
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'WIRE_TRANSFER',
					transactionType: 'CREDIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType,
					referenceIndex,
					previousBalance,
					newBalance: (previousBalance + transactionAmount).toFixed(
						2
					),
					status: 'COMPLETED',
				});

				walletData[balanceField] += transactionAmount;
				returnAmount = transactionAmount;
				break;
			}

			// DEPOSIT for agent/dealer deposits to users
			case 'DEPOSIT': {
				const receiverWalletData = await Wallet.findOne({
					user: referenceIndex,
				});

				if (!receiverWalletData) {
					throw new Error('The specified user does not exist.');
				}

				// Determine which balances to use
				const receiverBalanceField =
					cashType === 'REAL' ? 'realBalance' : 'virtualBalance';
				const receiverPreviousBalance =
					receiverWalletData[receiverBalanceField];

				if (transactionAmount > walletData[balanceField]) {
					throw new Error(
						`Insufficient ${cashType.toLowerCase()} funds to proceed.`
					);
				}

				if (userRole === 'ADMIN') {
					// Direct admin deposit without commission
					await Transaction.create({
						user: referenceIndex,
						cashType,
						transactionIdentifier: 'DEPOSIT',
						transactionType: 'CREDIT',
						transactionAmount: transactionAmount.toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: receiverPreviousBalance,
						newBalance: (
							receiverPreviousBalance + transactionAmount
						).toFixed(2),
						status: 'COMPLETED',
					});

					receiverWalletData[receiverBalanceField] =
						receiverPreviousBalance + transactionAmount;
					await receiverWalletData.save();
					returnAmount = transactionAmount;
				} else if (userRole === 'AGENT' || userRole === 'DEALER') {
					// Agent/Dealer deposit with commission
					const adminCommision =
						cashType === 'REAL'
							? parseFloat(
								config.depositCommissionAdmin *
								transactionAmount
							).toFixed(2)
							: 0;

					const agentCommision =
						cashType === 'REAL'
							? parseFloat(
								config.depositCommissionAgent *
								transactionAmount
							).toFixed(2)
							: 0;

					const amountAfterCommission =
						cashType === 'REAL'
							? parseFloat(
								transactionAmount -
								(parseFloat(agentCommision) +
									parseFloat(adminCommision))
							).toFixed(2)
							: transactionAmount;

					// Credit to receiver
					await Transaction.create({
						user: referenceIndex,
						cashType,
						transactionIdentifier: 'DEPOSIT',
						transactionType: 'CREDIT',
						transactionAmount: parseFloat(
							amountAfterCommission
						).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: receiverPreviousBalance,
						newBalance: (
							receiverPreviousBalance +
							parseFloat(amountAfterCommission)
						).toFixed(2),
						status: 'COMPLETED',
					});

					// Debit from depositor
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'DEPOSIT',
						transactionType: 'DEBIT',
						transactionAmount: transactionAmount.toFixed(2),
						referenceType,
						referenceIndex,
						previousBalance,
						newBalance: (
							previousBalance - transactionAmount
						).toFixed(2),
						status: 'COMPLETED',
					});

					// Update balances
					receiverWalletData[receiverBalanceField] =
						receiverPreviousBalance +
						parseFloat(amountAfterCommission);
					walletData[balanceField] =
						previousBalance - transactionAmount;

					await receiverWalletData.save();

					// If real cash, handle commissions
					if (cashType === 'REAL' && parseFloat(agentCommision) > 0) {
						// Agent commission
						await Transaction.create({
							user: userId,
							cashType,
							transactionIdentifier: 'DEPOSIT_COMMISSION',
							transactionType: 'CREDIT',
							transactionAmount:
								parseFloat(agentCommision).toFixed(2),
							referenceType,
							referenceIndex,
							previousBalance: walletData[balanceField],
							newBalance: (
								walletData[balanceField] +
								parseFloat(agentCommision)
							).toFixed(2),
							status: 'COMPLETED',
						});

						// System receives admin commission
						await Transaction.create({
							user: systemAccount._id,
							cashType,
							transactionIdentifier: 'DEPOSIT_COMMISSION',
							transactionType: 'CREDIT',
							transactionAmount:
								parseFloat(adminCommision).toFixed(2),
							referenceType: userRole,
							referenceIndex: userId,
							previousBalance: 0,
							newBalance: 0,
							status: 'COMPLETED',
						});

						walletData[balanceField] += parseFloat(agentCommision);
					}

					returnAmount = parseFloat(amountAfterCommission);
				}
				break;
			}

			// WITHDRAW for withdrawals by agents/dealers
			case 'WITHDRAW': {
				const receiverWalletData = await Wallet.findOne({
					user: referenceIndex,
				});

				if (!receiverWalletData) {
					throw new Error('The specified user does not exist.');
				}

				const receiverBalanceField =
					cashType === 'REAL' ? 'realBalance' : 'virtualBalance';
				const receiverPreviousBalance =
					receiverWalletData[receiverBalanceField];

				if (
					transactionAmount >=
					receiverWalletData[receiverBalanceField]
				) {
					throw new Error(
						`Insufficient ${cashType.toLowerCase()} funds to proceed.`
					);
				}

				if (userRole === 'ADMIN') {
					// Direct admin withdrawal
					await Transaction.create({
						user: referenceIndex,
						cashType,
						transactionIdentifier: 'WITHDRAW',
						transactionType: 'DEBIT',
						transactionAmount: transactionAmount.toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: receiverPreviousBalance,
						newBalance: (
							receiverPreviousBalance - transactionAmount
						).toFixed(2),
						status: 'COMPLETED',
					});

					receiverWalletData[receiverBalanceField] =
						receiverPreviousBalance - transactionAmount;
					await receiverWalletData.save();
					returnAmount = transactionAmount;
				} else if (userRole === 'AGENT' || userRole === 'DEALER') {
					// Agent/Dealer withdrawal with commission
					const adminCommision =
						cashType === 'REAL'
							? parseFloat(
								config.withdrawCommissionAdmin *
								transactionAmount
							).toFixed(2)
							: 0;

					const agentCommision =
						cashType === 'REAL'
							? parseFloat(
								config.withdrawCommissionAgent *
								transactionAmount
							).toFixed(2)
							: 0;

					const amountAfterCommission =
						cashType === 'REAL'
							? parseFloat(
								transactionAmount -
								(parseFloat(agentCommision) +
									parseFloat(adminCommision))
							).toFixed(2)
							: transactionAmount;

					// Debit from user
					await Transaction.create({
						user: referenceIndex,
						cashType,
						transactionIdentifier: 'WITHDRAW',
						transactionType: 'DEBIT',
						transactionAmount: transactionAmount.toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: receiverPreviousBalance,
						newBalance: (
							receiverPreviousBalance - transactionAmount
						).toFixed(2),
						status: 'COMPLETED',
					});

					// Credit to agent/dealer
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'WITHDRAW',
						transactionType: 'CREDIT',
						transactionAmount: parseFloat(
							amountAfterCommission
						).toFixed(2),
						referenceType,
						referenceIndex,
						previousBalance,
						newBalance: (
							previousBalance + parseFloat(amountAfterCommission)
						).toFixed(2),
						status: 'COMPLETED',
					});

					// Update balances
					receiverWalletData[receiverBalanceField] =
						receiverPreviousBalance - transactionAmount;
					walletData[balanceField] =
						previousBalance + parseFloat(amountAfterCommission);

					await receiverWalletData.save();

					// If real cash, handle commissions
					if (cashType === 'REAL') {
						if (parseFloat(agentCommision) > 0) {
							// Credit agent commission
							await Transaction.create({
								user: userId,
								cashType,
								transactionIdentifier: 'WITHDRAW_COMMISSION',
								transactionType: 'CREDIT',
								transactionAmount:
									parseFloat(agentCommision).toFixed(2),
								referenceType,
								referenceIndex,
								previousBalance: walletData[balanceField],
								newBalance: (
									walletData[balanceField] +
									parseFloat(agentCommision)
								).toFixed(2),
								status: 'COMPLETED',
							});

							walletData[balanceField] +=
								parseFloat(agentCommision);
						}

						if (parseFloat(adminCommision) > 0) {
							// Credit admin commission to system
							await Transaction.create({
								user: systemAccount._id,
								cashType,
								transactionIdentifier: 'WITHDRAW_COMMISSION',
								transactionType: 'CREDIT',
								transactionAmount:
									parseFloat(adminCommision).toFixed(2),
								referenceType,
								referenceIndex,
								previousBalance: 0,
								newBalance: 0,
								status: 'COMPLETED',
							});
						}
					}

					returnAmount = parseFloat(amountAfterCommission);
				}
				break;
			}

			// USER_TRANSFER for user-to-user transfers
			case 'USER_TRANSFER': {
				if (transactionAmount > walletData[balanceField]) {
					throw new Error(
						`Insufficient ${cashType.toLowerCase()} funds to proceed.`
					);
				}

				let referenceUserWallet = await Wallet.findOne({
					user: referenceIndex,
				});

				if (!referenceUserWallet) {
					throw new Error('Invalid reference user.');
				}

				const referenceBalanceField =
					cashType === 'REAL' ? 'realBalance' : 'virtualBalance';
				const referencePreviousBalance =
					referenceUserWallet[referenceBalanceField];

				// Calculate admin commission
				const adminCommision =
					cashType === 'REAL'
						? parseFloat(
							config.userTransferComissionAdmin *
							transactionAmount
						).toFixed(2)
						: 0;

				const amountAfterCommission =
					cashType === 'REAL'
						? parseFloat(
							transactionAmount - parseFloat(adminCommision)
						).toFixed(2)
						: transactionAmount;

				// Debit from sender
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'USER_TRANSFER',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType,
					referenceIndex,
					previousBalance,
					newBalance: (previousBalance - transactionAmount).toFixed(
						2
					),
					status: 'COMPLETED',
				});

				// Credit to receiver
				await Transaction.create({
					user: referenceIndex,
					cashType,
					transactionIdentifier: 'USER_TRANSFER',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(
						amountAfterCommission
					).toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: referencePreviousBalance,
					newBalance: (
						referencePreviousBalance +
						parseFloat(amountAfterCommission)
					).toFixed(2),
					status: 'COMPLETED',
				});

				// Update balances
				walletData[balanceField] = previousBalance - transactionAmount;
				referenceUserWallet[referenceBalanceField] =
					referencePreviousBalance +
					parseFloat(amountAfterCommission);

				// If real cash and admin commission exists, credit to system
				if (cashType === 'REAL' && parseFloat(adminCommision) > 0) {
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'TRANSFER_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount:
							parseFloat(adminCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							transferFrom: userId,
							transferTo: referenceIndex,
						},
						status: 'COMPLETED',
					});
				}

				await referenceUserWallet.save();
				returnAmount = parseFloat(amountAfterCommission);
				break;
			}

			// TICKET_BORLETTE for Borlette ticket purchases
			case 'TICKET_BORLETTE': {
				if (transactionAmount > walletData[balanceField]) {
					throw new Error(
						`Insufficient ${cashType.toLowerCase()} balance.`
					);
				}

				// Debit from user
				await Transaction.create({
					user: userId,
					cashType,
					transactionType: 'DEBIT',
					transactionIdentifier: 'TICKET_BORLETTE',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (previousBalance - transactionAmount).toFixed(
						2
					),
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Credit to system account
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionType: 'CREDIT',
					transactionIdentifier: 'TICKET_BORLETTE',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance - transactionAmount;

				// Handle agent commission if applicable
				if (userRole === 'AGENT') {
					const agentCommision = parseFloat(
						config.ticketBorletteComissionAgent * transactionAmount
					).toFixed(2);

					// Credit commission to agent
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'TICKET_BORLETTE_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] +
							parseFloat(agentCommision)
						).toFixed(2),
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					// Debit commission from system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'TICKET_BORLETTE_COMMISSION',
						transactionType: 'DEBIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					walletData[balanceField] += parseFloat(agentCommision);
				}
				break;
			}

			// TICKET_BORLETTE_CANCELLED for cancelled Borlette tickets
			case 'TICKET_BORLETTE_CANCELLED': {
				// Credit to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'TICKET_BORLETTE_CANCELLED',
					transactionType: 'CREDIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (previousBalance + transactionAmount).toFixed(
						2
					),
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Debit from system
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'TICKET_BORLETTE_CANCELLED',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance + transactionAmount;

				// If agent, handle commission cancellation
				if (userRole === 'AGENT') {
					const agentCommision = parseFloat(
						config.ticketBorletteComissionAgent * transactionAmount
					).toFixed(2);

					// Debit commission from agent
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier:
							'TICKET_BORLETTE_COMMISSION_CANCELLED',
						transactionType: 'DEBIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] -
							parseFloat(agentCommision)
						).toFixed(2),
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					// Credit commission to system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier:
							'TICKET_BORLETTE_COMMISSION_CANCELLED',
						transactionType: 'CREDIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					walletData[balanceField] -= parseFloat(agentCommision);
				}
				break;
			}

			// WON_BORLETTE for Borlette winnings
			case 'WON_BORLETTE': {
				const comissionAmount = (0.04 * transactionAmount).toFixed(2);
				const actualTransactionAmount = (
					transactionAmount - parseFloat(comissionAmount)
				).toFixed(2);
				returnAmount = parseFloat(actualTransactionAmount);

				// Debit from system
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_BORLETTE',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});

				// Credit to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'WON_BORLETTE',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(
						actualTransactionAmount
					).toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (
						previousBalance + parseFloat(actualTransactionAmount)
					).toFixed(2),
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] =
					previousBalance + parseFloat(actualTransactionAmount);

				// System keeps commission
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_BORLETTE_COMMISSION',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(comissionAmount).toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});

				// For agents/dealers, give them commission
				if (userRole === 'AGENT' || userRole === 'DEALER') {
					const agentCommision = (0.015 * transactionAmount).toFixed(
						2
					);

					// Debit commission from system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'WON_BORLETTE_COMMISSION',
						transactionType: 'DEBIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						status: 'COMPLETED',
					});

					// Credit commission to agent/dealer
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'WON_BORLETTE_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] +
							parseFloat(agentCommision)
						).toFixed(2),
						status: 'COMPLETED',
					});

					walletData[balanceField] += parseFloat(agentCommision);
				}
				break;
			}

			// TICKET_MEGAMILLION for MegaMillion ticket purchases
			case 'TICKET_MEGAMILLION': {
				if (transactionAmount > walletData[balanceField]) {
					throw new Error(
						`Insufficient ${cashType.toLowerCase()} balance.`
					);
				}

				// Debit from user
				await Transaction.create({
					user: userId,
					cashType,
					transactionType: 'DEBIT',
					transactionIdentifier: 'TICKET_MEGAMILLION',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (previousBalance - transactionAmount).toFixed(
						2
					),
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Credit to system account
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionType: 'CREDIT',
					transactionIdentifier: 'TICKET_MEGAMILLION',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance - transactionAmount;

				// Handle agent commission if applicable
				if (userRole === 'AGENT') {
					const agentCommision = parseFloat(
						config.ticketMegamillionComissionAgent *
						transactionAmount
					).toFixed(2);

					// Credit commission to agent
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'TICKET_MEGAMILLION_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] +
							parseFloat(agentCommision)
						).toFixed(2),
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					// Debit commission from system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'TICKET_MEGAMILLION_COMMISSION',
						transactionType: 'DEBIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					walletData[balanceField] += parseFloat(agentCommision);
				}
				break;
			}

			// TICKET_MEGAMILLION_CANCELLED for cancelled MegaMillion tickets
			case 'TICKET_MEGAMILLION_CANCELLED': {
				// Credit to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'TICKET_MEGAMILLION_CANCELLED',
					transactionType: 'CREDIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (previousBalance + transactionAmount).toFixed(
						2
					),
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Debit from system
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'TICKET_MEGAMILLION_CANCELLED',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance + transactionAmount;

				// If agent, handle commission cancellation
				if (userRole === 'AGENT') {
					const agentCommision = parseFloat(
						config.ticketMegamillionComissionAgent *
						transactionAmount
					).toFixed(2);

					// Debit commission from agent
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier:
							'TICKET_MEGAMILLION_COMMISSION_CANCELLED',
						transactionType: 'DEBIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] -
							parseFloat(agentCommision)
						).toFixed(2),
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					// Credit commission to system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier:
							'TICKET_MEGAMILLION_COMMISSION_CANCELLED',
						transactionType: 'CREDIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					walletData[balanceField] -= parseFloat(agentCommision);
				}
				break;
			}

			// WON_MEGAMILLION for MegaMillion winnings
			case 'WON_MEGAMILLION': {
				const comissionAmount = (0.04 * transactionAmount).toFixed(2);
				const actualTransactionAmount = (
					transactionAmount - parseFloat(comissionAmount)
				).toFixed(2);
				returnAmount = parseFloat(actualTransactionAmount);

				// Debit from system
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_MEGAMILLION',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});

				// Credit to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'WON_MEGAMILLION',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(
						actualTransactionAmount
					).toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (
						previousBalance + parseFloat(actualTransactionAmount)
					).toFixed(2),
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] =
					previousBalance + parseFloat(actualTransactionAmount);

				// System keeps commission
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_MEGAMILLION_COMMISSION',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(comissionAmount).toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});

				// For agents/dealers, give them commission
				if (userRole === 'AGENT' || userRole === 'DEALER') {
					const agentCommision = (0.015 * transactionAmount).toFixed(
						2
					);

					// Credit commission to agent/dealer
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'WON_MEGAMILLION_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] +
							parseFloat(agentCommision)
						).toFixed(2),
						status: 'COMPLETED',
					});

					// Debit commission from system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'WON_MEGAMILLION_COMMISSION',
						transactionType: 'DEBIT',
						transactionAmount:
							parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						status: 'COMPLETED',
					});

					walletData[balanceField] += parseFloat(agentCommision);
				}
				break;
			}

			// TICKET_ROULETTE for Roulette ticket purchases
			case 'TICKET_ROULETTE': {
				if (transactionAmount > walletData[balanceField]) {
					throw new Error(
						`Insufficient ${cashType.toLowerCase()} balance.`
					);
				}

				// Debit from user
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'TICKET_ROULETTE',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (previousBalance - transactionAmount).toFixed(
						2
					),
					status: 'COMPLETED',
				});

				// Credit to system account
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'TICKET_ROULETTE',
					transactionType: 'CREDIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance - transactionAmount;
				break;
			}

			// WON_ROULETTE for Roulette winnings
			case 'WON_ROULETTE': {
				const comissionAmount = (0.04 * transactionAmount).toFixed(2);
				const actualTransactionAmount = (
					transactionAmount - parseFloat(comissionAmount)
				).toFixed(2);
				returnAmount = parseFloat(actualTransactionAmount);

				// Debit from system
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_ROULETTE',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});

				// Credit to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'WON_ROULETTE',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(
						actualTransactionAmount
					).toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (
						previousBalance + parseFloat(actualTransactionAmount)
					).toFixed(2),
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] =
					previousBalance + parseFloat(actualTransactionAmount);

				// System keeps commission
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_ROULETTE_COMMISSION',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(comissionAmount).toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					status: 'COMPLETED',
				});
				break;
			}

			case 'DOMINO_ENTRY': {
				if (transactionAmount > walletData[balanceField]) {
					throw new Error(
						`Insufficient ${cashType.toLowerCase()} balance.`
					);
				}

				// Debit from user
				await Transaction.create({
					user: userId,
					cashType,
					transactionType: 'DEBIT',
					transactionIdentifier: 'DOMINO_ENTRY',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (previousBalance - transactionAmount).toFixed(2),
					transactionData: {
						roomId: ticketId, // roomId passed as ticketId parameter
						cashType,
					},
					status: 'COMPLETED',
				});

				// Credit to system account
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionType: 'CREDIT',
					transactionIdentifier: 'DOMINO_ENTRY',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						roomId: ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance - transactionAmount;

				// Handle agent commission if applicable
				if (userRole === 'AGENT') {
					const agentCommision = parseFloat(
						config.dominoComissionAgent * transactionAmount || 0.02 * transactionAmount
					).toFixed(2);

					// Credit commission to agent
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'DOMINO_ENTRY_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount: parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] + parseFloat(agentCommision)
						).toFixed(2),
						transactionData: {
							roomId: ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					// Debit commission from system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'DOMINO_ENTRY_COMMISSION',
						transactionType: 'DEBIT',
						transactionAmount: parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							roomId: ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					walletData[balanceField] += parseFloat(agentCommision);
				}
				break;
			}

			// WON_DOMINO for Domino game winnings
			case 'WON_DOMINO': {
				const comissionAmount = (0.04 * transactionAmount).toFixed(2);
				const actualTransactionAmount = (
					transactionAmount - parseFloat(comissionAmount)
				).toFixed(2);
				returnAmount = parseFloat(actualTransactionAmount);

				// Debit from system
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_DOMINO',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						gameId: ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Credit to user (minus commission)
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'WON_DOMINO',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(actualTransactionAmount).toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (
						previousBalance + parseFloat(actualTransactionAmount)
					).toFixed(2),
					transactionData: {
						gameId: ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] =
					previousBalance + parseFloat(actualTransactionAmount);

				// System keeps commission
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'WON_DOMINO_COMMISSION',
					transactionType: 'CREDIT',
					transactionAmount: parseFloat(comissionAmount).toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						gameId: ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// For agents/dealers, give them commission
				if (userRole === 'AGENT' || userRole === 'DEALER') {
					const agentCommision = (0.015 * transactionAmount).toFixed(2);

					// Debit commission from system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'WON_DOMINO_COMMISSION',
						transactionType: 'DEBIT',
						transactionAmount: parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							gameId: ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					// Credit commission to agent/dealer
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'WON_DOMINO_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount: parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] + parseFloat(agentCommision)
						).toFixed(2),
						transactionData: {
							gameId: ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					walletData[balanceField] += parseFloat(agentCommision);
				}
				break;
			}

			// DOMINO_REFUND for cancelled Domino games
			case 'DOMINO_REFUND': {
				// Credit to user
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'DOMINO_REFUND',
					transactionType: 'CREDIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: 'SYSTEM',
					referenceIndex: systemAccount._id,
					previousBalance,
					newBalance: (previousBalance + transactionAmount).toFixed(2),
					transactionData: {
						roomId: ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Debit from system
				await Transaction.create({
					user: systemAccount._id,
					cashType,
					transactionIdentifier: 'DOMINO_REFUND',
					transactionType: 'DEBIT',
					transactionAmount: transactionAmount.toFixed(2),
					referenceType: userRole,
					referenceIndex: userId,
					previousBalance: 0,
					newBalance: 0,
					transactionData: {
						roomId: ticketId,
						cashType,
					},
					status: 'COMPLETED',
				});

				// Update wallet balance
				walletData[balanceField] = previousBalance + transactionAmount;

				// If agent had commission, refund it
				if (userRole === 'AGENT') {
					const agentCommision = parseFloat(
						config.dominoComissionAgent * transactionAmount || 0.02 * transactionAmount
					).toFixed(2);

					// Debit commission from agent
					await Transaction.create({
						user: userId,
						cashType,
						transactionIdentifier: 'DOMINO_REFUND_COMMISSION',
						transactionType: 'DEBIT',
						transactionAmount: parseFloat(agentCommision).toFixed(2),
						referenceType: 'SYSTEM',
						referenceIndex: systemAccount._id,
						previousBalance: walletData[balanceField],
						newBalance: (
							walletData[balanceField] - parseFloat(agentCommision)
						).toFixed(2),
						transactionData: {
							roomId: ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					// Credit commission back to system
					await Transaction.create({
						user: systemAccount._id,
						cashType,
						transactionIdentifier: 'DOMINO_REFUND_COMMISSION',
						transactionType: 'CREDIT',
						transactionAmount: parseFloat(agentCommision).toFixed(2),
						referenceType: userRole,
						referenceIndex: userId,
						previousBalance: 0,
						newBalance: 0,
						transactionData: {
							roomId: ticketId,
							cashType,
						},
						status: 'COMPLETED',
					});

					walletData[balanceField] -= parseFloat(agentCommision);
				}
				break;
			}

			// For any other transaction type
			default: {
				throw new Error(
					`Unsupported transaction type: ${transactionIdentifier}`
				);
			}
		}

		// Save wallet changes
		await walletData.save();

		return returnAmount;
	} catch (error) {
		console.error(`Transaction error (${transactionIdentifier}):`, error);
		throw error;
	}
};

export const commissionSummaryByAgent = async (
	user,
	{ agentId, startDate, endDate }
) => {
	try {
		const criteria = {
			status: {
				$ne: 'CANCELLED',
			},
		};
		const transactionCriteria = {
			transactionIdentifier: {
				$in: [
					'TICKET_BORLETTE',
					'TICKET_BORLETTE_COMMISSION',
					'TICKET_BORLETTE_CANCELLED',
					'TICKET_BORLETTE_COMMISSION_CANCELLED',
					'TICKET_MEGAMILLION',
					'TICKET_MEGAMILLION_COMMISSION',
					'TICKET_MEGAMILLION_CANCELLED',
					'TICKET_MEGAMILLION_COMMISSION_CANCELLED',
					'DOMINO_ENTRY',
					'DOMINO_ENTRY_COMMISSION',
					'DOMINO_REFUND',
					'DOMINO_REFUND_COMMISSION',
					'WON_DOMINO',
					'WON_DOMINO_COMMISSION',
					'WITHDRAW',
					'WITHDRAW_COMMISSION',
					'DEPOSIT',
					'DEPOSIT_COMMISSION',
				],
			},
		};
		if (startDate || endDate) {
			criteria['$and'] = [];
			transactionCriteria['$and'] = [];
			if (startDate) {
				criteria['$and'].push({
					createdAt: {
						$gte: new Date(parseInt(startDate)),
					},
				});
				transactionCriteria['$and'].push({
					createdAt: {
						$gte: new Date(parseInt(startDate)),
					},
				});
			}
			if (endDate) {
				criteria['$and'].push({
					createdAt: {
						$lte: new Date(parseInt(endDate)),
					},
				});
				transactionCriteria['$and'].push({
					createdAt: {
						$lte: new Date(parseInt(endDate)),
					},
				});
			}
		}

		if (agentId) {
			criteria.user = agentId;
			transactionCriteria.user = agentId;
		}

		const rawTransactionData = await Transaction.aggregate([
			{
				$match: transactionCriteria,
			},
			{
				$group: {
					_id: {
						user: '$user',
						transactionIdentifier: '$transactionIdentifier',
					},
					amount: {
						$sum: '$transactionAmount',
					},
				},
			},
		]);

		const rawTransactionDataPopulated = await User.populate(
			rawTransactionData,
			{
				path: '_id.user',
				select: 'name role',
			}
		);

		const rawBorletteData = await BorletteTicket.aggregate([
			{
				$match: criteria,
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

		const rawMegamillionData = await MegaMillionTicket.aggregate([
			{
				$match: criteria,
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

		const summary = {};

		rawTransactionDataPopulated
			.filter(item => item._id.user.role === 'AGENT')
			.map(item => {
				if (!summary[item._id.user._id]) {
					summary[item._id.user._id] = {
						user: item._id.user,
						megamillion: {
							sale: 0,
							commission: 0,
							rewards: 0,
						},
						borlette: {
							sale: 0,
							commission: 0,
							rewards: 0,
						},
						deposit: {
							sale: 0,
							commission: 0,
							rewards: 0,
						},
					};
				}
				switch (item._id.transactionIdentifier) {
					case 'TICKET_BORLETTE':
						summary[item._id.user._id].borlette.sale += item.amount;
						break;
					case 'TICKET_BORLETTE_CANCELLED':
						summary[item._id.user._id].borlette.sale -= item.amount;
						break;
					case 'TICKET_BORLETTE_COMMISSION':
						summary[item._id.user._id].borlette.commission +=
							item.amount;
						break;
					case 'TICKET_BORLETTE_COMMISSION_CANCELLED':
						summary[item._id.user._id].borlette.commission -=
							item.amount;
						break;
					case 'TICKET_MEGAMILLION':
						summary[item._id.user._id].megamillion.sale +=
							item.amount;
						break;
					case 'TICKET_MEGAMILLION_CANCELLED':
						summary[item._id.user._id].megamillion.sale -=
							item.amount;
						break;
					case 'TICKET_MEGAMILLION_COMMISSION':
						summary[item._id.user._id].megamillion.commission +=
							item.amount;
						break;
					case 'TICKET_MEGAMILLION_COMMISSION_CANCELLED':
						summary[item._id.user._id].megamillion.commission -=
							item.amount;
						break;
				}
			});

		rawBorletteData
			// .filter((item) => item._id.user.role === "AGENT")
			.map(item => {
				if (summary[item._id]) {
					summary[item._id].borlette.rewards += item.rewards;
				}
			});

		rawMegamillionData
			// .filter((item) => item._id.user.role === "AGENT")
			.map(item => {
				if (summary[item._id]) {
					summary[item._id].megamillion.rewards += item.rewards;
				}
			});

		// const data = summaryPopulated
		//     .filter((item) => item._id.role === "AGENT")
		//     .map((item) => ({
		//         ...item,
		//         sales: parseFloat(item.sales),
		//         rewards: parseFloat(item.rewards),
		//         commission: parseFloat(
		//             config.ticketBorletteComissionAgent * item.sales
		//         ),
		//     }));
		return {
			status: 200,
			entity: {
				success: true,
				data: Object.values(summary),
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

export const makeTransfer = async (
	user,
	{ receiverPhone, amountToTransfer }
) => {
	try {
		if (amountToTransfer < 20) {
			throw 'Transfer amount should be atleast 20 Gourde.';
		}
		if (user.phone == receiverPhone) {
			throw 'You are not allowed to transfer funds to your own account.';
		}
		const receiver = await User.findOne({
			countryCode: user.countryCode,
			phone: receiverPhone,
			isActive: true,
		});
		if (receiver._id && receiver.role === 'USER') {
			// if(role === 'USER' && receiver._id && receiver.role === 'USER'){
			// const { adminCommision } = getWithdrawCommissionAmount(amountToTransfer)
			// const amountAfterCommission = parseFloat(amountToTransfer - adminCommision)

			await makeTransaction(
				user._id,
				user.role,
				'USER_TRANSFER',
				amountToTransfer,
				receiver.role,
				receiver._id
			);

			const senderWalletData = await Wallet.findOne({
				user: user._id,
			});
			const receiverWalletData = await Wallet.findOne({
				user: receiver._id,
			});

			const creditMessage = transactionText.amountCredited.user
				.replace(
					'$crediterName',
					`${user.name.firstName} ${user.name.lastName}`
				)
				.replace('$amount', amountToTransfer)
				.replace('$walletBalance', senderWalletData.totalBalance);
			const debitMessage = transactionText.amountDebited.user
				.replace(
					'$debiterName',
					`${receiver.name.firstName} ${receiver.name.lastName}`
				)
				.replace('$amount', amountToTransfer)
				.replace('$walletBalance', receiverWalletData.totalBalance);

			console.log('creditMessage => ', creditMessage);
			console.log('creditMessage => ', creditMessage);

			await sendMessage({
				phone: receiver.phone,
				message: creditMessage,
			});
			await sendMessage({
				phone: user.phone,
				message: debitMessage,
			});

			return {
				status: 200,
				entity: {
					success: true,
					walletData: senderWalletData,
				},
			};
		} else {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'The specified user does not exists.',
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

export const initiateTransaction = async (
	{ _id, countryCode },
	{ receiverPhone, amountToTransfer, transactionType }
) => {
	try {
		const receiver = await User.findOne({
			countryCode: countryCode,
			phone: receiverPhone,
			isActive: true,
		});
		if (!receiver) {
			return {
				status: 500,
				entity: {
					success: false,
					error: "The user either doesn't exist or has been blocked.",
				},
			};
		}
		amountToTransfer = parseFloat(amountToTransfer);
		if (amountToTransfer < 20 || amountToTransfer > 100000) {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Amount should be greater than Gourde 20 and less than Gourde 100000.',
				},
			};
		}
		if (transactionType !== 'CREDIT' && transactionType !== 'DEBIT') {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid transaction type.',
				},
			};
		}
		const walletData = await Wallet.findOne({
			user: _id,
		});
		const receiverWalletData = await Wallet.findOne({
			user: receiver._id,
		});
		if (
			(transactionType === 'DEBIT' &&
				receiverWalletData.totalBalance < amountToTransfer) ||
			(transactionType === 'CREDIT' &&
				walletData.totalBalance < amountToTransfer)
		) {
			return {
				status: 500,
				entity: {
					success: false,
					error: `${transactionType === 'DEBIT' ? 'Receiver does' : 'You do'
						} not have enough balance in your account for this transaction.`,
				},
			};
		}
		const verificationCode = generateRandomDigits(4);
		const message = `${verificationCode} is your OTP to ${transactionType.toLowerCase()} G ${amountToTransfer} ${transactionType === 'CREDIT' ? 'to' : 'from'
			} your account. The OTP is valid for 5 mins.`;
		const textResponse = await sendMessage({
			phone: receiverPhone,
			message,
		});
		if (textResponse.status === 200) {
			const verificationToken = jwtSign(
				{ _id },
				{ expiresIn: otpExpiresIn }
			);
			tokenReference[verificationToken] = {
				_id,
				verificationCode,
				receiverPhone,
				amountToTransfer,
				transactionType,
			};
			return {
				status: 200,
				entity: {
					success: true,
					verificationToken,
				},
			};
		}
		return textResponse;
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

export const processTransaction = async (
	{ _id, role, name, countryCode },
	{ receiverPhone, amountToTransfer, transactionType, verificationToken }
) => {
	try {
		const walletData = await Wallet.findOne({
			user: _id,
		});
		if (walletData.totalBalance < amountToTransfer) {
			delete tokenReference[verificationToken];
			throw 'You do not have enough balance in your account for this transaction.';
		}
		let adminId = await getAdminUserId();
		const receiver = await User.findOne({
			countryCode: countryCode,
			phone: receiverPhone,
			isActive: true,
		});
		if (role === 'AGENT' && receiver._id && receiver.role === 'USER') {
			if (transactionType === 'CREDIT') {
				// const { agentCommision, adminCommision } = getDepositCommissionAmount(amountToTransfer)
				// const amountToUser = parseFloat(amountToTransfer - (agentCommision + adminCommision))
				await makeTransaction(
					{ _id: _id },
					{
						transactionType: 'DEBIT',
						transactionAmount: amountToTransfer,
						transactionIdentifier: 'DEPOSIT',
						transactionData: {
							depositTo: receiver._id,
						},
					}
				);
				const userTransaction = await makeTransaction(
					{ _id: receiver._id },
					{
						transactionType: 'CREDIT',
						// transactionAmount: amountToUser,
						transactionAmount: amountToTransfer,
						transactionIdentifier: 'DEPOSIT',
						transactionData: {
							depositBy: _id,
						},
					}
				);

				const userMessage = transactionText.amountCredited.user
					.replace(
						'$crediterName',
						`${name.firstName} ${name.lastName}`
					)
					.replace('$amount', amountToTransfer)
					.replace(
						'$walletBalance',
						userTransaction.entity.walletData.totalBalance
					);
				const userMessageResponse = await sendMessage({
					phone: receiver.phone,
					message: userMessage,
				});
				// const agentTransactionCommision = await makeTransaction({_id: _id}, {
				// 	transactionType: 'CREDIT',
				// 	transactionAmount: agentCommision,
				// 	transactionIdentifier: 'DEPOSIT_COMMISION',
				// 	transactionData: {
				// 		depositTo: receiver._id
				// 	}
				// })
				// const adminTransaction = await makeTransaction({_id: adminId}, {
				// 	transactionType: 'CREDIT',
				// 	transactionAmount: adminCommision,
				// 	transactionIdentifier: 'DEPOSIT_COMMISION',
				// 	transactionData: {
				// 		depositTo: receiver._id,
				// 		depositBy: _id,
				// 	}
				// })
				delete tokenReference[verificationToken];
				return {
					status: 200,
					entity: {
						success: true,
						userMessageResponse,
					},
				};
			}
			if (transactionType === 'DEBIT') {
				const { agentCommision, adminCommision } =
					getWithdrawCommissionAmount(amountToTransfer);

				const amountAfterCommission = parseFloat(
					amountToTransfer - (agentCommision + adminCommision)
				);

				const userTransaction = await makeTransaction(
					{ _id: receiver._id },
					{
						transactionType: 'DEBIT',
						transactionAmount: amountToTransfer,
						transactionIdentifier: 'WITHDRAW',
						transactionData: {
							withdrawBy: _id,
						},
					}
				);
				await makeTransaction(
					{ _id: _id },
					{
						transactionType: 'CREDIT',
						transactionAmount: amountAfterCommission,
						transactionIdentifier: 'WITHDRAW',
						transactionData: {
							withdrawFrom: receiver._id,
						},
					}
				);
				await makeTransaction(
					{ _id: _id },
					{
						transactionType: 'CREDIT',
						transactionAmount: agentCommision,
						transactionIdentifier: 'WITHDRAW_COMMISION',
						transactionData: {
							withdrawFrom: receiver._id,
						},
					}
				);
				await makeTransaction(
					{ _id: adminId },
					{
						transactionType: 'CREDIT',
						transactionAmount: adminCommision,
						transactionIdentifier: 'WITHDRAW_COMMISION',
						transactionData: {
							withdrawFrom: receiver._id,
							withdrawBy: _id,
						},
					}
				);
				const userMessage = transactionText.amountDebited.user
					.replace(
						'$debiterName',
						`${name.firstName} ${name.lastName}`
					)
					.replace('$amount', amountToTransfer)
					.replace(
						'$walletBalance',
						userTransaction.entity.walletData.totalBalance
					);
				const userMessageResponse = await sendMessage({
					phone: receiver.phone,
					message: userMessage,
				});
				delete tokenReference[verificationToken];
				return {
					status: 200,
					entity: {
						success: true,
						amountAfterCommission,
						userMessageResponse,
					},
				};
			}
		}
		if (role === 'DEALER' && receiver._id && receiver.role === 'AGENT') {
			if (transactionType === 'CREDIT') {
				await makeTransaction(
					{ _id: receiver._id },
					{
						transactionType: 'CREDIT',
						transactionAmount: amountToTransfer,
						transactionIdentifier: 'DEPOSIT',
						transactionData: {
							depositBy: _id,
						},
					}
				);
				await makeTransaction(
					{ _id: _id },
					{
						transactionType: 'DEBIT',
						transactionAmount: amountToTransfer,
						transactionIdentifier: 'DEPOSIT',
						transactionData: {
							depositTo: receiver._id,
						},
					}
				);
				delete tokenReference[verificationToken];
				return {
					status: 200,
					entity: {
						success: true,
					},
				};
			}
			if (transactionType === 'DEBIT') {
				await makeTransaction(
					{ _id: receiver._id },
					{
						transactionType: 'DEBIT',
						transactionAmount: amountToTransfer,
						transactionIdentifier: 'WITHDRAW',
						transactionData: {
							withdrawBy: _id,
						},
					}
				);
				await makeTransaction(
					{ _id: _id },
					{
						transactionType: 'CREDIT',
						transactionAmount: amountToTransfer,
						transactionIdentifier: 'WITHDRAW',
						transactionData: {
							withdrawFrom: receiver._id,
						},
					}
				);
				delete tokenReference[verificationToken];
				return {
					status: 200,
					entity: {
						success: true,
					},
				};
			}
		}
		delete tokenReference[verificationToken];
		return {
			status: 403,
			entity: {
				success: false,
				error: 'You are unauthorized to process this transaction.',
			},
		};
	} catch (error) {
		delete tokenReference[verificationToken];
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

export const depositMoney = async (user, body) => {
	try {
		let { receiverPhone, amountToTransfer } = body;
		let { role, countryCode } = user;
		if (role === 'ADMIN' && body.countryCode) {
			countryCode = body.countryCode;
		}
		amountToTransfer = parseFloat(amountToTransfer);
		if (amountToTransfer < 20) {
			throw 'Amount should be greater than Gourde 20 and less than Gourde 100000.';
		}
		const receiver = await User.findOne({
			countryCode: countryCode,
			phone: receiverPhone,
			isActive: true,
		});
		if (!receiver) {
			throw 'The specified user does not exist.';
		}
		if (role === 'AGENT' && receiver.role !== 'USER') {
			throw 'The specified user does not exist.';
		}
		if (role === 'DEALER' && receiver.role !== 'AGENT') {
			throw 'The specified user does not exist.';
		}
		if (role === 'ADMIN' && receiver.role === 'ADMIN') {
			await makeTransaction(
				user._id,
				user.role,
				'WIRE_TRANSFER',
				amountToTransfer
			);
		} else {
			await makeTransaction(
				user._id,
				user.role,
				'DEPOSIT',
				amountToTransfer,
				receiver.role,
				receiver._id
			);
		}
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

export const withdrawMoney = async (user, body) => {
	try {
		let { receiverPhone, amountToTransfer } = body;
		let { role, countryCode } = user;
		if (role === 'ADMIN' && body.countryCode) {
			countryCode = body.countryCode;
		}
		amountToTransfer = parseFloat(amountToTransfer);
		if (amountToTransfer < 20) {
			throw 'Amount should be greater than Gourde 20 and less than Gourde 100000.';
		}
		const receiver = await User.findOne({
			countryCode: countryCode,
			phone: receiverPhone,
			isActive: true,
		});
		if (!receiver) {
			throw 'The specified user does not exist.';
		}
		if (role === 'AGENT' && receiver.role !== 'USER') {
			throw 'The specified user does not exist.';
		}
		if (role === 'DEALER' && receiver.role !== 'AGENT') {
			throw 'The specified user does not exist.';
		}
		const amountAfterCommission = await makeTransaction(
			user._id,
			user.role,
			'WITHDRAW',
			amountToTransfer,
			receiver.role,
			receiver._id
		);

		return {
			status: 200,
			entity: {
				success: true,
				amountAfterCommission,
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

const getWithdrawCommissionAmount = amountToTransfer => {
	let agentCommision = 0,
		adminCommision = 0;
	if (amountToTransfer >= 20 && amountToTransfer <= 99) {
		agentCommision = 2;
		adminCommision = 2;
	} else if (amountToTransfer >= 100 && amountToTransfer <= 249) {
		agentCommision = 4;
		adminCommision = 4;
	} else if (amountToTransfer >= 250 && amountToTransfer <= 499) {
		agentCommision = 5;
		adminCommision = 5;
	} else if (amountToTransfer >= 500 && amountToTransfer <= 999) {
		agentCommision = 8;
		adminCommision = 9;
	} else if (amountToTransfer >= 1000 && amountToTransfer <= 1999) {
		agentCommision = 14;
		adminCommision = 18;
	} else if (amountToTransfer >= 2000 && amountToTransfer <= 3999) {
		agentCommision = 23;
		adminCommision = 35;
	} else if (amountToTransfer >= 4000 && amountToTransfer <= 5999) {
		agentCommision = 32;
		adminCommision = 33;
	} else if (amountToTransfer >= 6000 && amountToTransfer <= 7999) {
		agentCommision = 35;
		adminCommision = 50;
	} else if (amountToTransfer >= 8000 && amountToTransfer <= 11999) {
		agentCommision = 47;
		adminCommision = 63;
	} else if (amountToTransfer >= 12000 && amountToTransfer <= 19999) {
		agentCommision = 68;
		adminCommision = 86;
	} else if (amountToTransfer >= 20000 && amountToTransfer <= 39999) {
		agentCommision = 115;
		adminCommision = 130;
	} else if (amountToTransfer >= 40000 && amountToTransfer <= 59999) {
		agentCommision = 160;
		adminCommision = 180;
	} else if (amountToTransfer >= 60000 && amountToTransfer <= 79999) {
		agentCommision = 201;
		adminCommision = 254;
	} else if (amountToTransfer >= 80000 && amountToTransfer <= 100000) {
		agentCommision = 245;
		adminCommision = 313;
	}
	return {
		agentCommision,
		adminCommision,
	};
};
