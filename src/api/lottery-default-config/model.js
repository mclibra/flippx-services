import mongoose, { Schema } from 'mongoose';

const LotteryDefaultConfigSchema = new Schema(
	{
		lotteryType: {
			type: String,
			enum: ['MEGAMILLION', 'BORLETTE'],
			required: true,
			unique: true,
		},
		defaultJackpotAmount: {
			type: Number,
			required: true,
			min: 0,
			default: 1000000, // Default to 1 million
		},
		updatedBy: {
			type: String,
			ref: 'User',
			default: null,
		},
		description: {
			type: String,
			default: '',
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

// Index for efficient querying
LotteryDefaultConfigSchema.index({ lotteryType: 1 });

export const LotteryDefaultConfig = mongoose.model(
	'LotteryDefaultConfig',
	LotteryDefaultConfigSchema
);
