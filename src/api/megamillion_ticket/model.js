import mongoose, { Schema } from 'mongoose';

// eslint-disable-next-line no-undef
const AutoIncrement = require('mongoose-sequence')(mongoose);

const purchasedBy = ['ADMIN', 'AGENT', 'DEALER', 'USER'];
const cashTypes = ['REAL', 'VIRTUAL'];

const MegaMillionTicketSchema = new Schema(
	{
		_id: { type: Number, required: true, default: 0 },
		user: { type: String, ref: 'User', required: true },
		lottery: { type: String, ref: 'Lottery', required: true },
		numbers: [{ type: Number, required: true }],
		megaBall: { type: Number, default: null },
		amountPlayed: { type: Number, required: true },
		amountWon: { type: Number, default: null },
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

MegaMillionTicketSchema.plugin(AutoIncrement, {
	id: 'megamillion_ticket_id',
	start_seq: 1113834213,
});

export const MegaMillionTicket = mongoose.model(
	'MegaMillionTicket',
	MegaMillionTicketSchema
);
