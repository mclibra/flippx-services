import { Transaction } from '../../transaction/model';

/**
 * Get commission summary by agent
 * Admin-only endpoint for viewing agent commission statistics
 */
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
					'CASHBACK',
					'REFERRAL_COMMISSION',
					'TICKET_BORLETTE_COMMISSION_CANCELLED',
					'TICKET_MEGAMILLION_COMMISSION_CANCELLED',
					'ROULETTE_BET_COMMISSION',
					'TICKET_ROULETTE',
				],
			},
		};

		if (user.role === 'ADMIN') {
			if (agentId) {
				criteria.agent = agentId;
				transactionCriteria.user = agentId;
			}
		} else {
			criteria.agent = user._id;
			transactionCriteria.user = user._id;
		}

		if (startDate && endDate) {
			criteria.createdAt = {
				$gte: new Date(startDate),
				$lte: new Date(endDate),
			};
			transactionCriteria.createdAt = {
				$gte: new Date(startDate),
				$lte: new Date(endDate),
			};
		}

		const transactions = await Transaction.find(transactionCriteria)
			.populate('user', 'name phone')
			.sort({ createdAt: -1 });

		const summary = {
			totalTransactions: transactions.length,
			totalCommissionEarned: 0,
			totalCommissionEarnedReal: 0,
			totalCommissionEarnedVirtual: 0,
			totalVolume: 0,
			totalVolumeReal: 0,
			totalVolumeVirtual: 0,
			gameBreakdown: {
				borlette: { 
					volume: 0, 
					volumeReal: 0, 
					volumeVirtual: 0,
					commission: 0, 
					commissionReal: 0,
					commissionVirtual: 0,
					count: 0 
				},
				megamillion: { 
					volume: 0, 
					volumeReal: 0, 
					volumeVirtual: 0,
					commission: 0, 
					commissionReal: 0,
					commissionVirtual: 0,
					count: 0 
				},
				domino: { 
					volume: 0, 
					volumeReal: 0, 
					volumeVirtual: 0,
					commission: 0, 
					commissionReal: 0,
					commissionVirtual: 0,
					count: 0 
				},
				roulette: { 
					volume: 0, 
					volumeReal: 0, 
					volumeVirtual: 0,
					commission: 0, 
					commissionReal: 0,
					commissionVirtual: 0,
					count: 0 
				},
			},
		};

		transactions.forEach(transaction => {
			const amount = transaction.transactionAmount;
			const isReal = transaction.cashType === 'REAL';
			const isVirtual = transaction.cashType === 'VIRTUAL';

			if (transaction.transactionIdentifier.includes('COMMISSION')) {
				summary.totalCommissionEarned += amount;
				if (isReal) {
					summary.totalCommissionEarnedReal += amount;
				} else if (isVirtual) {
					summary.totalCommissionEarnedVirtual += amount;
				}
			} else {
				summary.totalVolume += amount;
				if (isReal) {
					summary.totalVolumeReal += amount;
				} else if (isVirtual) {
					summary.totalVolumeVirtual += amount;
				}
			}

			// Categorize by game type
			if (transaction.transactionIdentifier.includes('BORLETTE')) {
				if (transaction.transactionIdentifier.includes('COMMISSION')) {
					summary.gameBreakdown.borlette.commission += amount;
					if (isReal) {
						summary.gameBreakdown.borlette.commissionReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.borlette.commissionVirtual += amount;
					}
				} else {
					summary.gameBreakdown.borlette.volume += amount;
					if (isReal) {
						summary.gameBreakdown.borlette.volumeReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.borlette.volumeVirtual += amount;
					}
					summary.gameBreakdown.borlette.count++;
				}
			} else if (
				transaction.transactionIdentifier.includes('MEGAMILLION')
			) {
				if (transaction.transactionIdentifier.includes('COMMISSION')) {
					summary.gameBreakdown.megamillion.commission += amount;
					if (isReal) {
						summary.gameBreakdown.megamillion.commissionReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.megamillion.commissionVirtual += amount;
					}
				} else {
					summary.gameBreakdown.megamillion.volume += amount;
					if (isReal) {
						summary.gameBreakdown.megamillion.volumeReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.megamillion.volumeVirtual += amount;
					}
					summary.gameBreakdown.megamillion.count++;
				}
			} else if (transaction.transactionIdentifier.includes('DOMINO')) {
				if (transaction.transactionIdentifier.includes('COMMISSION')) {
					summary.gameBreakdown.domino.commission += amount;
					if (isReal) {
						summary.gameBreakdown.domino.commissionReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.domino.commissionVirtual += amount;
					}
				} else {
					summary.gameBreakdown.domino.volume += amount;
					if (isReal) {
						summary.gameBreakdown.domino.volumeReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.domino.volumeVirtual += amount;
					}
					summary.gameBreakdown.domino.count++;
				}
			} else if (transaction.transactionIdentifier.includes('ROULETTE')) {
				if (transaction.transactionIdentifier.includes('COMMISSION')) {
					summary.gameBreakdown.roulette.commission += amount;
					if (isReal) {
						summary.gameBreakdown.roulette.commissionReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.roulette.commissionVirtual += amount;
					}
				} else {
					summary.gameBreakdown.roulette.volume += amount;
					if (isReal) {
						summary.gameBreakdown.roulette.volumeReal += amount;
					} else if (isVirtual) {
						summary.gameBreakdown.roulette.volumeVirtual += amount;
					}
					summary.gameBreakdown.roulette.count++;
				}
			}
		});

		return {
			status: 200,
			entity: {
				success: true,
				summary,
				transactions,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to get commission summary',
			},
		};
	}
};

