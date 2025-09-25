import mongoose, { Schema } from 'mongoose';

// Game Configuration Model
const DominoGameConfigSchema = new Schema(
	{
		turnTimeLimit: { type: Number, default: 60 }, // seconds
		houseEdge: { type: Number, default: 0 }, // percentage
		entryFees: [{ type: Number, default: [5, 10, 20, 30, 50, 100] }],
		maxPlayersPerRoom: { type: Number, default: 4 },
		isActive: { type: Boolean, default: true },
		computerPlayerNames: [
			{
				type: String,
				default: ['Bot_Alpha', 'Bot_Beta', 'Bot_Gamma', 'Bot_Delta'],
			},
		],
		newGameDelay: { type: Number, default: 30 }, // 30 seconds default
	},
	{
		timestamps: true,
	}
);
// No additional indexes needed for DominoGameConfig as it's a single-document collection
// and findOne() uses the default _id index.

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
			default: 'WAITING',
		},
		players: [
			{
				user: { type: String, ref: 'User' },
				playerType: {
					type: String,
					enum: ['HUMAN', 'COMPUTER'],
					default: 'HUMAN',
				},
				playerName: { type: String },
				position: { type: Number },
				isReady: { type: Boolean, default: false },
				joinedAt: { type: Date, default: Date.now },
				isConnected: { type: Boolean, default: true },
				lastConnectedAt: { type: Date, default: Date.now },
				disconnectedAt: { type: Date, default: null },
				totalScore: { type: Number, default: 0 },
			},
		],
		gameSettings: {
			tilesPerPlayer: { type: Number, enum: [7, 9] },
			winRule: {
				type: String,
				enum: ['STANDARD', 'POINTS'],
				default: 'STANDARD',
			},
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
// Indexes for DominoRoom
DominoRoomSchema.index(
	{ status: 1, cashType: 1, createdAt: 1 },
	{
		name: 'status_cashType_createdAt_idx',
		partialFilterExpression: { status: 'WAITING', cashType: 'VIRTUAL' },
	}
); // For fillVirtualRoomsWithBots
DominoRoomSchema.index(
	{ status: 1, createdAt: 1 },
	{
		name: 'status_createdAt_idx',
		partialFilterExpression: { status: 'WAITING' },
	}
); // For startFullRoomGames and cleanupAbandonedRooms
DominoRoomSchema.index({ roomId: 1 }, { unique: true }); // Already defined in schema, included for clarity

// Domino Game Model
const DominoGameSchema = new Schema(
	{
		room: {
			type: Schema.Types.ObjectId,
			ref: 'DominoRoom',
			required: true,
		},
		gameNumber: { type: Number, default: 1 }, // for point-based challenges
		currentPlayer: { type: Number, default: 0 }, // position index
		gameState: {
			type: String,
			enum: ['ACTIVE', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
			default: 'ACTIVE',
		},
		board: [
			{
				tile: { type: String }, // "6-4"
				position: { type: Number },
				placedBy: { type: Number },
				hasRotation: { type: Boolean },
				side: { type: String, enum: ['LEFT', 'RIGHT'] }, // which end was played
				placedAt: { type: Date, default: Date.now },
			},
		],
		players: [
			{
				position: { type: Number },
				user: { type: String, ref: 'User' },
				playerType: {
					type: String,
					enum: ['HUMAN', 'COMPUTER'],
					default: 'HUMAN',
				},
				playerName: { type: String },
				hand: [{ type: String }], // ["6-4", "3-2"]
				score: { type: Number, default: 0 }, // for point-based games
				totalScore: { type: Number, default: 0 }, // cumulative across rounds
				isConnected: { type: Boolean, default: true },
				lastAction: { type: Date, default: Date.now },
				consecutivePasses: { type: Number, default: 0 },
			},
		],
		drawPile: [{ type: String }],
		moves: [
			{
				player: { type: Number },
				action: { type: String, enum: ['PLACE', 'DRAW', 'PASS'] },
				tile: { type: String }, // if placed
				fromHand: { type: Boolean, default: true },
				boardState: { type: String }, // snapshot of board
				timestamp: { type: Date, default: Date.now },
				isAutoMove: { type: Boolean, default: false },
			},
		],
		turnStartTime: { type: Date },
		turnTimeLimit: { type: Number, default: 60 },
		turnHistory: [
			{
				player: { type: Number },
				startTime: { type: Date },
				endTime: { type: Date },
				timeUsed: { type: Number }, // seconds
			},
		],
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
				'BLOCKED_ALL_PASSED',
			],
		},
		finalScores: [
			{
				position: { type: Number },
				dotsRemaining: { type: Number },
				tilesRemaining: { type: Number },
				roundScore: { type: Number },
				totalScore: { type: Number },
			},
		],
		totalPot: { type: Number },
		houseEdge: { type: Number },
		houseAmount: { type: Number },
		winnerPayout: { type: Number },
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
// Indexes for DominoGame
DominoGameSchema.index(
	{ gameState: 1, turnStartTime: 1 },
	{
		name: 'gameState_turnStartTime_idx',
		partialFilterExpression: { gameState: 'ACTIVE' },
	}
); // For handleHumanTimeouts and sendTurnWarningsJob
DominoGameSchema.index(
	{ gameState: 1, turnStartTime: 1, 'players.playerType': 1 },
	{
		name: 'gameState_turnStartTime_playerType_idx',
		partialFilterExpression: {
			gameState: 'ACTIVE',
			'players.playerType': 'COMPUTER',
		},
	}
); // For processImmediateBotTurns
DominoGameSchema.index(
	{ _id: 1, gameState: 1, currentPlayer: 1 },
	{
		name: 'id_gameState_currentPlayer_idx',
	}
); // For processBotTurn findOneAndUpdate
DominoGameSchema.index({ room: 1 }, { name: 'room_idx' }); // For room population and queries

// Domino Chat Model
const DominoChatSchema = new Schema(
	{
		room: {
			type: Schema.Types.ObjectId,
			ref: 'DominoRoom',
			required: true,
		},
		user: { type: String, ref: 'User', required: true },
		playerName: { type: String, required: true },
		message: { type: String, required: true, maxlength: 200 },
		messageType: {
			type: String,
			enum: ['TEXT', 'EMOJI', 'SYSTEM', 'GAME_ACTION'],
			default: 'TEXT',
		},
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
	}
);
// Index for DominoChat
DominoChatSchema.index(
	{ room: 1, createdAt: 1 },
	{ name: 'room_createdAt_idx' }
); // For fetching chat messages by room

// Domino Tournament Model
const DominoTournamentSchema = new Schema(
	{
		name: { type: String, required: true },
		entryFee: { type: Number, required: true },
		maxParticipants: { type: Number, required: true },
		status: {
			type: String,
			enum: ['UPCOMING', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED'],
			default: 'UPCOMING',
		},
		startTime: { type: Date, required: true },
		participants: [
			{
				user: { type: String, ref: 'User' },
				registeredAt: { type: Date, default: Date.now },
				eliminated: { type: Boolean, default: false },
				finalPosition: { type: Number },
			},
		],
		prizePool: { type: Number },
		payoutStructure: [
			{
				position: { type: Number },
				amount: { type: Number },
				percentage: { type: Number },
			},
		],
		houseEdge: { type: Number, default: 0 },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
	}
);
// Index for DominoTournament
DominoTournamentSchema.index(
	{ status: 1, startTime: 1 },
	{ name: 'status_startTime_idx' }
); // For future tournament queries

export const DominoGameConfig = mongoose.model(
	'DominoGameConfig',
	DominoGameConfigSchema
);
export const DominoRoom = mongoose.model('DominoRoom', DominoRoomSchema);
export const DominoGame = mongoose.model('DominoGame', DominoGameSchema);
export const DominoChat = mongoose.model('DominoChat', DominoChatSchema);
export const DominoTournament = mongoose.model(
	'DominoTournament',
	DominoTournamentSchema
);
