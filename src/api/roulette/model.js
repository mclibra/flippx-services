import mongoose, { Schema } from 'mongoose';

const status = ['SCHEDULED', 'COMPLETED', 'CANCELLED'];

const RouletteSchema = new Schema(
	{
		spinSchedlue: { type: Number, required: true },
		winningNumber: { type: Number, default: null },
		status: {
			type: String,
			enum: status,
			default: 'SCHEDULED',
			required: true,
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
	},
);

export const Roulette = mongoose.model('Roulette', RouletteSchema);
