import moment from 'moment';
import _ from 'lodash';
import { makeTransaction } from '../transaction/controller';
import { RouletteTicket } from './model';
import { Wallet } from '../wallet/model';
import { Roulette } from '../roulette/model';

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
		const currentTime = moment.now();
		const wallet = await Wallet.findOne({
			user: user._id,
		});
		const roulette = await Roulette.findById(id);
		if (roulette.spinSchedlue >= currentTime) {
			let totalAmountPlayed = 0;
			let bet = _.map(betPlaced, (amount, block) => {
				totalAmountPlayed += amount;
				return {
					blockPlayed: block,
					amountPlayed: amount,
				};
			});
			if (wallet.totalBalance >= totalAmountPlayed) {
				const rouletteTicket = await RouletteTicket.create({
					user: user._id,
					roulette: id,
					bet: bet,
					totalAmountPlayed: totalAmountPlayed,
				});
				await makeTransaction(
					user._id,
					user.role,
					'TICKET_ROULETTE',
					totalAmountPlayed,
				);
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
					error: 'Insufficient Balance.',
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
							[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].indexOf(
								winningNumber,
							) !== -1
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
					case '3_6':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '3_6_2_5':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '6_9':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '6_9_5_8':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '9_12':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '9_12_8_11':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '12_15':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '12_15_11_14':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '15_18':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '15_18_14_17':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '18_21':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '18_21_17_20':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '21_24':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '21_24_20_23':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '24_27':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '24_27_23_26':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '27_30':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '27_30_26_29':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '30_33':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '30_33_29_32':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '33_36':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '33_36_32_35':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '2_5':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '2_5_1_4':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '5_8':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '5_8_4_7':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '8_11':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '8_11_7_10':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '11_14':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '11_14_10_13':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '14_17':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '14_17_13_16':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '17_20':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '17_20_16_19':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '20_23':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '20_23_19_22':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '23_26':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '23_26_22_25':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '26_29':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '26_29_25_28':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '29_32':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '29_32_28_31':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '32_35':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '32_35_31_34':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '1_4':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '1_4_0_3':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '4_7':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '4_7_3_6':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '7_10':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '7_10_6_9':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '10_13':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '10_13_9_12':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '13_16':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '13_16_12_15':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '16_19':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '16_19_15_18':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '19_22':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '19_22_18_21':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '22_25':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '22_25_21_24':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '25_28':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '25_28_24_27':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '28_31':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '28_31_27_30':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					case '31_34':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 17
								: 0;
						break;
					case '31_34_30_33':
						winningAmount =
							bet.blockPlayed
								.split('_')
								.map(n => parseInt(n))
								.indexOf(winningNumber) !== -1
								? bet.amountPlayed * 8
								: 0;
						break;
					default:
						winningAmount =
							winningNumber === parseInt(bet.blockPlayed)
								? bet.amountPlayed * 35
								: 0;
				}
				winningAmount += winningAmount == 0 ? 0 : bet.amountPlayed;
				totalAmountWon += winningAmount;
			});
		});
		console.log('totalAmountWon ', totalAmountWon);
		return totalAmountWon;
	} catch (error) {
		return {
			error,
		};
	}
};

export const updatePlacedBet = async ({ id, winningNumber }) => {
	try {
		winningNumber = parseInt(winningNumber);
		let rouletteTickets = await RouletteTicket.find({
			roulette: id,
		}).populate('user');
		const updatePromise = rouletteTickets.map(
			ticket =>
				new Promise(async (resolve, reject) => {
					let totalAmountWon = 0;
					ticket.bet = _.map(ticket.bet, bet => {
						bet.amountWon = 0;
						switch (bet.blockPlayed) {
							case '2_to_1_1':
								bet.amountWon =
									[
										3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33,
										36,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '2_to_1_2':
								bet.amountWon =
									[
										2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32,
										35,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '2_to_1_3':
								bet.amountWon =
									[
										1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31,
										34,
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
										13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
										23, 24,
									].indexOf(winningNumber) !== -1
										? bet.amountPlayed * 2
										: 0;
								break;
							case '3_12':
								bet.amountWon =
									[
										25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
										35, 36,
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
							case '9_12':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '9_12_8_11':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '12_15':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '12_15_11_14':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '15_18':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '15_18_14_17':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '18_21':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '18_21_17_20':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '21_24':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '21_24_20_23':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '24_27':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '24_27_23_26':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '27_30':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '27_30_26_29':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '30_33':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '30_33_29_32':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '33_36':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '33_36_32_35':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '2_5':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '2_5_1_4':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '5_8':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '5_8_4_7':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '8_11':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '8_11_7_10':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '11_14':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '11_14_10_13':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '14_17':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '14_17_13_16':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '17_20':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '17_20_16_19':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '20_23':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '20_23_19_22':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '23_26':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '23_26_22_25':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '26_29':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '26_29_25_28':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '29_32':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '29_32_28_31':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '32_35':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '32_35_31_34':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '1_4':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '1_4_0_3':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '4_7':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '4_7_3_6':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '7_10':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '7_10_6_9':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '10_13':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '10_13_9_12':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '13_16':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '13_16_12_15':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '16_19':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '16_19_15_18':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '19_22':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '19_22_18_21':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '22_25':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '22_25_21_24':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '25_28':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '25_28_24_27':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '28_31':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '28_31_27_30':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '31_34':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 17
										: 0;
								break;
							case '31_34_30_33':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 8
										: 0;
								break;
							case '0_1_2_3':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 6
										: 0;
								break;
							case '1_2_3':
							case '4_5_6':
							case '7_8_9':
							case '10_11_12':
							case '13_14_15':
							case '16_17_18':
							case '19_20_21':
							case '22_23_24':
							case '25_26_27':
							case '28_29_30':
							case '31_32_33':
							case '34_35_36':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 11
										: 0;
								break;
							case '1_2_3_4_5_6':
							case '4_5_6_7_8_9':
							case '7_8_9_10_11_12':
							case '10_11_12_13_14_15':
							case '13_14_15_16_17_18':
							case '16_17_18_19_20_21':
							case '19_20_21_22_23_24':
							case '22_23_24_25_26_27':
							case '25_26_27_28_29_30':
							case '28_29_30_31_32_33':
							case '31_32_33_34_35_36':
								bet.amountWon =
									bet.blockPlayed
										.split('_')
										.map(n => parseInt(n))
										.indexOf(winningNumber) !== -1
										? bet.amountPlayed * 5
										: 0;
								break;
							default:
								bet.amountWon =
									winningNumber === parseInt(bet.blockPlayed)
										? bet.amountPlayed * 35
										: 0;
						}
						bet.amountWon =
							bet.amountWon == 0
								? 0
								: bet.amountWon + bet.amountPlayed;
						totalAmountWon += bet.amountWon;
						return {
							blockPlayed: bet.blockPlayed,
							amountPlayed: bet.amountPlayed,
							amountWon: bet.amountWon,
						};
					});
					ticket.totalAmountWon = totalAmountWon;
					if (totalAmountWon > 0) {
						await makeTransaction(
							ticket.user._id,
							ticket.user.role,
							'WON_ROULETTE',
							totalAmountWon,
						);
					}
					await ticket.save();
					resolve();
				}),
		);
		return await Promise.all(updatePromise);
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
