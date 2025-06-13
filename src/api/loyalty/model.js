import mongoose, { Schema } from 'mongoose';

const loyaltyTiers = ['NONE', 'SILVER', 'GOLD', 'VIP'];

const LoyaltyProfileSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true, unique: true },
		currentTier: {
			type: String,
			enum: loyaltyTiers,
			default: 'NONE',
			required: true,
		},
		xpBalance: { type: Number, default: 0 },
		tierProgress: {
			daysPlayedThisWeek: { type: Number, default: 0 },
			daysPlayedThisMonth: { type: Number, default: 0 },
			totalDeposit30Days: { type: Number, default: 0 },
			totalDeposit60Days: { type: Number, default: 0 },
			totalDeposit90Days: { type: Number, default: 0 },
			lastPlayDate: { type: Date },
			silverEligibleDate: { type: Date },
			goldEligibleDate: { type: Date },
			vipEligibleDate: { type: Date },
			silverStartDate: { type: Date },
			goldStartDate: { type: Date },
			vipStartDate: { type: Date },
			lastTierEvaluationDate: { type: Date },
			inactivityStartDate: { type: Date },
		},
		weeklyWithdrawalUsed: { type: Number, default: 0 },
		weeklyWithdrawalReset: { type: Date },
		cashbackHistory: [
			{
				date: { type: Date },
				amount: { type: Number },
				processed: { type: Boolean, default: false },
			},
		],
		referralBenefits: [
			{
				referredUser: { type: String, ref: 'User' },
				earnedXP: { type: Number, default: 0 },
				qualified: { type: Boolean, default: false },
				qualificationDate: { type: Date },
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

const LoyaltyTransactionSchema = new Schema(
	{
		user: { type: String, ref: 'User', required: true },
		transactionType: {
			type: String,
			enum: [
				'EARN',
				'SPEND',
				'ADJUSTMENT',
				'CASHBACK',
				'REFERRAL',
				'BONUS',
			],
			required: true,
		},
		xpAmount: { type: Number, required: true },
		description: { type: String },
		reference: {
			type: { type: String },
			id: { type: Schema.Types.Mixed },
		},
		previousBalance: { type: Number, required: true },
		newBalance: { type: Number, required: true },
		tier: { type: String, enum: loyaltyTiers, required: true },
	},
	{
		timestamps: true,
	}
);

export const LoyaltyProfile = mongoose.model(
	'LoyaltyProfile',
	LoyaltyProfileSchema
);
export const LoyaltyTransaction = mongoose.model(
	'LoyaltyTransaction',
	LoyaltyTransactionSchema
);
