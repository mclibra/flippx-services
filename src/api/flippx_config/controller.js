import { FlippXConfig } from './model';
import { FlippXCollection } from '../flippx_collection/model';
import FlippXService from '../../services/flippx/collectionService';

// Get current collection configurations
export const getCurrentConfigurations = async (query, user) => {
    try {
        if (!['ADMIN'].includes(user.role)) {
            throw new Error('You are not authorized to view collection configurations.');
        }

        const configurations = await FlippXConfig.find({ isActive: true });

        // Get all game types with their current configuration
        const gameTypes = ['BORLETTE', 'ROULETTE', 'DOMINOES', 'MEGAMILLION'];
        const result = {};

        for (const gameType of gameTypes) {
            const config = configurations.find(c => c.gameType === gameType);
            result[gameType] = {
                percentage: config ? config.collectionPercentage : 0,
                isActive: config ? config.isActive : false,
                configId: config ? config._id : null,
                description: config ? config.description : 'No active configuration',
                lastUpdated: config ? config.updatedAt : null,
            };
        }

        return {
            status: 200,
            entity: {
                success: true,
                configurations: result,
            },
        };
    } catch (error) {
        console.error('Error getting collection configurations:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to retrieve collection configurations',
            },
        };
    }
};

// Set collection percentage
export const setCollectionPercentage = async (body, user) => {
    try {
        if (!['ADMIN'].includes(user.role)) {
            throw new Error('You are not authorized to set collection percentages.');
        }

        const { gameType, percentage, description } = body;

        // Validation
        if (!gameType || !['BORLETTE', 'ROULETTE', 'DOMINOES', 'MEGAMILLION'].includes(gameType)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Valid game type is required',
                },
            };
        }

        if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Collection percentage must be between 0 and 100',
                },
            };
        }

        // Deactivate existing configuration
        await FlippXConfig.updateMany(
            { gameType, isActive: true },
            { isActive: false }
        );

        // Create new configuration
        const config = await FlippXConfig.create({
            gameType,
            collectionPercentage: percentage,
            createdBy: user._id,
            description: description || `FlippX collection set to ${percentage}% for ${gameType}`,
            isActive: true,
        });

        return {
            status: 200,
            entity: {
                success: true,
                config,
                message: `Collection percentage for ${gameType} set to ${percentage}%`,
            },
        };
    } catch (error) {
        console.error('Error setting collection percentage:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to set collection percentage',
            },
        };
    }
};

// Update collection configuration
export const updateCollectionConfiguration = async ({ id }, body, user) => {
    try {
        if (!['ADMIN'].includes(user.role)) {
            throw new Error('You are not authorized to update collection configurations.');
        }

        const config = await FlippXConfig.findById(id);
        if (!config) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Configuration not found',
                },
            };
        }

        const { percentage, description } = body;

        if (percentage !== undefined) {
            if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
                return {
                    status: 400,
                    entity: {
                        success: false,
                        error: 'Collection percentage must be between 0 and 100',
                    },
                };
            }
            config.collectionPercentage = percentage;
        }

        if (description !== undefined) {
            config.description = description;
        }

        await config.save();

        return {
            status: 200,
            entity: {
                success: true,
                config,
                message: 'Configuration updated successfully',
            },
        };
    } catch (error) {
        console.error('Error updating collection configuration:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to update configuration',
            },
        };
    }
};

// Get collection analytics
export const getCollectionAnalytics = async (query, user) => {
    try {
        if (!['ADMIN'].includes(user.role)) {
            throw new Error('You are not authorized to view collection analytics.');
        }

        const { startDate, endDate, gameType } = query;

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

        // Build match criteria
        let matchCriteria = {
            status: 'COLLECTED',
            ...dateFilter,
        };

        if (gameType) {
            matchCriteria.gameType = gameType.toUpperCase();
        }

        // Get collection statistics
        const stats = await FlippXCollection.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: '$gameType',
                    totalCollections: { $sum: 1 },
                    totalOriginalWins: { $sum: '$originalWinAmount' },
                    totalCollected: { $sum: '$collectionAmount' },
                    totalNetPaid: { $sum: '$netWinAmount' },
                    avgCollectionPercentage: { $avg: '$collectionPercentage' },
                },
            },
            {
                $sort: { _id: 1 },
            },
        ]);

        // Get daily collections
        const dailyCollections = await FlippXCollection.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$createdAt',
                            },
                        },
                        gameType: '$gameType',
                    },
                    count: { $sum: 1 },
                    collected: { $sum: '$collectionAmount' },
                },
            },
            {
                $sort: { '_id.date': -1 },
            },
        ]);

        // Get overall summary
        const overallSummary = await FlippXCollection.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalCollected: { $sum: '$collectionAmount' },
                    totalOriginalWins: { $sum: '$originalWinAmount' },
                    avgCollectionRate: { $avg: '$collectionPercentage' },
                },
            },
        ]);

        return {
            status: 200,
            entity: {
                success: true,
                analytics: {
                    statistics: stats,
                    dailyCollections,
                    summary: overallSummary[0] || {},
                    dateRange: {
                        startDate: startDate || 'All time',
                        endDate: endDate || 'Present',
                    },
                },
            },
        };
    } catch (error) {
        console.error('Error getting collection analytics:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to retrieve analytics',
            },
        };
    }
};