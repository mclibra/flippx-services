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
			type: String,
			required: true,
			default: '10 Thousand',
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
