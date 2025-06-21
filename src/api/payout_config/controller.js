import { PayoutConfig } from './model';
import PayoutService from '../../services/payout/payoutService';

// Get current payout configurations
export const getCurrentConfigurations = async (req, user) => {
    try {
        const result = await PayoutService.getCurrentConfigurations();

        if (!result.success) {
            return {
                status: 500,
                entity: {
                    success: false,
                    error: result.error || 'Failed to get payout configurations',
                },
            };
        }

        return {
            status: 200,
            entity: {
                success: true,
                configurations: result.configurations,
            },
        };
    } catch (error) {
        console.error('Error getting current configurations:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to retrieve payout configurations',
            },
        };
    }
};

// Set payout configuration
export const setPayoutConfiguration = async (body, user) => {
    try {
        const { tier, gameType, percentage, description, isPromotional, validFrom, validTo } = body;

        // Validation
        if (!tier || !['SILVER', 'GOLD', 'VIP'].includes(tier)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Valid tier (SILVER, GOLD, VIP) is required',
                },
            };
        }

        if (!gameType || !['BORLETTE', 'ROULETTE', 'DOMINOES'].includes(gameType)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Valid game type (BORLETTE, ROULETTE, DOMINOES) is required',
                },
            };
        }

        if (typeof percentage !== 'number' || percentage < 0 || percentage > 200) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Payout percentage must be a number between 0 and 200',
                },
            };
        }

        // Parse dates if provided
        let parsedValidFrom = validFrom ? new Date(validFrom) : new Date();
        let parsedValidTo = validTo ? new Date(validTo) : null;

        // Validate dates
        if (parsedValidTo && parsedValidTo <= parsedValidFrom) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Valid to date must be after valid from date',
                },
            };
        }

        const options = {
            description,
            isPromotional: isPromotional || false,
            validFrom: parsedValidFrom,
            validTo: parsedValidTo,
        };

        const result = await PayoutService.setPayoutConfiguration(
            tier,
            gameType,
            percentage,
            user._id,
            options
        );

        if (!result.success) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: result.error || 'Failed to set payout configuration',
                },
            };
        }

        return {
            status: 200,
            entity: {
                success: true,
                message: result.message,
                config: result.config,
            },
        };
    } catch (error) {
        console.error('Error setting payout configuration:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to set payout configuration',
            },
        };
    }
};

// Update existing payout configuration
export const updatePayoutConfiguration = async ({ id }, body, user) => {
    try {
        const { percentage, description, isPromotional, validTo } = body;

        const config = await PayoutConfig.findById(id);
        if (!config) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Payout configuration not found',
                },
            };
        }

        if (!config.isActive) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Cannot update inactive configuration',
                },
            };
        }

        // Validate percentage if provided
        if (percentage !== undefined) {
            if (typeof percentage !== 'number' || percentage < 0 || percentage > 200) {
                return {
                    status: 400,
                    entity: {
                        success: false,
                        error: 'Payout percentage must be a number between 0 and 200',
                    },
                };
            }
            config.payoutPercentage = percentage;
        }

        // Update other fields if provided
        if (description !== undefined) {
            config.description = description;
        }
        if (isPromotional !== undefined) {
            config.isPromotional = isPromotional;
        }
        if (validTo !== undefined) {
            const parsedValidTo = validTo ? new Date(validTo) : null;
            if (parsedValidTo && parsedValidTo <= config.validFrom) {
                return {
                    status: 400,
                    entity: {
                        success: false,
                        error: 'Valid to date must be after valid from date',
                    },
                };
            }
            config.validTo = parsedValidTo;
        }

        await config.save();

        return {
            status: 200,
            entity: {
                success: true,
                message: `Payout configuration updated successfully`,
                config: config.toObject(),
            },
        };
    } catch (error) {
        console.error('Error updating payout configuration:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to update payout configuration',
            },
        };
    }
};

