import mongoose, { Schema } from 'mongoose';

const gameTypes = ['BORLETTE', 'ROULETTE', 'DOMINOES'];

const InfluencerCommissionSchema = new Schema(
    {
        influencer: { type: String, ref: 'User', required: true },
        referee: { type: String, ref: 'User', required: true },
        gameType: {
            type: String,
            enum: gameTypes,
            required: true
        },
        playId: { type: String, required: true }, // Ticket/game ID
        playAmount: { type: Number, required: true },
        commissionAmount: { type: Number, required: true },
        commissionRate: { type: Number, required: true },
        contractId: {
            type: Schema.Types.ObjectId,
            ref: 'Influencer',
            required: true
        },
        processed: { type: Boolean, default: false },
        processedDate: { type: Date },
        // For tracking purposes
        monthKey: { type: String, required: true }, // Format: YYYY-MM
        isCapReached: { type: Boolean, default: false },
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

// Indexes for efficient querying
InfluencerCommissionSchema.index({ influencer: 1, createdAt: -1 });
InfluencerCommissionSchema.index({ referee: 1, gameType: 1 });
InfluencerCommissionSchema.index({ monthKey: 1, influencer: 1 });
InfluencerCommissionSchema.index({ contractId: 1 });

export const InfluencerCommission = mongoose.model('InfluencerCommission', InfluencerCommissionSchema);