/**
 * Get tier-based payout analytics for admin dashboard
 */
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
		const { BorletteTicket } = await import('../../borlette_ticket/model');

		// Build match criteria for tickets
		let matchCriteria = {
			status: 'COMPLETED',
			...dateFilter,
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
						isCustom: '$payoutConfig.isCustom',
					},
					totalTickets: { $sum: 1 },
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: { $sum: '$totalAmountWon' },
					avgAmountPlayed: { $avg: '$totalAmountPlayed' },
					avgAmountWon: { $avg: '$totalAmountWon' },
					winningTickets: {
						$sum: {
							$cond: [{ $gt: ['$totalAmountWon', 0] }, 1, 0],
						},
					},
				},
			},
			{
				$addFields: {
					winRate: {
						$multiply: [
							{ $divide: ['$winningTickets', '$totalTickets'] },
							100,
						],
					},
					profitMargin: {
						$multiply: [
							{
								$divide: [
									{
										$subtract: [
											'$totalAmountPlayed',
											'$totalAmountWon',
										],
									},
									'$totalAmountPlayed',
								],
							},
							100,
						],
					},
				},
			},
			{
				$sort: { '_id.tier': 1 },
			},
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
								date: '$createdAt',
							},
						},
						tier: '$userTierAtPurchase',
					},
					totalTickets: { $sum: 1 },
					totalAmountPlayed: { $sum: '$totalAmountPlayed' },
					totalAmountWon: { $sum: '$totalAmountWon' },
				},
			},
			{
				$sort: { '_id.date': -1 },
			},
		]);

		// Get payout configuration usage
		const { PayoutConfig } = await import('../payout-config-management/model');
		const configUsage = await PayoutConfig.aggregate([
			{
				$match: {
					...dateFilter,
					isActive: true,
				},
			},
			{
				$group: {
					_id: {
						tier: '$tier',
						gameType: '$gameType',
						percentage: '$payoutPercentage',
					},
					usageCount: { $sum: 1 },
					isPromotional: { $first: '$isPromotional' },
					description: { $first: '$description' },
				},
			},
			{
				$sort: { '_id.tier': 1, '_id.gameType': 1 },
			},
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
					avgPayoutPercentageUsed: {
						$avg: '$payoutConfig.percentage',
					},
				},
			},
			{
				$addFields: {
					overallProfitMargin: {
						$multiply: [
							{
								$divide: [
									{
										$subtract: [
											'$totalRevenue',
											'$totalPayouts',
										],
									},
									'$totalRevenue',
								],
							},
							100,
						],
					},
				},
			},
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
						endDate: endDate || 'Present',
					},
				},
			},
		};
	} catch (error) {
		console.error('Error getting tier-based payout analytics:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve analytics',
			},
		};
	}
};

