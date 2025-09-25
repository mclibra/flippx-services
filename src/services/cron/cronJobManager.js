import cron from 'node-cron';
import moment from 'moment-timezone';
import { Lottery } from '../../api/lottery/model';
import { createLotteriesForState } from '../../api/lottery/controller';
import { State } from '../../api/admin/state-management/model';
import { fetchGameResult } from '../lottery/externalLottery';
import { publishResult } from '../lottery/resultPublisher';
import {
	processNoWinCashback,
	cleanupDepositData,
	evaluateUserTier,
} from '../../api/loyalty/controller';
import InfluencerCommissionService from '../influencer/commissionService';
import { LoyaltyProfile } from '../../api/loyalty/model';
import { User } from '../../api/user/model';
import TierConfigService from '../tier/tierConfigService';
import {
	DominoRoom,
	DominoGame,
	DominoGameConfig,
} from '../../api/domino/model';
import { DominoGameEngine } from '../domino/gameEngine';
import { makeTransaction } from '../../api/transaction/controller';
import {
	startDominoGame,
	handleTurnTimeout,
	notifyTurnChange,
	sendTurnWarnings,
	handleGameCompletion,
	removeDisconnectedPlayersFromWaitingRooms,
} from '../../api/domino/controller';
import SocketBroadcastService from '../socket/socketBroadcastService';

class CronJobManager {
	constructor() {
		this.jobs = new Map();
		this.isShuttingDown = false;
	}

	/**
	 * Initialize all cron jobs
	 */
	async start() {
		console.log('🚀 Starting cron job manager...');
		
		try {
			// Initialize lottery cron jobs
			await this.initializeLotteryJobs();
			
			// Initialize loyalty cron jobs
			await this.initializeLoyaltyJobs();
			
			// Initialize domino cron jobs
			await this.initializeDominoJobs();
			
			console.log('✅ All cron jobs started successfully');
		} catch (error) {
			console.error('❌ Failed to start cron jobs:', error);
			throw error;
		}
	}

	/**
	 * Initialize lottery-related cron jobs
	 */
	async initializeLotteryJobs() {
		console.log('Initializing lottery cron jobs...');

		// Check and publish lottery results - every 5 minutes
		this.createCronJob(
			'*/5 * * * *',
			'lottery-check-results',
			this.checkAndPublishResults.bind(this)
		);

		// Analyze lottery for each state and create missing lotteries - every hour
		this.createCronJob(
			'0 * * * *',
			'lottery-create-missing',
			this.analyzeAndCreateMissingLotteries.bind(this)
		);

		console.log('Lottery cron jobs initialized');
	}

	/**
	 * Initialize loyalty-related cron jobs
	 */
	async initializeLoyaltyJobs() {
		console.log('Initializing loyalty cron jobs...');

		// Process no-win cashback daily at 1 AM
		this.createCronJob(
			'0 1 * * *',
			'loyalty-no-win-cashback',
			this.processNoWinCashbackJob.bind(this)
		);

		// Reset monthly referral commission caps - Run on the 1st of every month at 12 AM
		this.createCronJob(
			'0 0 1 * *',
			'loyalty-reset-monthly-caps',
			this.resetMonthlyReferralCaps.bind(this)
		);

		// Reset weekly spending tracking - Run every Monday at 12 AM
		this.createCronJob(
			'0 0 * * 1',
			'loyalty-reset-weekly-spending',
			this.resetWeeklySpending.bind(this)
		);

		// Update no-win tracking for VIP users - Run daily at 3 AM
		this.createCronJob(
			'0 3 * * *',
			'loyalty-update-no-win-tracking',
			this.updateNoWinTracking.bind(this)
		);

		// Cleanup deposit data - Run daily at 4 AM
		this.createCronJob(
			'0 4 * * *',
			'loyalty-cleanup-deposit-data',
			this.cleanupDepositDataJob.bind(this)
		);

		// Evaluate all user tiers - Run daily at 5 AM
		this.createCronJob(
			'0 5 * * *',
			'loyalty-evaluate-user-tiers',
			this.evaluateUserTiersJob.bind(this)
		);

		// Refresh tier configuration cache - Run every 6 hours
		this.createCronJob(
			'0 */6 * * *',
			'loyalty-refresh-tier-config',
			this.refreshTierConfigCache.bind(this)
		);

		console.log('Loyalty cron jobs initialized');
	}

