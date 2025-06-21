import { PayoutConfig } from '../../api/payout_config/model';

// Default payout percentages (as per requirements)
const DEFAULT_PAYOUT_PERCENTAGES = {
    BORLETTE: {
        SILVER: 60, // 60% (default)
        GOLD: 65,   // 65%
        VIP: 70     // 70%
    }
};

class PayoutService {
    // Get current payout percentage for a tier and game type
    static async getPayoutPercentage(tier, gameType = 'BORLETTE') {
        try {
            // Check for active admin configuration
            const config = await PayoutConfig.findOne({
                tier: tier,
                gameType: gameType,
                isActive: true,
                $or: [
                    { validTo: null },
                    { validTo: { $gte: new Date() } }
                ],
                validFrom: { $lte: new Date() }
            }).sort({ createdAt: -1 });

            if (config) {
                return {
                    percentage: config.payoutPercentage,
                    isCustom: true,
                    configId: config._id,
                    description: config.description,
                    isPromotional: config.isPromotional
                };
            }

            // Fall back to default percentages
            const defaultPercentage = DEFAULT_PAYOUT_PERCENTAGES[gameType]?.[tier];
            if (!defaultPercentage) {
                throw new Error(`No payout percentage found for tier ${tier} and game ${gameType}`);
            }

            return {
                percentage: defaultPercentage,
                isCustom: false,
                configId: null,
                description: 'Default percentage',
                isPromotional: false
            };
        } catch (error) {
            console.error('Error getting payout percentage:', error);
            // Return default as fallback
            const defaultPercentage = DEFAULT_PAYOUT_PERCENTAGES[gameType]?.[tier] || 60;
            return {
                percentage: defaultPercentage,
                isCustom: false,
                configId: null,
                description: 'Fallback default percentage',
                isPromotional: false
            };
        }
    }

    // Get all current payout configurations
    static async getCurrentConfigurations() {
        try {
            const configs = await PayoutConfig.find({
                isActive: true,
                $or: [
                    { validTo: null },
                    { validTo: { $gte: new Date() } }
                ],
                validFrom: { $lte: new Date() }
            }).populate('createdBy', 'userName name').sort({ createdAt: -1 });

            // Build response with defaults for missing configurations
            const result = {};

            // Initialize with defaults
            Object.keys(DEFAULT_PAYOUT_PERCENTAGES).forEach(gameType => {
                result[gameType] = {};
                Object.keys(DEFAULT_PAYOUT_PERCENTAGES[gameType]).forEach(tier => {
                    result[gameType][tier] = {
                        percentage: DEFAULT_PAYOUT_PERCENTAGES[gameType][tier],
                        isCustom: false,
                        configId: null,
                        description: 'Default percentage',
                        isPromotional: false
                    };
                });
            });

            // Override with active configurations
            configs.forEach(config => {
                if (!result[config.gameType]) {
                    result[config.gameType] = {};
                }
                result[config.gameType][config.tier] = {
                    percentage: config.payoutPercentage,
                    isCustom: true,
                    configId: config._id,
                    description: config.description,
                    isPromotional: config.isPromotional,
                    validFrom: config.validFrom,
                    validTo: config.validTo,
                    createdBy: config.createdBy
                };
            });

            return { success: true, configurations: result };
        } catch (error) {
            console.error('Error getting current configurations:', error);
            return { success: false, error: error.message };
        }
    }

    // Set payout configuration
    static async setPayoutConfiguration(tier, gameType, percentage, adminUserId, options = {}) {
        try {
            // Validate percentage
            if (percentage < 0 || percentage > 200) {
                return { success: false, error: 'Payout percentage must be between 0% and 200%' };
            }

            // Deactivate existing configuration for this tier-game combination
            await PayoutConfig.updateMany(
                { tier, gameType, isActive: true },
                { isActive: false }
            );

            // Create new configuration
            const config = new PayoutConfig({
                tier,
                gameType,
                payoutPercentage: percentage,
                createdBy: adminUserId,
                description: options.description || `${tier} ${gameType} payout set to ${percentage}%`,
                isPromotional: options.isPromotional || false,
                validFrom: options.validFrom || new Date(),
                validTo: options.validTo || null
            });

            await config.save();

            return {
                success: true,
                config: config.toObject(),
                message: `Payout percentage for ${tier} ${gameType} set to ${percentage}%`
            };
        } catch (error) {
            console.error('Error setting payout configuration:', error);
            return { success: false, error: error.message };
        }
    }

    // Deactivate payout configuration
    static async deactivateConfiguration(configId) {
        try {
            const config = await PayoutConfig.findByIdAndUpdate(
                configId,
                { isActive: false },
                { new: true }
            );

            if (!config) {
                return { success: false, error: 'Configuration not found' };
            }

            return {
                success: true,
                message: `Configuration for ${config.tier} ${config.gameType} deactivated`
            };
        } catch (error) {
            console.error('Error deactivating configuration:', error);
            return { success: false, error: error.message };
        }
    }

    // Calculate adjusted payout amount based on tier
    static async calculateTierAdjustedPayout(baseAmount, userTier, gameType = 'BORLETTE') {
        try {
            const payoutConfig = await this.getPayoutPercentage(userTier, gameType);
            const adjustedAmount = Math.round((baseAmount * payoutConfig.percentage) / 60); // 60% is the base (Silver)

            return {
                originalAmount: baseAmount,
                adjustedAmount,
                tierMultiplier: payoutConfig.percentage / 60,
                payoutConfig
            };
        } catch (error) {
            console.error('Error calculating tier adjusted payout:', error);
            return {
                originalAmount: baseAmount,
                adjustedAmount: baseAmount, // fallback to original
                tierMultiplier: 1,
                payoutConfig: { percentage: 60, isCustom: false, error: error.message }
            };
        }
    }
}

export default PayoutService;