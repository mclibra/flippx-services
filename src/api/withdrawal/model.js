import mongoose, { Schema } from 'mongoose';

const withdrawalStatus = [
	'PENDING',
	'APPROVED',
	'REJECTED',
	'PROCESSING',
	'COMPLETED',
	'FAILED',
];

const WithdrawalSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		bankAccount: {
			type: Schema.Types.ObjectId,
			ref: 'BankAccount',
			required: true,
		},
		amount: { type: Number, required: true },
		fee: { type: Number, default: 0 },
		netAmount: { type: Number, required: true },
		status: { type: String, enum: withdrawalStatus, default: 'PENDING' },
		requestDate: { type: Date, default: Date.now },
		processedDate: { type: Date },
		approvedBy: { type: String, ref: 'User' },
		rejectionReason: { type: String },
		paymentReference: { type: String },
		paymentDetails: { type: Object },
	},
	{
		timestamps: true,
	}
);

export const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
