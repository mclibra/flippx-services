import http from 'http';
import { env, mongo, port, ip, apiRoot } from './config';
import mongoose from './src/services/mongoose';
import express from './src/services/express';
import { initializeSocket } from './src/services/socket';
import { createAdmin, createSystemAccount, createDominoConfig } from './src/seedDb';
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
		const admin = await createAdmin();
		if (admin) {
			console.log('');
			console.log('Admin user => ', admin.phone);
			console.log('');
		} else {
			console.log('Unable to create admin ');
		}

		// Create system account
		const systemAccount = await createSystemAccount();
		if (systemAccount) {
			console.log('System account initialized');
		} else {
			console.log('Unable to create system account');
		}

		// Create domino game config
		const dominoGameConfig = await createDominoConfig();
		if (dominoGameConfig) {
			console.log('Domino game config initialized');
		} else {
			console.log('Unable to create domino game config');
		}

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
		console.log('🚀 Starting cron worker processes...');
		await workerManager.start();
		console.log('✅ All systems operational - Main server + Worker processes running');

	} catch (error) {
		console.error('❌ Application startup failed:', error);

		// Attempt to shutdown workers gracefully on startup failure
		try {
			await workerManager.shutdown();
		} catch (shutdownError) {
			console.error('❌ Error during graceful shutdown:', shutdownError);
		}

		process.exit(1);
	}
});

// Graceful shutdown handler for the main process
const gracefulShutdown = async (signal) => {
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