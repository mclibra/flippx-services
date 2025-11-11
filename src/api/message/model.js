import mongoose, { Schema } from 'mongoose';

export const messageStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

const MessageReplySchema = new Schema(
	{
		body: { type: String, required: true, trim: true },
		media: [{ type: String, trim: true }],
		repliedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
	},
	{
		_id: true,
		timestamps: { createdAt: true, updatedAt: false },
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				delete ret._id;
			},
		},
	}
);

const MessageSchema = new Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		title: { type: String, required: true, trim: true },
		body: { type: String, required: true, trim: true },
		media: [{ type: String, trim: true }],
		status: {
			type: String,
			enum: messageStatuses,
			default: 'OPEN',
			index: true,
		},
		replies: [MessageReplySchema],
		lastRepliedAt: { type: Date, default: null },
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

export const Message = mongoose.model('Message', MessageSchema);

