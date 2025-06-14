import moment from 'moment';
import _ from 'lodash';
import { makeTransaction } from '../transaction/controller';
import { RouletteTicket } from './model';
import { Wallet } from '../wallet/model';
import { Roulette } from '../roulette/model';
import { LoyaltyService } from '../loyalty/service';

export const getTicket = async ({ id }, { _id }) => {
	try {
		const rouletteTicket = await RouletteTicket.findOne({
			roulette: id,
			user: _id,
		});
		if (rouletteTicket) {
			return {
				status: 200,
				entity: {
					success: true,
					rouletteTicket,
				},
			};
		} else {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid parameters passed.',
				},
			};
		}
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

export const placeBet = async ({ id }, betPlaced, user) => {
	try {
		const { cashType = 'VIRTUAL' } = betPlaced;

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

		const currentTime = moment.now();
		const wallet = await Wallet.findOne({
			user: user._id,
		});

		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		const roulette = await Roulette.findById(id);
		if (roulette.spinSchedlue >= currentTime) {
			let totalAmountPlayed = 0;

			// Extract bet data, excluding cashType from bet calculations
			const { cashType: _, ...bets } = betPlaced;

			let bet = _.map(bets, (amount, block) => {
				totalAmountPlayed += amount;
				return {
					blockPlayed: block,
					amountPlayed: amount,
				};
			});

			// Get the appropriate balance based on cash type
			const balanceToCheck =
				cashType === 'REAL'
					? wallet.realBalance
					: wallet.virtualBalance;

			if (balanceToCheck >= totalAmountPlayed) {
				const rouletteTicket = await RouletteTicket.create({
					user: user._id,
					roulette: id,
					bet: bet,
					totalAmountPlayed: totalAmountPlayed,
					cashType: cashType, // Store cash type in ticket
				});

				// Process transaction with cash type
				await makeTransaction(
					user._id,
					user.role,
					'TICKET_ROULETTE',
					totalAmountPlayed,
					null,
					null,
					rouletteTicket._id,
					cashType // Pass cash type to transaction function
				);

				// **NEW: Record play activity for loyalty tracking**
				try {
					const loyaltyResult = await LoyaltyService.recordUserPlayActivity(user._id);
					if (!loyaltyResult.success) {
						console.warn(`Failed to record play activity for user ${user._id}:`, loyaltyResult.error);
					} else {
						console.log(`Play activity recorded for user ${user._id} - Roulette bet placement`);
					}
				} catch (loyaltyError) {
					console.error(`Error recording play activity for user ${user._id}:`, loyaltyError);
					// Don't fail bet placement if loyalty tracking fails
				}

				// **NEW: Award XP for bet placement**
				try {
					// Calculate XP based on amount bet
					const baseXP = Math.max(5, Math.floor(totalAmountPlayed / 3)); // 1 XP per $3 bet, minimum 5 XP
					const cashTypeMultiplier = cashType === 'REAL' ? 2 : 1; // Real cash gives more XP
					const totalXP = baseXP * cashTypeMultiplier;

					const xpResult = await LoyaltyService.awardUserXP(
						user._id,
						totalXP,
						'GAME_ACTIVITY',
						`Roulette bet placement - Amount: $${totalAmountPlayed} (${cashType})`,
						{
							gameType: 'ROULETTE',
							ticketId: rouletteTicket._id,
							amountPlayed: totalAmountPlayed,
							cashType,
							baseXP,
							multiplier: cashTypeMultiplier,
							betCount: bet.length,
							rouletteId: id
						}
					);

					if (!xpResult.success) {
						console.warn(`Failed to award XP for user ${user._id}:`, xpResult.error);
					} else {
						console.log(`Awarded ${totalXP} XP to user ${user._id} for Roulette bet placement`);
					}
				} catch (xpError) {
					console.error(`Error awarding XP for user ${user._id}:`, xpError);
					// Don't fail bet placement if XP awarding fails
				}

				return {
					status: 200,
					entity: {
						success: true,
						rouletteTicket,
					},
				};
			}
			return {
				status: 500,
				entity: {
					success: false,
					error: `Insufficient ${cashType.toLowerCase()} balance.`,
				},
			};
		} else {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Timeout.',
				},
			};
		}
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

