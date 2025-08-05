// src/services/workers/workers/lotteryWorker.js
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
        this.log('Initializing lottery cron jobs...');

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

        this.log('Lottery cron jobs initialized successfully');
    }

    /**
     * Check and publish lottery results
     * Original: cron.schedule('*\/5 * * * *', ...)
     */
    async checkAndPublishResults() {
        this.log('Running cron job: Check and publish results');

        try {
            const now = moment();
            const lotteries = await Lottery.find({
                status: {
                    $in: ['SCHEDULED', 'ERROR']
                },
                scheduledTime: {
                    $lt: now.subtract(5, 'minutes').valueOf(),
                },
            });

            if (lotteries.length > 0) {
                this.log(`Found ${lotteries.length} lotteries ready to be published`);

                for (const lottery of lotteries) {
                    this.log(`Setting lottery status of ${lottery._id} to WAITING at ${moment.now()}`);
                    lottery.status = 'WAITING';
                    await lottery.save();
                    await this.fetchAndPublishResults(lottery);
                }

                this.log('[LOTTERY: CRON] Check and publish results completed successfully');
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
        this.log('Running cron job: Analyze and create missing lotteries');

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
                    if (state.externalLotteries && state.externalLotteries.length > 0) {
                        for (const lotteryConfig of state.externalLotteries) {
                            if (lotteryConfig.drawDays?.[today] || lotteryConfig.drawDays?.[tomorrow]) {
                                hasUpcomingDrawDays = true;
                                break;
                            }
                        }
                    }

                    // Check mega millions if no external lotteries have upcoming draws
                    if (!hasUpcomingDrawDays && state.megaMillions?.drawDays) {
                        if (state.megaMillions.drawDays[today] || state.megaMillions.drawDays[tomorrow]) {
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

                    // Only log when lotteries are actually created (not when they already exist)
                    if (result.success && result.message && result.message.includes('created')) {
                        this.log(`[LOTTERY: ANALYSIS] ${result.message}`);
                        totalLotteriesCreated++;
                    }

                } catch (stateError) {
                    this.logError(`Error analyzing state ${state.name} (${state.code}):`, stateError);
                }
            }

            // Log summary only if lotteries were created
            if (totalLotteriesCreated > 0) {
                this.log(`[LOTTERY: ANALYSIS] Completed - Processed ${totalStatesProcessed} states, created lotteries for ${totalLotteriesCreated} states`);
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
            this.log(`Publishing ${lottery.type} - ${lottery.metadata} lottery`);
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

                const mainNumbers = megaResult.data.winningNumbers;
                const megaBall = megaResult.data.additionalNumbers[0];

                const results = {
                    numbers: mainNumbers,
                    megaBall: megaBall,
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
            this.log(
                `Processing tickets for lottery ${lotteryId} with results:`,
                results
            );

            const published = await publishResult(lotteryId, results);

            this.log(
                `Processed tickets for lottery ${lotteryId} with status:`,
                published
            );

            // After successfully publishing lottery results, create new lotteries for the state
            if (published.status === 200) {
                const lottery = await Lottery.findById(lotteryId).populate('state');
                if (lottery && lottery.state) {
                    this.log(
                        `Creating new lotteries for state: ${lottery.state.name} after publishing lottery: ${lotteryId}`
                    );
                    const lotteryCreationResult = await createLotteriesForState(
                        lottery.state
                    );
                    this.log(`Lottery creation result:`, lotteryCreationResult);
                }
            }
        } catch (error) {
            this.logError(
                `Error processing tickets for lottery ${lotteryId}:`,
                error
            );
        }
    }
}

// Start the worker
const lotteryWorker = new LotteryWorker();

// Export for testing purposes
export default LotteryWorker;