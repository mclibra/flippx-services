import { initializeDominoGameSocket } from './dominoGameSocket';
import { initializeDominoChatSocket } from './dominoChatSocket';
import { jwtVerify } from '../jwt';

export const initializeSocket = (server) => {
    const io = require('socket.io')(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        },
        transports: ['websocket', 'polling'],
        allowEIO3: true
    });

    // Add authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            // Verify JWT token
            const decoded = jwtVerify(token);

            if (!decoded || !decoded.id) {
                return next(new Error('Authentication error: Invalid token'));
            }

            // Attach user ID to socket
            socket.userId = decoded.id;
            socket.role = decoded.role;
            socket.userName = decoded.userName;
            next();
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error('Authentication error: ' + error.message));
        }
    });

    // Initialize domino namespace
    initializeDominoGameSocket(io);

    // Initialize domino chat namespace
    initializeDominoChatSocket(io);

    return io;
};