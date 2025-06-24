import { generateRandomDigits } from '../../services/helper/utils';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';
import { Transaction } from './model';
import { sendMessage } from '../text/controller';
import { BorletteTicket } from '../borlette_ticket/model';
import { MegaMillionTicket } from '../megamillion_ticket/model';
import { LoyaltyService } from '../loyalty/service';

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
	referenceIndex,
	referenceType,
	ticketId,
	cashType = 'VIRTUAL'
) => {
	try {
		// Validate inputs
		if (!userId) {
			throw new Error('User ID is required');
		}

		if (!transactionIdentifier) {
			throw new Error('Transaction identifier is required');
		}

		// Validate cash type
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			throw new Error('Invalid cash type. Must be REAL or VIRTUAL');
		}

		// Validate transaction amount
		if (!transactionAmount || transactionAmount <= 0) {
			throw new Error('Invalid transaction amount');
		}

		// Get user wallet
		let walletData = await Wallet.findOne({ user: userId });
		if (!walletData) {
			throw new Error('Wallet not found for user');
		}

		// Get system account for commission transactions
		const systemAccount = await User.findOne({ role: 'SYSTEM' });
		if (!systemAccount) {
			throw new Error('System account not found');
		}

		// Store previous balances for transaction records
		const previousVirtualBalance = walletData.virtualBalance;
		const previousWithdrawableBalance = walletData.realBalanceWithdrawable;
		const previousNonWithdrawableBalance = walletData.realBalanceNonWithdrawable;

		let returnAmount = transactionAmount;

		// Handle different transaction types
		switch (transactionIdentifier) {
			// DEPOSIT for agents/dealers depositing to users
			case 'DEPOSIT': {
				if (!referenceIndex) {
					throw new Error('Reference index required for deposit transaction');
				}

				const receiverWalletData = await Wallet.findOne({
					user: referenceIndex,
				});

				if (!receiverWalletData) {
					throw new Error('The specified user does not exist.');
				}

				// Calculate commissions (only for REAL cash)
				const adminCommission = cashType === 'REAL'
					? parseFloat((config.depositCommissionAdmin * transactionAmount).toFixed(2))
					: 0;

				const agentCommission = cashType === 'REAL' && userRole === 'AGENT'
					? parseFloat((config.depositCommissionAgent * transactionAmount).toFixed(2))
					: 0;

				const amountAfterCommission = cashType === 'REAL'
					? parseFloat((transactionAmount - (agentCommission + adminCommission)).toFixed(2))
					: transactionAmount;

				if (cashType === 'REAL') {
					// For REAL cash deposits, validate sufficient balance
					const totalRealBalance = getTotalRealBalance(walletData);
					if (transactionAmount > totalRealBalance) {
						throw new Error('Insufficient real balance.');
					}

					// Deduct with priority (non-withdrawable first)
					const deductionResult = deductRealCashWithPriority(walletData, transactionAmount);

					// Credit to receiver (deposits go to non-withdrawable)
					receiverWalletData.realBalanceNonWithdrawable += amountAfterCommission;
				} else {
					// For VIRTUAL cash
					if (transactionAmount > walletData.virtualBalance) {
						throw new Error('Insufficient virtual balance.');
					}
					walletData.virtualBalance -= transactionAmount;
					receiverWalletData.virtualBalance += amountAfterCommission;
				}

				await walletData.save();
				await receiverWalletData.save();

				// Create transaction records
				await Transaction.create({
					user: userId,
					cashType,
					referenceType: referenceType || 'USER',
					referenceIndex,
					transactionType: 'DEBIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance: cashType === 'REAL' ?
						previousWithdrawableBalance + previousNonWithdrawableBalance :
						previousVirtualBalance,
					newBalance: cashType === 'REAL' ?
						walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable :
						walletData.virtualBalance,
					transactionData: {
						depositTo: referenceIndex,
						originalAmount: transactionAmount,
						amountAfterCommission,
						agentCommission,
						adminCommission,
					},
					status: 'COMPLETED',
				});

				break;
			}

			// TICKET transactions (gameplay) - Use priority system for Real Cash
			case 'TICKET_BORLETTE':
			case 'TICKET_MEGAMILLION':
			case 'DOMINO_ENTRY':
			case 'ROULETTE_BET': {
				if (cashType === 'REAL') {
					// Check total real balance
					const totalRealBalance = getTotalRealBalance(walletData);
					if (transactionAmount > totalRealBalance) {
						throw new Error('Insufficient real balance.');
					}

					// Use priority system: non-withdrawable first, then withdrawable
					const deductionResult = deductRealCashWithPriority(walletData, transactionAmount);

					await walletData.save();

					// Create transaction record with priority details
					await Transaction.create({
						user: userId,
						cashType,
						referenceType: ticketId ? 'TICKET' : 'GAME',
						referenceIndex: ticketId,
						transactionType: 'DEBIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance: previousWithdrawableBalance + previousNonWithdrawableBalance,
						newBalance: walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable,
						transactionData: {
							ticketId,
							gameType: transactionIdentifier.replace('TICKET_', '').replace('_ENTRY', '').replace('_BET', ''),
							deductedFromNonWithdrawable: deductionResult.deductedFromNonWithdrawable,
							deductedFromWithdrawable: deductionResult.deductedFromWithdrawable,
						},
						status: 'COMPLETED',
					});
				} else {
					// For VIRTUAL cash
					if (transactionAmount > walletData.virtualBalance) {
						throw new Error('Insufficient virtual balance.');
					}

					walletData.virtualBalance -= transactionAmount;
					await walletData.save();

					await Transaction.create({
						user: userId,
						cashType,
						referenceType: ticketId ? 'TICKET' : 'GAME',
						referenceIndex: ticketId,
						transactionType: 'DEBIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance: previousVirtualBalance,
						newBalance: walletData.virtualBalance,
						transactionData: {
							ticketId,
							gameType: transactionIdentifier.replace('TICKET_', '').replace('_ENTRY', '').replace('_BET', ''),
						},
						status: 'COMPLETED',
					});
				}

				// Process referral commission for gameplay
				try {
					const gameTypeMap = {
						'TICKET_BORLETTE': 'BORLETTE',
						'TICKET_MEGAMILLION': 'MEGAMILLION',
						'DOMINO_ENTRY': 'DOMINOES',
						'ROULETTE_BET': 'ROULETTE'
					};
					const gameType = gameTypeMap[transactionIdentifier];

					if (gameType) {
						const commissionResult = await LoyaltyService.processReferralCommission(
							userId,
							gameType,
							transactionAmount,
							ticketId
						);
						if (commissionResult.success) {
							console.log(`${gameType} referral commission processed: ${commissionResult.message}`);
						}
					}
				} catch (error) {
					console.error('Error processing referral commission:', error);
				}

				// Track spending for loyalty tier requirements
				try {
					await LoyaltyService.recordUserPlayActivity(userId, transactionAmount);
				} catch (error) {
					console.error('Error tracking play activity:', error);
				}

				break;
			}

			// WINNING transactions - Credit to withdrawable Real Cash
			case 'WON_BORLETTE':
			case 'WON_MEGAMILLION':
			case 'WON_ROULETTE':
			case 'WON_DOMINO': {
				if (cashType === 'REAL') {
					// Winnings go to withdrawable Real Cash
					walletData.realBalanceWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceType: ticketId ? 'TICKET' : 'GAME',
					referenceIndex: ticketId,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance: cashType === 'REAL' ?
						previousWithdrawableBalance + previousNonWithdrawableBalance :
						previousVirtualBalance,
					newBalance: cashType === 'REAL' ?
						walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable :
						walletData.virtualBalance,
					transactionData: {
						ticketId,
						gameType: transactionIdentifier.replace('WON_', ''),
						winningAmount: transactionAmount,
						creditedToWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				// Record win activity for no-win cashback tracking
				try {
					await LoyaltyService.recordUserWin(userId);
				} catch (error) {
					console.error('Error recording win activity:', error);
				}

				break;
			}

			// CASHBACK transactions - Credit to non-withdrawable Real Cash
			case 'CASHBACK':
			case 'REFERRAL_COMMISSION': {
				if (cashType === 'REAL') {
					// Cashback and referral commissions go to non-withdrawable Real Cash
					walletData.realBalanceNonWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceType: referenceType || 'LOYALTY',
					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance: cashType === 'REAL' ?
						previousWithdrawableBalance + previousNonWithdrawableBalance :
						previousVirtualBalance,
					newBalance: cashType === 'REAL' ?
						walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable :
						walletData.virtualBalance,
					transactionData: {
						creditedToNonWithdrawable: cashType === 'REAL',
						loyaltyType: transactionIdentifier,
					},
					status: 'COMPLETED',
				});

				break;
			}

			// PURCHASE transactions - Real Cash from purchases goes to non-withdrawable
			case 'PURCHASE':
			case 'WIRE_TRANSFER': {
				if (cashType === 'REAL') {
					// Real Cash from purchases goes to non-withdrawable
					walletData.realBalanceNonWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceType: referenceType || 'PAYMENT',
					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance: cashType === 'REAL' ?
						previousWithdrawableBalance + previousNonWithdrawableBalance :
						previousVirtualBalance,
					newBalance: cashType === 'REAL' ?
						walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable :
						walletData.virtualBalance,
					transactionData: {
						paymentId: referenceIndex,
						paymentType: transactionIdentifier,
						creditedToNonWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				break;
			}

			// WITHDRAWAL transactions - Only allow withdrawable Real Cash
			case 'WITHDRAWAL_REQUEST':
			case 'WITHDRAWAL_PENDING': {
				if (cashType === 'REAL') {
					// Only allow withdrawal from withdrawable Real Cash
					if (transactionAmount > walletData.realBalanceWithdrawable) {
						throw new Error('Insufficient withdrawable real balance.');
					}

					walletData.realBalanceWithdrawable -= transactionAmount;
					if (walletData.pendingWithdrawals) {
						walletData.pendingWithdrawals += transactionAmount;
					} else {
						walletData.pendingWithdrawals = transactionAmount;
					}
				} else {
					throw new Error('Withdrawals are only allowed for Real Cash');
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceType: 'WITHDRAWAL',
					referenceIndex,
					transactionType: 'PENDING_DEBIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance: previousWithdrawableBalance + previousNonWithdrawableBalance,
					newBalance: walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable,
					transactionData: {
						withdrawalId: referenceIndex,
						bankAccount: ticketId,
						deductedFromWithdrawable: transactionAmount,
					},
					status: 'PENDING',
				});

				break;
			}

			// WITHDRAWAL_REJECTED - Refund to withdrawable Real Cash
			case 'WITHDRAWAL_REJECTED': {
				if (cashType === 'REAL') {
					walletData.realBalanceWithdrawable += transactionAmount;
					if (walletData.pendingWithdrawals && walletData.pendingWithdrawals >= transactionAmount) {
						walletData.pendingWithdrawals -= transactionAmount;
					}
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceType: 'WITHDRAWAL',
					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance: cashType === 'REAL' ?
						previousWithdrawableBalance + previousNonWithdrawableBalance :
						previousVirtualBalance,
					newBalance: cashType === 'REAL' ?
						walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable :
						walletData.virtualBalance,
					transactionData: {
						withdrawalId: referenceIndex,
						refundedToWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				break;
			}

			// Handle cancelled/refund transactions
			case 'TICKET_BORLETTE_CANCELLED':
			case 'TICKET_MEGAMILLION_CANCELLED':
			case 'DOMINO_REFUND': {
				if (cashType === 'REAL') {
					// Refunds go back to non-withdrawable (as they were originally deducted from there first)
					walletData.realBalanceNonWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceType: ticketId ? 'TICKET' : 'GAME',
					referenceIndex: ticketId,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance: cashType === 'REAL' ?
						previousWithdrawableBalance + previousNonWithdrawableBalance :
						previousVirtualBalance,
					newBalance: cashType === 'REAL' ?
						walletData.realBalanceWithdrawable + walletData.realBalanceNonWithdrawable :
						walletData.virtualBalance,
					transactionData: {
						ticketId,
						refundReason: transactionIdentifier,
						refundedToNonWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				break;
			}

			default: {
				throw new Error(`Unsupported transaction identifier: ${transactionIdentifier}`);
			}
		}

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

// NEW: Get tier-based payout analytics for admin dashboard
export const getTierBasedPayoutAnalytics = async (query, user) => {
	try {
		if (!['ADMIN'].includes(user.role)) {
			throw new Error('You are not authorized to view analytics data.');
		}

		const { startDate, endDate, tier, gameType } = query;

		// Build date filter
		let dateFilter = {};
		if (startDate || endDate) {
			dateFilter.createdAt = {};
			if (startDate) {
				dateFilter.createdAt.$gte = new Date(startDate);
			}
			if (endDate) {
				dateFilter.createdAt.$lte = new Date(endDate);
			}
		}

		// Import models
		const { BorletteTicket } = await import('../borlette_ticket/model');

		// Build match criteria for tickets
		let matchCriteria = {
			status: 'COMPLETED',
			...dateFilter
		};

		if (tier) {
			matchCriteria.userTierAtPurchase = tier.toUpperCase();
		}

		// Get tier-based payout statistics
		const tierStats = await BorletteTicket.aggregate([
			{ $match: matchCriteria },
			{
				$group: {
					_id: {
						tier: '$userTierAtPurchase',
						payoutPercentage: '$payoutConfig.percentage',
						isCustom: '$payoutConfig.isCustom'
					},
					totalTickets: { $sum: 1 },
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: { $sum: '$totalAmountWon' },
					avgAmountPlayed: { $avg: '$totalAmountPlayed' },
					avgAmountWon: { $avg: '$totalAmountWon' },
					winningTickets: {
						$sum: {
							$cond: [{ $gt: ['$totalAmountWon', 0] }, 1, 0]
						}
					}
				}
			},
			{
				$addFields: {
					winRate: {
						$multiply: [
							{ $divide: ['$winningTickets', '$totalTickets'] },
							100
						]
					},
					profitMargin: {
						$multiply: [
							{
								$divide: [
									{ $subtract: ['$totalAmountPlayed', '$totalAmountWon'] },
									'$totalAmountPlayed'
								]
							},
							100
						]
					}
				}
			},
			{
				$sort: { '_id.tier': 1 }
			}
		]);

		// Get daily tier performance
		const dailyTierPerformance = await BorletteTicket.aggregate([
			{ $match: matchCriteria },
			{
				$group: {
					_id: {
						date: {
							$dateToString: {
								format: '%Y-%m-%d',
								date: '$createdAt'
							}
						},
						tier: '$userTierAtPurchase'
					},
					totalTickets: { $sum: 1 },
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: { $sum: '$totalAmountWon' }
				}
			},
			{
				$sort: { '_id.date': -1 }
			}
		]);

		// Get payout configuration usage
		const { PayoutConfig } = await import('../payout_config/model');
		const configUsage = await PayoutConfig.aggregate([
			{
				$match: {
					...dateFilter,
					isActive: true
				}
			},
			{
				$group: {
					_id: {
						tier: '$tier',
						gameType: '$gameType',
						percentage: '$payoutPercentage'
					},
					usageCount: { $sum: 1 },
					isPromotional: { $first: '$isPromotional' },
					description: { $first: '$description' }
				}
			},
			{
				$sort: { '_id.tier': 1, '_id.gameType': 1 }
			}
		]);

		// Calculate overall impact
		const overallImpact = await BorletteTicket.aggregate([
			{ $match: matchCriteria },
			{
				$group: {
					_id: null,
					totalRevenue: { $sum: '$totalAmountPlayed' },
					totalPayouts: { $sum: '$totalAmountWon' },
					totalTickets: { $sum: 1 },
					avgPayoutPercentageUsed: { $avg: '$payoutConfig.percentage' }
				}
			},
			{
				$addFields: {
					overallProfitMargin: {
						$multiply: [
							{
								$divide: [
									{ $subtract: ['$totalRevenue', '$totalPayouts'] },
									'$totalRevenue'
								]
							},
							100
						]
					}
				}
			}
		]);

		return {
			status: 200,
			entity: {
				success: true,
				analytics: {
					tierStatistics: tierStats,
					dailyTierPerformance: dailyTierPerformance,
					configurationUsage: configUsage,
					overallImpact: overallImpact[0] || {},
					dateRange: {
						startDate: startDate || 'All time',
						endDate: endDate || 'Present'
					}
				}
			}
		};
	} catch (error) {
		console.error('Error getting tier-based payout analytics:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve analytics'
			}
		};
	}
};

// NEW: Get revenue impact comparison (before vs after tier implementation)
export const getRevenueImpactComparison = async (query, user) => {
	try {
		if (!['ADMIN'].includes(user.role)) {
			throw new Error('You are not authorized to view analytics data.');
		}

		const { BorletteTicket } = await import('../borlette_ticket/model');

		// Assume tier implementation date (you can make this configurable)
		const tierImplementationDate = new Date('2024-01-01'); // Adjust as needed

		// Get statistics before tier implementation
		const beforeTierStats = await BorletteTicket.aggregate([
			{
				$match: {
					status: 'COMPLETED',
					createdAt: { $lt: tierImplementationDate }
				}
			},
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalRevenue: { $sum: '$totalAmountPlayed' },
					totalPayouts: { $sum: '$totalAmountWon' },
					avgTicketValue: { $avg: '$totalAmountPlayed' }
				}
			},
			{
				$addFields: {
					profitMargin: {
						$multiply: [
							{
								$divide: [
									{ $subtract: ['$totalRevenue', '$totalPayouts'] },
									'$totalRevenue'
								]
							},
							100
						]
					}
				}
			}
		]);

		// Get statistics after tier implementation
		const afterTierStats = await BorletteTicket.aggregate([
			{
				$match: {
					status: 'COMPLETED',
					createdAt: { $gte: tierImplementationDate }
				}
			},
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalRevenue: { $sum: '$totalAmountPlayed' },
					totalPayouts: { $sum: '$totalAmountWon' },
					avgTicketValue: { $avg: '$totalAmountPlayed' }
				}
			},
			{
				$addFields: {
					profitMargin: {
						$multiply: [
							{
								$divide: [
									{ $subtract: ['$totalRevenue', '$totalPayouts'] },
									'$totalRevenue'
								]
							},
							100
						]
					}
				}
			}
		]);

		const beforeStats = beforeTierStats[0] || {};
		const afterStats = afterTierStats[0] || {};

		// Calculate impact metrics
		const impact = {
			revenueChange: {
				absolute: (afterStats.totalRevenue || 0) - (beforeStats.totalRevenue || 0),
				percentage: beforeStats.totalRevenue
					? (((afterStats.totalRevenue || 0) - beforeStats.totalRevenue) / beforeStats.totalRevenue) * 100
					: 0
			},
			payoutChange: {
				absolute: (afterStats.totalPayouts || 0) - (beforeStats.totalPayouts || 0),
				percentage: beforeStats.totalPayouts
					? (((afterStats.totalPayouts || 0) - beforeStats.totalPayouts) / beforeStats.totalPayouts) * 100
					: 0
			},
			profitMarginChange: {
				absolute: (afterStats.profitMargin || 0) - (beforeStats.profitMargin || 0),
				beforeMargin: beforeStats.profitMargin || 0,
				afterMargin: afterStats.profitMargin || 0
			}
		};

		return {
			status: 200,
			entity: {
				success: true,
				comparison: {
					beforeTierImplementation: beforeStats,
					afterTierImplementation: afterStats,
					impact,
					implementationDate: tierImplementationDate
				}
			}
		};
	} catch (error) {
		console.error('Error getting revenue impact comparison:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve impact comparison'
			}
		};
	}
};

const deductRealCashWithPriority = (wallet, amount) => {
	let remainingAmount = amount;
	let deductedFromNonWithdrawable = 0;
	let deductedFromWithdrawable = 0;

	// First, use non-withdrawable Real Cash
	if (remainingAmount > 0 && wallet.realBalanceNonWithdrawable > 0) {
		deductedFromNonWithdrawable = Math.min(remainingAmount, wallet.realBalanceNonWithdrawable);
		wallet.realBalanceNonWithdrawable -= deductedFromNonWithdrawable;
		remainingAmount -= deductedFromNonWithdrawable;
	}

	// Then, use withdrawable Real Cash if needed
	if (remainingAmount > 0 && wallet.realBalanceWithdrawable > 0) {
		deductedFromWithdrawable = Math.min(remainingAmount, wallet.realBalanceWithdrawable);
		wallet.realBalanceWithdrawable -= deductedFromWithdrawable;
		remainingAmount -= deductedFromWithdrawable;
	}

	return {
		deductedFromNonWithdrawable,
		deductedFromWithdrawable,
		totalDeducted: deductedFromNonWithdrawable + deductedFromWithdrawable,
		remainingAmount
	};
};

const getTotalRealBalance = (wallet) => {
	return wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable;
};