import mongoose, { Schema } from 'mongoose';

const paymentStatus = [
	'PENDING',
	'COMPLETED',
	'FAILED',
	'CANCELLED',
	'REFUNDED',
];
const paymentMethods = [
	'CREDIT_CARD',
	'DEBIT_CARD',
	'BANK_TRANSFER',
	'PAYONEER_BALANCE',
];

const WalletSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		virtualBalance: { type: Number, required: true, default: 0.0 },
		realBalance: { type: Number, required: true, default: 0.0 },
		active: { type: Boolean, default: true },
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

const PaymentSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		sessionId: { type: String, required: true, unique: true },
		amount: { type: Number, required: true },
		currency: { type: String, default: 'USD' },
		method: { type: String, enum: paymentMethods },
		status: { type: String, enum: paymentStatus, default: 'PENDING' },
		virtualCashAmount: { type: Number, required: true },
		realCashAmount: { type: Number, required: true },
		providerResponse: { type: Object },
		errorMessage: { type: String },
		ipAddress: { type: String },
		metadata: { type: Object },
	},
	{
		timestamps: true,
	}
);

export const Wallet = mongoose.model('Wallet', WalletSchema);
export const Payment = mongoose.model('Payment', PaymentSchema);
