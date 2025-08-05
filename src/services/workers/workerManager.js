import { fork } from 'child_process';
import path from 'path';

class WorkerManager {
    constructor() {
        this.workers = new Map();
        this.isShuttingDown = false;
        this.restartAttempts = new Map();
        this.maxRestartAttempts = 5;
        this.baseRestartDelay = 1000;
        this.maxRestartDelay = 30000;
    }

    /**
     * Initialize and start all worker processes
     */
    async start() {
        console.log('🚀 Starting cron worker processes...');

        const workerConfigs = [
            {
                name: 'lottery-worker',
                script: path.join(__dirname, 'entries/lotteryWorkerEntry.js'),
                description: 'Handles lottery cron jobs'
            },
            {
                name: 'loyalty-worker',
                script: path.join(__dirname, 'entries/loyaltyWorkerEntry.js'),
                description: 'Handles loyalty program cron jobs'
            },
            {
                name: 'domino-worker',
                script: path.join(__dirname, 'entries/dominoWorkerEntry.js'),
                description: 'Handles domino game cron jobs'
            }
        ];

        // Start all workers
        for (const config of workerConfigs) {
            await this.startWorker(config);
        }

        // Setup graceful shutdown handlers
        this.setupShutdownHandlers();

        console.log('✅ All cron workers started successfully');
    }

    /**
     * Start an individual worker process
     */
    async startWorker(config) {
        try {
            console.log(`🔄 Starting ${config.name}: ${config.description}`);

            const worker = fork(config.script, [], {
                silent: false, // Allow direct stdout/stderr for centralized logging
                env: process.env
            });

            // Setup worker event handlers
            this.setupWorkerHandlers(worker, config);

            // Store worker reference
            this.workers.set(config.name, {
                process: worker,
                config: config,
                startTime: Date.now(),
                restarts: this.restartAttempts.get(config.name) || 0
            });

            console.log(`✅ ${config.name} started with PID: ${worker.pid}`);
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
                console.warn(`⚠️  Worker ${config.name} exited with code ${code}, signal ${signal}`);
                this.handleWorkerRestart(config);
            }
        });

        // Worker error handler
        worker.on('error', (error) => {
            console.error(`❌ Worker ${config.name} error:`, error);
            this.handleWorkerRestart(config);
        });

        // Worker message handler (for inter-process communication)
        worker.on('message', (message) => {
            if (message.type === 'log') {
                console.log(`[${config.name.toUpperCase()}] ${message.data}`);
            } else if (message.type === 'error') {
                console.error(`[${config.name.toUpperCase()}] ERROR:`, message.data);
            } else if (message.type === 'ready') {
                console.log(`✅ ${config.name} is ready and running`);
            }
        });

        // Send startup message to worker
        worker.send({ type: 'start', config: config });
    }

    /**
     * Handle worker restart with exponential backoff
     */
    async handleWorkerRestart(config) {
        if (this.isShuttingDown) return;

        const currentAttempts = this.restartAttempts.get(config.name) || 0;

        if (currentAttempts >= this.maxRestartAttempts) {
            console.error(`❌ Worker ${config.name} exceeded max restart attempts (${this.maxRestartAttempts})`);
            console.error(`❌ ${config.name} will not be restarted automatically`);
            return;
        }

        // Calculate exponential backoff delay
        const delay = Math.min(
            this.baseRestartDelay * Math.pow(2, currentAttempts),
            this.maxRestartDelay
        );

        console.log(`🔄 Restarting ${config.name} in ${delay}ms (attempt ${currentAttempts + 1}/${this.maxRestartAttempts})`);

        // Increment restart attempts
        this.restartAttempts.set(config.name, currentAttempts + 1);

        // Remove old worker reference
        this.workers.delete(config.name);

        // Restart after delay
        setTimeout(async () => {
            try {
                await this.startWorker(config);

                // Reset restart attempts on successful start
                setTimeout(() => {
                    this.restartAttempts.set(config.name, 0);
                }, 60000); // Reset after 1 minute of successful operation

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
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}, shutting down cron workers gracefully...`);
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

        const shutdownPromises = Array.from(this.workers.values()).map(async (workerData) => {
            return new Promise((resolve) => {
                const worker = workerData.process;
                const config = workerData.config;

                // Send shutdown signal to worker
                worker.send({ type: 'shutdown' });

                // Give worker 5 seconds to gracefully shutdown
                const timeout = setTimeout(() => {
                    console.warn(`⚠️  Force killing ${config.name} after timeout`);
                    worker.kill('SIGKILL');
                    resolve();
                }, 5000);

                worker.on('exit', () => {
                    clearTimeout(timeout);
                    console.log(`✅ ${config.name} shut down gracefully`);
                    resolve();
                });
            });
        });

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
                status: workerData.process.killed ? 'STOPPED' : 'RUNNING'
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