import { Influencer } from './model';
import { InfluencerCommission } from '../influencer_commission/model';
import { User } from '../user/model';
import moment from 'moment';

// Create influencer contract
export const createContract = async (body, admin) => {
    try {
        if (!['ADMIN'].includes(admin.role)) {
            throw new Error('You are not authorized to create influencer contracts.');
        }

        const { userId, contractStartDate, contractEndDate, commissionRates, specialTerms } = body;

        // Validate user exists
        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found',
                },
            };
        }

        // Check if user already has a contract
        const existingContract = await Influencer.findOne({ user: userId });
        if (existingContract) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'User already has an influencer contract',
                },
            };
        }

        // Create contract
        const contract = await Influencer.create({
            user: userId,
            contractStatus: 'ACTIVE',
            contractStartDate: contractStartDate || new Date(),
            contractEndDate: contractEndDate || null,
            commissionRates: commissionRates || {
                borlette: { perPlay: 0.25, monthlyCap: 15000 },
                roulette: { per100Spins: 0.35, monthlyCap: 15000 },
                dominoes: { per100Wagered: 0.30, monthlyCap: 15000 },
            },
            specialTerms,
            createdBy: admin._id,
        });

        // Update user to mark as influencer
        user.isInfluencer = true;
        user.influencerContractId = contract._id;
        await user.save();

        return {
            status: 200,
            entity: {
                success: true,
                contract,
                message: 'Influencer contract created successfully',
            },
        };
    } catch (error) {
        console.error('Error creating influencer contract:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to create contract',
            },
        };
    }
};

// Update contract terms
export const updateContract = async ({ userId }, body, admin) => {
    try {
        if (!['ADMIN'].includes(admin.role)) {
            throw new Error('You are not authorized to update influencer contracts.');
        }

        const contract = await Influencer.findOne({ user: userId });
        if (!contract) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Influencer contract not found',
                },
            };
        }

        const { contractEndDate, commissionRates, specialTerms } = body;

        if (contractEndDate !== undefined) {
            contract.contractEndDate = contractEndDate;
        }

        if (commissionRates) {
            contract.commissionRates = {
                ...contract.commissionRates,
                ...commissionRates,
            };
        }

        if (specialTerms !== undefined) {
            contract.specialTerms = specialTerms;
        }

        contract.lastModifiedBy = admin._id;
        await contract.save();

        return {
            status: 200,
            entity: {
                success: true,
                contract,
                message: 'Contract updated successfully',
            },
        };
    } catch (error) {
        console.error('Error updating influencer contract:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to update contract',
            },
        };
    }
};

// Activate contract
export const activateContract = async ({ userId }, admin) => {
    try {
        if (!['ADMIN'].includes(admin.role)) {
            throw new Error('You are not authorized to activate contracts.');
        }

        const contract = await Influencer.findOne({ user: userId });
        if (!contract) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Influencer contract not found',
                },
            };
        }

        contract.contractStatus = 'ACTIVE';
        contract.suspensionReason = null;
        contract.lastModifiedBy = admin._id;
        await contract.save();

        // Update user
        const user = await User.findById(userId);
        if (user) {
            user.isInfluencer = true;
            await user.save();
        }

        return {
            status: 200,
            entity: {
                success: true,
                contract,
                message: 'Contract activated successfully',
            },
        };
    } catch (error) {
        console.error('Error activating contract:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to activate contract',
            },
        };
    }
};

// Deactivate contract
export const deactivateContract = async ({ userId }, body, admin) => {
    try {
        if (!['ADMIN'].includes(admin.role)) {
            throw new Error('You are not authorized to deactivate contracts.');
        }

        const contract = await Influencer.findOne({ user: userId });
        if (!contract) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Influencer contract not found',
                },
            };
        }

        const { reason } = body;

        contract.contractStatus = 'INACTIVE';
        contract.suspensionReason = reason || 'Contract deactivated by admin';
        contract.lastModifiedBy = admin._id;
        await contract.save();

        // Update user
        const user = await User.findById(userId);
        if (user) {
            user.isInfluencer = false;
            await user.save();
        }

        return {
            status: 200,
            entity: {
                success: true,
                contract,
                message: 'Contract deactivated successfully',
            },
        };
    } catch (error) {
        console.error('Error deactivating contract:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to deactivate contract',
            },
        };
    }
};

