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
			// NEW: Weekly spending tracking
			weeklySpending: { type: Number, default: 0 },
			weeklySpendingResetDate: { type: Date },
			// NEW: Daily login tracking
			lastDailyLoginDate: { type: Date },
			dailyLoginStreak: { type: Number, default: 0 },
			dailySessionMinutesToday: { type: Number, default: 0 },
			// NEW: No-win tracking
			lastWinDate: { type: Date, default: null },
			consecutiveDaysNoWin: { type: Number, default: 0 },
			totalPlaysSinceLastWin: { type: Number, default: 0 },
			eligibleForNoWinCashback: { type: Boolean, default: false },
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
					enum: ['WEEKLY', 'MONTHLY', 'NO_WIN'], // Added NO_WIN type
					default: 'WEEKLY'
				},
				reference: {
					monthKey: { type: String },
					weekStart: { type: String },
					weekEnd: { type: String },
					noWinDays: { type: Number }, // For no-win cashback
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
		// NEW: Referral commission tracking
		referralCommissions: {
			monthly: {
				borlette: { earned: 0, plays: 0 },
				roulette: { earned: 0, spins: 0 },
				dominoes: { earned: 0, wagered: 0 },
				totalEarned: 0,
				resetDate: { type: Date },
			},
			lifetime: {
				borlette: { earned: 0, plays: 0 },
				roulette: { earned: 0, spins: 0 },
				dominoes: { earned: 0, wagered: 0 },
				totalEarned: 0,
			},
		},
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
				'GAME_REWARD',
				'REFERRAL_COMMISSION', // NEW: For cash commissions
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
			monthKey: { type: String },
			referredUser: { type: String },
			playAmount: { type: Number },
			gameType: { type: String },
			entryFee: { type: Number },
			cashType: { type: String },
			isWinner: { type: Boolean },
			// NEW: Commission tracking
			commissionType: { type: String }, // 'BORLETTE', 'ROULETTE', 'DOMINOES'
			commissionAmount: { type: Number },
			playsCount: { type: Number },
			spinsCount: { type: Number },
			wageredAmount: { type: Number },
		},
		previousBalance: { type: Number, required: true },
		newBalance: { type: Number, required: true },
		tier: { type: String, enum: loyaltyTiers, required: true },
	},
	{
		timestamps: true,
	}
);

// NEW: Referral commission detail schema
const ReferralCommissionSchema = new Schema(
	{
		referrer: { type: String, ref: 'User', required: true },
		referee: { type: String, ref: 'User', required: true },
		gameType: { type: String, enum: ['BORLETTE', 'ROULETTE', 'DOMINOES'], required: true },
		playId: { type: String, required: true }, // Ticket/game ID
		playAmount: { type: Number, required: true },
		commissionAmount: { type: Number, required: true },
		commissionRate: { type: Number, required: true },
		referrerTier: { type: String, enum: loyaltyTiers, required: true },
		processed: { type: Boolean, default: false },
		processedDate: { type: Date },
	},
	{
		timestamps: true,
	}
);

LoyaltyProfileSchema.index({ user: 1 });
LoyaltyProfileSchema.index({ currentTier: 1 });
LoyaltyTransactionSchema.index({ user: 1, createdAt: -1 });
LoyaltyTransactionSchema.index({ transactionType: 1, createdAt: -1 });
ReferralCommissionSchema.index({ referrer: 1, createdAt: -1 });
ReferralCommissionSchema.index({ referee: 1, gameType: 1 });

export const LoyaltyProfile = mongoose.model('LoyaltyProfile', LoyaltyProfileSchema);
export const LoyaltyTransaction = mongoose.model('LoyaltyTransaction', LoyaltyTransactionSchema);
export const ReferralCommission = mongoose.model('ReferralCommission', ReferralCommissionSchema);