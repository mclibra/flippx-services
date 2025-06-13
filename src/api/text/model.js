import mongoose, { Schema } from 'mongoose';

const textSchema = new Schema(
	{
		phone: {
			type: String,
			required: true,
			trim: true,
		},
		message: {
			type: String,
			trim: true,
			required: true,
		},
		verificationCode: {
			type: Number,
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

export const Text = mongoose.model('Text', textSchema);
