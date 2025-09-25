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
		// Setup IPC listeners based on process type
		if (this.isMainProcess) {
			// In main process, listen for socket broadcast requests from workers
			// This will be handled by WorkerManager, so no setup needed here
		} else if (process.send) {
			// In worker process, listen for socket broadcast responses from main process
			process.on('message', message => {
				if (message.type === 'socket-broadcast-response') {
					// This is handled by the Promise resolve/reject in broadcastToDominoRoom
					// No additional action needed here
				}
			});
		}
	}


	/**
	 * Broadcast to domino room (works in both main and worker processes)
	 */
	async broadcastToDominoRoom(roomId, event, payload) {
		try {
			if (this.isMainProcess) {
				// In main process, call directly
				console.log(`[SOCKET-BROADCAST] Main process broadcasting ${event} to room ${roomId}`);
				broadcastDominoGameUpdateToRoom(roomId, event, payload);
			} else {
				// In worker process, send IPC message to main process (fire and forget)
				// This prevents timeout issues and unhandled promise rejections
				console.log(`[SOCKET-BROADCAST] Worker process sending ${event} to room ${roomId} via IPC`);
				try {
					process.send({
						type: 'socket-broadcast',
						data: {
							roomId,
							event,
							payload,
							requestId: Date.now() + Math.random(),
						},
					});
				} catch (sendError) {
					console.error('Failed to send socket broadcast IPC message:', sendError);
				}
			}
		} catch (error) {
			console.error('Error in broadcastToDominoRoom:', error);
			// Don't throw the error to prevent unhandled promise rejections
			// Just log it and continue
		}
	}
}

// Export singleton instance
export default new SocketBroadcastService();
