import mongoose, { Schema } from 'mongoose';

const transactionType = ['DEBIT', 'CREDIT'];
const cashTypes = ['REAL', 'VIRTUAL'];
const status = ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];

const TransactionSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		cashType: { type: String, enum: cashTypes, required: true },
		referenceType: { type: String, default: null },
		referenceIndex: { type: String, default: null },
		transactionType: {
			type: String,
			enum: transactionType,
			required: true,
		},
		transactionIdentifier: { type: String, required: true },
		transactionAmount: { type: Number, required: true },
		previousBalance: { type: Number, required: true, default: 0.0 },
		newBalance: { type: Number, required: true, default: 0.0 },
		transactionData: { type: Object, default: null },
		status: { type: String, enum: status, default: 'PENDING' },
	},
	{
		timestamps: true,
	}
);

export const Transaction = mongoose.model('Transaction', TransactionSchema);
