import cron from 'node-cron';
import moment from 'moment-timezone';
import { Lottery } from '../../api/lottery/model';
import { fetchGameResult } from '../lottery/externalLottery';
import { publishResult } from '../../api/lottery/resultPublisher';

// Cron job: Check and publish lottery results
export const schedulePublishResults = () => {
	cron.schedule('*/5 * * * *', async () => {
		// Run every 5 minutes
		console.log('Running cron job: Check and publish results');
		try {
			const now = moment();
			const lotteries = await Lottery.find({
				status: 'SCHEDULED',
				scheduledTime: {
					$lt: now.subtract(5, 'minutes').valueOf(),
				},
			});

			if (lotteries.length > 0) {
				console.log(`Found ${lotteries.length} lotteries ready to be published`);
				for (const lottery of lotteries) {
					await fetchAndPublishResults(lottery);
				}
			} else {
				console.log(`No lotteries found to be published`);
			}
		} catch (error) {
			console.error('Error in publishResults cron job:', error);
		}
	});
};

// Exported function to create lotteries for a state (used by state and lottery services)
export const createLotteriesForState = async state => {
	try {
		const { externalLotteries, megaMillions } = state;
		const today = moment().format('dddd');

		// Create BORLETTE lotteries based on flexible configuration
		if (externalLotteries && externalLotteries.length > 0) {
			for (const lotteryConfig of externalLotteries) {
				// Skip if not scheduled to run today
				if (!lotteryConfig.drawDays?.[today]) {
					console.log(
						`BORLETTE lottery ${lotteryConfig.name} for ${state.name} does not run today`
					);
					continue;
				}

				// Skip if missing required game IDs
				if (!lotteryConfig.pick4GameId) {
					console.log(
						`BORLETTE lottery ${lotteryConfig.name} for ${state.name} missing pick4GameId`
					);
					continue;
				}

				// Check if there's already an active lottery for this type and session
				const existingLottery = await Lottery.findOne({
					state: state._id,
					type: 'BORLETTE',
					status: { $ne: 'COMPLETED' },
					metadata: lotteryConfig.name.toLowerCase(),
				});

				if (!existingLottery) {
					// Create a new lottery
					const drawTime = moment.tz(
						`${moment().format('YYYY-MM-DD')} ${lotteryConfig.drawTime}`,
						lotteryConfig.drawTimezone
					);

					const externalGameIds = {
						pick4: lotteryConfig.pick4GameId,
					};

					// Add pick3 ID if available
					if (lotteryConfig.pick3GameId) {
						externalGameIds.pick3 = lotteryConfig.pick3GameId;
					}

					await Lottery.create({
						title: `${state.name} Borlette ${lotteryConfig.name}`,
						type: 'BORLETTE',
						scheduledTime: drawTime.valueOf(),
						metadata: lotteryConfig.name.toLowerCase(),
						state: state._id,
						status: 'SCHEDULED',
						createdBy: null,
						externalGameIds,
						// Store whether this lottery supports marriage numbers
						additionalData: {
							hasMarriageNumbers: lotteryConfig.hasMarriageNumbers
						}
					});

					console.log(
						`Created new BORLETTE lottery for ${state.name} ${lotteryConfig.name}`
					);
				} else {
					console.log(
						`BORLETTE lottery for ${state.name} ${lotteryConfig.name} has already been created`
					);
				}
			}
		}

		// Create for Mega Millions
		if (megaMillions?.gameId && megaMillions?.drawDays?.[today]) {
			// Check if there's already an active Mega Millions lottery
			const existingLottery = await Lottery.findOne({
				state: state._id,
				type: 'MEGAMILLION',
				status: { $ne: 'COMPLETED' },
			});

			if (!existingLottery) {
				// Create a new lottery
				const drawTime = moment.tz(
					`${moment().format('YYYY-MM-DD')} ${megaMillions.drawTime}`,
					megaMillions.drawTimezone
				);

				await Lottery.create({
					title: `${state.name} Mega Millions`,
					type: 'MEGAMILLION',
					scheduledTime: drawTime.valueOf(),
					jackpotAmount: 1000000, // Default jackpot amount
					state: state._id,
					status: 'SCHEDULED',
					createdBy: null,
					externalGameIds: {
						megaMillions: megaMillions.gameId,
					},
				});

				console.log(
					`Created new MEGAMILLION lottery for ${state.name}`
				);
			}
		}

		return {
			success: true,
			message: `Lotteries created for state: ${state.name}`,
		};
	} catch (error) {
		console.error(
			`Error creating lotteries for state ${state.name}:`,
			error
		);
		return {
			success: false,
			error: error.message,
		};
	}
};

