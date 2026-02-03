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
		agent: 'Hi, you have successfully sent Gourde $amount to $creditedTo. Your wallet balance is now Gourde $walletBalance. Please contact MegaPay support.',
	},
	amountDebited: {
		user: 'Hi, $debiterName has withdrawn Gourde $amount from your account. Your wallet balance is now Gourde $walletBalance. Please contact MegaPay support.',
		agent: 'Hi, you have successfully withdrawn Gourde $amount from $debitedFrom. Your wallet balance is now Gourde $walletBalance. Please contact MegaPay support.',
	},
};

const tokenReference = {};

export const getTransactions = async (user, query) => {
	try {
		const {
			sortBy = 'createdAt',
			sortOrder = 'desc',
			offset = 0,
			limit = 10,
			cashType,
			transactionType,
			status,
			startDate,
			endDate,
		} = query;

		let params = {};

		if (user.role !== 'ADMIN') {
			params.user = user._id;
		}

		if (cashType) {
			params.cashType = cashType.toUpperCase();
		}

		if (transactionType) {
			params.transactionType = transactionType.toUpperCase();
		}

		if (status) {
			params.status = status.toUpperCase();
		}

		if (startDate && endDate) {
			params.createdAt = {
				$gte: new Date(startDate),
				$lte: new Date(endDate),
			};
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
					case 'PLAN': {
						const { Plan } = await import('../plan/model');
						let plan = await Plan.findById(
							item.referenceIndex,
							'name price'
						);
						item.referencePlan = plan;
						break;
					}
					case 'PAYMENT': {
						const { Payment } = await import('../wallet/model');
						let payment = await Payment.findById(
							item.referenceIndex,
							'amount method status'
						).populate('plan', 'name price');
						item.referencePayment = payment;
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
				
				// Add separate realAmount and virtualAmount based on cashType
				if (item.cashType === 'REAL') {
					item.realAmount = item.transactionAmount || 0;
					item.virtualAmount = 0;
				} else if (item.cashType === 'VIRTUAL') {
					item.realAmount = 0;
					item.virtualAmount = item.transactionAmount || 0;
				} else {
					// Default to virtual if cashType is not set
					item.realAmount = 0;
					item.virtualAmount = item.transactionAmount || 0;
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

export const transactionSummary = async (user, query) => {
	try {
		const {
			startDate,
			endDate,
			cashType,
			transactionType,
			status,
		} = query;

		let params = {};

		if (user.role !== 'ADMIN') {
			params.user = user._id;
		}

		if (cashType) {
			params.cashType = cashType.toUpperCase();
		}

		if (transactionType) {
			params.transactionType = transactionType.toUpperCase();
		}

		if (status) {
			params.status = status.toUpperCase();
		}

		if (startDate && endDate) {
			params.createdAt = {
				$gte: new Date(startDate),
				$lte: new Date(endDate),
			};
		}

		// Get summary statistics with separate real and virtual amounts
		const summary = await Transaction.aggregate([
			{ $match: params },
			{
				$group: {
					_id: null,
					totalTransactions: { $sum: 1 },
					totalAmount: { $sum: '$transactionAmount' },
					totalRealAmount: {
						$sum: {
							$cond: [
								{ $eq: ['$cashType', 'REAL'] },
								'$transactionAmount',
								0,
							],
						},
					},
					totalVirtualAmount: {
						$sum: {
							$cond: [
								{ $eq: ['$cashType', 'VIRTUAL'] },
								'$transactionAmount',
								0,
							],
						},
					},
					totalCredits: {
						$sum: {
							$cond: [
								{ $eq: ['$transactionType', 'CREDIT'] },
								'$transactionAmount',
								0,
							],
						},
					},
					totalCreditsReal: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ['$transactionType', 'CREDIT'] },
										{ $eq: ['$cashType', 'REAL'] },
									],
								},
								'$transactionAmount',
								0,
							],
						},
					},
					totalCreditsVirtual: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ['$transactionType', 'CREDIT'] },
										{ $eq: ['$cashType', 'VIRTUAL'] },
									],
								},
								'$transactionAmount',
								0,
							],
						},
					},
					totalDebits: {
						$sum: {
							$cond: [
								{ $eq: ['$transactionType', 'DEBIT'] },
								'$transactionAmount',
								0,
							],
						},
					},
					totalDebitsReal: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ['$transactionType', 'DEBIT'] },
										{ $eq: ['$cashType', 'REAL'] },
									],
								},
								'$transactionAmount',
								0,
							],
						},
					},
					totalDebitsVirtual: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ['$transactionType', 'DEBIT'] },
										{ $eq: ['$cashType', 'VIRTUAL'] },
									],
								},
								'$transactionAmount',
								0,
							],
						},
					},
				},
			},
		]);

		const result = summary[0] || {
			totalTransactions: 0,
			totalAmount: 0,
			totalRealAmount: 0,
			totalVirtualAmount: 0,
			totalCredits: 0,
			totalCreditsReal: 0,
			totalCreditsVirtual: 0,
			totalDebits: 0,
			totalDebitsReal: 0,
			totalDebitsVirtual: 0,
		};

		return {
			status: 200,
			entity: {
				success: true,
				summary: result,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error.message || 'Failed to get transaction summary',
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
 * @param {string} referenceIndex - Reference index
 * @param {string} cashType - 'REAL' or 'VIRTUAL'
 * @returns {Promise<number>} Amount transferred
 */
export const makeTransaction = async (
	userId,
	userRole,
	transactionIdentifier,
	transactionAmount,
	referenceIndex,
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

		if (!transactionAmount || transactionAmount <= 0) {
			throw new Error('Transaction amount must be greater than 0');
		}

		console.log(
			`Making ${transactionIdentifier} transaction for user ${userId}: ${transactionAmount} ${cashType}`
		);

		const walletData = await Wallet.findOne({
			user: userId,
		});

		if (!walletData) {
			throw new Error('User wallet not found');
		}

		// Store previous balances for transaction records
		const previousVirtualBalance = walletData.virtualBalance;
		const previousWithdrawableBalance = walletData.realBalanceWithdrawable;
		const previousNonWithdrawableBalance =
			walletData.realBalanceNonWithdrawable;

		let returnAmount = 0;

		switch (transactionIdentifier) {
			// VIRTUAL_CASH_PURCHASE and REAL_CASH_PURCHASE for payments
			case 'VIRTUAL_CASH_PURCHASE': {
				if (cashType === 'VIRTUAL') {
					walletData.virtualBalance += transactionAmount;
					await walletData.save();

					await Transaction.create({
						user: userId,
						cashType,
						referenceIndex,
						transactionType: 'CREDIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance: previousVirtualBalance,
						newBalance: walletData.virtualBalance,
						transactionData: {
							paymentId: referenceIndex,
							paymentType: transactionIdentifier,
						},
						status: 'COMPLETED',
					});
				} else {
					throw new Error(
						'Virtual cash purchase must use VIRTUAL cash type'
					);
				}
				break;
			}

			case 'REAL_CASH_PURCHASE': {
				if (cashType === 'REAL') {
					// Real cash from payments goes to non-withdrawable
					walletData.realBalanceNonWithdrawable += transactionAmount;
					await walletData.save();

					await Transaction.create({
						user: userId,
						cashType,
						referenceIndex,
						transactionType: 'CREDIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance:
							previousWithdrawableBalance +
							previousNonWithdrawableBalance,
						newBalance:
							walletData.realBalanceWithdrawable +
							walletData.realBalanceNonWithdrawable,
						transactionData: {
							paymentId: referenceIndex,
							paymentType: transactionIdentifier,
							creditedToNonWithdrawable: true,
						},
						status: 'COMPLETED',
					});
				} else {
					throw new Error(
						'Real cash purchase must use REAL cash type'
					);
				}
				break;
			}

			// PLAN_PURCHASE transactions (legacy support, but should now use VIRTUAL_CASH_PURCHASE/REAL_CASH_PURCHASE)
			case 'PLAN_PURCHASE_VIRTUAL':
			case 'PLAN_PURCHASE_REAL': {
				if (cashType === 'REAL') {
					// For plan purchases, real cash goes to non-withdrawable
					walletData.realBalanceNonWithdrawable += transactionAmount;
					await walletData.save();

					await Transaction.create({
						user: userId,
						cashType,
						referenceIndex: referenceIndex,
						transactionType: 'CREDIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance:
							previousWithdrawableBalance +
							previousNonWithdrawableBalance,
						newBalance:
							walletData.realBalanceWithdrawable +
							walletData.realBalanceNonWithdrawable,
						transactionData: {
							planId: referenceIndex,
							transactionType: 'PLAN_PURCHASE',
						},
						status: 'COMPLETED',
					});
				} else {
					// For virtual cash
					walletData.virtualBalance += transactionAmount;
					await walletData.save();

					await Transaction.create({
						user: userId,
						cashType,
						referenceIndex: referenceIndex, // This will be the plan ID
						transactionType: 'CREDIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance: previousVirtualBalance,
						newBalance: walletData.virtualBalance,
						transactionData: {
							planId: referenceIndex,
							transactionType: 'PLAN_PURCHASE',
						},
						status: 'COMPLETED',
					});
				}
				break;
			}

			// WITHDRAWAL transactions - Only allow withdrawable Real Cash
			case 'WITHDRAWAL_REQUEST':
			case 'WITHDRAWAL_PENDING': {
				if (cashType === 'REAL') {
					// Only allow withdrawal from withdrawable Real Cash
					if (
						transactionAmount > walletData.realBalanceWithdrawable
					) {
						throw new Error(
							'Insufficient withdrawable real balance.'
						);
					}

					walletData.realBalanceWithdrawable -= transactionAmount;
					if (walletData.pendingWithdrawals) {
						walletData.pendingWithdrawals += transactionAmount;
					} else {
						walletData.pendingWithdrawals = transactionAmount;
					}
				} else {
					throw new Error(
						'Withdrawals are only allowed for Real Cash'
					);
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceIndex,
					transactionType: 'DEBIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						previousWithdrawableBalance +
						previousNonWithdrawableBalance,
					newBalance:
						walletData.realBalanceWithdrawable +
						walletData.realBalanceNonWithdrawable,
					transactionData: {
						withdrawalId: referenceIndex,
						bankAccount: referenceIndex,
						deductedFromWithdrawable: transactionAmount,
					},
					status: 'PENDING',
				});

				break;
			}

			// WITHDRAWAL_COMPLETED - Finalize withdrawal
			case 'WITHDRAWAL_COMPLETED': {
				if (cashType === 'REAL') {
					if (
						walletData.pendingWithdrawals &&
						walletData.pendingWithdrawals >= transactionAmount
					) {
						walletData.pendingWithdrawals -= transactionAmount;
					}
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,

					referenceIndex,
					transactionType: 'COMPLETED_DEBIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						withdrawalId: referenceIndex,
						completionDate: new Date(),
					},
					status: 'COMPLETED',
				});

				break;
			}

			// WITHDRAWAL_REJECTED - Refund to withdrawable Real Cash
			case 'WITHDRAWAL_REJECTED': {
				if (cashType === 'REAL') {
					walletData.realBalanceWithdrawable += transactionAmount;
					if (
						walletData.pendingWithdrawals &&
						walletData.pendingWithdrawals >= transactionAmount
					) {
						walletData.pendingWithdrawals -= transactionAmount;
					}
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,

					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						withdrawalId: referenceIndex,
						refundedToWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				break;
			}

			// Game ticket purchases and entries
			case 'TICKET_BORLETTE':
			case 'TICKET_MEGAMILLION':
			case 'ROULETTE_BET':
			case 'TICKET_ROULETTE': // Alternative identifier for roulette bets
			case 'DOMINO_ENTRY': {
				if (cashType === 'REAL') {
					// Check sufficient balance
					const totalRealBalance =
						walletData.realBalanceWithdrawable +
						walletData.realBalanceNonWithdrawable;
					if (transactionAmount > totalRealBalance) {
						throw new Error('Insufficient real balance.');
					}

					// Deduct with priority (non-withdrawable first)
					const deductionResult = deductRealCashWithPriority(
						walletData,
						transactionAmount
					);

					await walletData.save();

					await Transaction.create({
						user: userId,
						cashType,

						referenceIndex: referenceIndex,
						transactionType: 'DEBIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance:
							previousWithdrawableBalance +
							previousNonWithdrawableBalance,
						newBalance:
							walletData.realBalanceWithdrawable +
							walletData.realBalanceNonWithdrawable,
						transactionData: {
							referenceIndex,
							deductedFromNonWithdrawable:
								deductionResult.deductedFromNonWithdrawable,
							deductedFromWithdrawable:
								deductionResult.deductedFromWithdrawable,
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

						referenceIndex: referenceIndex,
						transactionType: 'DEBIT',
						transactionIdentifier,
						transactionAmount,
						previousBalance: previousVirtualBalance,
						newBalance: walletData.virtualBalance,
						transactionData: {
							referenceIndex,
							gameType: transactionIdentifier
								.replace('TICKET_', '')
								.replace('_ENTRY', '')
								.replace('_BET', ''),
						},
						status: 'COMPLETED',
					});
				}

				// Process referral commission for gameplay
				try {
					const gameTypeMap = {
						TICKET_BORLETTE: 'BORLETTE',
						TICKET_MEGAMILLION: 'MEGAMILLION',
						DOMINO_ENTRY: 'DOMINOES',
						ROULETTE_BET: 'ROULETTE',
					};
					const gameType = gameTypeMap[transactionIdentifier];

					if (gameType) {
						const commissionResult =
							await LoyaltyService.processReferralCommission(
								userId,
								gameType,
								transactionAmount,
								referenceIndex
							);
						if (commissionResult.success) {
							console.log(
								`${gameType} referral commission processed: ${commissionResult.message}`
							);
						}
					}
				} catch (error) {
					console.error(
						'Error processing referral commission:',
						error
					);
				}

				// Track spending for loyalty tier requirements
				try {
					await LoyaltyService.recordUserPlayActivity(
						userId,
						transactionAmount
					);
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

					referenceIndex: referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						referenceIndex,
						gameType: transactionIdentifier.replace('WON_', ''),
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
			case 'CASHBACK': {
				if (cashType === 'REAL') {
					// Cashback goes to non-withdrawable Real Cash
					walletData.realBalanceNonWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						creditedToNonWithdrawable: cashType === 'REAL',
						loyaltyType: transactionIdentifier,
					},
					status: 'COMPLETED',
				});

				break;
			}

			// REFERRAL_COMMISSION transactions
			case 'REFERRAL_COMMISSION': {
				if (cashType === 'REAL') {
					// Referral commissions go to withdrawable Real Cash
					walletData.realBalanceWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						commissionType: 'REFERRAL',
						referenceId: referenceIndex,
						referenceIndex,
						creditedToWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				break;
			}

			// WIRE_TRANSFER transactions - Credit to non-withdrawable Real Cash
			case 'WIRE_TRANSFER':
			case 'PURCHASE': {
				if (cashType === 'REAL') {
					// Wire transfers and purchases go to non-withdrawable Real Cash
					walletData.realBalanceNonWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,
					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						paymentId: referenceIndex,
						paymentType: transactionIdentifier,
						creditedToNonWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				break;
			}

			// WITHDRAW for agents/dealers withdrawing from users
			case 'WITHDRAW': {
				if (!referenceIndex) {
					throw new Error(
						'Reference index required for withdraw transaction'
					);
				}

				const targetWalletData = await Wallet.findOne({
					user: referenceIndex,
				});

				if (!targetWalletData) {
					throw new Error('The specified user does not exist.');
				}

				// Calculate commissions (only for REAL cash)
				const adminCommission =
					cashType === 'REAL'
						? parseFloat(
								(
									config.withdrawCommissionAdmin *
									transactionAmount
								).toFixed(2)
							)
						: 0;

				const agentCommission =
					cashType === 'REAL' && userRole === 'AGENT'
						? parseFloat(
								(
									config.withdrawCommissionAgent *
									transactionAmount
								).toFixed(2)
							)
						: 0;

				const totalCommission = adminCommission + agentCommission;
				const amountAfterCommission =
					transactionAmount - totalCommission;

				if (cashType === 'REAL') {
					// Check if target user has sufficient balance
					const targetTotalBalance =
						targetWalletData.realBalanceWithdrawable +
						targetWalletData.realBalanceNonWithdrawable;
					if (transactionAmount > targetTotalBalance) {
						throw new Error(
							'Target user has insufficient real balance.'
						);
					}

					// Deduct from target user with priority
					const deductionResult = deductRealCashWithPriority(
						targetWalletData,
						transactionAmount
					);

					// Credit to withdrawing agent/dealer (goes to withdrawable)
					walletData.realBalanceWithdrawable += amountAfterCommission;
				} else {
					// For VIRTUAL cash
					if (transactionAmount > targetWalletData.virtualBalance) {
						throw new Error(
							'Target user has insufficient virtual balance.'
						);
					}
					targetWalletData.virtualBalance -= transactionAmount;
					walletData.virtualBalance += amountAfterCommission;
				}

				await targetWalletData.save();
				await walletData.save();

				// Create transaction record for the withdrawing agent/dealer
				await Transaction.create({
					user: userId,
					cashType,

					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount: amountAfterCommission,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						targetUserId: referenceIndex,
						originalAmount: transactionAmount,
						amountAfterCommission,
						adminCommission,
						agentCommission,
					},
					status: 'COMPLETED',
				});

				returnAmount = amountAfterCommission;
				break;
			}

			// Commission transactions
			case 'TICKET_BORLETTE_COMMISSION':
			case 'TICKET_MEGAMILLION_COMMISSION':
			case 'DOMINO_ENTRY_COMMISSION':
			case 'WON_DOMINO_COMMISSION': // Commission for domino winnings
			case 'ROULETTE_BET_COMMISSION':
			case 'DEPOSIT_COMMISSION':
			case 'WITHDRAW_COMMISSION': {
				if (cashType === 'REAL') {
					// Commissions go to withdrawable Real Cash
					walletData.realBalanceWithdrawable += transactionAmount;
				} else {
					walletData.virtualBalance += transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,

					referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						commissionType: transactionIdentifier,
						referenceId: referenceIndex,
					},
					status: 'COMPLETED',
				});

				break;
			}

			// Commission reversal transactions - Debit commission when operations are cancelled
			case 'TICKET_BORLETTE_COMMISSION_CANCELLED':
			case 'TICKET_MEGAMILLION_COMMISSION_CANCELLED':
			case 'DOMINO_REFUND_COMMISSION': {
				if (cashType === 'REAL') {
					// Check if agent has sufficient withdrawable balance for commission reversal
					if (
						transactionAmount > walletData.realBalanceWithdrawable
					) {
						throw new Error(
							'Insufficient withdrawable balance for commission reversal.'
						);
					}

					// Deduct commission from withdrawable Real Cash
					walletData.realBalanceWithdrawable -= transactionAmount;
				} else {
					// For VIRTUAL cash (rare case)
					if (transactionAmount > walletData.virtualBalance) {
						throw new Error(
							'Insufficient virtual balance for commission reversal.'
						);
					}
					walletData.virtualBalance -= transactionAmount;
				}

				await walletData.save();

				await Transaction.create({
					user: userId,
					cashType,

					referenceIndex,
					transactionType: 'DEBIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						commissionType: 'REVERSAL',
						originalCommissionType: transactionIdentifier
							.replace('_CANCELLED', '')
							.replace('_REFUND', ''),
						referenceId: referenceIndex,
						reason: 'Commission reversed due to cancellation/refund',
					},
					status: 'COMPLETED',
				});

				break;
			}

			// Handle cancelled/refund transactions
			case 'TICKET_BORLETTE_CANCELLED':
			case 'TICKET_MEGAMILLION_CANCELLED':
			case 'ROULETTE_BET_CANCELLED':
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

					referenceIndex: referenceIndex,
					transactionType: 'CREDIT',
					transactionIdentifier,
					transactionAmount,
					previousBalance:
						cashType === 'REAL'
							? previousWithdrawableBalance +
								previousNonWithdrawableBalance
							: previousVirtualBalance,
					newBalance:
						cashType === 'REAL'
							? walletData.realBalanceWithdrawable +
								walletData.realBalanceNonWithdrawable
							: walletData.virtualBalance,
					transactionData: {
						referenceIndex,
						refundReason: transactionIdentifier,
						refundedToNonWithdrawable: cashType === 'REAL',
					},
					status: 'COMPLETED',
				});

				break;
			}

			default:
				throw new Error(
					`Unknown transaction identifier: ${transactionIdentifier}`
				);
		}

		console.log(
			`Transaction ${transactionIdentifier} completed successfully for user ${userId}`
		);
		return returnAmount;
	} catch (error) {
		console.error(`Transaction error for ${transactionIdentifier}:`, error);
		throw error;
	}
};

