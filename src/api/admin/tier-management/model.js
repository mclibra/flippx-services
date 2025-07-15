import mongoose, { Schema } from 'mongoose';

const TierRequirementsSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Basic tier benefits
        benefits: {
            weeklyWithdrawalLimit: {
                type: Number,
                required: true,
                default: 0,
            },
            withdrawalTime: {
                type: Number, // hours
                required: true,
                default: 72,
            },
            weeklyCashbackPercentage: {
                type: Number,
                default: 0,
            },
            monthlyCashbackPercentage: {
                type: Number,
                default: 0,
            },
            referralXP: {
                type: Number,
                default: 0,
            },
            // No-win cashback
            noWinCashbackPercentage: {
                type: Number,
                default: 0,
            },
            noWinCashbackDays: {
                type: Number,
                default: 0,
            },
        },
        // Upgrade requirements
        requirements: {
            // Previous tier requirements
            previousTier: {
                type: String,
                default: null,
            },
            previousTierDays: {
                type: Number,
                default: 0,
            },
            // Deposit requirements
            depositAmount30Days: {
                type: Number,
                default: 0,
            },
            depositAmount60Days: {
                type: Number,
                default: 0,
            },
            depositAmount90Days: {
                type: Number,
                default: 0,
            },
            // Activity requirements
            daysPlayedPerWeek: {
                type: Number,
                default: 0,
            },
            weeklySpendAmount: {
                type: Number,
                default: 0,
            },
            dailySessionMinutes: {
                type: Number,
                default: 0,
            },
            // Maintenance requirements
            daysRequired: {
                type: Number,
                default: 0,
            },
            // Special requirements
            requireIDVerification: {
                type: Boolean,
                default: false,
            },
            dailyLoginRequired: {
                type: Boolean,
                default: false,
            },
        },
        // Referral commissions
        referralCommissions: {
            borlette: {
                perPlay: {
                    type: Number,
                    default: 0,
                },
                monthlyCap: {
                    type: Number,
                    default: 0,
                },
            },
            roulette: {
                per100Spins: {
                    type: Number,
                    default: 0,
                },
                monthlyCap: {
                    type: Number,
                    default: 0,
                },
            },
            dominoes: {
                per100Wagered: {
                    type: Number,
                    default: 0,
                },
                monthlyCap: {
                    type: Number,
                    default: 0,
                },
            },
        },
        // Downgrade settings
        downgrades: {
            inactivityDaysMin: {
                type: Number,
                default: 30,
            },
            inactivityDaysMax: {
                type: Number,
                default: 60,
            },
        },
        // Audit fields
        createdBy: {
            type: String,
            ref: 'User',
            required: true,
        },
        updatedBy: {
            type: String,
            ref: 'User',
        },
        lastModified: {
            type: Date,
            default: Date.now,
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

// Indexes for efficient queries
TierRequirementsSchema.index({ name: 1, isActive: 1 });
TierRequirementsSchema.index({ isActive: 1 });
TierRequirementsSchema.index({ createdAt: -1 });

// Pre-save middleware to update lastModified
TierRequirementsSchema.pre('save', function (next) {
    if (this.isModified() && !this.isNew) {
        this.lastModified = new Date();
    }
    next();
});

// Static method to get active tier configuration
TierRequirementsSchema.statics.getActiveTierConfig = async function (name = null) {
    const query = { isActive: true };
    if (name) {
        query.name = name.toUpperCase();
        return await this.findOne(query);
    }
    return await this.find(query).sort({ name: 1 });
};

// Static method to get all tiers configuration as constants format
TierRequirementsSchema.statics.getAsConstants = async function () {
    const tiers = await this.find({ isActive: true }).sort({ name: 1 });
    const constants = {};

    tiers.forEach(tier => {
        constants[tier.name] = {
            name: tier.name,
            weeklyWithdrawalLimit: tier.benefits.weeklyWithdrawalLimit,
            withdrawalTime: tier.benefits.withdrawalTime,
            weeklyCashbackPercentage: tier.benefits.weeklyCashbackPercentage,
            monthlyCashbackPercentage: tier.benefits.monthlyCashbackPercentage,
            referralXP: tier.benefits.referralXP,
            noWinCashbackPercentage: tier.benefits.noWinCashbackPercentage,
            noWinCashbackDays: tier.benefits.noWinCashbackDays,
            requirements: tier.requirements,
            referralCommissions: tier.referralCommissions,
        };
    });

    return constants;
};

export const TierRequirements = mongoose.model('TierRequirements', TierRequirementsSchema);