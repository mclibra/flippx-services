import mongoose, { Schema } from 'mongoose';

const StateSchema = new Schema(
	{
		name: { type: String, required: true, trim: true },
		code: { type: String, required: true, trim: true, unique: true },
		isActive: { type: Boolean, default: true },
		description: { type: String, default: null },
		region: { type: String, default: null },
		externalLotteries: [{
			name: { type: String, required: true },
			pick3Key: { type: String, default: null },
			pick4Key: { type: String, required: true },
			pick3GameId: { type: Number, default: null },
			pick4GameId: { type: Number, default: null },
			drawTime: { type: String, default: null },
			drawTimezone: { type: String, default: null },
			drawDays: { type: Object, default: {} },
			hasMarriageNumbers: { type: Boolean, default: true }
		}],
		megaMillions: {
			gameId: { type: Number, default: null },
			drawTime: { type: String, default: null },
			drawTimezone: { type: String, default: null },
			drawDays: { type: Object, default: {} },
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

export const State = mongoose.model('State', StateSchema);