import mongoose, { Schema } from 'mongoose';

const contractStatus = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'EXPIRED'];

const InfluencerSchema = new Schema(
    {
        user: { type: String, ref: 'User', required: true, unique: true },
        contractStatus: {
            type: String,
            enum: contractStatus,
            default: 'ACTIVE',
        },
        contractStartDate: { type: Date, required: true },
        contractEndDate: { type: Date, default: null },
        // Custom commission rates (can override defaults)
        commissionRates: {
            borlette: {
                perPlay: { type: Number, default: 0.25 },
                monthlyCap: { type: Number, default: 15000 },
            },
            roulette: {
                per100Spins: { type: Number, default: 0.35 },
                monthlyCap: { type: Number, default: 15000 },
            },
            dominoes: {
                per100Wagered: { type: Number, default: 0.30 },
                monthlyCap: { type: Number, default: 15000 },
            },
        },
        specialTerms: { type: String, default: null },
        createdBy: { type: String, ref: 'User', required: true },
        lastModifiedBy: { type: String, ref: 'User' },
        suspensionReason: { type: String, default: null },
        // Performance tracking
        totalEarned: { type: Number, default: 0 },
        lastPayoutDate: { type: Date, default: null },
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
InfluencerSchema.index({ user: 1 });
InfluencerSchema.index({ contractStatus: 1 });
InfluencerSchema.index({ contractEndDate: 1 });

export const Influencer = mongoose.model('Influencer', InfluencerSchema);