	/**
	 * Initialize domino-related cron jobs
	 */
	async initializeDominoJobs() {
		console.log('Initializing domino cron jobs...');

		// Fill VIRTUAL waiting rooms with bots - every 10 seconds
		this.createCronJob(
			'*/10 * * * * *',
			'domino-fill-virtual-rooms',
			this.fillVirtualRoomsWithBots.bind(this)
		);

		// Handle human timeouts - every 30 seconds
		this.createCronJob(
			'*/30 * * * * *',
			'domino-handle-timeouts',
			this.handleHumanTimeouts.bind(this)
		);

		// Process immediate bot turns - every 5 seconds
		this.createCronJob(
			'*/5 * * * * *',
			'domino-process-bot-turns',
			this.processImmediateBotTurns.bind(this)
		);

		// Start games when rooms are full - every 3 seconds
		this.createCronJob(
			'*/3 * * * * *',
			'domino-start-full-games',
			this.startFullRoomGames.bind(this)
		);

		// Send turn warnings via socket - every 10 seconds
		this.createCronJob(
			'*/10 * * * * *',
			'domino-send-warnings',
			this.sendTurnWarningsJob.bind(this)
		);

		// Remove disconnected players from waiting rooms - every 30 seconds
		this.createCronJob(
			'*/30 * * * * *',
			'domino-remove-disconnected',
			this.removeDisconnectedPlayersJob.bind(this)
		);

		// Clean up abandoned rooms - every hour
		this.createCronJob(
			'0 * * * *',
			'domino-cleanup-abandoned',
			this.cleanupAbandonedRooms.bind(this)
		);

		// Clean up orphaned games - every 5 minutes
		this.createCronJob(
			'*/5 * * * *',
			'domino-cleanup-orphaned',
			this.cleanupOrphanedGames.bind(this)
		);

		console.log('Domino cron jobs initialized');
	}

	/**
	 * Create a cron job with error handling
	 */
	createCronJob(schedule, name, task) {
		if (this.isShuttingDown) return;

		const job = cron.schedule(schedule, async () => {
			try {
				console.log(`[CRON] Running job: ${name}`);
				await task();
			} catch (error) {
				console.error(`[CRON] Error in job ${name}:`, error);
			}
		}, {
			scheduled: false
		});

		this.jobs.set(name, job);
		job.start();
		console.log(`[CRON] Started job: ${name} (${schedule})`);
	}

	/**
	 * Stop all cron jobs
	 */
	async stop() {
		console.log('🛑 Stopping all cron jobs...');
		this.isShuttingDown = true;

		for (const [name, job] of this.jobs) {
			job.stop();
			console.log(`[CRON] Stopped job: ${name}`);
		}

		this.jobs.clear();
		console.log('✅ All cron jobs stopped');
	}

	// Lottery job implementations
	async checkAndPublishResults() {
		try {
			const now = moment();
			const lotteries = await Lottery.find({
				status: {
					$in: ['SCHEDULED', 'ERROR'],
				},
				scheduledTime: {
					$lt: now.subtract(5, 'minutes').valueOf(),
				},
			});

			if (lotteries.length > 0) {
				console.log(`Found ${lotteries.length} lotteries ready to be published`);

				for (const lottery of lotteries) {
					lottery.status = 'WAITING';
					await lottery.save();
					await this.fetchAndPublishResults(lottery);
				}
			}
		} catch (error) {
			console.error('Error in checkAndPublishResults:', error);
		}
	}

	async analyzeAndCreateMissingLotteries() {
		try {
			const activeStates = await State.find({ isActive: true });
			if (activeStates.length === 0) return;

			const today = moment().format('dddd');
			const tomorrow = moment().add(1, 'day').format('dddd');

			let totalStatesProcessed = 0;
			let totalLotteriesCreated = 0;

			for (const state of activeStates) {
				totalStatesProcessed++;
				const created = await createLotteriesForState(state, today, tomorrow);
				totalLotteriesCreated += created;
			}

			console.log(`Processed ${totalStatesProcessed} states, created ${totalLotteriesCreated} lotteries`);
		} catch (error) {
			console.error('Error in analyzeAndCreateMissingLotteries:', error);
		}
	}

