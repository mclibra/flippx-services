import { fork } from 'child_process';
import path from 'path';
import SocketBroadcastService from '../socket/socketBroadcastService';

class WorkerManager {
	constructor() {
		this.workers = new Map();
		this.isShuttingDown = false;
		this.restartAttempts = new Map();
		this.maxRestartAttempts = Infinity; // Never stop trying to restart workers
		this.baseRestartDelay = 2000; // Increased initial delay
		this.maxRestartDelay = 60000; // Increased max delay to 1 minute
		this.consecutiveFailureWindow = 300000; // 5 minutes - reset count after this period
		this.lastRestartTime = new Map();
	}

	/**
	 * Initialize and start all worker processes
	 */
	async start() {
		const workerConfigs = [
			{
				name: 'lottery-worker',
				script: path.join(__dirname, 'entries/lotteryWorkerEntry.js'),
				description: 'Handles lottery cron jobs',
			},
			{
				name: 'loyalty-worker',
				script: path.join(__dirname, 'entries/loyaltyWorkerEntry.js'),
				description: 'Handles loyalty program cron jobs',
			},
			{
				name: 'domino-worker',
				script: path.join(__dirname, 'entries/dominoWorkerEntry.js'),
				description: 'Handles domino game cron jobs',
			},
		];

		// Start all workers
		for (const config of workerConfigs) {
			await this.startWorker(config);
		}

		// Setup graceful shutdown handlers
		this.setupShutdownHandlers();
	}

	/**
	 * Start an individual worker process
	 */
	async startWorker(config) {
		try {
			const worker = fork(config.script, [], {
				silent: false, // Allow direct stdout/stderr for centralized logging
				env: process.env,
			});

			// Setup worker event handlers
			this.setupWorkerHandlers(worker, config);

			// Store worker reference
			this.workers.set(config.name, {
				process: worker,
				config: config,
				startTime: Date.now(),
				restarts: this.restartAttempts.get(config.name) || 0,
			});
		} catch (error) {
			console.error(`❌ Failed to start ${config.name}:`, error);
			throw error;
		}
	}

	/**
	 * Setup event handlers for a worker process
	 */
	setupWorkerHandlers(worker, config) {
		// Worker exit handler
		worker.on('exit', (code, signal) => {
			if (!this.isShuttingDown) {
				console.warn(
					`⚠️  Worker ${config.name} exited with code ${code}, signal ${signal}`
				);
				this.handleWorkerRestart(config);
			}
		});

		// Worker error handler
		worker.on('error', error => {
			console.error(`❌ Worker ${config.name} error:`, error);
			this.handleWorkerRestart(config);
		});

		// Worker message handler (for inter-process communication)
		worker.on('message', async message => {
			if (message.type === 'log') {
				console.log(`[${config.name.toUpperCase()}] ${message.data}`);
			} else if (message.type === 'error') {
				console.error(
					`[${config.name.toUpperCase()}] ERROR:`,
					message.data
				);
			} else if (message.type === 'ready') {
				console.log(`✅ ${config.name} is ready and running`);
			} else if (message.type === 'socket-broadcast') {
				// Handle socket broadcast requests from workers
				try {
					const { roomId, event, payload, requestId } = message.data;
					console.log(
						`[WORKER-MANAGER] Received socket broadcast request: ${event} to room ${roomId}`
					);

					// Use the socket broadcast service to handle the broadcast
					await SocketBroadcastService.broadcastToDominoRoom(
						roomId,
						event,
						payload
					);

					console.log(
						`[WORKER-MANAGER] Successfully processed socket broadcast: ${event} to room ${roomId}`
					);

					// Only send response if requestId exists (for synchronous calls)
					if (requestId) {
						worker.send({
							type: 'socket-broadcast-response',
							success: true,
							requestId: requestId,
						});
					}
				} catch (error) {
					console.error(
						`Error handling socket broadcast from ${config.name}:`,
						error
					);

					// Only send error response if requestId exists (for synchronous calls)
					if (message.data.requestId) {
						worker.send({
							type: 'socket-broadcast-response',
							success: false,
							error: error.message,
							requestId: message.data.requestId,
						});
					}
				}
			}
		});

		// Send startup message to worker
		worker.send({ type: 'start', config: config });
	}

