/* eslint-disable no-undef */
const { MongoClient } = require('mongodb');

// Replace with your MongoDB Atlas connection string
const uri =
	'mongodb+srv://megapay-develop:pXxbgWtprcXhg3lL@megapay-develop.c5d6c5y.mongodb.net/megapay-develop?retryWrites=true&w=majority';

async function deleteAllDocuments() {
	// Create client with updated options
	const client = new MongoClient(uri, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});

	try {
		await client.connect();
		console.log('Connected to MongoDB Atlas');

		// Get the database
		const db = client.db('test');

		// Get collection stats before deletion to confirm collections have documents
		const collections = await db.listCollections().toArray();
		console.log(`Found ${collections.length} collections`);

		// Loop through each collection and delete all documents
		for (const collectionInfo of collections) {
			const collectionName = collectionInfo.name;
			const collection = db.collection(collectionName);

			// Count documents before deletion
			const count = await collection.countDocuments({});
			console.log(
				`Collection ${collectionName} has ${count} documents before deletion`
			);

			// Delete all documents in the collection
			const result = await collection.deleteMany({});

			console.log(
				`Deleted ${result.deletedCount} documents from collection: ${collectionName}`
			);
		}

		console.log('All documents deleted successfully from all collections');
	} catch (error) {
		console.error('Error deleting documents:', error.stack);
	} finally {
		await client.close();
		console.log('Connection closed');
	}
}

deleteAllDocuments();
