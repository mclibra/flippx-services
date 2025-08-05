import mongoose from 'mongoose';
import { mongo } from '../../../config';

class SharedDatabaseService {
    constructor() {
        this.isConnected = false;
        this.connectionPromise = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 seconds
    }

    /**
     * Connect to MongoDB with retry logic
     */
    async connect() {
        // Return existing connection promise if already connecting
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        // Return immediately if already connected
        if (this.isConnected) {
            return Promise.resolve();
        }

        this.connectionPromise = this._connectWithRetry();
        return this.connectionPromise;
    }

    /**
     * Internal connection method with retry logic
     */
    async _connectWithRetry() {
        while (this.retryCount < this.maxRetries && !this.isConnected) {
            try {
                console.log(`🔌 Connecting to MongoDB... (attempt ${this.retryCount + 1}/${this.maxRetries})`);

                await mongoose.connect(mongo.uri, {
                    useNewUrlParser: true,
                    useCreateIndex: true,
                    useUnifiedTopology: true,
                    maxPoolSize: 10, // Maintain up to 10 socket connections
                    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
                    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
                    bufferMaxEntries: 0, // Disable mongoose buffering
                    bufferCommands: false // Disable mongoose buffering
                });

                this.isConnected = true;
                this.retryCount = 0; // Reset retry count on successful connection
                this.connectionPromise = null;

                console.log('✅ MongoDB connected successfully');

                // Setup connection event handlers
                this.setupConnectionHandlers();

                return;
            } catch (error) {
                this.retryCount++;
                console.error(`❌ MongoDB connection failed (attempt ${this.retryCount}/${this.maxRetries}):`, error.message);

                if (this.retryCount >= this.maxRetries) {
                    this.connectionPromise = null;
                    throw new Error(`Failed to connect to MongoDB after ${this.maxRetries} attempts`);
                }

                // Wait before retrying
                await this.delay(this.retryDelay);
            }
        }
    }

    /**
     * Setup MongoDB connection event handlers
     */
    setupConnectionHandlers() {
        // Connection error handler
        mongoose.connection.on('error', (error) => {
            console.error('❌ MongoDB connection error:', error);
            this.isConnected = false;
        });

        // Disconnection handler
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected');
            this.isConnected = false;

            // Attempt to reconnect
            this.reconnect();
        });

        // Reconnection handler
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
            this.isConnected = true;
        });

        // Connection ready handler
        mongoose.connection.on('connected', () => {
            console.log('✅ MongoDB connection established');
            this.isConnected = true;
        });
    }

    /**
     * Attempt to reconnect to MongoDB
     */
    async reconnect() {
        if (this.connectionPromise || this.isConnected) {
            return;
        }

        console.log('🔄 Attempting to reconnect to MongoDB...');

        // Reset retry count for reconnection attempts
        this.retryCount = 0;

        try {
            await this.connect();
        } catch (error) {
            console.error('❌ Failed to reconnect to MongoDB:', error);
        }
    }

    /**
     * Gracefully disconnect from MongoDB
     */
    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        try {
            console.log('🔌 Disconnecting from MongoDB...');
            await mongoose.connection.close();
            this.isConnected = false;
            console.log('✅ MongoDB disconnected gracefully');
        } catch (error) {
            console.error('❌ Error disconnecting from MongoDB:', error);
        }
    }

    /**
     * Check if database is connected
     */
    isDbConnected() {
        return this.isConnected && mongoose.connection.readyState === 1;
    }

    /**
     * Get connection status information
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name
        };
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Ensure database connection before executing operations
     */
    async ensureConnection() {
        if (!this.isDbConnected()) {
            await this.connect();
        }
    }
}

// Export singleton instance
const sharedDatabaseService = new SharedDatabaseService();
export default sharedDatabaseService;