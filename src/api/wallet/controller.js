import { Wallet } from './model';
import { User } from '../user/model';
import { Payment } from '../wallet/model';
import { Transaction } from '../transaction/model';
import { Withdrawal } from '../withdrawal/model';
import { BankAccount } from '../bank_account/model';
import payoneerService from '../../services/payoneer';
import { payoneerConfig } from '../../../config';

export const getUserBalance = async ({ _id }) => {
	try {
		let walletData = await Wallet.findOne({
			user: _id,
		});

		return {
			status: 200,
			entity: {
				success: true,
				walletData: walletData,
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

export const getWalletSummary = async () => {
	try {
		let virtualWalletData = await Wallet.aggregate([
			{
				$project: {
					userObjId: {
						$toObjectId: '$user',
					},
					virtualBalance: {
						$multiply: ['$virtualBalance', 1000],
					},
				},
			},
			{
				$lookup: {
					from: User.collection.name,
					localField: 'userObjId',
					foreignField: '_id',
					as: 'user_doc',
				},
			},
			{
				$unwind: '$user_doc',
			},
			{
				$group: {
					_id: '$user_doc.role',
					totalVirtualBalance: {
						$sum: '$virtualBalance',
					},
				},
			},
		]);

		let realWalletData = await Wallet.aggregate([
			{
				$project: {
					userObjId: {
						$toObjectId: '$user',
					},
					realBalance: {
						$multiply: ['$realBalance', 1000],
					},
				},
			},
			{
				$lookup: {
					from: User.collection.name,
					localField: 'userObjId',
					foreignField: '_id',
					as: 'user_doc',
				},
			},
			{
				$unwind: '$user_doc',
			},
			{
				$group: {
					_id: '$user_doc.role',
					totalRealBalance: {
						$sum: '$realBalance',
					},
				},
			},
		]);

		// Combine the results
		const combinedData = [];
		const allRoles = [
			...new Set([
				...virtualWalletData.map(item => item._id),
				...realWalletData.map(item => item._id),
			]),
		];

		allRoles.forEach(role => {
			const virtualData = virtualWalletData.find(
				item => item._id === role
			);
			const realData = realWalletData.find(item => item._id === role);

			combinedData.push({
				role,
				totalVirtualBalance: virtualData
					? virtualData.totalVirtualBalance / 1000
					: 0,
				totalRealBalance: realData
					? realData.totalRealBalance / 1000
					: 0,
			});
		});

		return {
			status: 200,
			entity: {
				success: true,
				walletData: combinedData,
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

export const initiateVirtualCashPurchase = async req => {
	try {
		const { amount } = req.body;
		const user = req.user;

		// Validate amount
		if (
			amount < payoneerConfig.minPurchaseAmount ||
			amount > payoneerConfig.maxPurchaseAmount
		) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Purchase amount must be between ${payoneerConfig.minPurchaseAmount} and ${payoneerConfig.maxPurchaseAmount}`,
				},
			};
		}

		// Create payment session with Payoneer
		const baseUrl = req.protocol + '://' + req.get('host');
		const paymentSession = await payoneerService.createPaymentSession({
			amount: amount,
			currency: 'USD',
			description: `Virtual cash purchase of ${amount}`,
			successUrl: `${baseUrl}/api/wallet/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
			cancelUrl: `${baseUrl}/api/wallet/purchase/cancel?session_id={CHECKOUT_SESSION_ID}`,
			metadata: {
				userId: user._id.toString(),
				purchaseType: 'VIRTUAL_CASH',
			},
		});

		// Record payment attempt
		await Payment.create({
			user: user._id,
			sessionId: paymentSession.id,
			amount: amount,
			currency: 'USD',
			status: 'PENDING',
			virtualCashAmount: amount,
			realCashAmount: amount * payoneerConfig.conversionRate,
			metadata: {
				userId: user._id.toString(),
				purchaseType: 'VIRTUAL_CASH',
			},
		});

		return {
			status: 200,
			entity: {
				success: true,
				paymentUrl: paymentSession.redirect_url,
				sessionId: paymentSession.id,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to initiate purchase',
			},
		};
	}
};

export const handlePurchaseSuccess = async req => {
	try {
		const { session_id } = req.query;

		// Get payment record
		const payment = await Payment.findOne({ sessionId: session_id });
		if (!payment) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Payment session not found',
				},
			};
		}

		// Verify payment with Payoneer
		const paymentSession =
			await payoneerService.getPaymentSession(session_id);

		if (paymentSession.status === 'COMPLETED') {
			const userId = payment.user;
			const purchaseAmount = payment.virtualCashAmount;
			const realCashAmount = payment.realCashAmount;

			// Get system account
			const systemAccount = await User.findOne({ role: 'SYSTEM' });

			// Update user's balances
			const userWallet = await Wallet.findOne({ user: userId });
			const previousVirtualBalance = userWallet.virtualBalance;
			const previousRealBalance = userWallet.realBalance;

			userWallet.virtualBalance += purchaseAmount;
			userWallet.realBalance += realCashAmount;
			await userWallet.save();

			// Create transaction records
			// Virtual cash credit
			await Transaction.create({
				user: userId,
				cashType: 'VIRTUAL',
				transactionType: 'CREDIT',
				transactionIdentifier: 'PURCHASE',
				transactionAmount: purchaseAmount,
				previousBalance: previousVirtualBalance,
				newBalance: userWallet.virtualBalance,
				transactionData: {
					paymentId: payment._id,
					sessionId: session_id,
				},
				status: 'COMPLETED',
			});

			// Real cash bonus
			await Transaction.create({
				user: userId,
				cashType: 'REAL',
				transactionType: 'CREDIT',
				transactionIdentifier: 'PURCHASE_BONUS',
				transactionAmount: realCashAmount,
				previousBalance: previousRealBalance,
				newBalance: userWallet.realBalance,
				transactionData: {
					paymentId: payment._id,
					sessionId: session_id,
				},
				status: 'COMPLETED',
			});

			// System account revenue record
			await Transaction.create({
				user: systemAccount._id,
				cashType: 'VIRTUAL',
				transactionType: 'CREDIT',
				transactionIdentifier: 'PURCHASE_REVENUE',
				transactionAmount: purchaseAmount,
				previousBalance: 0, // We don't track system balance this way
				newBalance: 0,
				referenceType: 'USER',
				referenceIndex: userId,
				transactionData: {
					paymentId: payment._id,
					sessionId: session_id,
				},
				status: 'COMPLETED',
			});

			// Update payment record
			payment.status = 'COMPLETED';
			payment.providerResponse = paymentSession;
			await payment.save();

			return {
				status: 200,
				entity: {
					success: true,
					message: 'Purchase completed successfully',
					virtualAmount: purchaseAmount,
					realAmount: realCashAmount,
					wallet: {
						virtualBalance: userWallet.virtualBalance,
						realBalance: userWallet.realBalance,
					},
				},
			};
		} else {
			payment.status = paymentSession.status;
			payment.providerResponse = paymentSession;
			await payment.save();

			return {
				status: 400,
				entity: {
					success: false,
					error: 'Payment not completed',
					status: paymentSession.status,
				},
			};
		}
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process payment',
			},
		};
	}
};

export const handlePurchaseCancel = async req => {
	try {
		const { session_id } = req.query;

		// Get payment record
		const payment = await Payment.findOne({ sessionId: session_id });
		if (!payment) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Payment session not found',
				},
			};
		}

		// Update payment status
		payment.status = 'CANCELLED';
		await payment.save();

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Payment cancelled',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to cancel payment',
			},
		};
	}
};

