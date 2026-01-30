import mongoose, { Schema } from 'mongoose';

const CardSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		cardholderName: { type: String, required: true },
		cardNumber: { type: String, required: true },
		expirationMonth: { type: String, required: true },
		expirationYear: { type: String, required: true },
		cvv: { type: String, required: true },
		isDefault: { type: Boolean, default: false },
		isVerified: { type: Boolean, default: false },
		verificationDate: { type: Date, default: null },
		rapydBeneficiaryId: { type: String, default: null },
		rapydBeneficiaryError: { type: String, default: null },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
			transform: (obj, ret) => {
				// Mask card number for security
				ret.maskedCardNumber = '****' + ret.cardNumber.slice(-4);
				delete ret.cardNumber;
				delete ret.cvv;
				delete ret._id;
			},
		},
	}
);

export const Card = mongoose.model('Card', CardSchema);
