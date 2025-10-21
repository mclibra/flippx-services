import cron from 'node-cron';
import sharedDatabaseService from './sharedDatabase';

class BaseWorker {
	constructor(name) {
		this.name = name;
		this.isShuttingDown = false;
		this.activeCronJobs = new Set();
		this.setupMessageHandlers();
	}

	/**
	 * Setup message handlers for inter-process communication
	 */
	setupMessageHandlers() {
		process.on('message', async message => {
			switch (message.type) {
				case 'start':
					await this.start(message.config);
					break;
				case 'shutdown':
					await this.shutdown();
					break;
				case 'socket-broadcast-response':
					break;
				default:
					this.log(`Unknown message type: ${message.type}`);
			}
		});

		// Handle uncaught exceptions
		process.on('uncaughtException', error => {
			this.logError('Uncaught exception:', error);
			// Continue execution - do not exit
		});

		// Handle unhandled promise rejections
		process.on('unhandledRejection', reason => {
			this.logError('Unhandled promise rejection:', reason);
			// Continue execution - do not exit
		});
	}

	/**
	 * Start the worker
	 */
	async start() {
		try {
			this.log(`Starting ${this.name} worker...`);

			// Connect to database
			this.log('Connecting to database...');
			await sharedDatabaseService.connect();
			this.log('Database connected successfully');

			// Initialize cron jobs
			this.log('Initializing cron jobs...');
			await this.initializeCronJobs();
			this.log(
				`Cron jobs initialized. Active jobs: ${this.activeCronJobs.size}`
			);

			// Send ready message to parent
			this.sendMessage('ready', { name: this.name });
			this.log(`${this.name} worker started successfully`);
		} catch (error) {
			this.logError('Failed to start worker:', error);
			// Continue execution - do not exit
		}
	}

	/**
	 * Initialize cron jobs - to be implemented by child classes
	 */
	async initializeCronJobs() {
		throw new Error(
			'initializeCronJobs must be implemented by child class'
		);
	}

	/**
	 * Graceful shutdown
	 */
	async shutdown() {
		this.isShuttingDown = true;

		try {
			// Stop all active cron jobs
			await this.stopAllCronJobs();

			// Disconnect from database
			await sharedDatabaseService.disconnect();

			process.exit(0);
		} catch (error) {
			this.logError('Error during shutdown:', error);
			process.exit(1);
		}
	}

	/**
	 * Stop all cron jobs
	 */
	async stopAllCronJobs() {
		for (const cronJob of this.activeCronJobs) {
			try {
				if (cronJob && typeof cronJob.destroy === 'function') {
					cronJob.destroy();
				}
			} catch (error) {
				this.logError('Error stopping cron job:', error);
			}
		}

		this.activeCronJobs.clear();
	}

	/**
	 * Graceful exit with cleanup
	 */
	async gracefulExit(code = 0) {
		if (!this.isShuttingDown) {
			await this.shutdown();
		} else {
			process.exit(code);
		}
	}

	/**
	 * Send message to parent process
	 */
	sendMessage(type, data) {
		if (process.send) {
			process.send({ type, data });
		}
	}

	/**
	 * Send log message to parent process for centralized logging
	 */
	log(message) {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] ${message}`;

		// Log locally for debugging
		console.log(logMessage);

		// Send to parent for centralized logging
		this.sendMessage('log', logMessage);
	}

	/**
	 * Send error message to parent process for centralized logging
	 */
	logError(message, error = null) {
		const timestamp = new Date().toISOString();
		const errorMessage = error
			? `${message} ${error.stack || error}`
			: message;
		const logMessage = `[${timestamp}] ERROR: ${errorMessage}`;

		// Log locally for debugging
		console.error(logMessage);

		// Send to parent for centralized logging
		this.sendMessage('error', logMessage);
	}

	/**
	 * Safe cron job execution wrapper with enhanced error recovery
	 */
	async executeCronJob(jobName, jobFunction) {
		if (this.isShuttingDown) {
			return;
		}

		const maxRetries = 3;
		let lastError = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				// Ensure database connection
				await sharedDatabaseService.ensureConnection();

				// Execute the cron job
				await jobFunction();

				// Success - clear any previous errors
				return;
			} catch (error) {
				lastError = error;

				// Check if it's a database connection error
				const isDbError =
					error.name === 'MongoNetworkError' ||
					error.name === 'MongoTimeoutError' ||
					error.message?.includes('connection') ||
					error.message?.includes('timeout');

				if (isDbError && attempt < maxRetries) {
					this.logError(
						`Database error in cron job ${jobName} (attempt ${attempt}/${maxRetries}), retrying...`,
						error
					);

					// Wait before retrying (exponential backoff)
					await this.delay(1000 * attempt);

					// Force reconnection
					try {
						await sharedDatabaseService.disconnect();
						await sharedDatabaseService.connect();
					} catch (reconnectError) {
						this.logError(
							'Failed to reconnect during retry:',
							reconnectError
						);
					}
				} else {
					// Non-DB error or max retries reached
					this.logError(`Error in cron job ${jobName}:`, error);
					break;
				}
			}
		}

		// If we got here with an error after all retries, log it
		if (lastError) {
			this.logError(
				`Cron job ${jobName} failed after ${maxRetries} attempts:`,
				lastError
			);
		}
	}

	/**
	 * Utility delay function
	 */
	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Register a cron job
	 */
	registerCronJob(cronJob) {
		this.activeCronJobs.add(cronJob);
		return cronJob;
	}

	/**
	 * Create a safe cron job wrapper
	 */
	createSafeCronJob(schedule, jobName, jobFunction, options = {}) {
		this.log(`Creating cron job: ${jobName} with schedule: ${schedule}`);

		let executionCount = 0;

		try {
			const cronJob = cron.schedule(
				schedule,
				async () => {
					executionCount++;
					const executionId = executionCount;

					this.log(`Starting ${jobName} execution #${executionId}`);

					try {
						await this.executeCronJob(jobName, jobFunction);
						this.log(
							`Completed ${jobName} execution #${executionId}`
						);
					} catch (error) {
						this.logError(
							`${jobName} execution #${executionId} failed:`,
							error
						);
					}
				},
				{
					scheduled: true,
					...options,
				}
			);

			this.registerCronJob(cronJob);
			this.log(
				`✅ Cron job registered: ${jobName} with schedule ${schedule}`
			);

			return cronJob;
		} catch (error) {
			this.logError(`❌ Failed to create cron job ${jobName}:`, error);
			throw error;
		}
	}
}

export default BaseWorker;
