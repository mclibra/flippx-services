import http from 'http';
import { env, mongo, port, ip, apiRoot } from './config';
import mongoose from './src/services/mongoose';
import express from './src/services/express';
import { initializeSocket } from './src/services/socket';
import {
	createAdmin,
	createSystemAccount,
	createDominoConfig,
	initializeTierRequirements,
} from './src/seedDb';
import api from './src/api';

// Import WorkerManager for multi-core cron processing
import WorkerManager from './src/services/workers/workerManager';

const app = express(apiRoot, api);

mongoose.connect(mongo.uri, {
	useNewUrlParser: true,
	useCreateIndex: true,
});

const server = http.createServer(app);

initializeSocket(server);

// Initialize Worker Manager for cron jobs
const workerManager = new WorkerManager();

// eslint-disable-next-line no-undef
setImmediate(async () => {
	try {
		// Create admin user
		await createAdmin();

		// Create system account
		await createSystemAccount();

		// Create domino game config
		await createDominoConfig();

		// Initialize tier requirements
		await initializeTierRequirements();

		// Start the HTTP server
		server.listen(port, ip, () => {
			console.log(
				'Express server listening on http://%s:%d, in %s mode',
				ip,
				port,
				env
			);
		});

		// Start worker processes for cron jobs AFTER server is running
		// This prevents cron jobs from blocking the main server startup
		await workerManager.start();
	} catch (error) {
		console.error('❌ Application startup failed:', error);

		// Continue with worker processes even if main startup fails
		// This ensures cron jobs keep running even if HTTP server has issues
		console.log('🔄 Starting worker processes despite startup error...');

		try {
			await workerManager.start();
			console.log('✅ Worker processes started successfully despite main startup failure');
		} catch (workerError) {
			console.error('❌ Failed to start workers after main startup failure:', workerError);
		}

		// Do not exit - keep the process alive for worker processes
		console.log('⚠️  Main process continuing to keep worker processes alive');
	}
});

// Graceful shutdown handler for the main process
const gracefulShutdown = async signal => {
	console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

	try {
		// Close HTTP server
		console.log('🔌 Closing HTTP server...');
		server.close(() => {
			console.log('✅ HTTP server closed');
		});

		// Shutdown worker processes
		console.log('🛑 Shutting down worker processes...');
		await workerManager.shutdown();

		// Close database connection
		console.log('🔌 Closing database connection...');
		await mongoose.connection.close();
		console.log('✅ Database connection closed');

		console.log('✅ Graceful shutdown completed');
		process.exit(0);
	} catch (error) {
		console.error('❌ Error during graceful shutdown:', error);
		process.exit(1);
	}
};

// Setup graceful shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown);

export default app;
