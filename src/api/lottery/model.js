import mongoose, { Schema } from 'mongoose';

const status = ['SCHEDULED', 'WAITING', 'COMPLETED', 'CANCELLED'];

const LotterySchema = new Schema(
	{
		title: { type: String, required: true, trim: true },
		type: { type: String, required: true, trim: true },
		scheduledTime: { type: Number, required: true },
		drawTime: { type: Number, default: null },
		jackpotAmount: { type: Number, default: 0 },
		metadata: { type: String, default: null }, // Store lottery session name (e.g., "morning", "afternoon", "evening")
		results: { type: Object, default: null },
		createdBy: { type: String, ref: 'User', default: null },
		state: { type: String, ref: 'State', required: true },
		externalGameIds: {
			pick3: { type: Number, default: null },
			pick4: { type: Number, default: null },
			megaMillions: { type: Number, default: null },
		},
		additionalData: {
			hasMarriageNumbers: { type: Boolean, default: true }
		},
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
	}
);

const LotteryRestrictionSchema = new Schema(
	{
		lottery: { type: String, ref: 'Lottery', required: true },
		twoDigit: { type: Number, default: null },
		threeDigit: { type: Number, default: null },
		fourDigit: { type: Number, default: null },
		marriageNumber: { type: Number, default: null },
		individualNumber: [
			{
				number: { type: String, default: null },
				limit: { type: Number, default: null },
			},
		],
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

export const Lottery = mongoose.model('Lottery', LotterySchema);
export const LotteryRestriction = mongoose.model(
	'LotteryRestriction',
	LotteryRestrictionSchema
);