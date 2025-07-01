import mongoose, { Schema } from 'mongoose';

const userPlanStatus = ['ACTIVE', 'EXPIRED', 'CANCELLED'];

const UserPlanSchema = new Schema(
    {
        user: {
            type: String,
            ref: 'User',
            required: true,
        },
        plan: {
            type: Schema.Types.ObjectId,
            ref: 'Plan',
            required: true,
        },
        purchaseDate: {
            type: Date,
            default: Date.now,
        },
        status: {
            type: String,
            enum: userPlanStatus,
            default: 'ACTIVE',
        },
        paymentReference: {
            type: Schema.Types.ObjectId,
            ref: 'Payment',
        },
        transactionReference: {
            type: Schema.Types.ObjectId,
            ref: 'Transaction',
        },
        // Store plan details at time of purchase for audit
        planSnapshot: {
            name: String,
            price: Number,
            realCashAmount: Number,
            virtualCashAmount: Number,
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
UserPlanSchema.index({ user: 1, status: 1 });
UserPlanSchema.index({ plan: 1, status: 1 });
UserPlanSchema.index({ purchaseDate: -1 });
UserPlanSchema.index({ createdAt: -1 });

export const UserPlan = mongoose.model('UserPlan', UserPlanSchema);