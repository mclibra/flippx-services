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
					// Handle socket broadcast responses - these are handled by SocketBroadcastService
					// No action needed here as the service handles the response
					break;
				default:
					this.log(`Unknown message type: ${message.type}`);
			}
		});

		// Handle uncaught exceptions
		process.on('uncaughtException', error => {
			this.logError('Uncaught exception:', error);
			this.gracefulExit(1);
		});

		// Handle unhandled promise rejections
		process.on('unhandledRejection', (reason, promise) => {
			this.logError('Unhandled promise rejection:', reason);
			this.gracefulExit(1);
		});
	}

	/**
	 * Start the worker
	 */
	async start(config) {
		try {
			this.log(`Starting ${this.name} worker...`);

			// Connect to database
			await sharedDatabaseService.connect();

			// Initialize cron jobs
			await this.initializeCronJobs();

			// Send ready message to parent
			this.sendMessage('ready', { name: this.name });

			this.log(`${this.name} worker started successfully`);
		} catch (error) {
			this.logError('Failed to start worker:', error);
			this.gracefulExit(1);
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
		this.log(`Shutting down ${this.name} worker...`);

		try {
			// Stop all active cron jobs
			await this.stopAllCronJobs();

			// Disconnect from database
			await sharedDatabaseService.disconnect();

			this.log(`${this.name} worker shut down gracefully`);
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
		this.log(`Stopping ${this.activeCronJobs.size} active cron jobs...`);

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
		this.log('All cron jobs stopped');
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
	 * Safe cron job execution wrapper
	 */
	async executeCronJob(jobName, jobFunction) {
		if (this.isShuttingDown) {
			return;
		}

		try {
			// Ensure database connection
			await sharedDatabaseService.ensureConnection();

			// Execute the cron job
			await jobFunction();
		} catch (error) {
			this.logError(`Error in cron job ${jobName}:`, error);
		}
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
		// Import cron here to avoid issues
		const cron = require('node-cron');

		const cronJob = cron.schedule(
			schedule,
			async () => {
				await this.executeCronJob(jobName, jobFunction);
			},
			{
				scheduled: true,
				noOverlap: true,
				...options,
			}
		);

		this.registerCronJob(cronJob);
		this.log(`Registered cron job: ${jobName} (${schedule})`);

		return cronJob;
	}
}

export default BaseWorker;
