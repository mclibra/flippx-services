import mongoose, { Schema } from 'mongoose';

const messageType = ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO'];

const NotifcationSchema = new Schema(
	{
		to: { type: String, ref: 'User', required: true },
		from: { type: String, ref: 'User', required: true },
		messageType: { type: String, enum: messageType, default: 'TEXT' },
		messageTitle: { type: String, required: true },
		messageContent: { type: String, required: true },
		messageId: { type: String, required: true },
		read: { type: Boolean, default: false },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				delete ret._id;
			},
		},
	},
);

export const Notifcation = mongoose.model('Notifcation', NotifcationSchema);
