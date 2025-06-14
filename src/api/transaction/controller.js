import moment from 'moment';
import { generateRandomDigits } from '../../services/helper/utils';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';
import { Transaction } from './model';
import { sendMessage } from '../text/controller';
import { BorletteTicket } from '../borlette_ticket/model';
import { MegaMillionTicket } from '../megamillion_ticket/model';
import { LoyaltyService } from '../loyalty/service'; // ADD LOYALTY SERVICE IMPORT

const config = {
	depositCommissionAgent: 0.01,
	depositCommissionAdmin: 0.02,
	userTransferComissionAdmin: 0.03,
	ticketBorletteComissionAgent: 0.15,
	ticketMegamillionComissionAgent: 0.015,
	withdrawCommissionAgent: 0.01,
	withdrawCommissionAdmin: 0.02,
};

const transactionText = {
	amountCredited: {
		user: 'Hi, $crediterName has sent you Gourde $amount. Your wallet balance is now Gourde $walletBalance. Please contact MegaPay support.',
		agent:
			'Hi, you have successfully sent Gourde $amount to $creditedTo. Your wallet balance is now Gourde $walletBalance. Please contact MegaPay support.',
	},
	amountDebited: {
		user: 'Hi, $debiterName has withdrawn Gourde $amount from your account. Your wallet balance is now Gourde $walletBalance. Please contact MegaPay support.',
		agent:
			'Hi, you have successfully withdrawn Gourde $amount from $debitedFrom. Your wallet balance is now Gourde $walletBalance. Please contact MegaPay support.',
	},
};

const tokenReference = {};

export const list = async ({
	offset,
	limit,
	startDate,
	endDate,
	sortBy = 'createdAt',
	sortOrder = 'desc',
	transactionIdentifier,
	transactionType,
	cashType,
}) => {
	try {
		let params = {};
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
		if (transactionIdentifier) {
			params.transactionIdentifier = transactionIdentifier.toUpperCase();
		}
		if (transactionType) {
			params.transactionType = transactionType.toUpperCase();
		}
		if (cashType) {
			params.cashType = cashType.toUpperCase();
		}
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

		switch (transactionIdentifier) {
			// JOINING_BONUS for new user registration bonus
			case 'JOINING_BONUS': {
				await Transaction.create({
					user: userId,
					cashType,
					transactionIdentifier: 'JOINING_BONUS',
					transactionType: 'CREDIT',
					transactionAmount: transactionAmount.toFixed(2),
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

				// **NEW: Record deposit for loyalty tracking**
				try {
					const loyaltyResult = await LoyaltyService.recordUserDeposit(
						referenceIndex, // receiver of the deposit
						parseFloat(transactionAmount)
					);
					if (!loyaltyResult.success) {
						console.warn(`Failed to record deposit for loyalty tracking for user ${referenceIndex}:`, loyaltyResult.error);
					} else {
						console.log(`Deposit recorded for loyalty tracking: User ${referenceIndex}, Amount: ${transactionAmount}`);
					}
				} catch (loyaltyError) {
					console.error(`Error recording deposit for loyalty tracking for user ${referenceIndex}:`, loyaltyError);
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
					if (cashType === 'REAL' && parseFloat(agentCommision) > 0) {
						// Agent commission
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

						// System receives admin commission
						await Transaction.create({
							user: systemAccount._id,
							cashType,
							transactionIdentifier: 'WITHDRAW_COMMISSION',
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

			// USER_TRANSFER for user-to-user transfers
			case 'USER_TRANSFER': {
				const referenceUserWallet = await Wallet.findOne({
					user: referenceIndex,
				});

				if (!referenceUserWallet) {
					throw new Error('The specified user does not exist.');
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

			// Rest of the transaction cases remain unchanged...
			// Adding just the cases needed for this implementation

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
						$sum: '$amountPlayed',
					},
					rewards: {
						$sum: '$amountWon',
					},
				},
			},
		]);

		const rawBorletteDataPopulated = await User.populate(rawBorletteData, {
			path: '_id',
			select: 'name role',
		});

		const rawMegamillionDataPopulated = await User.populate(
			rawMegamillionData,
			{
				path: '_id',
				select: 'name role',
			}
		);

		return {
			status: 200,
			entity: {
				success: true,
				transactions: rawTransactionDataPopulated,
				borlette: rawBorletteDataPopulated,
				megamillion: rawMegamillionDataPopulated,
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

export const verifyToken = async (user, { verificationToken }) => {
	try {
		if (tokenReference[verificationToken]) {
			delete tokenReference[verificationToken];
			return {
				status: 200,
				entity: {
					success: true,
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: 'Invalid verification token.',
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

export const requestToken = async (user, { receiverPhone, countryCode }) => {
	try {
		const verificationToken = generateRandomDigits(6);
		tokenReference[verificationToken] = {
			user: user._id,
			receiverPhone,
			countryCode,
		};
		setTimeout(() => {
			delete tokenReference[verificationToken];
		}, 900000);
		return {
			status: 200,
			entity: {
				success: true,
				verificationToken,
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

export const transferMoney = async (
	user,
	{ verificationToken, amountToTransfer }
) => {
	try {
		let { _id, role, name, countryCode } = user;
		if (!tokenReference[verificationToken]) {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid or expired verification token.',
				},
			};
		}
		let { receiverPhone } = tokenReference[verificationToken];
		amountToTransfer = parseFloat(amountToTransfer);
		if (amountToTransfer < 20) {
			throw 'Amount should be greater than Gourde 20 and less than Gourde 100000.';
		}
		let adminId = await getAdminUserId();
		const receiver = await User.findOne({
			countryCode: countryCode,
			phone: receiverPhone,
			isActive: true,
		});
		if (role === 'AGENT' && receiver._id && receiver.role === 'USER') {
			if (transactionType === 'CREDIT') {
				const { agentCommision, adminCommision } = getDepositCommissionAmount(amountToTransfer)
				const amountToUser = parseFloat(amountToTransfer - (agentCommision + adminCommision))
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
						transactionAmount: amountToUser,
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
		if (role === 'ADMIN' && !['USER', 'AGENT'].includes(receiver.role)) {
			throw 'The specified user does not exist.';
		}
		const amountAfterCommission = await makeTransaction(
			user._id,
			user.role,
			'DEPOSIT',
			amountToTransfer,
			receiver.role,
			receiver._id,
			null,
			'REAL' // Use REAL cash type for deposits
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
				error: typeof error === 'string' ? error : 'An error occurred',
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
		if (role === 'ADMIN' && !['USER', 'AGENT'].includes(receiver.role)) {
			throw 'The specified user does not exist.';
		}
		const amountAfterCommission = await makeTransaction(
			user._id,
			user.role,
			'WITHDRAW',
			amountToTransfer,
			receiver.role,
			receiver._id,
			null,
			'REAL' // Use REAL cash type for withdrawals
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
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};