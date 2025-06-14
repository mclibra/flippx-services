import { DominoRoom, DominoGame, DominoChat, DominoGameConfig } from './model';
import { DominoGameEngine } from '../../services/domino/gameEngine';
import { Wallet } from '../wallet/model';
import { User } from '../user/model';
import { makeTransaction } from '../transaction/controller';
import { updateLoyaltyXP } from '../loyalty/controller';
import { broadcastToRoom, broadcastGameUpdate } from '../../services/socket/dominoSocket';

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

export const createRoom = async (body, user) => {
    try {
        const {
            playerCount,
            entryFee,
            cashType,
            gameSettings,
            roomType = 'PUBLIC'
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
                winRule: gameSettings?.winRule || 'STANDARD',
                targetPoints: gameSettings?.targetPoints || 100
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

        // Deduct entry fee
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
            entity: { success: true, room }
        };
    } catch (error) {
        console.error('Error creating room:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

export const joinRoom = async ({ roomId }, user) => {
    try {
        const room = await DominoRoom.findOne({ roomId, status: 'WAITING' })
            .populate('players.user', 'name');

        if (!room) {
            return {
                status: 404,
                entity: { success: false, error: 'Room not found or already started' }
            };
        }

        // Check if user already in room
        const existingPlayer = room.players.find(p => p.user && p.user._id.toString() === user._id);
        if (existingPlayer) {
            return {
                status: 400,
                entity: { success: false, error: 'You are already in this room' }
            };
        }

        // Check if room is full
        if (room.players.length >= room.playerCount) {
            return {
                status: 400,
                entity: { success: false, error: 'Room is full' }
            };
        }

        // Check user balance and deduct entry fee
        const wallet = await Wallet.findOne({ user: user._id });
        const balance = room.cashType === 'REAL' ? wallet.realBalance : wallet.virtualBalance;

        if (balance < room.entryFee) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: `Insufficient ${room.cashType.toLowerCase()} balance. Required: $${room.entryFee}`
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
        await room.save();

        // Deduct entry fee
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

        // Broadcast player joined
        broadcastToRoom(roomId, 'player-joined', {
            player: {
                user: user._id,
                playerName: `${userData.name.firstName} ${userData.name.lastName}`,
                position: room.players.length - 1
            },
            roomState: room
        });

        // Check if room is ready to start
        if (room.players.length === room.playerCount) {
            await startDominoGame(room);
        } else if (room.cashType === 'VIRTUAL') {
            // Fill remaining seats with computer players
            await fillWithComputerPlayers(room);
        }

        await room.populate('players.user', 'name');

        return {
            status: 200,
            entity: { success: true, room }
        };
    } catch (error) {
        console.error('Error joining room:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
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

        // Refund entry fee
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
        const game = await DominoGame.findById(gameId).populate('room');

        if (!game || game.gameState !== 'ACTIVE') {
            return {
                status: 400,
                entity: { success: false, error: 'Game not active' }
            };
        }

        // Find player position
        const playerPosition = game.players.findIndex(p =>
            p.user && p.user.toString() === user._id
        );

        if (playerPosition === -1) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this game' }
            };
        }

        // Validate it's player's turn
        if (game.currentPlayer !== playerPosition) {
            return {
                status: 400,
                entity: { success: false, error: 'Not your turn' }
            };
        }

        const player = game.players[playerPosition];
        let moveResult;

        switch (action) {
            case 'PLACE':
                moveResult = await placeTile(game, playerPosition, tile, side);
                break;
            case 'DRAW':
                moveResult = await drawTile(game, playerPosition);
                break;
            case 'PASS':
                moveResult = await passTurn(game, playerPosition);
                break;
            default:
                return {
                    status: 400,
                    entity: { success: false, error: 'Invalid action' }
                };
        }

        if (!moveResult.success) {
            return {
                status: 400,
                entity: moveResult
            };
        }

        // Record move
        game.moves.push({
            player: playerPosition,
            action,
            tile: action === 'PLACE' ? tile : null,
            boardState: JSON.stringify(game.board)
        });

        game.totalMoves += 1;

        // Reset consecutive passes for active move
        if (action !== 'PASS') {
            player.consecutivePasses = 0;
        }

        // Check for game end
        const gameEndCheck = DominoGameEngine.determineWinner(
            game.players,
            game.room.gameSettings.winRule,
            game.room.gameSettings.targetPoints
        );

        if (gameEndCheck.winner !== null || gameEndCheck.gameCompleted) {
            await endDominoGame(game, gameEndCheck);
        } else {
            // Move to next player
            game.currentPlayer = DominoGameEngine.getNextPlayer(game.currentPlayer, game.players);
            game.turnStartTime = new Date();

            // Process computer player turns
            await processComputerTurns(game);
        }

        await game.save();

        // Broadcast game update
        broadcastGameUpdate(game.room.roomId, {
            gameState: game,
            lastMove: {
                player: playerPosition,
                action,
                tile
            },
            gameEnded: gameEndCheck.gameCompleted,
            winner: gameEndCheck.winner
        });

        return {
            status: 200,
            entity: {
                success: true,
                gameState: game,
                gameEnded: gameEndCheck.gameCompleted,
                winner: gameEndCheck.winner
            }
        };
    } catch (error) {
        console.error('Error making move:', error);
        return {
            status: 500,
            entity: { success: false, error: error.message }
        };
    }
};

const placeTile = async (game, playerPosition, tile, side) => {
    const player = game.players[playerPosition];

    // Check if player has the tile
    if (!player.hand.includes(tile)) {
        return { success: false, error: 'You do not have this tile' };
    }

    // Check if tile can be placed
    const canPlace = DominoGameEngine.canPlaceTile(tile, game.board);
    if (!canPlace.canPlace) {
        return { success: false, error: 'This tile cannot be placed' };
    }

    // Validate side choice
    if (!canPlace.sides.includes(side)) {
        return { success: false, error: 'Invalid side for this tile' };
    }

    // Place tile
    DominoGameEngine.placeTileOnBoard(tile, game.board, side);
    game.board[game.board.length - 1].placedBy = playerPosition;
    game.board[game.board.length - 1].placedAt = new Date();

    // Remove tile from player's hand
    player.hand = player.hand.filter(t => t !== tile);
    player.lastAction = new Date();

    return { success: true };
};

const drawTile = async (game, playerPosition) => {
    const player = game.players[playerPosition];

    // Check if draw pile has tiles
    if (game.drawPile.length === 0) {
        return { success: false, error: 'No tiles left to draw' };
    }

    // Draw tile
    const drawnTile = game.drawPile.pop();
    player.hand.push(drawnTile);
    player.lastAction = new Date();

    return { success: true, drawnTile };
};

const passTurn = async (game, playerPosition) => {
    const player = game.players[playerPosition];

    // Check if player actually needs to pass
    if (DominoGameEngine.hasValidMoves(player.hand, game.board)) {
        return { success: false, error: 'You have valid moves available' };
    }

    player.consecutivePasses += 1;
    player.lastAction = new Date();

    return { success: true };
};

const processComputerTurns = async (game) => {
    let processed = false;

    while (game.gameState === 'ACTIVE') {
        const currentPlayer = game.players[game.currentPlayer];

        if (currentPlayer.playerType !== 'COMPUTER') {
            break;
        }

        // Computer makes move
        const autoMove = DominoGameEngine.autoPlay(
            currentPlayer.hand,
            game.board,
            game.drawPile,
            'COMPUTER'
        );

        let moveResult;
        switch (autoMove.action) {
            case 'PLACE':
                moveResult = await placeTile(game, game.currentPlayer, autoMove.tile, autoMove.side);
                break;
            case 'DRAW':
                moveResult = await drawTile(game, game.currentPlayer);
                break;
            case 'PASS':
                moveResult = await passTurn(game, game.currentPlayer);
                currentPlayer.consecutivePasses += 1;
                break;
        }

        if (moveResult.success) {
            // Record computer move
            game.moves.push({
                player: game.currentPlayer,
                action: autoMove.action,
                tile: autoMove.action === 'PLACE' ? autoMove.tile : null,
                boardState: JSON.stringify(game.board)
            });

            game.totalMoves += 1;
            processed = true;

            // Check for game end
            const gameEndCheck = DominoGameEngine.determineWinner(
                game.players,
                game.room.gameSettings.winRule,
                game.room.gameSettings.targetPoints
            );

            if (gameEndCheck.winner !== null || gameEndCheck.gameCompleted) {
                await endDominoGame(game, gameEndCheck);
                break;
            }

            // Move to next player
            game.currentPlayer = DominoGameEngine.getNextPlayer(game.currentPlayer, game.players);
            game.turnStartTime = new Date();
        } else {
            break;
        }
    }

    return processed;
};

const endDominoGame = async (game, gameEndResult) => {
    try {
        game.gameState = 'COMPLETED';
        game.winner = gameEndResult.winner;
        game.endReason = gameEndResult.endReason;
        game.completedAt = new Date();
        game.duration = Math.floor((new Date() - game.createdAt) / 1000);

        // Calculate final scores
        if (gameEndResult.finalScores) {
            game.finalScores = gameEndResult.finalScores;
        } else {
            // Calculate for simple win
            game.finalScores = game.players.map(p => ({
                position: p.position,
                dotsRemaining: DominoGameEngine.calculateDots(p.hand),
                roundScore: p.position === game.winner ? 1 : 0,
                totalScore: p.totalScore
            }));
        }

        // Process payout
        if (game.winner !== null && game.winner !== undefined) {
            const winnerPlayer = game.players[game.winner];

            if (winnerPlayer.user) { // Only pay real users, not computer players
                await makeTransaction(
                    winnerPlayer.user,
                    'USER',
                    'DOMINO_WIN',
                    game.winnerPayout,
                    null,
                    null,
                    game._id,
                    game.room.cashType
                );

                // Award loyalty points
                await awardLoyaltyPoints(winnerPlayer.user, true, game.room.entryFee);
            }
        }

        // Award participation points to other human players
        for (const player of game.players) {
            if (player.user && player.position !== game.winner) {
                await awardLoyaltyPoints(player.user, false, game.room.entryFee);
            }
        }

        // Update room status
        await DominoRoom.findByIdAndUpdate(game.room._id, {
            status: 'COMPLETED',
            completedAt: new Date()
        });

        // Broadcast game ended
        broadcastToRoom(game.room.roomId, 'game-ended', {
            gameState: game,
            winner: game.winner,
            finalScores: game.finalScores,
            payout: game.winnerPayout
        });

        return game;
    } catch (error) {
        console.error('Error ending domino game:', error);
        throw error;
    }
};

// ===================== GAME STATE & HISTORY =====================

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
        const playerInGame = game.players.some(p =>
            p.user && p.user._id.toString() === user._id
        );

        if (!playerInGame) {
            return {
                status: 403,
                entity: { success: false, error: 'You are not in this game' }
            };
        }

        // Create sanitized game state (hide other players' hands)
        const sanitizedGame = {
            ...game.toObject(),
            players: game.players.map((p, index) => {
                const isCurrentUser = p.user && p.user._id.toString() === user._id;
                return {
                    ...p,
                    hand: isCurrentUser ? p.hand : { length: p.hand.length }, // Only show hand size for others
                    handCount: p.hand.length
                };
            })
        };

        return {
            status: 200,
            entity: {
                success: true,
                gameState: sanitizedGame
            }
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
        const {
            status,
            cashType,
            limit = 20,
            offset = 0,
            startDate,
            endDate
        } = query;

        let dateQuery = {};
        if (startDate || endDate) {
            if (startDate) dateQuery.$gte = new Date(parseInt(startDate));
            if (endDate) dateQuery.$lte = new Date(parseInt(endDate));
        }

        // Find games where user participated
        let gameQuery = {
            'players.user': user._id
        };

        if (Object.keys(dateQuery).length > 0) {
            gameQuery.createdAt = dateQuery;
        }

        if (status) {
            gameQuery.gameState = status.toUpperCase();
        }

        const games = await DominoGame.find(gameQuery)
            .populate('room')
            .populate('players.user', 'name')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset));

        // Filter by cash type if specified
        const filteredGames = cashType ?
            games.filter(game => game.room.cashType === cashType.toUpperCase()) :
            games;

        // Add user-specific data to each game
        const gamesWithUserData = filteredGames.map(game => {
            const userPlayer = game.players.find(p =>
                p.user && p.user._id.toString() === user._id
            );

            const isWinner = game.winner === userPlayer?.position;
            const userScore = game.finalScores?.find(s => s.position === userPlayer?.position);

            return {
                ...game.toObject(),
                userPosition: userPlayer?.position,
                userWon: isWinner,
                userPayout: isWinner ? game.winnerPayout : 0,
                userScore: userScore || null
            };
        });

        const total = await DominoGame.countDocuments(gameQuery);

        return {
            status: 200,
            entity: {
                success: true,
                games: gamesWithUserData,
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

// ===================== CHAT FUNCTIONALITY =====================

export const sendMessage = async ({ roomId }, { message }, user) => {
    try {
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

        // Validate message
        if (!message || message.trim().length === 0) {
            return {
                status: 400,
                entity: { success: false, error: 'Message cannot be empty' }
            };
        }

        if (message.length > 200) {
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

        return {
            status: 200,
            entity: {
                success: true,
                messages: messages.reverse() // Reverse to show oldest first
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

// ===================== ADMIN CONFIGURATION =====================

export const updateGameConfig = async (body, user) => {
    try {
        const config = await DominoGameConfig.findOneAndUpdate(
            {},
            body,
            { upsert: true, new: true }
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
        let config = await DominoGameConfig.findOne();

        if (!config) {
            config = await DominoGameConfig.create({});
        }

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

// ===================== HELPER FUNCTIONS =====================

const awardLoyaltyPoints = async (userId, isWinner, entryFee) => {
    try {
        // Import loyalty functions if they exist


        // Award points based on win/participation and entry fee
        const basePoints = isWinner ? 10 : 5;
        const feeMultiplier = Math.max(1, Math.floor(entryFee / 10));
        const totalPoints = basePoints * feeMultiplier;

        await updateLoyaltyXP(userId, totalPoints, 'DOMINO_GAME');
    } catch (error) {
        console.error('Error awarding loyalty points:', error);
        // Don't throw error - loyalty points are not critical
    }
};

export const handleTurnTimeout = async (gameId, userId) => {
    try {
        const game = await DominoGame.findById(gameId);
        if (!game || game.gameState !== 'ACTIVE') return;

        const playerPosition = game.players.findIndex(p =>
            p.user && p.user.toString() === userId
        );

        if (playerPosition === -1 || game.currentPlayer !== playerPosition) return;

        // Auto-pass the turn
        const player = game.players[playerPosition];
        player.consecutivePasses += 1;
        player.lastAction = new Date();

        // Record timeout move
        game.moves.push({
            player: playerPosition,
            action: 'PASS',
            tile: null,
            boardState: JSON.stringify(game.board)
        });

        // Check for game end
        const gameEndCheck = DominoGameEngine.determineWinner(
            game.players,
            game.room.gameSettings.winRule,
            game.room.gameSettings.targetPoints
        );

        if (gameEndCheck.winner !== null || gameEndCheck.gameCompleted) {
            await endDominoGame(game, gameEndCheck);
        } else {
            // Move to next player
            game.currentPlayer = DominoGameEngine.getNextPlayer(game.currentPlayer, game.players);
            game.turnStartTime = new Date();
        }

        await game.save();

        // Broadcast timeout
        broadcastGameUpdate(game.room.roomId, {
            gameState: game,
            lastMove: {
                player: playerPosition,
                action: 'PASS',
                reason: 'TIMEOUT'
            }
        });

    } catch (error) {
        console.error('Error handling turn timeout:', error);
    }
};

export const handlePlayerDisconnection = async (roomId, userId) => {
    try {
        const room = await DominoRoom.findOne({ roomId });
        if (!room) return;

        // Mark player as disconnected
        const player = room.players.find(p => p.user && p.user.toString() === userId);
        if (player) {
            player.isConnected = false;
            await room.save();
        }

        // If game is in progress, handle disconnected player turns
        if (room.status === 'IN_PROGRESS') {
            const game = await DominoGame.findOne({ room: room._id, gameState: 'ACTIVE' });
            if (game) {
                const playerPosition = game.players.findIndex(p =>
                    p.user && p.user.toString() === userId
                );

                if (playerPosition !== -1) {
                    game.players[playerPosition].isConnected = false;
                    await game.save();
                }
            }
        }

    } catch (error) {
        console.error('Error handling player disconnection:', error);
    }
};