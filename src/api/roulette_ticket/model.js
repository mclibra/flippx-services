import mongoose, { Schema } from 'mongoose'

const cashTypes = ['REAL', 'VIRTUAL'];

const RouletteTicketSchema = new Schema({
	user: { type: String, ref: 'User', required: true },
	roulette: { type: String, ref: 'Roulette', required: true },
	bet: [{
		blockPlayed: { type: String, required: true },
		amountPlayed: { type: Number, required: true },
		amountWon: { type: Number, default: null },
	}],
	cashType: { type: String, enum: cashTypes, required: true },
	totalAmountPlayed: { type: Number, default: null, required: true },
	totalAmountWon: { type: Number, default: null },
}, {
	timestamps: true,
	toJSON: {
		virtuals: true,
		transform: (obj, ret) => { delete ret._id }
	}
})

export const RouletteTicket = mongoose.model('RouletteTicket', RouletteTicketSchema)