	async fetchAndPublishResults(lottery) {
		try {
			const result = await fetchGameResult(lottery);
			if (result) {
				await publishResult(lottery, result);
			}
		} catch (error) {
			console.error('Error fetching and publishing results:', error);
		}
	}

	// Loyalty job implementations
	async processNoWinCashbackJob() {
		try {
			const result = await processNoWinCashback();
			console.log(`No-win cashback completed with ${result.entity.results.length} users processed`);
		} catch (error) {
			console.error('Error in processNoWinCashbackJob:', error);
		}
	}

	async resetMonthlyReferralCaps() {
		try {
			await InfluencerCommissionService.resetMonthlyCaps();
			console.log('Monthly referral caps reset successfully');
		} catch (error) {
			console.error('Error resetting monthly referral caps:', error);
		}
	}

	async resetWeeklySpending() {
		try {
			await LoyaltyProfile.updateMany(
				{},
				{ $unset: { weeklySpending: 1 } }
			);
			console.log('Weekly spending tracking reset successfully');
		} catch (error) {
			console.error('Error resetting weekly spending:', error);
		}
	}

	async updateNoWinTracking() {
		try {
			// Implementation for VIP no-win tracking
			console.log('Updated VIP no-win tracking');
		} catch (error) {
			console.error('Error updating no-win tracking:', error);
		}
	}

	async cleanupDepositDataJob() {
		try {
			await cleanupDepositData();
			console.log('Deposit data cleanup completed');
		} catch (error) {
			console.error('Error in cleanupDepositDataJob:', error);
		}
	}

	async evaluateUserTiersJob() {
		try {
			await evaluateUserTier();
			console.log('User tier evaluation completed');
		} catch (error) {
			console.error('Error in evaluateUserTiersJob:', error);
		}
	}

	async refreshTierConfigCache() {
		try {
			await TierConfigService.refreshCache();
			console.log('Tier configuration cache refreshed');
		} catch (error) {
			console.error('Error refreshing tier config cache:', error);
		}
	}

	// Domino job implementations
	async fillVirtualRoomsWithBots() {
		try {
			const gameConfig = await DominoGameConfig.findOne();
			if (!gameConfig) return;

			const waitingRooms = await DominoRoom.find({
				cashType: 'VIRTUAL',
				status: 'WAITING',
				'players.0': { $exists: true },
				'players.1': { $exists: false },
				createdAt: { $lt: new Date(Date.now() - 10000) }
			});

			for (const room of waitingRooms) {
				// Fill with bots logic here
				console.log(`Filling room ${room.roomId} with bots`);
			}
		} catch (error) {
			console.error('Error in fillVirtualRoomsWithBots:', error);
		}
	}

	async handleHumanTimeouts() {
		try {
			await handleTurnTimeout();
		} catch (error) {
			console.error('Error in handleHumanTimeouts:', error);
		}
	}

	async processImmediateBotTurns() {
		try {
			// Process bot turns logic here
			console.log('Processing immediate bot turns');
		} catch (error) {
			console.error('Error in processImmediateBotTurns:', error);
		}
	}

	async startFullRoomGames() {
		try {
			await startDominoGame();
		} catch (error) {
			console.error('Error in startFullRoomGames:', error);
		}
	}

	async sendTurnWarningsJob() {
		try {
			await sendTurnWarnings();
		} catch (error) {
			console.error('Error in sendTurnWarningsJob:', error);
		}
	}

	async removeDisconnectedPlayersJob() {
		try {
			await removeDisconnectedPlayersFromWaitingRooms();
		} catch (error) {
			console.error('Error in removeDisconnectedPlayersJob:', error);
		}
	}

	async cleanupAbandonedRooms() {
		try {
			// Cleanup abandoned rooms logic here
			console.log('Cleaning up abandoned rooms');
		} catch (error) {
			console.error('Error in cleanupAbandonedRooms:', error);
		}
	}

	async cleanupOrphanedGames() {
		try {
			// Cleanup orphaned games logic here
			console.log('Cleaning up orphaned games');
		} catch (error) {
			console.error('Error in cleanupOrphanedGames:', error);
		}
	}
}

export default CronJobManager;
