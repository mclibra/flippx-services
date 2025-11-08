import mongoose, { Schema } from 'mongoose';

const messageType = ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO'];

// Global Chat Message Schema
const GlobalChatMessageSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		userName: { type: String, required: true },
		message: { type: String },
		messageType: { type: String, enum: messageType, default: 'TEXT' },
		mediaUrl: { type: String },
		mediaWidth: { type: Number },
		mediaHeight: { type: Number },
		isDeleted: { type: Boolean, default: false },
		deletedBy: { type: String, ref: 'User' },
		deletedAt: { type: Date },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				delete ret._id;
			},
		},
	}
);

// Indexes for GlobalChatMessage
GlobalChatMessageSchema.index({ createdAt: -1 }); // For getting recent messages
GlobalChatMessageSchema.index({ isDeleted: 1, createdAt: -1 }); // For filtering deleted messages

// Global Chat Mute Schema
const GlobalChatMuteSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true, unique: true },
		mutedBy: { type: String, ref: 'User', required: true },
		reason: { type: String, default: '' },
		expiresAt: { type: Date },
		isActive: { type: Boolean, default: true },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				delete ret._id;
			},
		},
	}
);

// Indexes for GlobalChatMute
GlobalChatMuteSchema.index({ user: 1, isActive: 1 }); // For checking if user is muted
GlobalChatMuteSchema.index({ expiresAt: 1 }); // For cleanup of expired mutes

// Global Chat Message Report Schema
const GlobalChatMessageReportSchema = new Schema(
	{
		message: {
			type: Schema.Types.ObjectId,
			ref: 'GlobalChatMessage',
			required: true,
		},
		reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
		reason: { type: String, default: '' },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				delete ret._id;
			},
		},
	}
);

GlobalChatMessageReportSchema.index(
	{ message: 1, reportedBy: 1 },
	{ unique: true }
);

// Global Chat User Report Schema
const GlobalChatUserReportSchema = new Schema(
	{
		reportedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
		reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
		message: {
			type: Schema.Types.ObjectId,
			ref: 'GlobalChatMessage',
		},
		reason: { type: String, default: '' },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				delete ret._id;
			},
		},
	}
);

GlobalChatUserReportSchema.index(
	{ reportedUser: 1, reportedBy: 1, message: 1 },
	{ unique: true, partialFilterExpression: { message: { $exists: true } } }
);
GlobalChatUserReportSchema.index(
	{ reportedUser: 1, reportedBy: 1 },
	{ unique: true, partialFilterExpression: { message: { $exists: false } } }
);

export const GlobalChatMessage = mongoose.model(
	'GlobalChatMessage',
	GlobalChatMessageSchema
);
export const GlobalChatMute = mongoose.model(
	'GlobalChatMute',
	GlobalChatMuteSchema
);
export const GlobalChatMessageReport = mongoose.model(
	'GlobalChatMessageReport',
	GlobalChatMessageReportSchema
);
export const GlobalChatUserReport = mongoose.model(
	'GlobalChatUserReport',
	GlobalChatUserReportSchema
);