export const getTotalWinningAmount = async (id, winningNumber) => {
	try {
		winningNumber = parseInt(winningNumber);
		let rouletteTickets = await RouletteTicket.find({
			roulette: id,
		});
		let totalAmountWon = 0;
		rouletteTickets.map(ticket => {
			ticket.bet = _.map(ticket.bet, bet => {
				let winningAmount = 0;
				switch (bet.blockPlayed) {
					case '2_to_1_1':
						winningAmount =
							[
								3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed * 2
								: 0;
						break;
					case '2_to_1_2':
						winningAmount =
							[
								2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed * 2
								: 0;
						break;
					case '2_to_1_3':
						winningAmount =
							[
								1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed * 2
								: 0;
						break;
					case '1_12':
						winningAmount =
							[
								1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed * 2
								: 0;
						break;
					case '2_12':
						winningAmount =
							[
								13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed * 2
								: 0;
						break;
					case '3_12':
						winningAmount =
							[
								25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed * 2
								: 0;
						break;
					case '1_18':
						winningAmount =
							winningNumber >= 1 && winningNumber <= 18
								? bet.amountPlayed
								: 0;
						break;
					case '19_36':
						winningAmount =
							winningNumber >= 19 && winningNumber <= 36
								? bet.amountPlayed
								: 0;
						break;
					case 'even':
						winningAmount =
							winningNumber % 2 === 0 ? bet.amountPlayed : 0;
						break;
					case 'odd':
						winningAmount =
							winningNumber % 2 === 0 ? 0 : bet.amountPlayed;
						break;
					case 'red':
						winningAmount =
							[
								1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25,
								27, 30, 32, 34, 36,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed
								: 0;
						break;
					case 'black':
						winningAmount =
							[
								2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26,
								28, 29, 31, 33, 35,
							].indexOf(winningNumber) !== -1
								? bet.amountPlayed
								: 0;
						break;
					default:
						if (parseInt(bet.blockPlayed) === winningNumber) {
							winningAmount = bet.amountPlayed * 35;
						}
						break;
				}
				totalAmountWon += winningAmount;
				return {
					...bet,
					amountWon: winningAmount,
				};
			});
			ticket.totalAmountWon = _.reduce(
				ticket.bet,
				(sum, bet) => sum + bet.amountWon,
				0
			);
		});
		return totalAmountWon;
	} catch (error) {
		console.log(error);
		return 0;
	}
};

export const updatePlacedBet = async (id, winningNumber) => {
	try {
		winningNumber = parseInt(winningNumber);
		let rouletteTickets = await RouletteTicket.find({
			roulette: id,
		}).populate('user');

		const ticketPromise = rouletteTickets.map(
			ticket =>
				new Promise(async (resolve, reject) => {
					ticket.bet = _.map(ticket.bet, bet => {
						switch (bet.blockPlayed) {
							case '2_to_1_1':
								bet.amountWon =
									[
										3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '2_to_1_2':
								bet.amountWon =
									[
										2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '2_to_1_3':
								bet.amountWon =
									[
										1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '1_12':
								bet.amountWon =
									[
										1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '2_12':
								bet.amountWon =
									[
										13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '3_12':
								bet.amountWon =
									[
										25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '1_18':
								bet.amountWon =
									winningNumber >= 1 && winningNumber <= 18
										? bet.amountPlayed
										: 0;
								break;
							case '19_36':
								bet.amountWon =
									winningNumber >= 19 && winningNumber <= 36
										? bet.amountPlayed
										: 0;
								break;
							case 'even':
								bet.amountWon =
									winningNumber % 2 === 0
										? bet.amountPlayed
										: 0;
								break;
							case 'odd':
								bet.amountWon =
									winningNumber % 2 === 0
										? 0
										: bet.amountPlayed;
								break;
							case 'red':
								bet.amountWon =
									[
										1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21,
										23, 25, 27, 30, 32, 34, 36,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed
										: 0;
								break;
							case 'black':
								bet.amountWon =
									[
										2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22,
										24, 26, 28, 29, 31, 33, 35,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed
										: 0;
								break;
							// Handle corner bets
							case '3_6':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '3_6_2_5':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '6_9':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '6_9_5_8':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							// Add all other corner bet cases...
							default:
								// Single number bet
								if (parseInt(bet.blockPlayed) === winningNumber) {
									bet.amountWon = bet.amountPlayed * 35;
								} else {
									bet.amountWon = 0;
								}
								break;
						}
						return bet;
					});

					ticket.totalAmountWon = _.reduce(
						ticket.bet,
						(sum, bet) => sum + bet.amountWon,
						0
					);

					// **NEW: Award XP for winning bets**
					if (ticket.totalAmountWon > 0) {
						try {
							// Calculate XP based on amount won
							const baseXP = Math.max(15, Math.floor(ticket.totalAmountWon / 5)); // Higher XP for wins
							const cashTypeMultiplier = ticket.cashType === 'REAL' ? 2 : 1;
							const winMultiplier = 1.5; // Bonus for winning
							const totalXP = Math.floor(baseXP * cashTypeMultiplier * winMultiplier);

							const xpResult = await LoyaltyService.awardUserXP(
								ticket.user._id,
								totalXP,
								'GAME_REWARD',
								`Roulette win - Amount: $${ticket.totalAmountWon} (${ticket.cashType || 'VIRTUAL'})`,
								{
									gameType: 'ROULETTE',
									ticketId: ticket._id,
									amountWon: ticket.totalAmountWon,
									cashType: ticket.cashType || 'VIRTUAL',
									baseXP,
									multiplier: cashTypeMultiplier * winMultiplier,
									isWin: true,
									winningNumber,
									rouletteId: id
								}
							);

							if (!xpResult.success) {
								console.warn(`Failed to award win XP for user ${ticket.user._id}:`, xpResult.error);
							} else {
								console.log(`Awarded ${totalXP} XP to user ${ticket.user._id} for Roulette win`);
							}
						} catch (xpError) {
							console.error(`Error awarding win XP for user ${ticket.user._id}:`, xpError);
						}
					}

					if (
						ticket.isAmountDisbursed &&
						ticket.totalAmountWon > 0
					) {
						const amount = ticket.totalAmountWon;
						await makeTransaction(
							ticket.user._id,
							ticket.user.role,
							'WON_ROULETTE',
							amount,
							null,
							null,
							ticket._id,
							ticket.cashType || 'VIRTUAL' // Use ticket cash type or default to VIRTUAL
						);
					}
					await ticket.save();
					resolve(ticket);
				})
		);
		const tickets = await Promise.all(ticketPromise);
		return tickets;
	} catch (error) {
		console.log(error);
		return [];
	}
};