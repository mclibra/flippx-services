import { FlippXConfig } from '../../api/flippx_config/model';
import { FlippXCollection } from '../../api/flippx_collection/model';
import { Transaction } from '../../api/transaction/model';
import { Wallet } from '../../api/wallet/model';

// Default collection percentages
const DEFAULT_COLLECTION_PERCENTAGES = {
    BORLETTE: 5, // 5% default
    ROULETTE: 5,
    DOMINOES: 5,
    MEGAMILLION: 5,
};

class FlippXService {
    // Get current collection percentage for a game type
    static async getCollectionPercentage(gameType) {
        try {
            // Check for active configuration
            const config = await FlippXConfig.findOne({
                gameType: gameType.toUpperCase(),
                isActive: true,
            }).sort({ createdAt: -1 });

            if (config) {
                return {
                    percentage: config.collectionPercentage,
                    isCustom: true,
                    configId: config._id,
                    description: config.description,
                };
            }

            // Fall back to default percentage
            const defaultPercentage = DEFAULT_COLLECTION_PERCENTAGES[gameType.toUpperCase()];
            return {
                percentage: defaultPercentage || 0,
                isCustom: false,
                configId: null,
                description: 'Default percentage',
            };
        } catch (error) {
            console.error('Error getting collection percentage:', error);
            // Return 0 as fallback to avoid blocking wins
            return {
                percentage: 0,
                isCustom: false,
                configId: null,
                error: error.message,
            };
        }
    }

    // Process collection on winning amount
    static async processWinningCollection(userId, gameType, originalWinAmount, ticketId) {
        try {
            // Get collection percentage
            const collectionConfig = await this.getCollectionPercentage(gameType);
            const collectionPercentage = collectionConfig.percentage;

            // If no collection configured, return original amount
            if (collectionPercentage === 0) {
                return {
                    success: true,
                    originalAmount: originalWinAmount,
                    collectionAmount: 0,
                    netAmount: originalWinAmount,
                    message: 'No collection applied',
                };
            }

            // Calculate collection
            const collectionAmount = Math.round((originalWinAmount * collectionPercentage) / 100);
            const netWinAmount = originalWinAmount - collectionAmount;

            // Create collection record
            const collection = await FlippXCollection.create({
                user: userId,
                gameType: gameType.toUpperCase(),
                winningTransaction: null, // Will be updated when transaction is created
                ticketId,
                originalWinAmount,
                collectionPercentage,
                collectionAmount,
                netWinAmount,
                status: 'COLLECTED',
                processedAt: new Date(),
            });

            return {
                success: true,
                originalAmount: originalWinAmount,
                collectionAmount,
                netAmount: netWinAmount,
                collectionId: collection._id,
                message: `FlippX collection of ${collectionPercentage}% applied`,
            };
        } catch (error) {
            console.error('Error processing winning collection:', error);
            // Don't fail the winning process due to collection error
            return {
                success: false,
                originalAmount: originalWinAmount,
                collectionAmount: 0,
                netAmount: originalWinAmount,
                error: error.message,
            };
        }
    }

    // Get collection report
    static async getCollectionReport(startDate, endDate) {
        try {
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

            const report = await FlippXCollection.aggregate([
                {
                    $match: {
                        status: 'COLLECTED',
                        ...dateFilter,
                    },
                },
                {
                    $group: {
                        _id: {
                            gameType: '$gameType',
                            date: {
                                $dateToString: {
                                    format: '%Y-%m-%d',
                                    date: '$createdAt',
                                },
                            },
                        },
                        totalTransactions: { $sum: 1 },
                        totalOriginalWins: { $sum: '$originalWinAmount' },
                        totalCollected: { $sum: '$collectionAmount' },
                        totalNetPaid: { $sum: '$netWinAmount' },
                        avgCollectionPercentage: { $avg: '$collectionPercentage' },
                    },
                },
                {
                    $sort: { '_id.date': -1, '_id.gameType': 1 },
                },
            ]);

            return {
                success: true,
                report,
                dateRange: {
                    startDate: startDate || 'All time',
                    endDate: endDate || 'Present',
                },
            };
        } catch (error) {
            console.error('Error generating collection report:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    // Update collection record with transaction ID
    static async updateCollectionTransaction(collectionId, transactionId) {
        try {
            await FlippXCollection.findByIdAndUpdate(
                collectionId,
                { winningTransaction: transactionId }
            );
            return { success: true };
        } catch (error) {
            console.error('Error updating collection transaction:', error);
            return { success: false, error: error.message };
        }
    }
}

export default FlippXService;