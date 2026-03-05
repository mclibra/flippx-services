import mongoose, { Schema } from 'mongoose';

export const inviteStatuses = ['PENDING', 'SENT', 'FAILED'];

const inviteSchema = new Schema(
	{
		invitedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		phone: {
			type: String,
			required: true,
			trim: true,
		},
		message: {
			type: String,
			required: true,
			trim: true,
		},
		status: {
			type: String,
			enum: inviteStatuses,
			default: 'PENDING',
			index: true,
		},
		error: {
			type: String,
			default: null,
			trim: true,
		},
		sentAt: {
			type: Date,
			default: null,
		},
		lastAttemptAt: {
			type: Date,
			default: null,
		},
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

inviteSchema.index({ invitedBy: 1, phone: 1 }, { unique: true });

export const Invite = mongoose.model('Invite', inviteSchema);


