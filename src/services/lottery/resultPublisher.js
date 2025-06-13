import moment from 'moment';
import { BorletteTicket } from '../../api/borlette_ticket/model';
import { MegaMillionTicket } from '../../api/megamillion_ticket/model';
import { makeTransaction } from '../../api/transaction/controller';

const MEGAMILLION_TICKET_AMOUNT = 2;

export const previewResult = async ({ _id, type, jackpotAmount }, results) => {
	let ticketList = [];
	if (type === 'MEGAMILLION') {
		ticketList = await MegaMillionTicket.find({
			lottery: _id,
			status: 'ACTIVE',
		});
	} else {
		ticketList = await BorletteTicket.find({
			lottery: _id,
			status: 'ACTIVE',
		});
	}
	let megamillionResult = {
		tickets: [],
		counter: 0,
		totalAmountWon: 0,
		totalAmountReceived: 0,
		matches: {
			'5_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'5_only': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'4_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'4_only': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'3_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'3_only': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'2_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'1_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
			'0_megaball': {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			},
		},
	};
	let borletteResult = {
		totalAmountReceived: 0,
		totalAmountWon: 0,
	};
	let winningNumbers = results.numbers.map(n => n.toString());
	let bonusNumber = null;
	let marriageNumbers = [];
	if (results.numbers.length === 3) {
		if (winningNumbers[0].length > 2) {
			bonusNumber = winningNumbers[0].substr(0, 1);
			winningNumbers[0] = winningNumbers[0].substr(1, 2);
			borletteResult[`${bonusNumber}${winningNumbers[0]}`] = {
				amountReceived: 0,
				amountWon: 0,
				counter: 0,
			};
		}
		borletteResult[`${winningNumbers[0]}${winningNumbers[1]}`] = {
			amountReceived: 0,
			amountWon: 0,
			counter: 0,
		};
		borletteResult[`${winningNumbers[1]}${winningNumbers[2]}`] = {
			amountReceived: 0,
			amountWon: 0,
			counter: 0,
		};
		borletteResult[`${winningNumbers[0]}${winningNumbers[2]}`] = {
			amountReceived: 0,
			amountWon: 0,
			counter: 0,
		};
		marriageNumbers = [
			`${winningNumbers[0]}x${winningNumbers[1]}`,
			`${winningNumbers[1]}x${winningNumbers[0]}`,
			`${winningNumbers[1]}x${winningNumbers[2]}`,
			`${winningNumbers[2]}x${winningNumbers[1]}`,
			`${winningNumbers[0]}x${winningNumbers[2]}`,
			`${winningNumbers[2]}x${winningNumbers[0]}`,
		];
		marriageNumbers.map(number => {
			if (!borletteResult[number]) {
				borletteResult[number] = {
					amountReceived: 0,
					amountWon: 0,
					counter: 0,
				};
			}
		});
		winningNumbers.map(number => {
			if (!borletteResult[number]) {
				borletteResult[number] = {
					amountReceived: 0,
					amountWon: 0,
					counter: 0,
				};
			}
		});
	}
	let ticketsPromise = ticketList.map(
		ticket =>
			// eslint-disable-next-line no-async-promise-executor
			new Promise(async resolve => {
				ticket.amountWon = 0;
				ticket.counter = 0;
				switch (type) {
					case 'BORLETTE':
						ticket.numbers.map(number => {
							number.amountWon = 0;
							if (
								marriageNumbers.indexOf(
									number.numberPlayed.toString()
								) !== -1
							) {
								number.amountWon = number.amountPlayed * 500;
							} else {
								switch (number.numberPlayed.toString()) {
									case `${winningNumbers[0]}${winningNumbers[1]}`:
										number.amountWon =
											number.amountPlayed * 800;
										break;
									case `${winningNumbers[1]}${winningNumbers[2]}`:
										number.amountWon =
											number.amountPlayed * 800;
										break;
									case `${winningNumbers[0]}${winningNumbers[2]}`:
										number.amountWon =
											number.amountPlayed * 800;
										break;
									case `${bonusNumber}${winningNumbers[0]}`:
										number.amountWon =
											number.amountPlayed * 300;
										break;
									case `${winningNumbers[0]}`:
										number.amountWon =
											number.amountPlayed * 65;
										break;
									case `${winningNumbers[1]}`:
										number.amountWon =
											number.amountPlayed * 20;
										break;
									case `${winningNumbers[2]}`:
										number.amountWon =
											number.amountPlayed * 10;
										break;
								}
							}
							if (number.amountWon > 0) {
								borletteResult[
									number.numberPlayed
								].amountReceived += number.amountPlayed;
								borletteResult[number.numberPlayed].amountWon +=
									number.amountWon;
								borletteResult[number.numberPlayed].counter +=
									1;
							}
							borletteResult.totalAmountReceived +=
								number.amountPlayed;
							borletteResult.totalAmountWon += number.amountWon;
						});
						break;
					case 'MEGAMILLION': {
						const matchedNumbers = ticket.numbers
							.map(number => number.toString())
							.filter(
								number =>
									results.numbers.indexOf(
										number.toString()
									) !== -1
							);
						const matchedMegaBall =
							ticket.megaBall === results.megaBall;
						if (matchedNumbers.length === 5 && matchedMegaBall) {
							megamillionResult.matches['5_megaball'].counter +=
								1;
							megamillionResult.matches['5_megaball'].amountWon +=
								jackpotAmount;
							ticket.amountWon = jackpotAmount;
						} else if (
							matchedNumbers.length === 5 &&
							!matchedMegaBall
						) {
							megamillionResult.matches['5_only'].counter += 1;
							megamillionResult.matches['5_only'].amountWon +=
								75 * 1000;
							ticket.amountWon = 75 * 1000;
						} else if (
							matchedNumbers.length === 4 &&
							matchedMegaBall
						) {
							megamillionResult.matches['4_megaball'].counter +=
								1;
							megamillionResult.matches['4_megaball'].amountWon +=
								10 * 1000;
							ticket.amountWon = 10 * 1000;
						} else if (
							matchedNumbers.length === 4 &&
							!matchedMegaBall
						) {
							megamillionResult.matches['4_only'].counter += 1;
							megamillionResult.matches['4_only'].amountWon +=
								500;
							ticket.amountWon = 500;
						} else if (
							matchedNumbers.length === 3 &&
							matchedMegaBall
						) {
							megamillionResult.matches['3_megaball'].counter +=
								1;
							megamillionResult.matches['3_megaball'].amountWon +=
								200;
							ticket.amountWon = 200;
						} else if (
							matchedNumbers.length === 3 &&
							!matchedMegaBall
						) {
							megamillionResult.matches['3_only'].counter += 1;
							megamillionResult.matches['3_only'].amountWon += 15;
							ticket.amountWon = 15;
						} else if (
							matchedNumbers.length === 2 &&
							matchedMegaBall
						) {
							megamillionResult.matches['2_megaball'].counter +=
								1;
							megamillionResult.matches['2_megaball'].amountWon +=
								10;
							ticket.amountWon = 10;
						} else if (
							matchedNumbers.length === 1 &&
							matchedMegaBall
						) {
							megamillionResult.matches['1_megaball'].counter +=
								1;
							megamillionResult.matches['1_megaball'].amountWon +=
								4;
							ticket.amountWon = 4;
						} else if (
							matchedNumbers.length === 0 &&
							matchedMegaBall
						) {
							megamillionResult.matches['0_megaball'].counter +=
								1;
							megamillionResult.matches['0_megaball'].amountWon +=
								2;
							ticket.amountWon = 2;
						}
						megamillionResult.totalAmountReceived +=
							MEGAMILLION_TICKET_AMOUNT;
						megamillionResult.totalAmountWon += ticket.amountWon;
						break;
					}
				}
				resolve(ticket);
			})
	);
	const tickets = await Promise.all(ticketsPromise);

	return type === 'MEGAMILLION'
		? { ...megamillionResult, tickets }
		: { ...borletteResult, tickets };
};