export const handlePayoneerWebhook = async req => {
	try {
		// Verify webhook signature
		const signature = req.headers['x-payoneer-signature'];
		const payload = req.body;

		if (
			!payoneerService.verifyWebhookSignature(
				JSON.stringify(payload),
				signature
			)
		) {
			return {
				status: 401,
				entity: {
					error: 'Invalid signature',
				},
			};
		}

		const { event, data } = payload;

		if (event === 'checkout.session.completed') {
			// Find the payment
			const payment = await Payment.findOne({ sessionId: data.id });
			if (!payment) {
				return {
					status: 404,
					entity: {
						error: 'Payment not found',
					},
				};
			}

			// Check if payment already processed
			if (payment.status === 'COMPLETED') {
				return {
					status: 200,
					entity: {
						message: 'Payment already processed',
						received: true,
					},
				};
			}

			const userId = payment.user;
			const purchaseAmount = payment.virtualCashAmount;
			const realCashAmount = payment.realCashAmount;

			// Get system account
			const systemAccount = await User.findOne({ role: 'SYSTEM' });
			if (!systemAccount) {
				console.error('System account not found');
				return {
					status: 500,
					entity: {
						error: 'System configuration error',
					},
				};
			}

			// Update user's balances
			const userWallet = await Wallet.findOne({ user: userId });
			if (!userWallet) {
				console.error(`Wallet not found for user ${userId}`);
				return {
					status: 404,
					entity: {
						error: 'User wallet not found',
					},
				};
			}

			const previousVirtualBalance = userWallet.virtualBalance;
			const previousRealBalance = userWallet.realBalance;

			userWallet.virtualBalance += purchaseAmount;
			userWallet.realBalance += realCashAmount;
			await userWallet.save();

			// Create transaction records
			// Virtual cash credit
			await Transaction.create({
				user: userId,
				cashType: 'VIRTUAL',
				transactionType: 'CREDIT',
				transactionIdentifier: 'PURCHASE',
				transactionAmount: purchaseAmount,
				previousBalance: previousVirtualBalance,
				newBalance: userWallet.virtualBalance,
				transactionData: {
					paymentId: payment._id,
					sessionId: data.id,
					source: 'webhook',
				},
				status: 'COMPLETED',
			});

			// Real cash bonus
			await Transaction.create({
				user: userId,
				cashType: 'REAL',
				transactionType: 'CREDIT',
				transactionIdentifier: 'PURCHASE_BONUS',
				transactionAmount: realCashAmount,
				previousBalance: previousRealBalance,
				newBalance: userWallet.realBalance,
				transactionData: {
					paymentId: payment._id,
					sessionId: data.id,
					source: 'webhook',
				},
				status: 'COMPLETED',
			});

			// System account revenue record
			await Transaction.create({
				user: systemAccount._id,
				cashType: 'VIRTUAL',
				transactionType: 'CREDIT',
				transactionIdentifier: 'PURCHASE_REVENUE',
				transactionAmount: purchaseAmount,
				previousBalance: 0, // We don't track system balance this way
				newBalance: 0,
				referenceType: 'USER',
				referenceIndex: userId,
				transactionData: {
					paymentId: payment._id,
					sessionId: data.id,
					source: 'webhook',
				},
				status: 'COMPLETED',
			});

			// Update payment record
			payment.status = 'COMPLETED';
			payment.providerResponse = data;
			payment.completedAt = new Date();
			await payment.save();

			// Log successful webhook processing
			console.log(
				`Webhook processed successfully: session ${data.id} for user ${userId}`
			);
		} else if (
			event === 'checkout.session.expired' ||
			event === 'checkout.session.canceled'
		) {
			// Handle expired or canceled sessions
			const payment = await Payment.findOne({ sessionId: data.id });
			if (payment) {
				payment.status =
					event === 'checkout.session.expired'
						? 'EXPIRED'
						: 'CANCELLED';
				payment.providerResponse = data;
				await payment.save();

				console.log(
					`Payment ${payment.status.toLowerCase()}: session ${
						data.id
					}`
				);
			}
		}

		return {
			status: 200,
			entity: {
				received: true,
			},
		};
	} catch (error) {
		console.error('Webhook processing error:', error);
		return {
			status: 500,
			entity: {
				error: error.message || 'Webhook processing failed',
			},
		};
	}
};

