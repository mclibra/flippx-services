import { initializeDominoSocket } from './dominoSocket';

export const initializeSocket = (server) => {
    const io = require('socket.io')(server);

    // Initialize domino namespace
    initializeDominoSocket(io);

};