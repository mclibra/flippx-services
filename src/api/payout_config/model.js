import mongoose, { Schema } from 'mongoose';

const tierTypes = ['SILVER', 'GOLD', 'VIP'];
const gameTypes = ['BORLETTE', 'ROULETTE', 'DOMINOES'];

const PayoutConfigSchema = new Schema(
    {
        tier: {
            type: String,
            enum: tierTypes,
            required: true,
        },
        gameType: {
            type: String,
            enum: gameTypes,
            required: true,
        },
        payoutPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 200, // Allow up to 200% for promotional purposes
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: String,
            ref: 'User',
            required: true,
        },
        validFrom: {
            type: Date,
            default: Date.now,
        },
        validTo: {
            type: Date,
            default: null, // null means indefinitely valid
        },
        description: {
            type: String,
            default: '',
        },
        isPromotional: {
            type: Boolean,
            default: false,
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

// Index for efficient querying
PayoutConfigSchema.index({ tier: 1, gameType: 1, isActive: 1 });
PayoutConfigSchema.index({ validFrom: 1, validTo: 1 });

// Ensure only one active config per tier-game combination
PayoutConfigSchema.index(
    { tier: 1, gameType: 1, isActive: 1 },
    {
        unique: true,
        partialFilterExpression: { isActive: true }
    }
);

export const PayoutConfig = mongoose.model('PayoutConfig', PayoutConfigSchema);