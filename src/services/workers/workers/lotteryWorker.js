import BaseWorker from '../baseWorker';
import moment from 'moment-timezone';
import { Lottery } from '../../../api/lottery/model';
import { createLotteriesForState } from '../../../api/lottery/controller';
import { State } from '../../../api/admin/state-management/model';
import { fetchGameResult } from '../../lottery/externalLottery';
import { publishResult } from '../../lottery/resultPublisher';

class LotteryWorker extends BaseWorker {
	constructor() {
		super('lottery');
	}

	/**
	 * Initialize all lottery-related cron jobs
	 */
	async initializeCronJobs() {
		// Check and publish lottery results - every 5 minutes
		this.createSafeCronJob(
			'*/5 * * * *',
			'check-and-publish-results',
			this.checkAndPublishResults.bind(this)
		);

		// Analyze lottery for each state and create missing lotteries - every hour
		this.createSafeCronJob(
			'0 * * * *',
			'analyze-and-create-missing-lotteries',
			this.analyzeAndCreateMissingLotteries.bind(this)
		);
	}

	/**
	 * Check and publish lottery results
	 * Original: cron.schedule('*\/5 * * * *', ...)
	 */
	async checkAndPublishResults() {
		try {
			const now = moment();
			const lotteries = await Lottery.find({
				status: {
					$in: ['SCHEDULED', 'ERROR'],
				},
				scheduledTime: {
					$lt: now.subtract(15, 'minutes').valueOf(),
				},
			});

			if (lotteries.length > 0) {
				for (const lottery of lotteries) {
					lottery.status = 'WAITING';
					await lottery.save();
					await this.fetchAndPublishResults(lottery);
				}
			}
		} catch (error) {
			this.logError('Error in publishResults cron job:', error);
		}
	}

	/**
	 * Analyze lottery for each state and create missing lotteries
	 * Original: cron.schedule('0 * * * *', ...)
	 */
	async analyzeAndCreateMissingLotteries() {
		try {
			// Get all active states
			const activeStates = await State.find({ isActive: true });

			if (activeStates.length === 0) {
				return;
			}

			const today = moment().format('dddd');
			const tomorrow = moment().add(1, 'day').format('dddd');

			let totalStatesProcessed = 0;
			let totalLotteriesCreated = 0;

			for (const state of activeStates) {
				try {
					// Check if state has upcoming draw days (today or tomorrow)
					let hasUpcomingDrawDays = false;

					// Check external lotteries
					if (
						state.externalLotteries &&
						state.externalLotteries.length > 0
					) {
						for (const lotteryConfig of state.externalLotteries) {
							if (
								lotteryConfig.drawDays?.[today] ||
								lotteryConfig.drawDays?.[tomorrow]
							) {
								hasUpcomingDrawDays = true;
								break;
							}
						}
					}

					// Check mega millions if no external lotteries have upcoming draws
					if (!hasUpcomingDrawDays && state.megaMillions?.drawDays) {
						if (
							state.megaMillions.drawDays[today] ||
							state.megaMillions.drawDays[tomorrow]
						) {
							hasUpcomingDrawDays = true;
						}
					}

					// Skip states with no upcoming draw days
					if (!hasUpcomingDrawDays) {
						continue;
					}

					totalStatesProcessed++;

					// Call existing function to create lotteries for this state
					const result = await createLotteriesForState(state);

					// Only count when lotteries are actually created (not when they already exist)
					if (
						result.success &&
						result.message &&
						result.message.includes('created')
					) {
						totalLotteriesCreated++;
					}
				} catch (stateError) {
					this.logError(
						`Error analyzing state ${state.name} (${state.code}):`,
						stateError
					);
				}
			}

		} catch (error) {
			this.logError('Error in lottery analysis cron job:', error);
		}
	}

