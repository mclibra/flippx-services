import moment from 'moment';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';
import { Transaction } from '../transaction/model';
import { BorletteTicket } from '../borlette_ticket/model';
import { MegaMillionTicket } from '../megamillion_ticket/model';
import { BankAccount } from '../bank_account/model';
import { Withdrawal } from '../withdrawal/model';
import { Payment } from '../wallet/model';
import { State } from '../state/model';
import { Lottery } from '../lottery/model';

export const getDashboardOverview = async (_, { role }) => {
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

		// Get user counts by role
		const userCounts = await User.aggregate([
			{
				$match: {
					role: { $nin: ['ADMIN', 'SYSTEM'] }
				}
			},
			{
				$group: {
					_id: '$role',
					count: { $sum: 1 },
				},
			},
		]);

		// Get cash balances by user role
		const walletSummary = await Wallet.aggregate([
			{
				$lookup: {
					from: 'users',
					localField: 'user',
					foreignField: '_id',
					as: 'user_data',
				},
			},
			{
				$unwind: '$user_data',
			},
			{
				$group: {
					_id: '$user_data.role',
					totalVirtualBalance: { $sum: '$virtualBalance' },
					totalRealBalance: { $sum: '$realBalance' },
					userCount: { $sum: 1 },
				},
			},
		]);

		// Get game statistics
		const currentDate = moment();
		const startOfDay = moment(currentDate).startOf('day').valueOf();
		const endOfDay = moment(currentDate).endOf('day').valueOf();

		// Get today's transactions
		const todayTransactions = await Transaction.find({
			createdAt: {
				$gte: new Date(startOfDay),
				$lte: new Date(endOfDay),
			},
		}).count();

		// Get today's tickets
		const todayBorletteTickets = await BorletteTicket.find({
			purchasedOn: {
				$gte: startOfDay,
				$lte: endOfDay,
			},
		}).count();

		const todayMegaMillionTickets = await MegaMillionTicket.find({
			purchasedOn: {
				$gte: startOfDay,
				$lte: endOfDay,
			},
		}).count();

		// Get withdrawal statistics
		const withdrawalStats = await Withdrawal.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
				},
			},
		]);

		// Get payment statistics
		const paymentStats = await Payment.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
					totalVirtualCash: { $sum: '$virtualCashAmount' },
					totalRealCash: { $sum: '$realCashAmount' },
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				userCounts,
				walletSummary,
				transactionStats: {
					today: todayTransactions,
				},
				ticketStats: {
					today: {
						borlette: todayBorletteTickets,
						megaMillion: todayMegaMillionTickets,
						total: todayBorletteTickets + todayMegaMillionTickets,
					},
				},
				withdrawalStats,
				paymentStats,
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

