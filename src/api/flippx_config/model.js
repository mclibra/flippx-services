import mongoose, { Schema } from 'mongoose';

const gameTypes = ['BORLETTE', 'ROULETTE', 'DOMINOES', 'MEGAMILLION'];

const FlippXConfigSchema = new Schema(
    {
        gameType: {
            type: String,
            enum: gameTypes,
            required: true,
        },
        collectionPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
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
        description: {
            type: String,
            default: '',
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
FlippXConfigSchema.index({ gameType: 1, isActive: 1 });

// Ensure only one active config per game type
FlippXConfigSchema.index(
    { gameType: 1, isActive: 1 },
    {
        unique: true,
        partialFilterExpression: { isActive: true }
    }
);

export const FlippXConfig = mongoose.model('FlippXConfig', FlippXConfigSchema);