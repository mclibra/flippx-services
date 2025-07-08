import { DominoRoom, DominoGame, DominoChat, DominoGameConfig } from './model';
import { DominoGameEngine } from '../../services/domino/gameEngine';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';
import { makeTransaction } from '../transaction/controller';
import { LoyaltyService } from '../loyalty/service';
import { broadcastToRoom, broadcastGameUpdate } from '../../services/socket/dominoSocket';
import { stringify } from 'uuid';

// ===================== ROOM MANAGEMENT =====================

export const getRooms = async (query, user) => {
    try {
        const {
            cashType,
            playerCount,
            entryFee,
            status = 'WAITING',
            limit = 20,
            offset = 0
        } = query;

        let queryFilter = { status };

        if (cashType) queryFilter.cashType = cashType.toUpperCase();
        if (playerCount) queryFilter.playerCount = parseInt(playerCount);
        if (entryFee) queryFilter.entryFee = parseInt(entryFee);

        const rooms = await DominoRoom.find(queryFilter)
            .populate('players.user', 'name')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset));

        const total = await DominoRoom.countDocuments(queryFilter);

        return {
            status: 200,
            entity: {
                success: true,
                rooms,
                total,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < total
                }
            }
        };
    } catch (error) {
        console.error('Error fetching rooms:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const joinOrCreateRoom = async (body, user) => {
    try {
        const {
            playerCount,
            entryFee,
            cashType,
            winRule = 'STANDARD'
        } = body;

        // Validate inputs
        if (![2, 3, 4].includes(playerCount)) {
            return {
                status: 400,
                entity: { success: false, error: 'Player count must be 2, 3, or 4' }
            };
        }

        // Validate user balance
        const wallet = await Wallet.findOne({ user: user._id });
        if (!wallet) {
            return {
                status: 404,
                entity: { success: false, error: 'User wallet not found' }
            };
        }

        const balance = cashType === 'REAL' ? wallet.realBalance : wallet.virtualBalance;

        if (balance < entryFee) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: `Insufficient ${cashType.toLowerCase()} balance. Required: $${entryFee}, Available: $${balance}`
                }
            };
        }

        // Check if user is already in any waiting room
        const existingRoom = await DominoRoom.findOne({
            'players.user': user._id,
            status: 'WAITING'
        });

        if (existingRoom) {
            return {
                status: 400,
                entity: { success: false, error: 'You are already in a waiting room' }
            };
        }

        // First, try to find an existing room with vacancy that matches criteria
        const availableRoom = await DominoRoom.findOne({
            status: 'WAITING',
            cashType,
            playerCount,
            entryFee,
            'gameSettings.winRule': winRule,
            $expr: { $lt: [{ $size: "$players" }, "$playerCount"] }
        });

        if (availableRoom) {
            // Join existing room
            return await joinExistingRoom(availableRoom, user);
        } else {
            // Create new room
            return await createNewRoom(body, user);
        }

    } catch (error) {
        console.error('Error in joinOrCreateRoom:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

const joinExistingRoom = async (room, user) => {
    try {
        // Check user balance and deduct entry fee
        const wallet = await Wallet.findOne({ user: user._id });
        const balance = room.cashType === 'REAL' ? wallet.realBalance : wallet.virtualBalance;

        if (balance < room.entryFee) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: `Insufficient ${room.cashType.toLowerCase()} balance. Required: $${room.entryFee}, Available: $${balance}`
                }
            };
        }

        // Get user details
        const userData = await User.findById(user._id);

        // Add player to room
        room.players.push({
            user: user._id,
            playerName: `${userData.name.firstName} ${userData.name.lastName}`,
            position: room.players.length,
            isReady: true,
            isConnected: true
        });

        room.totalPot += room.entryFee;

        // Deduct entry fee using DOMINO_ENTRY transaction identifier
        await makeTransaction(
            user._id,
            user.role,
            'DOMINO_ENTRY',
            room.entryFee,
            null,
            null,
            room._id,
            room.cashType
        );

        await room.save();
        await room.populate('createdBy', 'name');

        // Broadcast player joined
        broadcastToRoom(room.roomId, 'player-joined', {
            userId: user._id,
            roomState: room
        });

        // Check if room is full and start game with computer players if needed
        if (room.players.length === room.playerCount) {
            await startDominoGame(room);
        }

        return {
            status: 200,
            entity: { success: true, room, action: 'joined' }
        };

    } catch (error) {
        console.error('Error joining existing room:', error);
        throw error;
    }
};

