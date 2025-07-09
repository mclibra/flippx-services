import http from 'http';
import { env, mongo, port, ip, apiRoot } from './config';
import mongoose from './src/services/mongoose';
import express from './src/services/express';
import { initializeSocket } from './src/services/socket';
import { createAdmin, createSystemAccount, createDominoConfig } from './src/seedDb';
import api from './src/api';
import './src/services/cron/lottery';
import './src/services/cron/loyaltyTasks';
import './src/services/cron/dominoMaintenance';

const app = express(apiRoot, api);

mongoose.connect(mongo.uri, {
	useNewUrlParser: true,
	useCreateIndex: true,
});

const server = http.createServer(app);

initializeSocket(server);

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
	} catch (error) {
		console.log(error);
	}
	server.listen(port, ip, () => {
		console.log(
			'Express server listening on http://%s:%d, in %s mode',
			ip,
			port,
			env
		);
	});
});

export default app;