export const getFinancialSummary = async ({ period = 'month' }, { role }) => {
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

		const currentDate = moment();
		let startDate;

		switch (period) {
			case 'week':
				startDate = moment(currentDate)
					.subtract(7, 'days')
					.startOf('day');
				break;
			case 'month':
				startDate = moment(currentDate)
					.subtract(30, 'days')
					.startOf('day');
				break;
			case 'quarter':
				startDate = moment(currentDate)
					.subtract(90, 'days')
					.startOf('day');
				break;
			case 'year':
				startDate = moment(currentDate)
					.subtract(365, 'days')
					.startOf('day');
				break;
			default:
				startDate = moment(currentDate)
					.subtract(30, 'days')
					.startOf('day');
		}

		// Get daily transactions for the period
		const dailyTransactions = await Transaction.aggregate([
			{
				$match: {
					createdAt: {
						$gte: startDate.toDate(),
						$lte: currentDate.toDate(),
					},
				},
			},
			{
				$group: {
					_id: {
						date: {
							$dateToString: {
								format: '%Y-%m-%d',
								date: '$createdAt',
							},
						},
						cashType: '$cashType',
						transactionType: '$transactionType',
					},
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
			{
				$sort: {
					'_id.date': 1,
				},
			},
		]);

		// Get payment data for the period
		const paymentData = await Payment.aggregate([
			{
				$match: {
					createdAt: {
						$gte: startDate.toDate(),
						$lte: currentDate.toDate(),
					},
					status: 'COMPLETED',
				},
			},
			{
				$group: {
					_id: {
						date: {
							$dateToString: {
								format: '%Y-%m-%d',
								date: '$createdAt',
							},
						},
					},
					totalAmount: { $sum: '$amount' },
					totalVirtualCash: { $sum: '$virtualCashAmount' },
					totalRealCash: { $sum: '$realCashAmount' },
					count: { $sum: 1 },
				},
			},
			{
				$sort: {
					'_id.date': 1,
				},
			},
		]);

		// Get withdrawal data for the period
		const withdrawalData = await Withdrawal.aggregate([
			{
				$match: {
					createdAt: {
						$gte: startDate.toDate(),
						$lte: currentDate.toDate(),
					},
				},
			},
			{
				$group: {
					_id: {
						date: {
							$dateToString: {
								format: '%Y-%m-%d',
								date: '$createdAt',
							},
						},
						status: '$status',
					},
					totalAmount: { $sum: '$amount' },
					count: { $sum: 1 },
				},
			},
			{
				$sort: {
					'_id.date': 1,
				},
			},
		]);

		// Get ticket data by cash type
		const ticketData = await Promise.all([
			BorletteTicket.aggregate([
				{
					$match: {
						purchasedOn: {
							$gte: startDate.valueOf(),
							$lte: currentDate.valueOf(),
						},
					},
				},
				{
					$group: {
						_id: {
							date: {
								$dateToString: {
									format: '%Y-%m-%d',
									date: {
										$toDate: {
											$multiply: ['$purchasedOn', 1],
										},
									},
								},
							},
							cashType: '$cashType',
						},
						totalAmount: { $sum: '$totalAmountPlayed' },
						totalWinnings: { $sum: '$totalAmountWon' },
						count: { $sum: 1 },
					},
				},
				{
					$sort: {
						'_id.date': 1,
					},
				},
			]),
			MegaMillionTicket.aggregate([
				{
					$match: {
						purchasedOn: {
							$gte: startDate.valueOf(),
							$lte: currentDate.valueOf(),
						},
					},
				},
				{
					$group: {
						_id: {
							date: {
								$dateToString: {
									format: '%Y-%m-%d',
									date: {
										$toDate: {
											$multiply: ['$purchasedOn', 1],
										},
									},
								},
							},
							cashType: '$cashType',
						},
						totalAmount: { $sum: '$amountPlayed' },
						totalWinnings: { $sum: '$amountWon' },
						count: { $sum: 1 },
					},
				},
				{
					$sort: {
						'_id.date': 1,
					},
				},
			]),
		]);

		return {
			status: 200,
			entity: {
				success: true,
				period,
				dailyTransactions,
				paymentData,
				withdrawalData,
				ticketData: {
					borlette: ticketData[0],
					megaMillion: ticketData[1],
				},
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

export const getSystemAccountActivity = async (
	{ period = 'week', limit = 50, offset = 0 },
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

		const currentDate = moment();
		let startDate;

		switch (period) {
			case 'day':
				startDate = moment(currentDate)
					.subtract(1, 'days')
					.startOf('day');
				break;
			case 'week':
				startDate = moment(currentDate)
					.subtract(7, 'days')
					.startOf('day');
				break;
			case 'month':
				startDate = moment(currentDate)
					.subtract(30, 'days')
					.startOf('day');
				break;
			default:
				startDate = moment(currentDate)
					.subtract(7, 'days')
					.startOf('day');
		}

		// Get system account transactions
		const systemTransactions = await Transaction.find({
			referenceType: 'SYSTEM',
			createdAt: {
				$gte: startDate.toDate(),
				$lte: currentDate.toDate(),
			},
		})
			.sort({ createdAt: -1 })
			.skip(parseInt(offset))
			.limit(parseInt(limit))
			.lean();

		// Get summary stats
		const systemTransactionStats = await Transaction.aggregate([
			{
				$match: {
					referenceType: 'SYSTEM',
					createdAt: {
						$gte: startDate.toDate(),
						$lte: currentDate.toDate(),
					},
				},
			},
			{
				$group: {
					_id: {
						cashType: '$cashType',
						transactionType: '$transactionType',
						transactionIdentifier: '$transactionIdentifier',
					},
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
		]);

		const total = await Transaction.count({
			referenceType: 'SYSTEM',
			createdAt: {
				$gte: startDate.toDate(),
				$lte: currentDate.toDate(),
			},
		});

		return {
			status: 200,
			entity: {
				success: true,
				systemTransactions,
				systemTransactionStats,
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

export const getWithdrawalDashboard = async (
	{ status, startDate, endDate, limit = 50, offset = 0 },
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

		let query = {};

		if (status) {
			query.status = status.toUpperCase();
		}

		if (startDate || endDate) {
			query.createdAt = {};
			if (startDate) {
				query.createdAt.$gte = new Date(parseInt(startDate));
			}
			if (endDate) {
				query.createdAt.$lte = new Date(parseInt(endDate));
			}
		}

		// Get withdrawals
		const withdrawals = await Withdrawal.find(query)
			.populate('user', 'name email phone')
			.populate('bankAccount')
			.sort({ createdAt: -1 })
			.skip(parseInt(offset))
			.limit(parseInt(limit))
			.lean();

		// Get withdrawal statistics
		const withdrawalStats = await Withdrawal.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
				},
			},
		]);

		const pendingAmount = await Withdrawal.aggregate([
			{
				$match: { status: 'PENDING' },
			},
			{
				$group: {
					_id: null,
					totalAmount: { $sum: '$amount' },
					count: { $sum: 1 },
				},
			},
		]);

		const total = await Withdrawal.count(query);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawals,
				withdrawalStats,
				pendingAmount:
					pendingAmount.length > 0
						? pendingAmount[0]
						: { totalAmount: 0, count: 0 },
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

export const getUserCashManagement = async (
	{ role: userRole, query, limit = 50, offset = 0 },
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

		let userQuery = {};

		if (userRole) {
			userQuery.role = userRole.toUpperCase();
		}

		if (query) {
			userQuery['$or'] = [
				{ 'name.firstName': new RegExp(query, 'i') },
				{ 'name.lastName': new RegExp(query, 'i') },
				{ email: new RegExp(query, 'i') },
				{ phone: new RegExp(query, 'i') },
			];
		}

		// Get users with wallet data
		const users = await User.find(userQuery)
			.sort({ createdAt: -1 })
			.skip(parseInt(offset))
			.limit(parseInt(limit))
			.lean();

		const userIds = users.map(user => user._id.toString());

		// Get wallets for these users
		const wallets = await Wallet.find({
			user: { $in: userIds },
		}).lean();

		// Get bank accounts for these users
		const bankAccounts = await BankAccount.find({
			user: { $in: userIds },
		}).lean();

		// Get user transaction counts
		const transactionCounts = await Transaction.aggregate([
			{
				$match: {
					user: { $in: userIds },
				},
			},
			{
				$group: {
					_id: '$user',
					count: { $sum: 1 },
				},
			},
		]);

		// Prepare response data
		const usersWithData = users.map(user => {
			const userWallet = wallets.find(
				w => w.user.toString() === user._id.toString()
			) || {
				virtualBalance: 0,
				realBalance: 0,
			};

			const userBankAccounts = bankAccounts.filter(
				ba => ba.user.toString() === user._id.toString()
			);

			const transactionCount = transactionCounts.find(
				tc => tc._id.toString() === user._id.toString()
			);

			return {
				...user,
				wallet: {
					virtualBalance: userWallet.virtualBalance,
					realBalance: userWallet.realBalance,
				},
				bankAccounts: userBankAccounts.map(ba => ({
					id: ba._id,
					bankName: ba.bankName,
					maskedAccountNumber: '****' + ba.accountNumber.slice(-4),
					accountType: ba.accountType,
					isDefault: ba.isDefault,
				})),
				transactionCount: transactionCount ? transactionCount.count : 0,
			};
		});

		const total = await User.count(userQuery);

		return {
			status: 200,
			entity: {
				success: true,
				users: usersWithData,
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

export const getGameStatisticsByCashType = async (
	{ startDate, endDate, stateId },
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

		let dateQuery = {};
		if (startDate || endDate) {
			if (startDate) {
				dateQuery.$gte = parseInt(startDate);
			}
			if (endDate) {
				dateQuery.$lte = parseInt(endDate);
			}
		}

		// Get all lotteries if stateId is provided
		let lotteryQuery = {};
		if (stateId) {
			lotteryQuery.state = stateId;
		}

		// Get state if provided
		let state = null;
		if (stateId) {
			state = await State.findById(stateId);
		}

		// Get lotteries
		const lotteries = stateId
			? await Lottery.find(lotteryQuery).lean()
			: [];
		const lotteryIds = lotteries.map(lottery => lottery._id.toString());

		// Prepare ticket queries
		let borletteQuery = {};
		let megaMillionQuery = {};

		if (dateQuery.$gte || dateQuery.$lte) {
			borletteQuery.purchasedOn = dateQuery;
			megaMillionQuery.purchasedOn = dateQuery;
		}

		if (stateId && lotteryIds.length > 0) {
			borletteQuery.lottery = { $in: lotteryIds };
			megaMillionQuery.lottery = { $in: lotteryIds };
		}

		// Get Borlette ticket stats by cash type
		const borletteStats = await BorletteTicket.aggregate([
			{
				$match: borletteQuery,
			},
			{
				$group: {
					_id: '$cashType',
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: { $sum: '$totalAmountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		// Get MegaMillion ticket stats by cash type
		const megaMillionStats = await MegaMillionTicket.aggregate([
			{
				$match: megaMillionQuery,
			},
			{
				$group: {
					_id: '$cashType',
					totalAmountPlayed: { $sum: '$amountPlayed' },
					totalAmountWon: { $sum: '$amountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		// Format default stats if empty
		const formatStats = stats => {
			const virtualStats = stats.find(s => s._id === 'VIRTUAL') || {
				_id: 'VIRTUAL',
				totalAmountPlayed: 0,
				totalAmountWon: 0,
				ticketCount: 0,
			};

			const realStats = stats.find(s => s._id === 'REAL') || {
				_id: 'REAL',
				totalAmountPlayed: 0,
				totalAmountWon: 0,
				ticketCount: 0,
			};

			return { virtual: virtualStats, real: realStats };
		};

		return {
			status: 200,
			entity: {
				success: true,
				state: state,
				borlette: formatStats(borletteStats),
				megaMillion: formatStats(megaMillionStats),
				timeRange: {
					startDate: startDate ? new Date(parseInt(startDate)) : null,
					endDate: endDate ? new Date(parseInt(endDate)) : null,
				},
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

// USER Dashboard
export const getUserDashboard = async ({ _id }) => {
	try {
		// Get user's wallet
		const wallet = await Wallet.findOne({ user: _id });

		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Wallet not found',
				},
			};
		}

		// Get recent transactions
		const recentTransactions = await Transaction.find({ user: _id })
			.sort({ createdAt: -1 })
			.limit(10)
			.lean();

		// Get active tickets
		const activeTickets = await Promise.all([
			BorletteTicket.find({
				user: _id,
				status: 'ACTIVE',
			})
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.limit(5)
				.sort({ purchasedOn: -1 })
				.lean(),

			MegaMillionTicket.find({
				user: _id,
				status: 'ACTIVE',
			})
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.limit(5)
				.sort({ purchasedOn: -1 })
				.lean(),
		]);

		// Get recent winning tickets
		const recentWinningTickets = await Promise.all([
			BorletteTicket.find({
				user: _id,
				status: 'COMPLETED',
				totalAmountWon: { $gt: 0 },
			})
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.limit(5)
				.sort({ purchasedOn: -1 })
				.lean(),

			MegaMillionTicket.find({
				user: _id,
				status: 'COMPLETED',
				amountWon: { $gt: 0 },
			})
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.limit(5)
				.sort({ purchasedOn: -1 })
				.lean(),
		]);

		// Get withdrawal status
		const pendingWithdrawals = await Withdrawal.find({
			user: _id,
			status: { $in: ['PENDING', 'APPROVED', 'PROCESSING'] },
		})
			.populate('bankAccount')
			.sort({ createdAt: -1 })
			.lean();

		// Get bank accounts
		const bankAccounts = await BankAccount.find({
			user: _id,
		})
			.sort({ isDefault: -1 })
			.lean();

		// Get next upcoming lotteries
		const upcomingLotteries = await Lottery.find({
			status: 'SCHEDULED',
			scheduledTime: { $gt: moment.now() },
		})
			.populate('state', 'name code')
			.sort({ scheduledTime: 1 })
			.limit(3)
			.lean();

		return {
			status: 200,
			entity: {
				success: true,
				wallet: {
					virtualBalance: wallet.virtualBalance,
					realBalance: wallet.realBalance,
				},
				recentTransactions,
				activeTickets: {
					borlette: activeTickets[0],
					megaMillion: activeTickets[1],
				},
				recentWinningTickets: {
					borlette: recentWinningTickets[0],
					megaMillion: recentWinningTickets[1],
				},
				pendingWithdrawals,
				bankAccounts: bankAccounts.map(account => ({
					id: account._id,
					bankName: account.bankName,
					maskedAccountNumber: account.maskedAccountNumber,
					accountType: account.accountType,
					isDefault: account.isDefault,
					isVerified: account.isVerified,
				})),
				upcomingLotteries: upcomingLotteries.map(lottery => ({
					id: lottery._id,
					title: lottery.title,
					type: lottery.type,
					scheduledTime: lottery.scheduledTime,
					state: lottery.state,
					countdown: lottery.scheduledTime - moment.now(),
				})),
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

// AGENT Dashboard
export const getAgentDashboard = async ({ _id, role }) => {
	try {
		if (role !== 'AGENT') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		// Get agent's wallet
		const wallet = await Wallet.findOne({ user: _id });

		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Wallet not found',
				},
			};
		}

		// Get today's sales data
		const today = moment().startOf('day');
		const tomorrow = moment(today).add(1, 'days');

		const todaySales = await Promise.all([
			BorletteTicket.aggregate([
				{
					$match: {
						user: _id.toString(),
						purchasedOn: {
							$gte: today.valueOf(),
							$lt: tomorrow.valueOf(),
						},
					},
				},
				{
					$group: {
						_id: '$cashType',
						totalAmount: { $sum: '$totalAmountPlayed' },
						ticketCount: { $sum: 1 },
					},
				},
			]),

			MegaMillionTicket.aggregate([
				{
					$match: {
						user: _id.toString(),
						purchasedOn: {
							$gte: today.valueOf(),
							$lt: tomorrow.valueOf(),
						},
					},
				},
				{
					$group: {
						_id: '$cashType',
						totalAmount: { $sum: '$amountPlayed' },
						ticketCount: { $sum: 1 },
					},
				},
			]),
		]);

		// Get monthly commission data
		const startOfMonth = moment().startOf('month');
		const endOfMonth = moment().endOf('month');

		const monthlyCommissions = await Transaction.aggregate([
			{
				$match: {
					user: _id.toString(),
					transactionIdentifier: {
						$in: [
							'TICKET_BORLETTE_COMMISSION',
							'TICKET_MEGAMILLION_COMMISSION',
							'DEPOSIT_COMMISSION',
							'WITHDRAW_COMMISSION',
						],
					},
					transactionType: 'CREDIT',
					createdAt: {
						$gte: startOfMonth.toDate(),
						$lte: endOfMonth.toDate(),
					},
				},
			},
			{
				$group: {
					_id: '$transactionIdentifier',
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
		]);

		// Get recent user transactions (deposits/withdrawals)
		const recentUserTransactions = await Transaction.find({
			user: _id.toString(),
			transactionIdentifier: { $in: ['DEPOSIT', 'WITHDRAW'] },
		})
			.sort({ createdAt: -1 })
			.limit(10)
			.lean();

		// Get recent winning tickets created by agent
		const recentWinningTickets = await Promise.all([
			BorletteTicket.find({
				user: _id.toString(),
				status: 'COMPLETED',
				totalAmountWon: { $gt: 0 },
			})
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.populate('user', 'name phone')
				.limit(5)
				.sort({ purchasedOn: -1 })
				.lean(),

			MegaMillionTicket.find({
				user: _id.toString(),
				status: 'COMPLETED',
				amountWon: { $gt: 0 },
			})
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.populate('user', 'name phone')
				.limit(5)
				.sort({ purchasedOn: -1 })
				.lean(),
		]);

		// Get pending withdrawals
		const pendingWithdrawals = await Withdrawal.find({
			user: _id.toString(),
			status: { $in: ['PENDING', 'APPROVED', 'PROCESSING'] },
		})
			.populate('bankAccount')
			.sort({ createdAt: -1 })
			.lean();

		// Get upcoming lotteries
		const upcomingLotteries = await Lottery.find({
			status: 'SCHEDULED',
			scheduledTime: { $gt: moment.now() },
		})
			.populate('state', 'name code')
			.sort({ scheduledTime: 1 })
			.limit(5)
			.lean();

		return {
			status: 200,
			entity: {
				success: true,
				wallet: {
					virtualBalance: wallet.virtualBalance,
					realBalance: wallet.realBalance,
				},
				todaySales: {
					borlette: {
						virtual: todaySales[0].find(
							s => s._id === 'VIRTUAL'
						) || { totalAmount: 0, ticketCount: 0 },
						real: todaySales[0].find(s => s._id === 'REAL') || {
							totalAmount: 0,
							ticketCount: 0,
						},
					},
					megaMillion: {
						virtual: todaySales[1].find(
							s => s._id === 'VIRTUAL'
						) || { totalAmount: 0, ticketCount: 0 },
						real: todaySales[1].find(s => s._id === 'REAL') || {
							totalAmount: 0,
							ticketCount: 0,
						},
					},
				},
				monthlyCommissions,
				recentUserTransactions,
				recentWinningTickets: {
					borlette: recentWinningTickets[0],
					megaMillion: recentWinningTickets[1],
				},
				pendingWithdrawals,
				upcomingLotteries: upcomingLotteries.map(lottery => ({
					id: lottery._id,
					title: lottery.title,
					type: lottery.type,
					scheduledTime: lottery.scheduledTime,
					state: lottery.state,
					countdown: lottery.scheduledTime - moment.now(),
				})),
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

// DEALER Dashboard
export const getDealerDashboard = async ({ _id, role }) => {
	try {
		if (role !== 'DEALER') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		// Get dealer's wallet
		const wallet = await Wallet.findOne({ user: _id });

		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Wallet not found',
				},
			};
		}

		// Get agents under this dealer (assuming there's a way to identify them)
		// This requires a way to identify dealer-agent relationships
		// Here I'll assume agents have a 'dealer' field in their user document
		const agents = await User.find({
			role: 'AGENT',
			dealer: _id.toString(),
		})
			.select('_id name phone email')
			.lean();

		const agentIds = agents.map(agent => agent._id.toString());

		// Get agent wallets
		const agentWallets = await Wallet.find({
			user: { $in: agentIds },
		}).lean();

		// Get today's sales by agent
		const today = moment().startOf('day');
		const tomorrow = moment(today).add(1, 'days');

		const agentSalesPromises = agentIds.map(agentId => {
			return Promise.all([
				BorletteTicket.aggregate([
					{
						$match: {
							user: agentId,
							purchasedOn: {
								$gte: today.valueOf(),
								$lt: tomorrow.valueOf(),
							},
						},
					},
					{
						$group: {
							_id: '$cashType',
							totalAmount: { $sum: '$totalAmountPlayed' },
							ticketCount: { $sum: 1 },
						},
					},
				]),

				MegaMillionTicket.aggregate([
					{
						$match: {
							user: agentId,
							purchasedOn: {
								$gte: today.valueOf(),
								$lt: tomorrow.valueOf(),
							},
						},
					},
					{
						$group: {
							_id: '$cashType',
							totalAmount: { $sum: '$amountPlayed' },
							ticketCount: { $sum: 1 },
						},
					},
				]),
			]);
		});

		const agentSalesResults = await Promise.all(agentSalesPromises);

		// Monthly commission data
		const startOfMonth = moment().startOf('month');
		const endOfMonth = moment().endOf('month');

		const monthlyCommissions = await Transaction.aggregate([
			{
				$match: {
					user: _id.toString(),
					transactionIdentifier: {
						$in: [
							'TICKET_BORLETTE_COMMISSION',
							'TICKET_MEGAMILLION_COMMISSION',
							'DEPOSIT_COMMISSION',
							'WITHDRAW_COMMISSION',
						],
					},
					transactionType: 'CREDIT',
					createdAt: {
						$gte: startOfMonth.toDate(),
						$lte: endOfMonth.toDate(),
					},
				},
			},
			{
				$group: {
					_id: '$transactionIdentifier',
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
		]);

		// Get regional statistics (if dealer is associated with a region/state)
		// This requires a way to identify dealer-region relationships
		// Assuming dealer has a 'state' field
		const dealer = await User.findById(_id).select('state').lean();
		let regionalStats = null;

		if (dealer && dealer.state) {
			const lotteries = await Lottery.find({
				state: dealer.state,
			}).lean();
			const lotteryIds = lotteries.map(lottery => lottery._id.toString());

			// Get statistics for these lotteries
			const borletteStats = await BorletteTicket.aggregate([
				{
					$match: {
						lottery: { $in: lotteryIds },
						status: { $ne: 'CANCELLED' },
					},
				},
				{
					$group: {
						_id: '$cashType',
						totalAmountPlayed: { $sum: '$totalAmountPlayed' },
						totalAmountWon: { $sum: '$totalAmountWon' },
						ticketCount: { $sum: 1 },
					},
				},
			]);

			const megaMillionStats = await MegaMillionTicket.aggregate([
				{
					$match: {
						lottery: { $in: lotteryIds },
						status: { $ne: 'CANCELLED' },
					},
				},
				{
					$group: {
						_id: '$cashType',
						totalAmountPlayed: { $sum: '$amountPlayed' },
						totalAmountWon: { $sum: '$amountWon' },
						ticketCount: { $sum: 1 },
					},
				},
			]);

			regionalStats = {
				state: await State.findById(dealer.state)
					.select('name code')
					.lean(),
				borlette: {
					virtual: borletteStats.find(s => s._id === 'VIRTUAL') || {
						totalAmountPlayed: 0,
						totalAmountWon: 0,
						ticketCount: 0,
					},
					real: borletteStats.find(s => s._id === 'REAL') || {
						totalAmountPlayed: 0,
						totalAmountWon: 0,
						ticketCount: 0,
					},
				},
				megaMillion: {
					virtual: megaMillionStats.find(
						s => s._id === 'VIRTUAL'
					) || {
						totalAmountPlayed: 0,
						totalAmountWon: 0,
						ticketCount: 0,
					},
					real: megaMillionStats.find(s => s._id === 'REAL') || {
						totalAmountPlayed: 0,
						totalAmountWon: 0,
						ticketCount: 0,
					},
				},
			};
		}

		// Get pending withdrawals
		const pendingWithdrawals = await Withdrawal.find({
			user: _id.toString(),
			status: { $in: ['PENDING', 'APPROVED', 'PROCESSING'] },
		})
			.populate('bankAccount')
			.sort({ createdAt: -1 })
			.lean();

		return {
			status: 200,
			entity: {
				success: true,
				wallet: {
					virtualBalance: wallet.virtualBalance,
					realBalance: wallet.realBalance,
				},
				agents: agents.map((agent, index) => {
					const agentWallet = agentWallets.find(
						w => w.user.toString() === agent._id.toString()
					);
					const agentSales = agentSalesResults[index];

					return {
						...agent,
						wallet: agentWallet
							? {
								virtualBalance: agentWallet.virtualBalance,
								realBalance: agentWallet.realBalance,
							}
							: { virtualBalance: 0, realBalance: 0 },
						todaySales: {
							borlette: {
								virtual: agentSales[0].find(
									s => s._id === 'VIRTUAL'
								) || { totalAmount: 0, ticketCount: 0 },
								real: agentSales[0].find(
									s => s._id === 'REAL'
								) || { totalAmount: 0, ticketCount: 0 },
							},
							megaMillion: {
								virtual: agentSales[1].find(
									s => s._id === 'VIRTUAL'
								) || { totalAmount: 0, ticketCount: 0 },
								real: agentSales[1].find(
									s => s._id === 'REAL'
								) || { totalAmount: 0, ticketCount: 0 },
							},
						},
					};
				}),
				monthlyCommissions,
				regionalStats,
				pendingWithdrawals,
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

export const getUserGameHistory = async (
	{ _id },
	{ cashType, gameType, status, startDate, endDate, limit = 10, offset = 0 }
) => {
	try {
		let dateQuery = {};
		if (startDate || endDate) {
			dateQuery = {};
			if (startDate) {
				dateQuery.$gte = parseInt(startDate);
			}
			if (endDate) {
				dateQuery.$lte = parseInt(endDate);
			}
		}

		let query = { user: _id };

		if (cashType) {
			query.cashType = cashType.toUpperCase();
		}

		if (status) {
			query.status = status.toUpperCase();
		}

		if (Object.keys(dateQuery).length > 0) {
			query.purchasedOn = dateQuery;
		}

		let tickets = [];
		let total = 0;

		// Get tickets based on game type
		if (!gameType || gameType.toUpperCase() === 'BORLETTE') {
			const borletteTickets = await BorletteTicket.find(query)
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.sort({ purchasedOn: -1 })
				.skip(parseInt(offset))
				.limit(parseInt(limit))
				.lean();

			const borletteTotal = await BorletteTicket.count(query);

			tickets = borletteTickets.map(ticket => ({
				...ticket,
				gameType: 'BORLETTE',
				amountPlayed: ticket.totalAmountPlayed,
				amountWon: ticket.totalAmountWon,
			}));

			total = borletteTotal;
		} else if (gameType.toUpperCase() === 'MEGAMILLION') {
			const megaMillionTickets = await MegaMillionTicket.find(query)
				.populate({
					path: 'lottery',
					populate: {
						path: 'state',
						select: 'name code',
					},
				})
				.sort({ purchasedOn: -1 })
				.skip(parseInt(offset))
				.limit(parseInt(limit))
				.lean();

			const megaMillionTotal = await MegaMillionTicket.count(query);

			tickets = megaMillionTickets.map(ticket => ({
				...ticket,
				gameType: 'MEGAMILLION',
			}));

			total = megaMillionTotal;
		} else if (gameType.toUpperCase() === 'ALL') {
			// For "ALL" we need to get both types and merge them
			const [
				borletteTickets,
				megaMillionTickets,
				borletteTotal,
				megaMillionTotal,
			] = await Promise.all([
				BorletteTicket.find(query)
					.populate({
						path: 'lottery',
						populate: {
							path: 'state',
							select: 'name code',
						},
					})
					.sort({ purchasedOn: -1 })
					.lean(),

				MegaMillionTicket.find(query)
					.populate({
						path: 'lottery',
						populate: {
							path: 'state',
							select: 'name code',
						},
					})
					.sort({ purchasedOn: -1 })
					.lean(),

				BorletteTicket.count(query),
				MegaMillionTicket.count(query),
			]);

			// Combine tickets with gameType indicator
			const allTickets = [
				...borletteTickets.map(ticket => ({
					...ticket,
					gameType: 'BORLETTE',
					amountPlayed: ticket.totalAmountPlayed,
					amountWon: ticket.totalAmountWon,
				})),
				...megaMillionTickets.map(ticket => ({
					...ticket,
					gameType: 'MEGAMILLION',
				})),
			];

			// Sort combined tickets by purchasedOn
			const sortedTickets = allTickets.sort(
				(a, b) => b.purchasedOn - a.purchasedOn
			);

			tickets = sortedTickets.slice(
				parseInt(offset),
				parseInt(offset) + parseInt(limit)
			);
			total = borletteTotal + megaMillionTotal;
		}

		return {
			status: 200,
			entity: {
				success: true,
				tickets,
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

// Get agent sales stats
export const getAgentSalesStats = async (
	{ _id, role },
	{ startDate, endDate, cashType }
) => {
	try {
		if (role !== 'AGENT') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		let dateQuery = {};
		if (startDate || endDate) {
			dateQuery = {};
			if (startDate) {
				dateQuery.$gte = parseInt(startDate);
			}
			if (endDate) {
				dateQuery.$lte = parseInt(endDate);
			}
		} else {
			// Default to current month
			const startOfMonth = moment().startOf('month').valueOf();
			const endOfMonth = moment().endOf('month').valueOf();
			dateQuery = {
				$gte: startOfMonth,
				$lte: endOfMonth,
			};
		}

		let query = {
			user: _id.toString(),
			purchasedOn: dateQuery,
		};

		if (cashType) {
			query.cashType = cashType.toUpperCase();
		}

		// Get daily sales
		const dailyBorletteStats = await BorletteTicket.aggregate([
			{
				$match: query,
			},
			{
				$addFields: {
					day: {
						$dateToString: {
							format: '%Y-%m-%d',
							date: {
								$toDate: { $multiply: ['$purchasedOn', 1] },
							},
						},
					},
				},
			},
			{
				$group: {
					_id: {
						day: '$day',
						cashType: '$cashType',
					},
					totalAmount: { $sum: '$totalAmountPlayed' },
					ticketCount: { $sum: 1 },
				},
			},
			{
				$sort: {
					'_id.day': 1,
				},
			},
		]);

		const dailyMegaMillionStats = await MegaMillionTicket.aggregate([
			{
				$match: query,
			},
			{
				$addFields: {
					day: {
						$dateToString: {
							format: '%Y-%m-%d',
							date: {
								$toDate: { $multiply: ['$purchasedOn', 1] },
							},
						},
					},
				},
			},
			{
				$group: {
					_id: {
						day: '$day',
						cashType: '$cashType',
					},
					totalAmount: { $sum: '$amountPlayed' },
					ticketCount: { $sum: 1 },
				},
			},
			{
				$sort: {
					'_id.day': 1,
				},
			},
		]);

		// Get commission data
		const commissionQuery = {
			user: _id.toString(),
			transactionIdentifier: {
				$in: [
					'TICKET_BORLETTE_COMMISSION',
					'TICKET_MEGAMILLION_COMMISSION',
					'DEPOSIT_COMMISSION',
					'WITHDRAW_COMMISSION',
				],
			},
			transactionType: 'CREDIT',
		};

		if (startDate || endDate) {
			commissionQuery.createdAt = {};
			if (startDate) {
				commissionQuery.createdAt.$gte = new Date(parseInt(startDate));
			}
			if (endDate) {
				commissionQuery.createdAt.$lte = new Date(parseInt(endDate));
			}
		} else {
			commissionQuery.createdAt = {
				$gte: moment().startOf('month').toDate(),
				$lte: moment().endOf('month').toDate(),
			};
		}

		const dailyCommissions = await Transaction.aggregate([
			{
				$match: commissionQuery,
			},
			{
				$group: {
					_id: {
						day: {
							$dateToString: {
								format: '%Y-%m-%d',
								date: '$createdAt',
							},
						},
						identifier: '$transactionIdentifier',
					},
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
			{
				$sort: {
					'_id.day': 1,
				},
			},
		]);

		// Get summary statistics
		const borletteStats = await BorletteTicket.aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: '$cashType',
					totalAmount: { $sum: '$totalAmountPlayed' },
					totalWinnings: { $sum: '$totalAmountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		const megaMillionStats = await MegaMillionTicket.aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: '$cashType',
					totalAmount: { $sum: '$amountPlayed' },
					totalWinnings: { $sum: '$amountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		const commissionTotals = await Transaction.aggregate([
			{
				$match: commissionQuery,
			},
			{
				$group: {
					_id: '$transactionIdentifier',
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				salesByDay: {
					borlette: dailyBorletteStats,
					megaMillion: dailyMegaMillionStats,
				},
				commissionsByDay: dailyCommissions,
				summary: {
					borlette: {
						virtual: borletteStats.find(
							s => s._id === 'VIRTUAL'
						) || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
						real: borletteStats.find(s => s._id === 'REAL') || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
					},
					megaMillion: {
						virtual: megaMillionStats.find(
							s => s._id === 'VIRTUAL'
						) || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
						real: megaMillionStats.find(s => s._id === 'REAL') || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
					},
					commissions: commissionTotals,
				},
				timeRange: {
					startDate: startDate
						? new Date(parseInt(startDate))
						: moment().startOf('month').toDate(),
					endDate: endDate
						? new Date(parseInt(endDate))
						: moment().endOf('month').toDate(),
				},
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

// Get dealer stats
export const getDealerStats = async (
	{ _id, role },
	{ startDate, endDate, agentId }
) => {
	try {
		if (role !== 'DEALER') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		// Get agents under this dealer (assuming there's a way to identify them)
		let agentFilter = {
			role: 'AGENT',
			dealer: _id.toString(),
		};

		if (agentId) {
			agentFilter._id = agentId;
		}

		const agents = await User.find(agentFilter)
			.select('_id name phone email')
			.lean();
		const agentIds = agents.map(agent => agent._id.toString());

		if (agentIds.length === 0) {
			return {
				status: 200,
				entity: {
					success: true,
					agents: [],
					summary: {
						borlette: {
							virtual: {
								totalAmount: 0,
								totalWinnings: 0,
								ticketCount: 0,
							},
							real: {
								totalAmount: 0,
								totalWinnings: 0,
								ticketCount: 0,
							},
						},
						megaMillion: {
							virtual: {
								totalAmount: 0,
								totalWinnings: 0,
								ticketCount: 0,
							},
							real: {
								totalAmount: 0,
								totalWinnings: 0,
								ticketCount: 0,
							},
						},
						commissions: [],
					},
					timeRange: {
						startDate: startDate
							? new Date(parseInt(startDate))
							: moment().startOf('month').toDate(),
						endDate: endDate
							? new Date(parseInt(endDate))
							: moment().endOf('month').toDate(),
					},
				},
			};
		}

		// Time range
		let dateQuery = {};
		if (startDate || endDate) {
			dateQuery = {};
			if (startDate) {
				dateQuery.$gte = parseInt(startDate);
			}
			if (endDate) {
				dateQuery.$lte = parseInt(endDate);
			}
		} else {
			// Default to current month
			const startOfMonth = moment().startOf('month').valueOf();
			const endOfMonth = moment().endOf('month').valueOf();
			dateQuery = {
				$gte: startOfMonth,
				$lte: endOfMonth,
			};
		}

		let query = {
			user: { $in: agentIds },
			purchasedOn: dateQuery,
		};

		// Get sales data for each agent
		const agentStatsPromises = agentIds.map(agentId => {
			const agentQuery = { ...query, user: agentId };

			return Promise.all([
				BorletteTicket.aggregate([
					{
						$match: agentQuery,
					},
					{
						$group: {
							_id: '$cashType',
							totalAmount: { $sum: '$totalAmountPlayed' },
							totalWinnings: { $sum: '$totalAmountWon' },
							ticketCount: { $sum: 1 },
						},
					},
				]),

				MegaMillionTicket.aggregate([
					{
						$match: agentQuery,
					},
					{
						$group: {
							_id: '$cashType',
							totalAmount: { $sum: '$amountPlayed' },
							totalWinnings: { $sum: '$amountWon' },
							ticketCount: { $sum: 1 },
						},
					},
				]),
			]);
		});

		const agentStatsResults = await Promise.all(agentStatsPromises);

		// Get commission data
		const commissionTimeQuery = {};
		if (startDate || endDate) {
			if (startDate) {
				commissionTimeQuery.$gte = new Date(parseInt(startDate));
			}
			if (endDate) {
				commissionTimeQuery.$lte = new Date(parseInt(endDate));
			}
		} else {
			commissionTimeQuery.$gte = moment().startOf('month').toDate();
			commissionTimeQuery.$lte = moment().endOf('month').toDate();
		}

		const agentCommissionsPromises = agentIds.map(agentId => {
			return Transaction.aggregate([
				{
					$match: {
						user: agentId,
						transactionIdentifier: {
							$in: [
								'TICKET_BORLETTE_COMMISSION',
								'TICKET_MEGAMILLION_COMMISSION',
								'DEPOSIT_COMMISSION',
								'WITHDRAW_COMMISSION',
							],
						},
						transactionType: 'CREDIT',
						createdAt: commissionTimeQuery,
					},
				},
				{
					$group: {
						_id: '$transactionIdentifier',
						totalAmount: { $sum: '$transactionAmount' },
						count: { $sum: 1 },
					},
				},
			]);
		});

		const agentCommissionsResults = await Promise.all(
			agentCommissionsPromises
		);

		// Get overall summary
		const borletteStats = await BorletteTicket.aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: '$cashType',
					totalAmount: { $sum: '$totalAmountPlayed' },
					totalWinnings: { $sum: '$totalAmountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		const megaMillionStats = await MegaMillionTicket.aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: '$cashType',
					totalAmount: { $sum: '$amountPlayed' },
					totalWinnings: { $sum: '$amountWon' },
					ticketCount: { $sum: 1 },
				},
			},
		]);

		const commissionTotals = await Transaction.aggregate([
			{
				$match: {
					user: { $in: agentIds },
					transactionIdentifier: {
						$in: [
							'TICKET_BORLETTE_COMMISSION',
							'TICKET_MEGAMILLION_COMMISSION',
							'DEPOSIT_COMMISSION',
							'WITHDRAW_COMMISSION',
						],
					},
					transactionType: 'CREDIT',
					createdAt: commissionTimeQuery,
				},
			},
			{
				$group: {
					_id: '$transactionIdentifier',
					totalAmount: { $sum: '$transactionAmount' },
					count: { $sum: 1 },
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				agents: agents.map((agent, index) => {
					const agentStats = agentStatsResults[index];
					const agentCommissions = agentCommissionsResults[index];

					return {
						...agent,
						stats: {
							borlette: {
								virtual: agentStats[0].find(
									s => s._id === 'VIRTUAL'
								) || {
									totalAmount: 0,
									totalWinnings: 0,
									ticketCount: 0,
								},
								real: agentStats[0].find(
									s => s._id === 'REAL'
								) || {
									totalAmount: 0,
									totalWinnings: 0,
									ticketCount: 0,
								},
							},
							megaMillion: {
								virtual: agentStats[1].find(
									s => s._id === 'VIRTUAL'
								) || {
									totalAmount: 0,
									totalWinnings: 0,
									ticketCount: 0,
								},
								real: agentStats[1].find(
									s => s._id === 'REAL'
								) || {
									totalAmount: 0,
									totalWinnings: 0,
									ticketCount: 0,
								},
							},
							commissions: agentCommissions,
						},
					};
				}),
				summary: {
					borlette: {
						virtual: borletteStats.find(
							s => s._id === 'VIRTUAL'
						) || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
						real: borletteStats.find(s => s._id === 'REAL') || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
					},
					megaMillion: {
						virtual: megaMillionStats.find(
							s => s._id === 'VIRTUAL'
						) || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
						real: megaMillionStats.find(s => s._id === 'REAL') || {
							totalAmount: 0,
							totalWinnings: 0,
							ticketCount: 0,
						},
					},
					commissions: commissionTotals,
				},
				timeRange: {
					startDate: startDate
						? new Date(parseInt(startDate))
						: moment().startOf('month').toDate(),
					endDate: endDate
						? new Date(parseInt(endDate))
						: moment().endOf('month').toDate(),
				},
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
