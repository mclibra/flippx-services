/* eslint-disable no-undef */
const { MongoClient } = require('mongodb');

// Your MongoDB Atlas connection string
const uri =
	'mongodb+srv://megapay-develop:pXxbgWtprcXhg3lL@megapay-develop.c5d6c5y.mongodb.net/?retryWrites=true&w=majority';

async function listAllDatabases() {
	const client = new MongoClient(uri, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});

	try {
		await client.connect();
		console.log('Connected to MongoDB Atlas');

		// List all databases
		const databasesList = await client.db().admin().listDatabases();
		console.log('Databases:');
		databasesList.databases.forEach(db => {
			console.log(` - ${db.name}`);
		});

		// Try to list collections in each database
		for (const dbInfo of databasesList.databases) {
			if (dbInfo.name !== 'admin' && dbInfo.name !== 'local') {
				console.log(`\nCollections in database "${dbInfo.name}":`);
				const db = client.db(dbInfo.name);
				const collections = await db.listCollections().toArray();

				if (collections.length === 0) {
					console.log(` - No collections found`);
				} else {
					collections.forEach(collection => {
						console.log(` - ${collection.name}`);
					});
				}
			}
		}
	} catch (error) {
		console.error('Error:', error.message);
		if (error.stack) console.error(error.stack);
	} finally {
		await client.close();
		console.log('\nConnection closed');
	}
}

listAllDatabases();