export const processTicketsAndPublishResults = async (lottery, results) => {
	const { _id, type, jackpotAmount } = lottery;
	let ticketList = [];
	if (type === 'MEGAMILLION') {
		ticketList = await MegaMillionTicket.find({
			lottery: _id,
			status: 'ACTIVE',
		}).populate('user');
	} else {
		ticketList = await BorletteTicket.find({
			lottery: _id,
			status: 'ACTIVE',
		}).populate('user');
	}
	let megamillionResult = {
		tickets: [],
		totalAmountWon: 0,
		totalAmountReceived: 0,
	};
	let borletteResult = {
		totalAmountReceived: 0,
		totalAmountWon: 0,
	};
	let winningNumbers = results.numbers.map(n => n.toString()),
		bonusNumber = null,
		marriageNumbers = [];
	if (results.numbers.length === 3) {
		if (winningNumbers[0].length > 2) {
			bonusNumber = winningNumbers[0].substr(0, 1);
			winningNumbers[0] = winningNumbers[0].substr(1, 2);
		}
		marriageNumbers = [
			`${winningNumbers[0]}x${winningNumbers[1]}`,
			`${winningNumbers[1]}x${winningNumbers[0]}`,
			`${winningNumbers[1]}x${winningNumbers[2]}`,
			`${winningNumbers[2]}x${winningNumbers[1]}`,
			`${winningNumbers[0]}x${winningNumbers[2]}`,
			`${winningNumbers[2]}x${winningNumbers[0]}`,
		];
	}
	let ticketsPromise = ticketList.map(
		ticket =>
			// eslint-disable-next-line no-async-promise-executor
			new Promise(async resolve => {
				ticket.amountWon = 0;
				ticket.isAmountDisbursed = ticket.purchasedBy === 'USER';
				switch (type) {
					case 'BORLETTE':
						ticket.numbers.map(number => {
							if (
								!borletteResult[number.numberPlayed.toString()]
							) {
								borletteResult[number.numberPlayed.toString()] =
									{
										amountReceived: 0,
										amountWon: 0,
									};
							}
							number.amountWon = 0;
							if (
								marriageNumbers.indexOf(
									number.numberPlayed.toString()
								) !== -1
							) {
								number.amountWon = number.amountPlayed * 500;
							} else {
								switch (number.numberPlayed.toString()) {
									case `${winningNumbers[0]}${winningNumbers[1]}`:
										number.amountWon =
											number.amountPlayed * 800;
										break;
									case `${winningNumbers[1]}${winningNumbers[2]}`:
										number.amountWon =
											number.amountPlayed * 800;
										break;
									case `${winningNumbers[0]}${winningNumbers[2]}`:
										number.amountWon =
											number.amountPlayed * 800;
										break;
									case `${bonusNumber}${winningNumbers[0]}`:
										number.amountWon =
											number.amountPlayed * 300;
										break;
									case `${winningNumbers[0]}`:
										number.amountWon =
											number.amountPlayed * 65;
										break;
									case `${winningNumbers[1]}`:
										number.amountWon =
											number.amountPlayed * 20;
										break;
									case `${winningNumbers[2]}`:
										number.amountWon =
											number.amountPlayed * 10;
										break;
								}
							}
							borletteResult[
								number.numberPlayed
							].amountReceived += number.amountPlayed;
							borletteResult[number.numberPlayed].amountWon +=
								number.amountWon;
							borletteResult.totalAmountReceived +=
								number.amountPlayed;
							borletteResult.totalAmountWon += number.amountWon;
							ticket.totalAmountWon += number.amountWon;
						});
						break;
					case 'MEGAMILLION': {
						const matchedNumbers = ticket.numbers
							.map(number => number.toString())
							.filter(
								number =>
									results.numbers.indexOf(
										number.toString()
									) !== -1
							);
						const matchedMegaBall =
							ticket.megaBall == results.megaBall;
						if (matchedNumbers.length === 5 && matchedMegaBall) {
							ticket.amountWon = jackpotAmount;
						} else if (
							matchedNumbers.length === 5 &&
							!matchedMegaBall
						) {
							ticket.amountWon = 75 * 1000;
						} else if (
							matchedNumbers.length === 4 &&
							matchedMegaBall
						) {
							ticket.amountWon = 10 * 1000;
						} else if (
							matchedNumbers.length === 4 &&
							!matchedMegaBall
						) {
							ticket.amountWon = 500;
						} else if (
							matchedNumbers.length === 3 &&
							matchedMegaBall
						) {
							ticket.amountWon = 200;
						} else if (
							matchedNumbers.length === 3 &&
							!matchedMegaBall
						) {
							ticket.amountWon = 15;
						} else if (
							matchedNumbers.length === 2 &&
							matchedMegaBall
						) {
							ticket.amountWon = 10;
						} else if (
							matchedNumbers.length === 1 &&
							matchedMegaBall
						) {
							ticket.amountWon = 4;
						} else if (
							matchedNumbers.length === 0 &&
							matchedMegaBall
						) {
							ticket.amountWon = 2;
						}
						megamillionResult.totalAmountReceived +=
							MEGAMILLION_TICKET_AMOUNT;
						megamillionResult.totalAmountWon += ticket.amountWon;
						break;
					}
				}
				if (
					ticket.isAmountDisbursed &&
					(ticket.amountWon > 0 || ticket.totalAmountWon > 0)
				) {
					const amount =
						type === 'MEGAMILLION'
							? ticket.amountWon
							: ticket.totalAmountWon;
					await makeTransaction(
						ticket.user._id,
						ticket.user.role,
						`WON_${type.toUpperCase()}`,
						amount
					);
				}
				await ticket.save();
				resolve(ticket);
			})
	);
	lottery.status = 'COMPLETED';
	lottery.results = results;
	lottery.drawTime = moment.now();
	await lottery.save();
	const tickets = await Promise.all(ticketsPromise);
	return type === 'MEGAMILLION'
		? { ...megamillionResult, tickets }
		: { ...borletteResult, tickets };
};
