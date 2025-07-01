import mongoose, { Schema } from 'mongoose';

const planStatus = ['ACTIVE', 'DEPRECATED'];

const PlanSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: false,
            trim: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: 'USD',
        },
        realCashAmount: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        virtualCashAmount: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        status: {
            type: String,
            enum: planStatus,
            default: 'ACTIVE',
        },
        isAvailableForPurchase: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: String,
            ref: 'User',
            required: true,
        },
        updatedBy: {
            type: String,
            ref: 'User',
        },
        deprecatedBy: {
            type: String,
            ref: 'User',
        },
        deprecatedAt: {
            type: Date,
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

// Index for efficient queries
PlanSchema.index({ status: 1, isAvailableForPurchase: 1 });
PlanSchema.index({ createdAt: -1 });

// Virtual for total cash value
PlanSchema.virtual('totalCashValue').get(function () {
    return this.realCashAmount + this.virtualCashAmount;
});

export const Plan = mongoose.model('Plan', PlanSchema);