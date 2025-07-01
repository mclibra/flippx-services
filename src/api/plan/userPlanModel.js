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
            required: false, // Optional to support legacy data or direct plan creation
        },
        transactionReference: {
            type: Schema.Types.ObjectId,
            ref: 'Transaction',
            required: false, // Optional as there might be multiple transactions per plan
        },
        // Store plan details at time of purchase for audit
        planSnapshot: {
            name: String,
            price: Number,
            realCashAmount: Number,
            virtualCashAmount: Number,
        },
        // Additional metadata
        purchaseMethod: {
            type: String,
            enum: ['PAYMENT_GATEWAY', 'MANUAL_PAYMENT', 'ADMIN_GRANT'],
            default: 'PAYMENT_GATEWAY',
        },
        // For admin-granted plans
        grantedBy: {
            type: String,
            ref: 'User',
            required: false,
        },
        grantReason: {
            type: String,
            required: false,
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
UserPlanSchema.index({ paymentReference: 1 });

// Compound index for user-plan uniqueness validation
UserPlanSchema.index({ user: 1, plan: 1, status: 1 });

// Pre-save middleware to set purchase method based on payment reference
UserPlanSchema.pre('save', function (next) {
    if (this.isNew && !this.purchaseMethod) {
        if (this.paymentReference) {
            this.purchaseMethod = 'PAYMENT_GATEWAY';
        } else if (this.grantedBy) {
            this.purchaseMethod = 'ADMIN_GRANT';
        } else {
            this.purchaseMethod = 'MANUAL_PAYMENT';
        }
    }
    next();
});

export const UserPlan = mongoose.model('UserPlan', UserPlanSchema);