const createNewRoom = async (body, user) => {
    try {
        const {
            playerCount,
            entryFee,
            cashType,
            winRule = 'STANDARD',
            roomType = 'PUBLIC'
        } = body;

        // Get user details
        const userData = await User.findById(user._id);

        // Create room
        const roomId = DominoGameEngine.generateRoomId();
        const room = await DominoRoom.create({
            roomId,
            roomType,
            playerCount,
            entryFee,
            cashType,
            gameSettings: {
                tilesPerPlayer: playerCount <= 2 ? 9 : 7,
                winRule,
                targetPoints: 100
            },
            players: [{
                user: user._id,
                playerName: `${userData.name.firstName} ${userData.name.lastName}`,
                position: 0,
                isReady: true,
                isConnected: true
            }],
            createdBy: user._id,
            totalPot: entryFee
        });

        // Deduct entry fee using DOMINO_ENTRY transaction identifier
        await makeTransaction(
            user._id,
            user.role,
            'DOMINO_ENTRY',
            entryFee,
            null,
            null,
            room._id,
            cashType
        );

        await room.populate('players.user', 'name');
        await room.populate('createdBy', 'name');

        return {
            status: 200,
            entity: { success: true, room, action: 'created' }
        };

    } catch (error) {
        console.error('Error creating new room:', error);
        throw error;
    }
};

