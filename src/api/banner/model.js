import mongoose, { Schema } from 'mongoose';

const BannerSchema = new Schema(
	{
		imageUrl: { type: String, required: true, trim: true },
		title: { type: String, trim: true, default: null },
		description: { type: String, trim: true, default: null },
		linkUrl: { type: String, trim: true, default: null },
		order: { type: Number, default: 0 },
		isActive: { type: Boolean, default: true },
		createdBy: { type: String, ref: 'User', required: true },
		updatedBy: { type: String, ref: 'User', default: null },
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
BannerSchema.index({ isActive: 1, order: 1 });
BannerSchema.index({ createdAt: -1 });

export const Banner = mongoose.model('Banner', BannerSchema);