// Deactivate payout configuration
export const deactivateConfiguration = async ({ id }, user) => {
    try {
        const result = await PayoutService.deactivateConfiguration(id);

        if (!result.success) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: result.error || 'Configuration not found',
                },
            };
        }

        return {
            status: 200,
            entity: {
                success: true,
                message: result.message,
            },
        };
    } catch (error) {
        console.error('Error deactivating configuration:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to deactivate configuration',
            },
        };
    }
};

// Get configuration history
export const getConfigurationHistory = async (query, user) => {
    try {
        const { limit = 50, offset = 0, tier, gameType } = query;

        let params = {};
        if (tier) {
            params.tier = tier.toUpperCase();
        }
        if (gameType) {
            params.gameType = gameType.toUpperCase();
        }

        const configs = await PayoutConfig.find(params)
            .populate('createdBy', 'userName name')
            .sort({ createdAt: -1 })
            .skip(parseInt(offset))
            .limit(parseInt(limit));

        const total = await PayoutConfig.countDocuments(params);

        return {
            status: 200,
            entity: {
                success: true,
                configurations: configs,
                total,
            },
        };
    } catch (error) {
        console.error('Error getting configuration history:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to retrieve configuration history',
            },
        };
    }
};

// Get payout analytics
export const getPayoutAnalytics = async (query, user) => {
    try {
        const { startDate, endDate } = query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) {
                dateFilter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                dateFilter.createdAt.$lte = new Date(endDate);
            }
        }

        // Get configuration usage statistics
        const configStats = await PayoutConfig.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: {
                        tier: '$tier',
                        gameType: '$gameType',
                        isPromotional: '$isPromotional',
                    },
                    count: { $sum: 1 },
                    avgPercentage: { $avg: '$payoutPercentage' },
                    maxPercentage: { $max: '$payoutPercentage' },
                    minPercentage: { $min: '$payoutPercentage' },
                },
            },
            {
                $sort: { '_id.tier': 1, '_id.gameType': 1 },
            },
        ]);

        // Get active configurations count
        const activeConfigs = await PayoutConfig.countDocuments({
            isActive: true,
            $or: [
                { validTo: null },
                { validTo: { $gte: new Date() } }
            ],
            validFrom: { $lte: new Date() }
        });

        // Get promotional configurations count
        const promotionalConfigs = await PayoutConfig.countDocuments({
            isActive: true,
            isPromotional: true,
            $or: [
                { validTo: null },
                { validTo: { $gte: new Date() } }
            ],
            validFrom: { $lte: new Date() }
        });

        return {
            status: 200,
            entity: {
                success: true,
                analytics: {
                    configurationStats: configStats,
                    activeConfigurations: activeConfigs,
                    promotionalConfigurations: promotionalConfigs,
                },
            },
        };
    } catch (error) {
        console.error('Error getting payout analytics:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to retrieve payout analytics',
            },
        };
    }
};

// ADD these validation functions to src/api/payout_config/controller.js

