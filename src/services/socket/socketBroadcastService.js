import { broadcastDominoGameUpdateToRoom } from './dominoGameSocket';

/**
 * Socket Broadcast Service
 * Handles socket broadcasts from worker processes via IPC
 */
class SocketBroadcastService {
	constructor() {
		this.isMainProcess =
			process.env.NODE_ENV !== 'test' && process.send === undefined;
		this.setupIPC();
	}

	/**
	 * Setup IPC communication for socket broadcasts
	 */
	setupIPC() {
		// Only setup IPC in worker processes
		if (!this.isMainProcess && process.send) {
			// Listen for socket broadcast requests from main process
			process.on('message', message => {
				if (message.type === 'socket-broadcast') {
					this.handleSocketBroadcast(message.data);
				}
			});
		}
	}

	/**
	 * Handle socket broadcast request
	 */
	async handleSocketBroadcast(data) {
		try {
			const { roomId, event, payload } = data;

			// Broadcast to the room
			broadcastDominoGameUpdateToRoom(roomId, event, payload);

			// Send success response back to worker
			process.send({
				type: 'socket-broadcast-response',
				success: true,
				requestId: data.requestId,
			});
		} catch (error) {
			console.error('Error handling socket broadcast:', error);

			// Send error response back to worker
			process.send({
				type: 'socket-broadcast-response',
				success: false,
				error: error.message,
				requestId: data.requestId,
			});
		}
	}

	/**
	 * Broadcast to domino room (works in both main and worker processes)
	 */
	async broadcastToDominoRoom(roomId, event, payload) {
		if (this.isMainProcess) {
			// In main process, call directly
			broadcastDominoGameUpdateToRoom(roomId, event, payload);
		} else {
			// In worker process, send IPC message to main process
			return new Promise((resolve, reject) => {
				const requestId = Date.now() + Math.random();

				// Set up response handler
				const responseHandler = message => {
					if (
						message.type === 'socket-broadcast-response' &&
						message.requestId === requestId
					) {
						process.removeListener('message', responseHandler);

						if (message.success) {
							resolve();
						} else {
							reject(new Error(message.error));
						}
					}
				};

				process.on('message', responseHandler);

				// Send broadcast request to main process
				process.send({
					type: 'socket-broadcast',
					data: {
						roomId,
						event,
						payload,
						requestId,
					},
				});

				// Set timeout for response
				setTimeout(() => {
					process.removeListener('message', responseHandler);
					reject(new Error('Socket broadcast timeout'));
				}, 5000);
			});
		}
	}
}

// Export singleton instance
export default new SocketBroadcastService();