	/**
	 * Fetch and publish results for a lottery
	 * Extracted from original lottery.js
	 */
	async fetchAndPublishResults(lottery) {
		try {
			if (lottery.type === 'BORLETTE') {
				const pick4Id = lottery.externalGameIds.pick4;
				const pick3Id = lottery.externalGameIds.pick3;

				const pick4Result = await fetchGameResult(pick4Id);

				if (!pick4Result?.data?.winningNumbers) {
					this.logError(
						'Invalid pick4 result data for BORLETTE lottery:',
						lottery._id
					);
					return;
				}

				// Validate that the API result date matches the lottery's scheduled date
				const lotteryDate = moment(lottery.scheduledTime).format(
					'YYYY-MM-DD'
				);
				const apiDrawDate = pick4Result.data.drawDate;

				if (apiDrawDate !== lotteryDate) {
					console.log(
						`API draw date (${apiDrawDate}) does not match lottery date (${lotteryDate}) for lottery ${lottery._id}. Skipping for now.`
					);
					return;
				}

				// Check if this drawNumber has already been processed to prevent duplicate results
				const drawNumber = pick4Result.data.drawNumber;
				const existingDrawNumber = await Lottery.findOne({
					drawNumber: drawNumber,
					state: lottery.state,
					type: 'BORLETTE',
					status: 'COMPLETED',
				});

				if (existingDrawNumber) {
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
					hasMarriageNumbers:
						lottery.additionalData?.hasMarriageNumbers || false,
					drawNumber: drawNumber,
					drawDate: apiDrawDate,
				};

				await this.processTicketsForLottery(lottery._id, results);
			} else if (lottery.type === 'MEGAMILLION') {
				const megaId = lottery.externalGameIds.megaMillions;
				const megaResult = await fetchGameResult(megaId);

				if (
					!megaResult?.data?.winningNumbers ||
					!megaResult?.data?.additionalNumbers
				) {
					this.logError(
						'Invalid result data for MEGAMILLION lottery:',
						lottery.id
					);
					return;
				}

				// Validate that the API result date matches the lottery's scheduled date
				const megaLotteryDate = moment(lottery.scheduledTime).format(
					'YYYY-MM-DD'
				);
				const megaApiDrawDate = megaResult.data.drawDate;

				if (megaApiDrawDate !== megaLotteryDate) {
					console.log(
						`API draw date (${megaApiDrawDate}) does not match lottery date (${megaLotteryDate}) for MEGAMILLION lottery ${lottery._id}. Skipping for now.`
					);
					return;
				}

				// Check if this drawNumber has already been processed to prevent duplicate results
				const megaDrawNumber = megaResult.data.drawNumber;
				const existingMegaDrawNumber = await Lottery.findOne({
					drawNumber: megaDrawNumber,
					type: 'MEGAMILLION',
					status: 'COMPLETED',
				});

				if (existingMegaDrawNumber) {
					return;
				}

				const mainNumbers = megaResult.data.winningNumbers;
				const megaBall = megaResult.data.additionalNumbers[0];

				const results = {
					numbers: mainNumbers,
					megaBall: megaBall,
					drawNumber: megaDrawNumber,
					drawDate: megaApiDrawDate,
				};

				await this.processTicketsForLottery(lottery._id, results);
			}
		} catch (error) {
			lottery.status = 'ERROR';
			await lottery.save();
			this.logError(
				`Error publishing results for lottery ${lottery.id}:`,
				error
			);
		}
	}

	/**
	 * Process tickets for lottery
	 * Extracted from original lottery.js
	 */
	async processTicketsForLottery(lotteryId, results) {
		try {
			await publishResult(lotteryId, results);

			// Note: Lottery creation is handled separately by the analyzeAndCreateMissingLotteries cron job
			// to prevent race conditions and duplicate lottery creation issues
		} catch (error) {
			this.logError(
				`Error processing tickets for lottery ${lotteryId}:`,
				error
			);
		}
	}
}

// Start the worker
new LotteryWorker();

// Export for testing purposes
export default LotteryWorker;