// List all influencers
export const listInfluencers = async (query, admin) => {
    try {
        if (!['ADMIN'].includes(admin.role)) {
            throw new Error('You are not authorized to view influencer list.');
        }

        const { status, offset = 0, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = query;

        let matchCriteria = {};
        if (status) {
            matchCriteria.contractStatus = status.toUpperCase();
        }

        const influencers = await Influencer.find(matchCriteria)
            .populate('user', 'name phone email userName')
            .populate('createdBy', 'name')
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .sort({ [sortBy]: sortOrder.toLowerCase() });

        const total = await Influencer.countDocuments(matchCriteria);

        return {
            status: 200,
            entity: {
                success: true,
                influencers,
                total,
            },
        };
    } catch (error) {
        console.error('Error listing influencers:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to list influencers',
            },
        };
    }
};

// Get influencer analytics
export const getInfluencerAnalytics = async (query, admin) => {
    try {
        if (!['ADMIN'].includes(admin.role)) {
            throw new Error('You are not authorized to view influencer analytics.');
        }

        const { startDate, endDate, influencerId } = query;

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
        let matchCriteria = dateFilter;
        if (influencerId) {
            matchCriteria.influencer = influencerId;
        }

        // Get commission statistics
        const commissionStats = await InfluencerCommission.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: {
                        influencer: '$influencer',
                        gameType: '$gameType',
                        monthKey: '$monthKey',
                    },
                    totalCommissions: { $sum: '$commissionAmount' },
                    totalPlays: { $sum: 1 },
                    totalPlayAmount: { $sum: '$playAmount' },
                    uniqueReferees: { $addToSet: '$referee' },
                },
            },
            {
                $group: {
                    _id: {
                        influencer: '$_id.influencer',
                        monthKey: '$_id.monthKey',
                    },
                    gameBreakdown: {
                        $push: {
                            gameType: '$_id.gameType',
                            totalCommissions: '$totalCommissions',
                            totalPlays: '$totalPlays',
                            totalPlayAmount: '$totalPlayAmount',
                            uniqueReferees: { $size: '$uniqueReferees' },
                        },
                    },
                    monthlyTotal: { $sum: '$totalCommissions' },
                },
            },
            {
                $sort: { '_id.monthKey': -1 },
            },
        ]);

        // Get top performers
        const topPerformers = await InfluencerCommission.aggregate([
            {
                $match: {
                    ...matchCriteria,
                    monthKey: moment().format('YYYY-MM'),
                },
            },
            {
                $group: {
                    _id: '$influencer',
                    totalEarned: { $sum: '$commissionAmount' },
                    totalReferrals: { $sum: 1 },
                    uniqueReferees: { $addToSet: '$referee' },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo',
                },
            },
            {
                $project: {
                    influencer: { $arrayElemAt: ['$userInfo', 0] },
                    totalEarned: 1,
                    totalReferrals: 1,
                    uniqueReferees: { $size: '$uniqueReferees' },
                },
            },
            {
                $sort: { totalEarned: -1 },
            },
            {
                $limit: 10,
            },
        ]);

        return {
            status: 200,
            entity: {
                success: true,
                analytics: {
                    commissionStats,
                    topPerformers,
                    dateRange: {
                        startDate: startDate || 'All time',
                        endDate: endDate || 'Present',
                    },
                },
            },
        };
    } catch (error) {
        console.error('Error getting influencer analytics:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to retrieve analytics',
            },
        };
    }
};