// Helper function to fetch and publish results
async function fetchAndPublishResults(lottery) {
	try {
		console.log(`Publishing ${lottery.type} - ${lottery.metadata} lottery`);
		if (lottery.type === 'BORLETTE') {
			const pick4Id = lottery.externalGameIds.pick4;
			const pick3Id = lottery.externalGameIds.pick3;

			const pick4Result = await fetchGameResult(pick4Id);

			if (!pick4Result?.data?.winningNumbers) {
				console.error(
					'Invalid pick4 result data for BORLETTE lottery:',
					lottery.id
				);
				return;
			}

			let pick3Result = null;
			let pick3Numbers = null;

			// If pick3 ID exists, fetch its results
			if (pick3Id) {
				pick3Result = await fetchGameResult(pick3Id);
				if (pick3Result?.data?.winningNumbers) {
					pick3Numbers = pick3Result.data.winningNumbers;
				}
			}

			// Format the results
			const pick4Numbers = pick4Result.data.winningNumbers;

			// If no pick3 numbers available, use first 3 digits of pick4
			if (!pick3Numbers) {
				pick3Numbers = pick4Numbers.slice(0, 3);
			}

			// First number: Pick 3 numbers (either from pick3 game or first 3 of pick4)
			const firstNumber = pick3Numbers.join('');

			// Second number: first 2 digits of Pick 4
			const secondNumber = pick4Numbers.slice(0, 2).join('');

			// Third number: last 2 digits of Pick 4
			const thirdNumber = pick4Numbers.slice(2, 4).join('');

			const results = {
				numbers: [firstNumber, secondNumber, thirdNumber],
				hasMarriageNumbers: lottery.additionalData?.hasMarriageNumbers || false
			};

			await processTicketsForLottery(lottery._id, results);
		} else if (lottery.type === 'MEGAMILLION') {
			const megaId = lottery.externalGameIds.megaMillions;
			const megaResult = await fetchGameResult(megaId);

			if (
				!megaResult?.data?.winningNumbers ||
				!megaResult?.data?.additionalNumbers
			) {
				console.error(
					'Invalid result data for MEGAMILLION lottery:',
					lottery.id
				);
				return;
			}

			const mainNumbers = megaResult.data.winningNumbers;
			const megaBall = megaResult.data.additionalNumbers[0];

			const results = {
				numbers: mainNumbers,
				megaBall: megaBall,
			};

			await processTicketsForLottery(lottery._id, results);
		}
	} catch (error) {
		console.error(
			`Error publishing results for lottery ${lottery.id}:`,
			error
		);
	}
}

async function processTicketsForLottery(lotteryId, results) {
	try {
		console.log(
			`Processing tickets for lottery ${lotteryId} with results:`,
			results
		);

		const published = await publishResult(lotteryId, results);

		console.log(
			`Processed tickets for lottery ${lotteryId} with status:`,
			published
		);

		// After successfully publishing lottery results, create new lotteries for the state
		if (published.status === 200) {
			const lottery = await Lottery.findById(lotteryId).populate('state');
			if (lottery && lottery.state) {
				console.log(
					`Creating new lotteries for state: ${lottery.state.name} after publishing lottery: ${lotteryId}`
				);
				const lotteryCreationResult = await createLotteriesForState(
					lottery.state
				);
				console.log(`Lottery creation result:`, lotteryCreationResult);
			}
		}
	} catch (error) {
		console.error(
			`Error processing tickets for lottery ${lotteryId}:`,
			error
		);
	}
}

export const initCronJobs = () => {
	schedulePublishResults();
	console.log('Cron jobs initialized');
};