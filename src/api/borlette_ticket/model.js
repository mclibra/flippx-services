import mongoose, { Schema } from 'mongoose';

// eslint-disable-next-line no-undef
const AutoIncrement = require('mongoose-sequence')(mongoose);

const purchasedBy = ['ADMIN', 'AGENT', 'DEALER', 'USER'];
const cashTypes = ['REAL', 'VIRTUAL'];
const tierTypes = ['NONE', 'SILVER', 'GOLD', 'VIP'];

const BorletteTicketSchema = new Schema(
	{
		_id: { type: Number, required: true, default: 0 },
		user: { type: String, ref: 'User', required: true },
		lottery: { type: String, ref: 'Lottery', required: true },
		numbers: [
			{
				numberPlayed: { type: String, required: true, lowercase: true },
				amountPlayed: { type: Number, required: true },
				amountWon: { type: Number, default: null },
			},
		],
		totalAmountPlayed: { type: Number, required: true },
		totalAmountWon: { type: Number, default: null },
		isAmountDisbursed: { type: Boolean, default: false },
		purchasedBy: {
			type: String,
			required: true,
			enum: purchasedBy,
			default: 'USER',
		},
		purchasedOn: { type: Number, required: true },
		status: {
			type: 'String',
			enum: ['ACTIVE', 'CANCELLED', 'COMPLETED'],
			default: 'ACTIVE',
		},
		cashType: {
			type: 'String',
			enum: cashTypes,
			default: 'VIRTUAL',
			required: true,
		},
		// NEW: Store user's tier at purchase time for payout calculation
		userTierAtPurchase: {
			type: String,
			enum: tierTypes,
			default: 'NONE',
		},
		// NEW: Store payout configuration used
		payoutConfig: {
			percentage: { type: Number, default: 60 },
			isCustom: { type: Boolean, default: false },
			configId: { type: Schema.Types.ObjectId, ref: 'PayoutConfig', default: null },
			description: { type: String, default: 'Default percentage' }
		},
	},
	{
		_id: false,
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				delete ret._id;
			},
		},
	}
);

BorletteTicketSchema.plugin(AutoIncrement, {
	id: 'borlette_ticket_id',
	start_seq: 1113834213,
});

// Add index for tier-based analytics
BorletteTicketSchema.index({ userTierAtPurchase: 1, status: 1 });
BorletteTicketSchema.index({ 'payoutConfig.configId': 1 });

export const BorletteTicket = mongoose.model(
	'BorletteTicket',
	BorletteTicketSchema
);