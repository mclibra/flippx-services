import moment from 'moment';
import mongoose from 'mongoose';
import { Plan } from './model';
import { UserPlan } from './userPlanModel';
import { Transaction } from '../transaction/model';
import { makeTransaction } from '../transaction/controller';

export const list = async (query) => {
    try {
        const {
            offset = 0,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            status,
            isAvailableForPurchase,
        } = query;

        let params = {};

        if (status) {
            params.status = status.toUpperCase();
        }

        if (isAvailableForPurchase !== undefined) {
            params.isAvailableForPurchase = isAvailableForPurchase === 'true';
        }

        const plans = await Plan.find(params)
            .populate('createdBy', 'name.firstName name.lastName')
            .populate('updatedBy', 'name.firstName name.lastName')
            .populate('deprecatedBy', 'name.firstName name.lastName')
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 });

        const total = await Plan.countDocuments(params);

        return {
            status: 200,
            entity: {
                success: true,
                plans,
                total,
                pagination: {
                    offset: parseInt(offset),
                    limit: parseInt(limit),
                    total,
                },
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to fetch plans',
            },
        };
    }
};

export const create = async (body, user) => {
    try {
        const {
            name,
            description,
            price,
            currency = 'USD',
            realCashAmount = 0,
            virtualCashAmount = 0,
        } = body;

        // Validation
        if (!name || !price) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Name and price are required',
                },
            };
        }

        if (price <= 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Price must be greater than 0',
                },
            };
        }

        if (realCashAmount < 0 || virtualCashAmount < 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Cash amounts cannot be negative',
                },
            };
        }

        if (realCashAmount === 0 && virtualCashAmount === 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'At least one cash amount (real or virtual) must be greater than 0',
                },
            };
        }

        const plan = await Plan.create({
            name,
            description,
            price,
            currency,
            realCashAmount,
            virtualCashAmount,
            createdBy: user._id,
        });

        const populatedPlan = await Plan.findById(plan._id)
            .populate('createdBy', 'name.firstName name.lastName');

        return {
            status: 201,
            entity: {
                success: true,
                plan: populatedPlan,
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 409,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to create plan',
            },
        };
    }
};

export const show = async ({ id }) => {
    try {
        const plan = await Plan.findById(id)
            .populate('createdBy', 'name.firstName name.lastName')
            .populate('updatedBy', 'name.firstName name.lastName')
            .populate('deprecatedBy', 'name.firstName name.lastName');

        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        // Get active users count for this plan
        const activeUsersCount = await UserPlan.countDocuments({
            plan: id,
            status: 'ACTIVE',
        });

        // Get total purchases count
        const totalPurchasesCount = await UserPlan.countDocuments({
            plan: id,
        });

        return {
            status: 200,
            entity: {
                success: true,
                plan: {
                    ...plan.toObject(),
                    activeUsersCount,
                    totalPurchasesCount,
                },
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to fetch plan',
            },
        };
    }
};

export const update = async ({ id }, body, user) => {
    try {
        const plan = await Plan.findById(id);
        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        if (plan.status === 'DEPRECATED') {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Cannot update deprecated plan',
                },
            };
        }

        const {
            name,
            description,
            price,
            currency,
            realCashAmount,
            virtualCashAmount,
            isAvailableForPurchase,
        } = body;

        // Validation
        if (price !== undefined && price <= 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Price must be greater than 0',
                },
            };
        }

        if ((realCashAmount !== undefined && realCashAmount < 0) ||
            (virtualCashAmount !== undefined && virtualCashAmount < 0)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Cash amounts cannot be negative',
                },
            };
        }

        // Update fields
        if (name !== undefined) plan.name = name;
        if (description !== undefined) plan.description = description;
        if (price !== undefined) plan.price = price;
        if (currency !== undefined) plan.currency = currency;
        if (realCashAmount !== undefined) plan.realCashAmount = realCashAmount;
        if (virtualCashAmount !== undefined) plan.virtualCashAmount = virtualCashAmount;
        if (isAvailableForPurchase !== undefined) plan.isAvailableForPurchase = isAvailableForPurchase;

        plan.updatedBy = user._id;

        // Check if at least one cash amount is greater than 0
        if (plan.realCashAmount === 0 && plan.virtualCashAmount === 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'At least one cash amount (real or virtual) must be greater than 0',
                },
            };
        }

        await plan.save();

        const updatedPlan = await Plan.findById(id)
            .populate('createdBy', 'name.firstName name.lastName')
            .populate('updatedBy', 'name.firstName name.lastName')
            .populate('deprecatedBy', 'name.firstName name.lastName');

        return {
            status: 200,
            entity: {
                success: true,
                plan: updatedPlan,
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 409,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to update plan',
            },
        };
    }
};

export const remove = async ({ id }, user) => {
    try {
        const plan = await Plan.findById(id);
        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        if (plan.status === 'DEPRECATED') {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Plan is already deprecated',
                },
            };
        }

        // Instead of removing, we deprecate the plan
        plan.status = 'DEPRECATED';
        plan.isAvailableForPurchase = false;
        plan.deprecatedBy = user._id;
        plan.deprecatedAt = new Date();
        plan.updatedBy = user._id;

        await plan.save();

        return {
            status: 200,
            entity: {
                success: true,
                message: 'Plan has been deprecated successfully',
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 409,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to deprecate plan',
            },
        };
    }
};

