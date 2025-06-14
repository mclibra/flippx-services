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
				type: {
					type: String,
					enum: ['WEEKLY', 'MONTHLY'],
					default: 'WEEKLY'
				},
				reference: {
					monthKey: { type: String }, // For monthly cashback tracking (YYYY-MM)
					weekStart: { type: String },
					weekEnd: { type: String },
				},
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
			weekStart: { type: String },
			weekEnd: { type: String },
			monthStart: { type: String },
			monthEnd: { type: String },
			monthKey: { type: String }, // For monthly tracking
			referredUser: { type: String },
			playAmount: { type: Number },
		},
		previousBalance: { type: Number, required: true },
		newBalance: { type: Number, required: true },
		tier: { type: String, enum: loyaltyTiers, required: true },
	},
	{
		timestamps: true,
	}
);

LoyaltyProfileSchema.index({ user: 1 });
LoyaltyProfileSchema.index({ currentTier: 1 });
LoyaltyTransactionSchema.index({ user: 1, createdAt: -1 });
LoyaltyTransactionSchema.index({ transactionType: 1, createdAt: -1 });

export const LoyaltyProfile = mongoose.model('LoyaltyProfile', LoyaltyProfileSchema);
export const LoyaltyTransaction = mongoose.model('LoyaltyTransaction', LoyaltyTransactionSchema);