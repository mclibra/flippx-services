import mongoose, { Schema } from 'mongoose';

const gameTypes = ['BORLETTE', 'ROULETTE', 'DOMINOES', 'MEGAMILLION'];
const status = ['PENDING', 'COLLECTED', 'FAILED'];

const FlippXCollectionSchema = new Schema(
    {
        user: { type: String, ref: 'User', required: true },
        gameType: {
            type: String,
            enum: gameTypes,
            required: true,
        },
        winningTransaction: {
            type: Schema.Types.ObjectId,
            ref: 'Transaction',
            required: true,
        },
        ticketId: { type: String, required: true },
        originalWinAmount: { type: Number, required: true },
        collectionPercentage: { type: Number, required: true },
        collectionAmount: { type: Number, required: true },
        netWinAmount: { type: Number, required: true },
        status: {
            type: String,
            enum: status,
            default: 'PENDING',
        },
        processedAt: { type: Date },
        failureReason: { type: String },
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
FlippXCollectionSchema.index({ user: 1, createdAt: -1 });
FlippXCollectionSchema.index({ gameType: 1, status: 1 });
FlippXCollectionSchema.index({ createdAt: -1 });

export const FlippXCollection = mongoose.model('FlippXCollection', FlippXCollectionSchema);