	/**
	 * Handle worker restart with exponential backoff and smart reset
	 */
	async handleWorkerRestart(config) {
		if (this.isShuttingDown) return;

		const now = Date.now();
		const lastRestart = this.lastRestartTime.get(config.name) || 0;
		const timeSinceLastRestart = now - lastRestart;

		// Reset restart counter if enough time has passed since last failure
		if (timeSinceLastRestart > this.consecutiveFailureWindow) {
			console.log(
				`🔄 Resetting restart counter for ${config.name} (${Math.round(
					timeSinceLastRestart / 1000
				)}s since last failure)`
			);
			this.restartAttempts.set(config.name, 0);
		}

		const currentAttempts = this.restartAttempts.get(config.name) || 0;

		// Always restart workers - no limit on restart attempts
		// This ensures lottery workers never permanently stop

		// Calculate exponential backoff delay
		const delay = Math.min(
			this.baseRestartDelay * Math.pow(2, Math.min(currentAttempts, 10)),
			this.maxRestartDelay
		);

		console.log(
			`🔄 Restarting ${config.name} in ${Math.round(
				delay / 1000
			)}s (attempt ${currentAttempts + 1}/${this.maxRestartAttempts})`
		);

		// Increment restart attempts and update last restart time
		this.restartAttempts.set(config.name, currentAttempts + 1);
		this.lastRestartTime.set(config.name, now);

		// Remove old worker reference
		this.workers.delete(config.name);

		// Restart after delay
		setTimeout(async () => {
			try {
				await this.startWorker(config);

				// Reset restart attempts on successful start after stability period
				setTimeout(() => {
					const currentAttempts =
						this.restartAttempts.get(config.name) || 0;
					if (currentAttempts > 0) {
						console.log(
							`✅ ${config.name} stable for 2 minutes, resetting restart counter`
						);
						this.restartAttempts.set(config.name, 0);
					}
				}, 120000); // Reset after 2 minutes of successful operation
			} catch (error) {
				console.error(`❌ Failed to restart ${config.name}:`, error);
				this.handleWorkerRestart(config); // Try again
			}
		}, delay);
	}

	/**
	 * Setup graceful shutdown handlers
	 */
	setupShutdownHandlers() {
		const gracefulShutdown = async signal => {
			console.log(
				`\n🛑 Received ${signal}, shutting down cron workers gracefully...`
			);
			await this.shutdown();
			process.exit(0);
		};

		process.on('SIGTERM', gracefulShutdown);
		process.on('SIGINT', gracefulShutdown);
		process.on('SIGUSR2', gracefulShutdown); // PM2 reload
	}

	/**
	 * Gracefully shutdown all workers
	 */
	async shutdown() {
		this.isShuttingDown = true;

		console.log('🛑 Shutting down all cron workers...');

		const shutdownPromises = Array.from(this.workers.values()).map(
			async workerData => {
				return new Promise(resolve => {
					const worker = workerData.process;
					const config = workerData.config;

					// Send shutdown signal to worker
					worker.send({ type: 'shutdown' });

					// Give worker 5 seconds to gracefully shutdown
					const timeout = setTimeout(() => {
						console.warn(
							`⚠️  Force killing ${config.name} after timeout`
						);
						worker.kill('SIGKILL');
						resolve();
					}, 5000);

					worker.on('exit', () => {
						clearTimeout(timeout);
						console.log(`✅ ${config.name} shut down gracefully`);
						resolve();
					});
				});
			}
		);

		await Promise.all(shutdownPromises);
		console.log('✅ All cron workers shut down successfully');
	}

	/**
	 * Get worker status information
	 */
	getWorkerStatus() {
		const status = [];

		for (const [name, workerData] of this.workers) {
			status.push({
				name: name,
				pid: workerData.process.pid,
				uptime: Date.now() - workerData.startTime,
				restarts: this.restartAttempts.get(name) || 0,
				status: workerData.process.killed ? 'STOPPED' : 'RUNNING',
			});
		}

		return status;
	}

	/**
	 * Manually restart a specific worker
	 */
	async restartWorker(workerName) {
		const workerData = this.workers.get(workerName);
		if (!workerData) {
			throw new Error(`Worker ${workerName} not found`);
		}

		console.log(`🔄 Manually restarting ${workerName}...`);

		// Kill current worker
		workerData.process.kill('SIGTERM');

		// Remove from workers map
		this.workers.delete(workerName);

		// Start new worker
		await this.startWorker(workerData.config);

		console.log(`✅ ${workerName} restarted successfully`);
	}
}

export default WorkerManager;