export const getPlanAnalytics = async ({ id }, query) => {
    try {
        const plan = await Plan.findById(id);
        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        const {
            startDate,
            endDate,
            period = 'weekly', // weekly, monthly, custom
        } = query;

        // Calculate date range based on period
        let dateFilter = {};
        let dateRange = {};

        if (period === 'weekly') {
            dateRange.start = moment().subtract(7, 'days').toDate();
            dateRange.end = new Date();
        } else if (period === 'monthly') {
            dateRange.start = moment().subtract(30, 'days').toDate();
            dateRange.end = new Date();
        } else if (period === 'custom' && startDate && endDate) {
            dateRange.start = new Date(startDate);
            dateRange.end = new Date(endDate);
        } else {
            // Default to last 7 days
            dateRange.start = moment().subtract(7, 'days').toDate();
            dateRange.end = new Date();
        }

        dateFilter.createdAt = {
            $gte: dateRange.start,
            $lte: dateRange.end,
        };

        // Get active users count for this plan
        const activeUsers = await UserPlan.find({
            plan: id,
            status: 'ACTIVE',
        }).populate('user', 'name.firstName name.lastName phone');

        // Get transactions in the specified period for users with this plan
        const userPlanPurchases = await UserPlan.find({
            plan: id,
            ...dateFilter,
        }).populate('user', 'name.firstName name.lastName phone');

        // Get transaction statistics
        const transactionStats = await UserPlan.aggregate([
            {
                $match: {
                    plan: new mongoose.Types.ObjectId(id),
                    ...dateFilter,
                },
            },
            {
                $lookup: {
                    from: 'plans',
                    localField: 'plan',
                    foreignField: '_id',
                    as: 'planDetails',
                },
            },
            {
                $unwind: '$planDetails',
            },
            {
                $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalRevenue: { $sum: '$planDetails.price' },
                    totalRealCash: { $sum: '$planDetails.realCashAmount' },
                    totalVirtualCash: { $sum: '$planDetails.virtualCashAmount' },
                },
            },
        ]);

        // Get daily breakdown for charts
        const dailyBreakdown = await UserPlan.aggregate([
            {
                $match: {
                    plan: new mongoose.Types.ObjectId(id),
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' },
                    },
                    count: { $sum: 1 },
                    date: { $first: '$createdAt' },
                },
            },
            {
                $sort: { date: 1 },
            },
        ]);

        const stats = transactionStats[0] || {
            totalTransactions: 0,
            totalRevenue: 0,
            totalRealCash: 0,
            totalVirtualCash: 0,
        };

        return {
            status: 200,
            entity: {
                success: true,
                plan,
                analytics: {
                    period: period,
                    dateRange,
                    activeUsersCount: activeUsers.length,
                    activeUsers: activeUsers.slice(0, 10), // Limit to 10 for response size
                    transactionStats: stats,
                    recentPurchases: userPlanPurchases.slice(0, 20), // Limit to 20 recent purchases
                    dailyBreakdown,
                },
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to fetch plan analytics',
            },
        };
    }
};

export const purchasePlan = async ({ id }, user) => {
    try {
        const plan = await Plan.findById(id);
        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        if (plan.status !== 'ACTIVE' || !plan.isAvailableForPurchase) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Plan is not available for purchase',
                },
            };
        }

        // Check if user already has an active plan of this type
        const existingUserPlan = await UserPlan.findOne({
            user: user._id,
            plan: id,
            status: 'ACTIVE',
        });

        if (existingUserPlan) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'You already have an active subscription to this plan',
                },
            };
        }

        // Credit virtual cash if specified
        if (plan.virtualCashAmount > 0) {
            await makeTransaction(
                user._id,
                user.role,
                'PLAN_PURCHASE_VIRTUAL',
                plan.virtualCashAmount,
                id,
                'PLAN',
                null,
                'VIRTUAL'
            );
        }

        // Credit real cash if specified (goes to non-withdrawable)
        if (plan.realCashAmount > 0) {
            await makeTransaction(
                user._id,
                user.role,
                'PLAN_PURCHASE_REAL',
                plan.realCashAmount,
                id,
                'PLAN',
                null,
                'REAL'
            );
        }

        // Create user plan record
        const userPlan = await UserPlan.create({
            user: user._id,
            plan: id,
            planSnapshot: {
                name: plan.name,
                price: plan.price,
                realCashAmount: plan.realCashAmount,
                virtualCashAmount: plan.virtualCashAmount,
            },
        });

        const populatedUserPlan = await UserPlan.findById(userPlan._id)
            .populate('plan')
            .populate('user', 'name.firstName name.lastName phone');

        return {
            status: 200,
            entity: {
                success: true,
                userPlan: populatedUserPlan,
                message: `Successfully purchased ${plan.name} plan`,
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to purchase plan',
            },
        };
    }
};