export const initiateTransaction = async (user, body) => {
	try {
		const { userId, amount, amountType = 'VIRTUAL', transactionType } = body;

		// Validate inputs
		if (!userId || !amount || amount <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Valid userId and amount are required',
				},
			};
		}

		// Validate amountType
		const cashType = amountType.toUpperCase();
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'amountType must be REAL or VIRTUAL',
				},
			};
		}

		// Determine transaction identifier based on transactionType
		let transactionIdentifier = 'DEPOSIT';
		if (transactionType) {
			transactionIdentifier = transactionType.toUpperCase();
		}

		// For withdrawals, ensure only REAL cash type
		if (transactionIdentifier.includes('WITHDRAW') && cashType !== 'REAL') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Withdrawals are only allowed for REAL cash type',
				},
			};
		}

		// Create transaction record (actual processing happens in processTransaction)
		const transaction = await Transaction.create({
			user: userId,
			cashType,
			transactionType: transactionIdentifier.includes('WITHDRAW') ? 'DEBIT' : 'CREDIT',
			transactionIdentifier,
			transactionAmount: amount,
			status: 'PENDING',
			referenceIndex: user._id.toString(),
		});

		return {
			status: 200,
			entity: {
				success: true,
				transaction: {
					id: transaction._id,
					userId,
					amount,
					realAmount: cashType === 'REAL' ? amount : 0,
					virtualAmount: cashType === 'VIRTUAL' ? amount : 0,
					amountType: cashType,
					transactionType: transactionIdentifier,
					status: 'PENDING',
				},
				message: 'Transaction initiated successfully',
			},
		};
	} catch (error) {
		console.error('Initiate transaction error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to initiate transaction',
			},
		};
	}
};