export const initiateRealCashWithdrawal = async req => {
	try {
		const { amount, bankAccountId } = req.body;
		const user = req.user;

		// Validate amount
		const minWithdrawalAmount = 10; // Define minimum withdrawal amount
		if (!amount || amount < minWithdrawalAmount) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Withdrawal amount must be at least ${minWithdrawalAmount}`,
				},
			};
		}

		// Check user wallet
		const wallet = await Wallet.findOne({ user: user._id });
		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Wallet not found',
				},
			};
		}

		// Verify sufficient balance
		if (wallet.realBalance < amount) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Insufficient real cash balance',
				},
			};
		}

		// Verify bank account belongs to user
		const bankAccount = await BankAccount.findOne({
			_id: bankAccountId,
			user: user._id,
		});

		if (!bankAccount) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Bank account not found or does not belong to user',
				},
			};
		}

		// Create withdrawal record
		const withdrawal = await Withdrawal.create({
			user: user._id,
			amount,
			bankAccount: bankAccountId,
			status: 'PENDING',
			requestedAt: new Date(),
			withdrawalFee: 0, // Set fees as appropriate
			netAmount: amount, // Adjust for fees if needed
		});

		// Reserve the funds (deduct from available balance)
		const previousBalance = wallet.realBalance;
		wallet.realBalance -= amount;
		wallet.pendingWithdrawals = (wallet.pendingWithdrawals || 0) + amount;
		await wallet.save();

		// Create transaction record
		await Transaction.create({
			user: user._id,
			cashType: 'REAL',
			transactionType: 'PENDING_DEBIT',
			transactionIdentifier: 'WITHDRAWAL_REQUEST',
			transactionAmount: amount,
			previousBalance,
			newBalance: wallet.realBalance,
			transactionData: {
				withdrawalId: withdrawal._id,
				bankAccount: bankAccountId,
			},
			status: 'COMPLETED',
		});

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Withdrawal request submitted successfully',
				withdrawal: {
					id: withdrawal._id,
					amount: withdrawal.amount,
					status: withdrawal.status,
					requestedAt: withdrawal.requestedAt,
				},
				wallet: {
					realBalance: wallet.realBalance,
					pendingWithdrawals: wallet.pendingWithdrawals,
				},
			},
		};
	} catch (error) {
		console.error('Withdrawal request error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to process withdrawal request',
			},
		};
	}
};
