import mongoose, { Schema } from 'mongoose';

// Game Configuration Model
const DominoGameConfigSchema = new Schema(
    {
        turnTimeLimit: { type: Number, default: 60 }, // seconds
        houseEdge: { type: Number, default: 0 }, // percentage
        entryFees: [{ type: Number, default: [5, 10, 20, 30, 50, 100] }],
        maxPlayersPerRoom: { type: Number, default: 4 },
        isActive: { type: Boolean, default: true },
        computerPlayerNames: [{
            type: String,
            default: ['Bot_Alpha', 'Bot_Beta', 'Bot_Gamma', 'Bot_Delta']
        }],
        newGameDelay: { type: Number, default: 30 }, // 30 seconds default
    },
    {
        timestamps: true,
    }
);

// Domino Room Model
const DominoRoomSchema = new Schema(
    {
        roomId: { type: String, unique: true, required: true },
        roomType: { type: String, enum: ['PUBLIC', 'PRIVATE'], required: true },
        playerCount: { type: Number, enum: [2, 3, 4], required: true },
        entryFee: { type: Number, required: true },
        cashType: { type: String, enum: ['REAL', 'VIRTUAL'], required: true },
        status: {
            type: String,
            enum: ['WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
            default: 'WAITING'
        },
        players: [{
            user: { type: String, ref: 'User' },
            playerType: { type: String, enum: ['HUMAN', 'COMPUTER'], default: 'HUMAN' },
            playerName: { type: String },
            position: { type: Number },
            isReady: { type: Boolean, default: false },
            joinedAt: { type: Date, default: Date.now },
            isConnected: { type: Boolean, default: true },
            lastConnectedAt: { type: Date, default: Date.now },
            disconnectedAt: { type: Date, default: null },
            totalScore: { type: Number, default: 0 },
        }],
        gameSettings: {
            tilesPerPlayer: { type: Number, enum: [7, 9] },
            winRule: { type: String, enum: ['STANDARD', 'POINTS'], default: 'STANDARD' },
            targetPoints: { type: Number, default: 100 },
        },
        createdBy: { type: String, ref: 'User', required: true },
        startedAt: { type: Date },
        completedAt: { type: Date },
        totalPot: { type: Number, default: 0 },
        houseEdge: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
    }
);

// Domino Game Model
const DominoGameSchema = new Schema(
    {
        room: { type: Schema.Types.ObjectId, ref: 'DominoRoom', required: true },
        gameNumber: { type: Number, default: 1 }, // for point-based challenges
        currentPlayer: { type: Number, default: 0 }, // position index
        gameState: {
            type: String,
            enum: ['ACTIVE', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
            default: 'ACTIVE'
        },

        // Game Board State
        board: [{
            tile: { type: String }, // "6-4"
            position: { type: Number },
            placedBy: { type: Number },
            side: { type: String, enum: ['LEFT', 'RIGHT'] }, // which end was played
            placedAt: { type: Date, default: Date.now }
        }],

        // Player Hands and States
        players: [{
            position: { type: Number },
            user: { type: String, ref: 'User' },
            playerType: { type: String, enum: ['HUMAN', 'COMPUTER'], default: 'HUMAN' },
            playerName: { type: String },
            hand: [{ type: String }], // ["6-4", "3-2"]
            score: { type: Number, default: 0 }, // for point-based games
            totalScore: { type: Number, default: 0 }, // cumulative across rounds
            isConnected: { type: Boolean, default: true },
            lastAction: { type: Date, default: Date.now },
            consecutivePasses: { type: Number, default: 0 },
        }],

        // Draw Pile
        drawPile: [{ type: String }],

        // Game History
        moves: [{
            player: { type: Number },
            action: { type: String, enum: ['PLACE', 'DRAW', 'PASS'] },
            tile: { type: String }, // if placed
            fromHand: { type: Boolean, default: true },
            boardState: { type: String }, // snapshot of board
            timestamp: { type: Date, default: Date.now }
        }],

        // Turn Management
        turnStartTime: { type: Date },
        turnTimeLimit: { type: Number, default: 60 },
        turnHistory: [{
            player: { type: Number },
            startTime: { type: Date },
            endTime: { type: Date },
            timeUsed: { type: Number }, // seconds
        }],

        // Results
        winner: { type: Number }, // position
        endReason: {
            type: String,
            enum: [
                'LAST_TILE',
                'LOWEST_DOTS',
                'POINTS_REACHED',
                'ALL_PASSED',
                'TIMEOUT',
                'BLOCKED_NO_MOVES',
                'BLOCKED_ALL_PASSED'
            ]
        },
        finalScores: [{
            position: { type: Number },
            dotsRemaining: { type: Number },
            roundScore: { type: Number },
            totalScore: { type: Number }
        }],

        // Financial
        totalPot: { type: Number },
        houseEdge: { type: Number },
        houseAmount: { type: Number },
        winnerPayout: { type: Number },

        // Metadata
        duration: { type: Number }, // game duration in seconds
        totalMoves: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
    }
);

// Domino Chat Model
const DominoChatSchema = new Schema(
    {
        room: { type: Schema.Types.ObjectId, ref: 'DominoRoom', required: true },
        user: { type: String, ref: 'User', required: true },
        playerName: { type: String, required: true },
        message: { type: String, required: true, maxlength: 200 },
        messageType: {
            type: String,
            enum: ['TEXT', 'EMOJI', 'SYSTEM', 'GAME_ACTION'],
            default: 'TEXT'
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
    }
);

// Domino Tournament Model (for future expansion)
const DominoTournamentSchema = new Schema(
    {
        name: { type: String, required: true },
        entryFee: { type: Number, required: true },
        maxParticipants: { type: Number, required: true },
        status: {
            type: String,
            enum: ['UPCOMING', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED'],
            default: 'UPCOMING'
        },
        startTime: { type: Date, required: true },
        participants: [{
            user: { type: String, ref: 'User' },
            registeredAt: { type: Date, default: Date.now },
            eliminated: { type: Boolean, default: false },
            finalPosition: { type: Number },
        }],
        prizePool: { type: Number },
        payoutStructure: [{
            position: { type: Number },
            amount: { type: Number },
            percentage: { type: Number },
        }],
        houseEdge: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
    }
);

export const DominoGameConfig = mongoose.model('DominoGameConfig', DominoGameConfigSchema);
export const DominoRoom = mongoose.model('DominoRoom', DominoRoomSchema);
export const DominoGame = mongoose.model('DominoGame', DominoGameSchema);
export const DominoChat = mongoose.model('DominoChat', DominoChatSchema);
export const DominoTournament = mongoose.model('DominoTournament', DominoTournamentSchema);