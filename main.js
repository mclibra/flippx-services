import http from 'http';
import { env, mongo, port, ip, apiRoot } from './config';
import mongoose from './src/services/mongoose';
import express from './src/services/express';
import { createAdmin, createSystemAccount } from './src/seedDb';
import api from './src/api';
import { initCronJobs } from './src/services/cron/lottery';
import { initializeLoyaltyScheduler } from './src/services/cron/loyaltyTasks';

const app = express(apiRoot, api);

mongoose.connect(mongo.uri, {
	useNewUrlParser: true,
	useCreateIndex: true,
});

const server = http.createServer(app);

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
	} catch (error) {
		console.log(error);
	}

	initCronJobs();
	initializeLoyaltyScheduler();
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