// NEW: Validate tier-based payout system
export const validateTierPayoutSystem = async (query, user) => {
    try {
        if (!['ADMIN'].includes(user.role)) {
            throw new Error('You are not authorized to perform system validation.');
        }

        const validationResults = {
            configurationValidation: {},
            ticketValidation: {},
            systemIntegrity: {},
            recommendations: []
        };

        // 1. Validate payout configurations
        console.log('Validating payout configurations...');

        const { PayoutConfig } = await import('./model');
        const activeConfigs = await PayoutConfig.find({
            isActive: true,
            $or: [
                { validTo: null },
                { validTo: { $gte: new Date() } }
            ],
            validFrom: { $lte: new Date() }
        });

        // Check if all tier-game combinations have configurations
        const requiredCombinations = [
            { tier: 'SILVER', gameType: 'BORLETTE' },
            { tier: 'GOLD', gameType: 'BORLETTE' },
            { tier: 'VIP', gameType: 'BORLETTE' }
        ];

        const missingConfigs = [];
        for (const combo of requiredCombinations) {
            const exists = activeConfigs.find(
                config => config.tier === combo.tier && config.gameType === combo.gameType
            );
            if (!exists) {
                missingConfigs.push(combo);
            }
        }

        validationResults.configurationValidation = {
            totalActiveConfigs: activeConfigs.length,
            missingConfigurations: missingConfigs,
            promotionalConfigs: activeConfigs.filter(c => c.isPromotional).length,
            configurationsByTier: {
                SILVER: activeConfigs.filter(c => c.tier === 'SILVER').length,
                GOLD: activeConfigs.filter(c => c.tier === 'GOLD').length,
                VIP: activeConfigs.filter(c => c.tier === 'VIP').length
            }
        };

        // 2. Validate ticket tier assignments
        console.log('Validating ticket tier assignments...');

        const { BorletteTicket } = await import('../borlette_ticket/model');

        const ticketStats = await BorletteTicket.aggregate([
            {
                $group: {
                    _id: '$userTierAtPurchase',
                    count: { $sum: 1 },
                    hasPayoutConfig: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $exists: ['$payoutConfig'] },
                                        { $ne: ['$payoutConfig', null] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    avgPayoutPercentage: { $avg: '$payoutConfig.percentage' }
                }
            }
        ]);

        const ticketsWithoutTier = await BorletteTicket.countDocuments({
            $or: [
                { userTierAtPurchase: { $exists: false } },
                { userTierAtPurchase: null }
            ]
        });

        const ticketsWithoutPayoutConfig = await BorletteTicket.countDocuments({
            $or: [
                { payoutConfig: { $exists: false } },
                { payoutConfig: null }
            ]
        });

        validationResults.ticketValidation = {
            ticketsByTier: ticketStats,
            ticketsWithoutTier,
            ticketsWithoutPayoutConfig,
            totalTickets: await BorletteTicket.countDocuments()
        };

        // 3. System integrity checks
        console.log('Performing system integrity checks...');

        // Check for inconsistent payout calculations
        const inconsistentTickets = await BorletteTicket.find({
            status: 'COMPLETED',
            totalAmountWon: { $gt: 0 },
            'payoutConfig.percentage': { $exists: true }
        }).limit(100);

        let payoutInconsistencies = 0;
        for (const ticket of inconsistentTickets) {
            // Basic validation - check if payout seems reasonable for the tier
            const expectedMultiplier = ticket.payoutConfig.percentage / 60; // 60% is base
            if (expectedMultiplier < 0.5 || expectedMultiplier > 3) {
                payoutInconsistencies++;
            }
        }

        // Check for duplicate active configurations
        const duplicateConfigs = await PayoutConfig.aggregate([
            {
                $match: { isActive: true }
            },
            {
                $group: {
                    _id: { tier: '$tier', gameType: '$gameType' },
                    count: { $sum: 1 },
                    configs: { $push: '$_id' }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]);

        validationResults.systemIntegrity = {
            payoutInconsistencies,
            duplicateActiveConfigs: duplicateConfigs.length,
            duplicateDetails: duplicateConfigs
        };

        // 4. Generate recommendations
        if (missingConfigs.length > 0) {
            validationResults.recommendations.push({
                type: 'MISSING_CONFIG',
                severity: 'HIGH',
                message: `Missing payout configurations for ${missingConfigs.length} tier-game combinations`,
                details: missingConfigs
            });
        }

        if (ticketsWithoutTier > 0) {
            validationResults.recommendations.push({
                type: 'MISSING_TIER_DATA',
                severity: 'MEDIUM',
                message: `${ticketsWithoutTier} tickets missing tier information`,
                action: 'Run migration script to update existing tickets'
            });
        }

        if (duplicateConfigs.length > 0) {
            validationResults.recommendations.push({
                type: 'DUPLICATE_CONFIGS',
                severity: 'HIGH',
                message: `${duplicateConfigs.length} duplicate active configurations found`,
                action: 'Deactivate duplicate configurations'
            });
        }

        if (payoutInconsistencies > 0) {
            validationResults.recommendations.push({
                type: 'PAYOUT_INCONSISTENCIES',
                severity: 'MEDIUM',
                message: `${payoutInconsistencies} tickets with potential payout calculation issues`,
                action: 'Review payout calculation logic'
            });
        }

        const overallHealth = validationResults.recommendations.length === 0 ? 'HEALTHY' :
            validationResults.recommendations.some(r => r.severity === 'HIGH') ? 'CRITICAL' : 'WARNING';

        return {
            status: 200,
            entity: {
                success: true,
                validationResults,
                systemHealth: overallHealth,
                validatedAt: new Date(),
                summary: {
                    totalIssues: validationResults.recommendations.length,
                    criticalIssues: validationResults.recommendations.filter(r => r.severity === 'HIGH').length,
                    warningIssues: validationResults.recommendations.filter(r => r.severity === 'MEDIUM').length
                }
            }
        };

    } catch (error) {
        console.error('Error validating tier payout system:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to validate tier payout system'
            }
        };
    }
};

// NEW: Test tier-based payout calculation
export const testTierPayoutCalculation = async (body, user) => {
    try {
        if (!['ADMIN'].includes(user.role)) {
            throw new Error('You are not authorized to perform payout tests.');
        }

        const { tier, gameType = 'BORLETTE', baseAmount, numbers } = body;

        if (!tier || !['SILVER', 'GOLD', 'VIP'].includes(tier)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Valid tier (SILVER, GOLD, VIP) is required'
                }
            };
        }

        if (!baseAmount || baseAmount <= 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Valid base amount is required'
                }
            };
        }

        // Test calculations for different scenarios
        const testScenarios = numbers || [
            { numberPlayed: '12', amountPlayed: 10, multiplier: 65 }, // 1st place
            { numberPlayed: '34', amountPlayed: 10, multiplier: 20 }, // 2nd place
            { numberPlayed: '56', amountPlayed: 10, multiplier: 10 }, // 3rd place
            { numberPlayed: '1234', amountPlayed: 10, multiplier: 800 }, // Marriage number
        ];

        const PayoutService = (await import('../../services/payout/index')).default;

        // Get current payout configuration for the tier
        const payoutConfig = await PayoutService.getPayoutPercentage(tier, gameType);

        const testResults = {
            tierInfo: {
                tier,
                gameType,
                payoutPercentage: payoutConfig.percentage,
                isCustomConfig: payoutConfig.isCustom,
                description: payoutConfig.description
            },
            calculations: [],
            summary: {
                totalBasePayout: 0,
                totalAdjustedPayout: 0,
                totalDifference: 0,
                tierMultiplier: payoutConfig.percentage / 60
            }
        };

        // Calculate payouts for each scenario
        for (const scenario of testScenarios) {
            const basePayout = scenario.amountPlayed * scenario.multiplier;
            const adjustedResult = await PayoutService.calculateTierAdjustedPayout(
                basePayout,
                tier,
                gameType
            );

            const calculationResult = {
                scenario: {
                    numberPlayed: scenario.numberPlayed,
                    amountPlayed: scenario.amountPlayed,
                    multiplier: scenario.multiplier
                },
                basePayout,
                adjustedPayout: adjustedResult.adjustedAmount,
                difference: adjustedResult.adjustedAmount - basePayout,
                tierMultiplier: adjustedResult.tierMultiplier,
                payoutConfig: adjustedResult.payoutConfig
            };

            testResults.calculations.push(calculationResult);
            testResults.summary.totalBasePayout += basePayout;
            testResults.summary.totalAdjustedPayout += adjustedResult.adjustedAmount;
        }

        testResults.summary.totalDifference =
            testResults.summary.totalAdjustedPayout - testResults.summary.totalBasePayout;

        return {
            status: 200,
            entity: {
                success: true,
                testResults,
                testedAt: new Date()
            }
        };

    } catch (error) {
        console.error('Error testing tier payout calculation:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to test payout calculation'
            }
        };
    }
};