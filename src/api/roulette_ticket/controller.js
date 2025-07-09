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

		// Ensure we get the roulette ID as a string, not an object
		const rouletteId = typeof id === 'object' ? id._id || id.id : id;
		const roulette = await Roulette.findById(rouletteId);

		if (!roulette) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Roulette game not found',
				},
			};
		}

		if (roulette.spinSchedlue >= currentTime) {
			let totalAmountPlayed = 0;

			// Extract bet data, excluding cashType from bet calculations
			const { cashType: _, ...bets } = betPlaced;

			let bet = Object.entries(bets).map(([block, amount]) => {
				totalAmountPlayed += amount;
				return {
					blockPlayed: block,
					amountPlayed: amount,
				};
			});

			// Get the appropriate balance based on cash type
			const balanceToCheck =
				cashType === 'REAL'
					? wallet.realBalanceWithdrawable + wallet.realBalanceNonWithdrawable
					: wallet.virtualBalance;

			if (balanceToCheck >= totalAmountPlayed) {
				const rouletteTicket = await RouletteTicket.create({
					user: user._id,
					roulette: rouletteId, // Use the string ID, not the object
					bet: bet,
					totalAmountPlayed: totalAmountPlayed,
					cashType: cashType,
				});

				// Process transaction with cash type
				await makeTransaction(
					user._id,
					user.role,
					'ROULETTE_BET',
					totalAmountPlayed,
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
						`Roulette bet placement - Amount: ${totalAmountPlayed} (${cashType})`,
						{
							gameType: 'ROULETTE',
							ticketId: rouletteTicket._id,
							amountPlayed: totalAmountPlayed,
							cashType,
							baseXP,
							multiplier: cashTypeMultiplier,
							betCount: bet.length,
							rouletteId: rouletteId
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
			ticket.bet = ticket.bet.map(bet => {
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
								? bet.amountPlayed : 0;
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
			ticket.totalAmountWon = ticket.bet.reduce(
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

export const updatePlacedBet = async (roulette, winningNumber) => {
	try {
		// Get the roulette ID properly
		const rouletteId = typeof roulette === 'object' ? roulette._id || roulette.id : roulette;
		winningNumber = winningNumber || roulette.winningNumber;
		winningNumber = parseInt(winningNumber);

		let rouletteTickets = await RouletteTicket.find({
			roulette: rouletteId,
		}).populate('user');

		const ticketPromise = rouletteTickets.map(
			ticket =>
				new Promise(async (resolve, reject) => {
					ticket.bet = ticket.bet.map(bet => {
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
							// Handle corner bets and other special bets
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
							// Handle line bets like 4_5_6_7_8_9 (from the POST body)
							case '4_5_6_7_8_9':
								bet.amountWon =
									[4, 5, 6, 7, 8, 9].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 5
										: 0;
								break;
							// Handle other multi-number bets dynamically
							default:
								// Check if it's a multi-number bet (contains underscores)
								if (bet.blockPlayed.includes('_')) {
									const numbers = bet.blockPlayed.split('_').map(n => parseInt(n));
									if (numbers.includes(winningNumber)) {
										// Determine payout based on number of numbers in the bet
										let multiplier = 35; // Single number default
										if (numbers.length === 2) multiplier = 17; // Split bet
										else if (numbers.length === 3) multiplier = 11; // Street bet
										else if (numbers.length === 4) multiplier = 8; // Corner bet
										else if (numbers.length === 5) multiplier = 6; // Five number bet
										else if (numbers.length === 6) multiplier = 5; // Line bet

										bet.amountWon = bet.amountPlayed * multiplier;
									} else {
										bet.amountWon = 0;
									}
								} else {
									// Single number bet
									if (parseInt(bet.blockPlayed) === winningNumber) {
										bet.amountWon = bet.amountPlayed * 35;
									} else {
										bet.amountWon = 0;
									}
								}
								break;
						}
						return bet;
					});

					ticket.totalAmountWon = ticket.bet.reduce(
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
								`Roulette win - Amount: ${ticket.totalAmountWon} (${ticket.cashType || 'VIRTUAL'})`,
								{
									gameType: 'ROULETTE',
									ticketId: ticket._id,
									amountWon: ticket.totalAmountWon,
									cashType: ticket.cashType || 'VIRTUAL',
									baseXP,
									multiplier: cashTypeMultiplier * winMultiplier,
									isWin: true,
									winningNumber,
									rouletteId: rouletteId
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

					// Use findOneAndUpdate to avoid version conflicts
					const updatedTicket = await RouletteTicket.findOneAndUpdate(
						{ _id: ticket._id },
						{
							$set: {
								bet: ticket.bet,
								totalAmountWon: ticket.totalAmountWon
							}
						},
						{ new: true, runValidators: true }
					).populate('user');

					// Process winnings transaction immediately (no isAmountDisbursed field in RouletteTicket)
					if (updatedTicket && updatedTicket.totalAmountWon && updatedTicket.totalAmountWon > 0) {
						await makeTransaction(
							updatedTicket.user._id,
							updatedTicket.user.role,
							'WON_ROULETTE',
							updatedTicket.totalAmountWon,
							updatedTicket._id,
							updatedTicket.cashType
						);
					}
					resolve(updatedTicket || ticket);
				}),
		);
		await Promise.all(ticketPromise);
	} catch (error) {
		console.log(error);
	}
};