/**
 * Get revenue impact comparison (before vs after tier implementation)
 */
export const getRevenueImpactComparison = async (query, user) => {
	try {
		if (!['ADMIN'].includes(user.role)) {
			throw new Error('You are not authorized to view analytics data.');
		}

		const { BorletteTicket } = await import('../../borlette_ticket/model');

		// Assume tier implementation date (you can make this configurable)
		const tierImplementationDate = new Date('2024-01-01'); // Adjust as needed

		// Get statistics before tier implementation
		const beforeTierStats = await BorletteTicket.aggregate([
			{
				$match: {
					status: 'COMPLETED',
					createdAt: { $lt: tierImplementationDate },
				},
			},
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalRevenue: { $sum: '$totalAmountPlayed' },
					totalPayouts: { $sum: '$totalAmountWon' },
					avgTicketValue: { $avg: '$totalAmountPlayed' },
				},
			},
			{
				$addFields: {
					profitMargin: {
						$multiply: [
							{
								$divide: [
									{
										$subtract: [
											'$totalRevenue',
											'$totalPayouts',
										],
									},
									'$totalRevenue',
								],
							},
							100,
						],
					},
				},
			},
		]);

		// Get statistics after tier implementation
		const afterTierStats = await BorletteTicket.aggregate([
			{
				$match: {
					status: 'COMPLETED',
					createdAt: { $gte: tierImplementationDate },
				},
			},
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalRevenue: { $sum: '$totalAmountPlayed' },
					totalPayouts: { $sum: '$totalAmountWon' },
					avgTicketValue: { $avg: '$totalAmountPlayed' },
				},
			},
			{
				$addFields: {
					profitMargin: {
						$multiply: [
							{
								$divide: [
									{
										$subtract: [
											'$totalRevenue',
											'$totalPayouts',
										],
									},
									'$totalRevenue',
								],
							},
							100,
						],
					},
				},
			},
		]);

		const beforeStats = beforeTierStats[0] || {};
		const afterStats = afterTierStats[0] || {};

		// Calculate impact metrics
		const impact = {
			revenueChange: {
				absolute:
					(afterStats.totalRevenue || 0) -
					(beforeStats.totalRevenue || 0),
				percentage: beforeStats.totalRevenue
					? (((afterStats.totalRevenue || 0) -
							beforeStats.totalRevenue) /
							beforeStats.totalRevenue) *
						100
					: 0,
			},
			payoutChange: {
				absolute:
					(afterStats.totalPayouts || 0) -
					(beforeStats.totalPayouts || 0),
				percentage: beforeStats.totalPayouts
					? (((afterStats.totalPayouts || 0) -
							beforeStats.totalPayouts) /
							beforeStats.totalPayouts) *
						100
					: 0,
			},
			profitMarginChange: {
				absolute:
					(afterStats.profitMargin || 0) -
					(beforeStats.profitMargin || 0),
				beforeMargin: beforeStats.profitMargin || 0,
				afterMargin: afterStats.profitMargin || 0,
			},
		};

		return {
			status: 200,
			entity: {
				success: true,
				comparison: {
					beforeTierImplementation: beforeStats,
					afterTierImplementation: afterStats,
					impact,
					implementationDate: tierImplementationDate,
				},
			},
		};
	} catch (error) {
		console.error('Error getting revenue impact comparison:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to retrieve impact comparison',
			},
		};
	}
};