export const processTransaction = async (user, body) => {
	try {
		const { transactionId, userId, amount, amountType = 'VIRTUAL' } = body;

		// Validate inputs
		if (!transactionId && (!userId || !amount)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Either transactionId or userId and amount are required',
				},
			};
		}

		const cashType = amountType.toUpperCase();
		if (!['REAL', 'VIRTUAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'amountType must be REAL or VIRTUAL',
				},
			};
		}

		let targetUserId = userId;
		let transactionAmount = amount;
		let transactionIdentifier = 'DEPOSIT';

		// If transactionId is provided, fetch the transaction
		if (transactionId) {
			const transaction = await Transaction.findById(transactionId);
			if (!transaction) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'Transaction not found',
					},
				};
			}

			if (transaction.status !== 'PENDING') {
				return {
					status: 400,
					entity: {
						success: false,
						error: `Transaction is already ${transaction.status.toLowerCase()}`,
					},
				};
			}

			targetUserId = transaction.user.toString();
			transactionAmount = transaction.transactionAmount;
			transactionIdentifier = transaction.transactionIdentifier;
		}

		// Process the transaction using makeTransaction
		await makeTransaction(
			targetUserId,
			user.role,
			transactionIdentifier,
			transactionAmount,
			transactionId || user._id.toString(),
			cashType
		);

		// Update transaction status if transactionId was provided
		if (transactionId) {
			await Transaction.findByIdAndUpdate(transactionId, {
				status: 'COMPLETED',
			});
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Transaction processed successfully',
				transaction: {
					userId: targetUserId,
					amount: transactionAmount,
					realAmount: cashType === 'REAL' ? transactionAmount : 0,
					virtualAmount: cashType === 'VIRTUAL' ? transactionAmount : 0,
					amountType: cashType,
				},
			},
		};
	} catch (error) {
		console.error('Process transaction error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process transaction',
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

const deductRealCashWithPriority = (wallet, amount) => {
	let remaining = amount;
	let deductedFromNonWithdrawable = 0;
	let deductedFromWithdrawable = 0;

	// First, deduct from non-withdrawable
	if (remaining > 0 && wallet.realBalanceNonWithdrawable > 0) {
		deductedFromNonWithdrawable = Math.min(
			remaining,
			wallet.realBalanceNonWithdrawable
		);
		wallet.realBalanceNonWithdrawable -= deductedFromNonWithdrawable;
		remaining -= deductedFromNonWithdrawable;
	}

	// Then, deduct from withdrawable
	if (remaining > 0 && wallet.realBalanceWithdrawable > 0) {
		deductedFromWithdrawable = Math.min(
			remaining,
			wallet.realBalanceWithdrawable
		);
		wallet.realBalanceWithdrawable -= deductedFromWithdrawable;
		remaining -= deductedFromWithdrawable;
	}

	return {
		deductedFromNonWithdrawable,
		deductedFromWithdrawable,
		totalDeducted: deductedFromNonWithdrawable + deductedFromWithdrawable,
		remaining,
	};
};

const getTotalRealBalance = wallet => {
	return wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable;
};
