import mongoose, { Schema } from 'mongoose';

const RouletteConfigSchema = new Schema(
	{
		key: { type: String, required: true, unique: true },
		temporaryWinningNumber: { type: Number, default: null },
		temporaryWinningNumberExpiresAt: { type: Date, default: null },
		temporaryWinningNumberSetBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		temporaryWinningNumberSetAt: { type: Date, default: null },
	},
	{ timestamps: true }
);

RouletteConfigSchema.statics.getGlobalConfig = async function () {
	let config = await this.findOne({ key: 'global' }).exec();
	if (!config) {
		config = await this.create({ key: 'global' });
	}
	return config;
};

export const RouletteConfig = mongoose.model(
	'RouletteConfig',
	RouletteConfigSchema
);