export const leaveRoom = async ({ roomId }, user) => {
    try {
        const room = await DominoRoom.findOne({ roomId });

        if (!room) {
            return {
                status: 404,
                entity: { success: false, error: 'Room not found' }
            };
        }

        if (room.status !== 'WAITING') {
            return {
                status: 400,
                entity: { success: false, error: 'Cannot leave room after game has started' }
            };
        }

        // Find and remove player
        const playerIndex = room.players.findIndex(p => p.user && p.user.toString() === user._id);

        if (playerIndex === -1) {
            return {
                status: 400,
                entity: { success: false, error: 'You are not in this room' }
            };
        }

        // Refund entry fee using DOMINO_REFUND transaction identifier
        await makeTransaction(
            user._id,
            user.role,
            'DOMINO_REFUND',
            room.entryFee,
            null,
            null,
            room._id,
            room.cashType
        );

        // Remove player and update positions
        room.players.splice(playerIndex, 1);
        room.players.forEach((player, index) => {
            player.position = index;
        });

        room.totalPot -= room.entryFee;

        // If room is empty, delete it
        if (room.players.length === 0) {
            await DominoRoom.findByIdAndDelete(room._id);
        } else {
            await room.save();
        }

        // Broadcast player left
        broadcastToRoom(roomId, 'player-left', {
            userId: user._id,
            roomState: room
        });

        return {
            status: 200,
            entity: { success: true, message: 'Left room successfully' }
        };
    } catch (error) {
        console.error('Error leaving room:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

// ===================== GAME LOGIC =====================

export const startDominoGame = async (room) => {
    try {
        const gameConfig = await DominoGameConfig.findOne();
        const houseEdge = gameConfig?.houseEdge || 0;

        // Deal tiles
        const { players, drawPile } = DominoGameEngine.dealTiles(
            room.playerCount,
            room.gameSettings.tilesPerPlayer
        );

        console.log('room.players', JSON.stringify(room.players));

        // Map room players to game players
        const gamePlayers = players.map((gamePlayer, index) => ({
            ...gamePlayer,
            user: room.players[index].user,
            playerName: room.players[index].playerName,
            playerType: room.players[index].playerType
        }));

        // Calculate financials
        const totalPot = room.totalPot;
        const houseAmount = Math.floor(totalPot * (houseEdge / 100));
        const winnerPayout = totalPot - houseAmount;

        // Create game
        const game = await DominoGame.create({
            room: room._id,
            players: gamePlayers,
            drawPile,
            board: [],
            currentPlayer: 0,
            turnStartTime: new Date(),
            turnTimeLimit: gameConfig?.turnTimeLimit || 60,
            totalPot,
            houseEdge,
            houseAmount,
            winnerPayout
        });

        // Update room status
        room.status = 'IN_PROGRESS';
        room.startedAt = new Date();
        await room.save();

        // Record play activity for all human players using LoyaltyService
        for (const player of room.players) {
            if (player.user && player.playerType === 'HUMAN') {
                try {
                    // FIX: Extract user ID string from user object if it's populated
                    const userId = typeof player.user === 'object' ? player.user._id : player.user;
                    const loyaltyResult = await LoyaltyService.recordUserPlayActivity(userId);
                    if (!loyaltyResult.success) {
                        console.warn(`Failed to record play activity for user ${userId}:`, loyaltyResult.error);
                    }
                } catch (error) {
                    console.error(`Error recording play activity for user ${player.user}:`, error);
                    // Don't fail the game start if loyalty tracking fails
                }
            }
        }

        // Broadcast game started
        broadcastToRoom(room.roomId, 'game-started', {
            gameId: game._id,
            gameState: game,
            message: 'Game has started!'
        });

        return game;
    } catch (error) {
        console.error('Error starting domino game:', error);
        throw error;
    }
};

export const fillWithComputerPlayers = async (room) => {
    try {
        const config = await DominoGameConfig.findOne();
        const computerNames = config?.computerPlayerNames || ['Bot_Alpha', 'Bot_Beta', 'Bot_Gamma'];

        while (room.players.length < room.playerCount) {
            const botName = computerNames[room.players.length - 1] || `Bot_${room.players.length}`;

            room.players.push({
                user: null,
                playerName: botName,
                playerType: 'COMPUTER',
                position: room.players.length,
                isReady: true,
                isConnected: true
            });
        }

        await room.save();

        // Start game immediately
        await startDominoGame(room);

        return room;
    } catch (error) {
        console.error('Error filling with computer players:', error);
        throw error;
    }
};

export const makeMove = async ({ gameId }, { action, tile, side }, user) => {
    try {
        const game = await DominoGame.findById(gameId)
            .populate('room')
            .populate('players.user', 'name');

        if (!game || game.gameState !== 'ACTIVE') {
            return {
                status: 404,
                entity: { success: false, error: 'Game not found or not active' }
            };
        }

        // Find player in game
        const playerIndex = game.players.findIndex(p =>
            p.user && p.user._id.toString() === user._id
        );

        if (playerIndex === -1) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this game' }
            };
        }

        // Check if it's player's turn
        if (game.currentPlayer !== playerIndex) {
            return {
                status: 400,
                entity: { success: false, error: 'Not your turn' }
            };
        }

        // Process the move using game engine
        const moveResult = DominoGameEngine.processMove(game, playerIndex, action, tile, side);

        if (!moveResult.success) {
            return {
                status: 400,
                entity: { success: false, error: moveResult.error }
            };
        }

        // Update game state
        Object.assign(game, moveResult.gameState);
        await game.save();

        // Broadcast move to all players
        broadcastGameUpdate(game.room.roomId, 'game-update', {
            gameState: game,
            lastMove: moveResult.move
        });

        // Check if game is completed
        if (game.gameState === 'COMPLETED') {
            await handleGameCompletion(game);
        }

        return {
            status: 200,
            entity: { success: true, gameState: game, move: moveResult.move }
        };

    } catch (error) {
        console.error('Error making move:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

const handleGameCompletion = async (game) => {
    try {
        const room = game.room;

        // Process payouts
        if (game.winner !== undefined) {
            const winnerPlayer = game.players[game.winner];
            if (winnerPlayer.user) {
                // Credit winner with payout using DOMINO_WIN transaction
                await makeTransaction(
                    winnerPlayer.user,
                    'USER',
                    'DOMINO_WIN',
                    game.winnerPayout,
                    null,
                    null,
                    game._id,
                    room.cashType
                );
            }
        }

        // Update room status
        room.status = 'COMPLETED';
        room.completedAt = new Date();
        await room.save();

        // Broadcast game completion
        broadcastToRoom(room.roomId, 'game-completed', {
            winner: game.winner,
            finalScores: game.finalScores,
            winnerPayout: game.winnerPayout
        });

    } catch (error) {
        console.error('Error handling game completion:', error);
    }
};

export const getGameState = async ({ gameId }, user) => {
    try {
        const game = await DominoGame.findById(gameId)
            .populate('room')
            .populate('players.user', 'name');

        if (!game) {
            return {
                status: 404,
                entity: { success: false, error: 'Game not found' }
            };
        }

        // Check if user is in the game
        const playerInGame = game.players.find(p =>
            p.user && p.user._id.toString() === user._id
        );

        if (!playerInGame) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this game' }
            };
        }

        return {
            status: 200,
            entity: { success: true, game }
        };

    } catch (error) {
        console.error('Error getting game state:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const getUserGameHistory = async (user, query) => {
    try {
        const { limit = 20, offset = 0, status } = query;

        let matchQuery = { 'players.user': user._id };
        if (status) {
            matchQuery.gameState = status.toUpperCase();
        }

        const games = await DominoGame.find(matchQuery)
            .populate('room', 'roomId playerCount entryFee cashType')
            .populate('players.user', 'name')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset));

        const total = await DominoGame.countDocuments(matchQuery);

        return {
            status: 200,
            entity: {
                success: true,
                games,
                total,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < total
                }
            }
        };

    } catch (error) {
        console.error('Error getting user game history:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const sendMessage = async ({ roomId }, { message }, user) => {
    try {
        if (!message || message.trim().length === 0) {
            return {
                status: 400,
                entity: { success: false, error: 'Message cannot be empty' }
            };
        }

        const room = await DominoRoom.findOne({ roomId });

        if (!room) {
            return {
                status: 404,
                entity: { success: false, error: 'Room not found' }
            };
        }

        // Check if user is in room
        const playerInRoom = room.players.find(p =>
            p.user && p.user.toString() === user._id
        );

        if (!playerInRoom) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this room' }
            };
        }

        if (message.trim().length > 200) {
            return {
                status: 400,
                entity: { success: false, error: 'Message too long (max 200 characters)' }
            };
        }

        // Create chat message
        const chatMessage = await DominoChat.create({
            room: room._id,
            user: user._id,
            playerName: playerInRoom.playerName,
            message: message.trim(),
            messageType: 'TEXT'
        });

        // Broadcast to room
        broadcastToRoom(roomId, 'new-message', {
            messageId: chatMessage._id,
            user: user._id,
            playerName: playerInRoom.playerName,
            message: chatMessage.message,
            messageType: chatMessage.messageType,
            timestamp: chatMessage.createdAt
        });

        return {
            status: 200,
            entity: {
                success: true,
                message: chatMessage
            }
        };
    } catch (error) {
        console.error('Error sending message:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const getChatHistory = async ({ roomId }, query, user) => {
    try {
        const { limit = 50, offset = 0 } = query;

        const room = await DominoRoom.findOne({ roomId });

        if (!room) {
            return {
                status: 404,
                entity: { success: false, error: 'Room not found' }
            };
        }

        // Check if user is in room
        const playerInRoom = room.players.find(p =>
            p.user && p.user.toString() === user._id
        );

        if (!playerInRoom) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this room' }
            };
        }

        const messages = await DominoChat.find({ room: room._id })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset));

        const total = await DominoChat.countDocuments({ room: room._id });

        return {
            status: 200,
            entity: {
                success: true,
                messages: messages.reverse(), // Reverse to show oldest first
                total,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < total
                }
            }
        };

    } catch (error) {
        console.error('Error getting chat history:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const updateGameConfig = async (body, user) => {
    try {
        const config = await DominoGameConfig.findOneAndUpdate(
            {},
            body,
            { new: true, upsert: true }
        );

        return {
            status: 200,
            entity: { success: true, config }
        };

    } catch (error) {
        console.error('Error updating game config:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const getGameConfig = async () => {
    try {
        const config = await DominoGameConfig.findOne();

        return {
            status: 200,
            entity: { success: true, config }
        };

    } catch (error) {
        console.error('Error getting game config:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const handleTurnTimeout = async (gameId, userId) => {
    try {
        const game = await DominoGame.findById(gameId)
            .populate('room');

        if (!game || game.gameState !== 'ACTIVE') {
            return;
        }

        // Find current player
        const currentPlayer = game.players[game.currentPlayer];

        // Auto-pass for the current player
        const moveResult = DominoGameEngine.processMove(game, game.currentPlayer, 'PASS');

        if (moveResult.success) {
            Object.assign(game, moveResult.gameState);
            await game.save();

            // Broadcast timeout and move
            broadcastGameUpdate(game.room.roomId, 'turn-timeout', {
                gameState: game,
                timedOutPlayer: game.currentPlayer
            });

            // Check if game is completed
            if (game.gameState === 'COMPLETED') {
                await handleGameCompletion(game);
            }
        }

    } catch (error) {
        console.error('Error handling turn timeout:', error);
    }
};