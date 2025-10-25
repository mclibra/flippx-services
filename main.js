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

// Import CronScheduler for cron job processing
import CronScheduler from './src/services/scheduler/cronScheduler';

const app = express(apiRoot, api);

mongoose.connect(mongo.uri, {
	useNewUrlParser: true,
	useCreateIndex: true,
});

const server = http.createServer(app);

initializeSocket(server);

// Initialize Cron Scheduler for cron jobs
const cronScheduler = new CronScheduler();

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

		// Start cron scheduler for cron jobs AFTER server is running
		// This prevents cron jobs from blocking the main server startup
		await cronScheduler.initialize();
	} catch (error) {
		console.error('❌ Application startup failed:', error);

		// Continue with cron scheduler even if main startup fails
		// This ensures cron jobs keep running even if HTTP server has issues
		console.log('🔄 Starting cron scheduler despite startup error...');

		try {
			await cronScheduler.initialize();
			console.log('✅ Cron scheduler started successfully despite main startup failure');
		} catch (schedulerError) {
			console.error('❌ Failed to start cron scheduler after main startup failure:', schedulerError);
		}

		// Do not exit - keep the process alive for cron jobs
		console.log('⚠️  Main process continuing to keep cron scheduler alive');
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

		// Shutdown cron scheduler
		console.log('🛑 Shutting down cron scheduler...');
		await cronScheduler.shutdown();

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

// Setup global error handlers to prevent process crashes
process.on('uncaughtException', (error) => {
	console.error('❌ Uncaught Exception - Process will continue:', error);
	// Do not exit - keep cron jobs running
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('❌ Unhandled Promise Rejection - Process will continue:', reason);
	console.error('Promise:', promise);
	// Do not exit - keep cron jobs running
});

// Setup graceful shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown);

export default app;
