import mongoose, { Schema } from 'mongoose';

const LotteryDefaultConfigSchema = new Schema(
	{
		lotteryType: {
			type: String,
			enum: ['MEGAMILLION', 'BORLETTE'],
			required: true,
			unique: true,
		},
		jackpotAmount: {
			type: Number,
			required: true,
			default: 10000,
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
