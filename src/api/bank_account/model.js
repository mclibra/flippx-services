import mongoose, { Schema } from 'mongoose';

const accountTypes = ['CHECKING', 'SAVINGS'];

const BankAccountSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		bankName: { type: String, required: true },
		accountNumber: { type: String, required: true },
		accountHolderName: { type: String, required: true },
		routingNumber: { type: String, required: true },
		accountType: { type: String, enum: accountTypes, required: true },
		isDefault: { type: Boolean, default: false },
		isVerified: { type: Boolean, default: false },
		verificationDate: { type: Date, default: null },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				// Mask account number for security
				ret.maskedAccountNumber = '****' + ret.accountNumber.slice(-4);
				delete ret.accountNumber;
				delete ret._id;
			},
		},
	}
);

export const BankAccount = mongoose.model('BankAccount', BankAccountSchema);
