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
		realBalanceWithdrawable: { type: Number, required: true, default: 0.0 },
		realBalanceNonWithdrawable: { type: Number, required: true, default: 0.0 },
		active: { type: Boolean, default: true },
		pendingWithdrawals: { type: Number, default: 0.0 },
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

WalletSchema.virtual('realBalance').get(function () {
	return this.realBalanceWithdrawable + this.realBalanceNonWithdrawable;
});

const PaymentSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		// Make sessionId optional for manual payments
		sessionId: { type: String, required: false, unique: true, sparse: true },
		amount: { type: Number, required: true },
		currency: { type: String, default: 'USD' },
		method: { type: String, enum: paymentMethods },
		status: { type: String, enum: paymentStatus, default: 'PENDING' },

		// Plan association (optional)
		plan: { type: Schema.Types.ObjectId, ref: 'Plan', required: false },

		// Make these optional for manual payments where admin only specifies total amount
		virtualCashAmount: { type: Number, required: false, default: 0 },
		realCashAmount: { type: Number, required: false },
		providerResponse: { type: Object },
		errorMessage: { type: String },
		ipAddress: { type: String },
		metadata: { type: Object },

		// New fields for manual bank transfer capture
		isManual: { type: Boolean, default: false },
		bankTransferReference: { type: String }, // Bank transaction reference/ID
		bankName: { type: String }, // Bank where transfer was made
		transferDate: { type: Date }, // Date when transfer was made
		depositorName: { type: String }, // Name of person who made the transfer
		notes: { type: String }, // Additional notes about the transfer

		// Admin confirmation details
		confirmedBy: { type: String, ref: 'User' },
		confirmedAt: { type: Date },

		// Additional validation fields for manual payments
		validatedBy: { type: String, ref: 'User' },
		validationNotes: { type: String },
	},
	{
		timestamps: true,
	}
);

// Pre-save middleware to set amounts based on plan or manual input
PaymentSchema.pre('save', async function (next) {
	// If plan is associated, set cash amounts based on plan
	if (this.plan && !this.virtualCashAmount && !this.realCashAmount) {
		try {
			const Plan = mongoose.model('Plan');
			const plan = await Plan.findById(this.plan);
			if (plan) {
				this.virtualCashAmount = plan.virtualCashAmount || 0;
				this.realCashAmount = plan.realCashAmount || 0;
			}
		} catch (error) {
			console.error('Error setting plan amounts:', error);
		}
	}

	// For manual payments, if realCashAmount is not set, use the full amount
	if (this.isManual && !this.realCashAmount && !this.plan) {
		this.realCashAmount = this.amount;
	}
	// For manual payments, virtualCashAmount defaults to 0
	if (this.isManual && !this.virtualCashAmount && !this.plan) {
		this.virtualCashAmount = 0;
	}
	next();
});

export const Wallet = mongoose.model('Wallet', WalletSchema);
export const Payment = mongoose.model('Payment', PaymentSchema);