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
		temporaryWinningNumber: { type: Number, default: null },
		temporaryWinningNumberExpiresAt: { type: Date, default: null },
		temporaryWinningNumberSetBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		temporaryWinningNumberSetAt: { type: Date, default: null },
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

export const Roulette = mongoose.model('Roulette', RouletteSchema);
