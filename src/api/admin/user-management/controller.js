import { User } from '../../user/model';
import { Wallet } from '../../wallet/model';
import { Transaction } from '../../transaction/model';
import { LoyaltyProfile, LoyaltyTransaction } from '../../loyalty/model';
import { BorletteTicket } from '../../borlette_ticket/model';
import { MegaMillionTicket } from '../../megamillion_ticket/model';
import { RouletteTicket } from '../../roulette_ticket/model';
import { DominoGame } from '../../domino/model';
import { Payment } from '../../wallet/model';
import { Withdrawal } from '../../withdrawal/model';
import { LoyaltyService } from '../../loyalty/service';
import randtoken from 'rand-token';
import bcrypt from 'bcryptjs';

// ===== USER LIST WITH SEARCH & FILTERING =====

export const getUserList = async (query) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            status,
            loyaltyTier,
            verificationStatus,
            registrationStartDate,
            registrationEndDate,
            lastLoginStartDate,
            lastLoginEndDate,
            country,
            role,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = query;

        // Build filter object
        const filter = {};

        // Search functionality (username, email, phone)
        if (search) {
            filter.$or = [
                { userName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') },
                { 'name.firstName': new RegExp(search, 'i') },
                { 'name.lastName': new RegExp(search, 'i') }
            ];
        }

        // Account status filter
        if (status) {
            if (status === 'active') {
                filter.isActive = true;
            } else if (status === 'suspended' || status === 'banned') {
                filter.isActive = false;
            }
        }

        // Country filter
        if (country) {
            filter['address.country'] = new RegExp(country, 'i');
        }

        // User role filter
        if (role) {
            filter['role'] = role;
        }

        // Verification status filter
        if (verificationStatus) {
            if (verificationStatus === 'verified') {
                filter.$and = [
                    { 'idProof.verificationStatus': 'VERIFIED' },
                    { 'addressProof.verificationStatus': 'VERIFIED' }
                ];
            } else if (verificationStatus === 'unverified') {
                filter.$or = [
                    { 'idProof.verificationStatus': { $in: ['NOT_UPLOADED', 'REJECTED'] } },
                    { 'addressProof.verificationStatus': { $in: ['NOT_UPLOADED', 'REJECTED'] } }
                ];
            } else if (verificationStatus === 'pending') {
                filter.$or = [
                    { 'idProof.verificationStatus': 'PENDING' },
                    { 'addressProof.verificationStatus': 'PENDING' }
                ];
            }
        }

        // Registration date range
        if (registrationStartDate || registrationEndDate) {
            filter.createdAt = {};
            if (registrationStartDate) {
                filter.createdAt.$gte = new Date(registrationStartDate);
            }
            if (registrationEndDate) {
                filter.createdAt.$lte = new Date(registrationEndDate);
            }
        }

        // Last login date range
        if (lastLoginStartDate || lastLoginEndDate) {
            filter['sessionTracking.lastLoginDate'] = {};
            if (lastLoginStartDate) {
                filter['sessionTracking.lastLoginDate'].$gte = new Date(lastLoginStartDate);
            }
            if (lastLoginEndDate) {
                filter['sessionTracking.lastLoginDate'].$lte = new Date(lastLoginEndDate);
            }
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get users with populated data
        const users = await User.find(filter)
            .select('-password -securePin')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 });

        // Get total count
        const total = await User.countDocuments(filter);

        // Get loyalty and wallet data for each user
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            const wallet = await Wallet.findOne({ user: user._id });
            const loyalty = await LoyaltyProfile.findOne({ user: user._id });

            // Count gaming activity across all game types
            const [borletteTickets, megaMillionTickets, rouletteTickets, dominoGames] = await Promise.all([
                BorletteTicket.countDocuments({ user: user._id }),
                MegaMillionTicket.countDocuments({ user: user._id }),
                RouletteTicket.countDocuments({ user: user._id }),
                DominoGame.countDocuments({ 'players.user': user._id })
            ]);

            return {
                ...user.toObject(),
                wallet: wallet ? {
                    virtualBalance: wallet.virtualBalance,
                    realBalance: wallet.realBalance,
                    pendingWithdrawals: wallet.pendingWithdrawals
                } : null,
                loyalty: loyalty ? {
                    currentTier: loyalty.currentTier,
                    totalXP: loyalty.totalXP
                } : null,
                gameStats: {
                    totalGames: borletteTickets + megaMillionTickets + rouletteTickets + dominoGames,
                    borletteTickets,
                    megaMillionTickets,
                    rouletteTickets,
                    dominoGames
                }
            };
        }));

        // Filter by loyalty tier if specified
        let finalUsers = enrichedUsers;
        if (loyaltyTier) {
            finalUsers = enrichedUsers.filter(user =>
                user.loyalty && user.loyalty.currentTier === loyaltyTier.toUpperCase()
            );
        }

        return {
            status: 200,
            entity: {
                success: true,
                users: finalUsers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit),
                    hasMore: (parseInt(page) * parseInt(limit)) < total
                }
            }
        };
    } catch (error) {
        console.error('Get user list error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to fetch users'
            }
        };
    }
};

// ===== USER CREATION =====

export const createUser = async (body, adminUser) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            countryCode,
            dob,
            password,
            role = 'USER',
            // Address details
            address1,
            address2,
            city,
            state,
            country,
            pincode,
            sim_nif,
            // Account settings
            isActive = true,
            loyaltyTier = 'NONE',
        } = body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !countryCode || !dob || !password) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Missing required fields'
                }
            };
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { phone }]
        });

        if (existingUser) {
            return {
                status: 409,
                entity: {
                    success: false,
                    error: 'User with this email or phone already exists'
                }
            };
        }

        // Create user
        const userData = {
            name: { firstName, lastName },
            email,
            phone,
            countryCode,
            dob,
            slugName: `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
            password,
            role,
            isActive,
            address: {
                address1,
                address2,
                city,
                state,
                country,
                pincode
            },
            sim_nif
        };

        const user = await User.create(userData);

        // Create wallet
        await Wallet.create({
            user: user._id,
            virtualBalance: 0,
            realBalanceWithdrawable: 0,
            realBalanceNonWithdrawable: 0,
            active: true
        });

        // Initialize loyalty profile
        await LoyaltyService.initializeLoyaltyForUser(user._id);

        // If loyalty tier is specified and not BRONZE, update it
        if (loyaltyTier !== 'NONE') {
            await LoyaltyService.manualTierUpgrade(
                user._id,
                loyaltyTier,
                adminUser._id,
                'Admin user creation'
            );
        }

        return {
            status: 201,
            entity: {
                success: true,
                user: {
                    ...user.view(true),
                    password: undefined
                }
            }
        };
    } catch (error) {
        console.error('Create user error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to create user'
            }
        };
    }
};

// ===== USER UPDATE =====

export const updateUser = async (userId, body, adminUser) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        // Prepare update object
        const updateData = {};

        // Basic information updates
        if (body.firstName || body.lastName) {
            updateData.name = {
                firstName: body.firstName || user.name.firstName,
                lastName: body.lastName || user.name.lastName
            };
        }

        if (body.email) updateData.email = body.email;
        if (body.phone) updateData.phone = body.phone;
        if (body.countryCode) updateData.countryCode = body.countryCode;
        if (body.dob) updateData.dob = body.dob;
        if (body.role) updateData.role = body.role;
        if (body.isActive !== undefined) updateData.isActive = body.isActive;
        if (body.sim_nif) updateData.sim_nif = body.sim_nif;

        // Address updates
        if (body.address1 || body.address2 || body.city || body.state || body.country || body.pincode) {
            updateData.address = {
                ...user.address,
                ...(body.address1 && { address1: body.address1 }),
                ...(body.address2 && { address2: body.address2 }),
                ...(body.city && { city: body.city }),
                ...(body.state && { state: body.state }),
                ...(body.country && { country: body.country }),
                ...(body.pincode && { pincode: body.pincode })
            };
        }

        // Bank account updates
        if (body.bankAccounts) {
            updateData.bankAccount = body.bankAccounts;
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        );

        return {
            status: 200,
            entity: {
                success: true,
                user: {
                    ...updatedUser.view(true),
                    password: undefined
                }
            }
        };
    } catch (error) {
        console.error('Update user error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to update user'
            }
        };
    }
};

// ===== USER DETAILS VIEW =====

export const getUserDetails = async (userId, query = {}) => {
    try {
        const { startDate, endDate } = query;

        // Get user with full details
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        // Get wallet information
        const wallet = await Wallet.findOne({ user: userId });

        // Get loyalty profile
        const loyalty = await LoyaltyProfile.findOne({ user: userId });

        // Build date filter for gaming activities if dates are provided
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

        // Get recent transactions (apply date filter if provided)
        const recentTransactions = await Transaction.find({
            user: userId,
            ...dateFilter
        })
            .sort({ createdAt: -1 })
            .limit(10);

        // Get gaming statistics with date filtering
        const gameFilters = { user: userId, ...dateFilter };

        const [borletteTickets, megaMillionTickets, rouletteTickets, dominoGames] = await Promise.all([
            BorletteTicket.find(gameFilters).sort({ createdAt: -1 }).limit(5),
            MegaMillionTicket.find(gameFilters).sort({ createdAt: -1 }).limit(5),
            RouletteTicket.find(gameFilters).sort({ createdAt: -1 }).limit(5),
            DominoGame.find({ 'players.user': userId, ...dateFilter }).sort({ createdAt: -1 }).limit(5)
        ]);

        // Get payment history (apply date filter if provided)
        const payments = await Payment.find({ user: userId, ...dateFilter })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('plan', 'name price');

        // Get withdrawal history (apply date filter if provided)
        const withdrawals = await Withdrawal.find({ user: userId, ...dateFilter })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('bankAccount');

        // Calculate gaming statistics (apply date filter if provided)
        const totalBorletteTickets = await BorletteTicket.countDocuments(gameFilters);
        const totalMegaMillionTickets = await MegaMillionTicket.countDocuments(gameFilters);
        const totalRouletteTickets = await RouletteTicket.countDocuments(gameFilters);
        const totalDominoGames = await DominoGame.countDocuments({ 'players.user': userId, ...dateFilter });

        // Calculate financial summary (apply date filter if provided)
        const totalDeposits = await Payment.aggregate([
            { $match: { user: userId, status: 'COMPLETED', ...dateFilter } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalWithdrawals = await Withdrawal.aggregate([
            { $match: { user: userId, status: 'COMPLETED', ...dateFilter } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // ===== NEW: CASH TYPE ANALYTICS =====

        // 1. Borlette Tickets Analytics by Cash Type
        const borletteAnalytics = await BorletteTicket.aggregate([
            { $match: gameFilters },
            {
                $group: {
                    _id: '$cashType',
                    totalAmountSpent: { $sum: '$totalAmountPlayed' },
                    totalWon: { $sum: { $ifNull: ['$totalAmountWon', 0] } },
                    totalGames: { $sum: 1 },
                    winningGames: {
                        $sum: {
                            $cond: [{ $gt: [{ $ifNull: ['$totalAmountWon', 0] }, 0] }, 1, 0]
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalLoss: { $subtract: ['$totalAmountSpent', '$totalWon'] },
                    netProfit: { $subtract: ['$totalWon', '$totalAmountSpent'] },
                    wonRate: {
                        $cond: [
                            { $eq: ['$totalGames', 0] },
                            0,
                            { $multiply: [{ $divide: ['$winningGames', '$totalGames'] }, 100] }
                        ]
                    },
                    profitMargin: {
                        $cond: [
                            { $eq: ['$totalAmountSpent', 0] },
                            0,
                            { $multiply: [{ $divide: [{ $subtract: ['$totalWon', '$totalAmountSpent'] }, '$totalAmountSpent'] }, 100] }
                        ]
                    }
                }
            }
        ]);

        // 2. MegaMillionTicket Analytics by Cash Type
        const megaMillionAnalytics = await MegaMillionTicket.aggregate([
            { $match: gameFilters },
            {
                $group: {
                    _id: '$cashType',
                    totalAmountSpent: { $sum: '$amountPlayed' },
                    totalWon: { $sum: { $ifNull: ['$amountWon', 0] } },
                    totalGames: { $sum: 1 },
                    winningGames: {
                        $sum: {
                            $cond: [{ $gt: [{ $ifNull: ['$amountWon', 0] }, 0] }, 1, 0]
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalLoss: { $subtract: ['$totalAmountSpent', '$totalWon'] },
                    netProfit: { $subtract: ['$totalWon', '$totalAmountSpent'] },
                    wonRate: {
                        $cond: [
                            { $eq: ['$totalGames', 0] },
                            0,
                            { $multiply: [{ $divide: ['$winningGames', '$totalGames'] }, 100] }
                        ]
                    },
                    profitMargin: {
                        $cond: [
                            { $eq: ['$totalAmountSpent', 0] },
                            0,
                            { $multiply: [{ $divide: [{ $subtract: ['$totalWon', '$totalAmountSpent'] }, '$totalAmountSpent'] }, 100] }
                        ]
                    }
                }
            }
        ]);

        // 3. RouletteTicket Analytics by Cash Type
        const rouletteAnalytics = await RouletteTicket.aggregate([
            { $match: gameFilters },
            {
                $group: {
                    _id: '$cashType',
                    totalAmountSpent: { $sum: '$totalAmountPlayed' },
                    totalWon: { $sum: { $ifNull: ['$totalAmountWon', 0] } },
                    totalGames: { $sum: 1 },
                    winningGames: {
                        $sum: {
                            $cond: [{ $gt: [{ $ifNull: ['$totalAmountWon', 0] }, 0] }, 1, 0]
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalLoss: { $subtract: ['$totalAmountSpent', '$totalWon'] },
                    netProfit: { $subtract: ['$totalWon', '$totalAmountSpent'] },
                    wonRate: {
                        $cond: [
                            { $eq: ['$totalGames', 0] },
                            0,
                            { $multiply: [{ $divide: ['$winningGames', '$totalGames'] }, 100] }
                        ]
                    },
                    profitMargin: {
                        $cond: [
                            { $eq: ['$totalAmountSpent', 0] },
                            0,
                            { $multiply: [{ $divide: [{ $subtract: ['$totalWon', '$totalAmountSpent'] }, '$totalAmountSpent'] }, 100] }
                        ]
                    }
                }
            }
        ]);

        // 4. Domino Game Analytics by Cash Type
        // For domino games, we need to get the room details to know entry fee and cash type
        const dominoAnalytics = await DominoGame.aggregate([
            { $match: { 'players.user': userId, ...dateFilter } },
            {
                $lookup: {
                    from: 'dominorooms',
                    localField: 'room',
                    foreignField: '_id',
                    as: 'roomDetails'
                }
            },
            { $unwind: '$roomDetails' },
            {
                $group: {
                    _id: '$roomDetails.cashType',
                    totalAmountSpent: { $sum: '$roomDetails.entryFee' },
                    totalWon: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        { $arrayElemAt: ['$players.user', '$winner'] },
                                        userId
                                    ]
                                },
                                '$winnerPayout',
                                0
                            ]
                        }
                    },
                    totalGames: { $sum: 1 },
                    winningGames: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        { $arrayElemAt: ['$players.user', '$winner'] },
                                        userId
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalLoss: { $subtract: ['$totalAmountSpent', '$totalWon'] },
                    netProfit: { $subtract: ['$totalWon', '$totalAmountSpent'] },
                    wonRate: {
                        $cond: [
                            { $eq: ['$totalGames', 0] },
                            0,
                            { $multiply: [{ $divide: ['$winningGames', '$totalGames'] }, 100] }
                        ]
                    },
                    profitMargin: {
                        $cond: [
                            { $eq: ['$totalAmountSpent', 0] },
                            0,
                            { $multiply: [{ $divide: [{ $subtract: ['$totalWon', '$totalAmountSpent'] }, '$totalAmountSpent'] }, 100] }
                        ]
                    }
                }
            }
        ]);

        // 5. Combine all analytics by cash type
        const combineAnalyticsByCashType = (analytics) => {
            const result = {
                REAL: {
                    totalAmountSpent: 0,
                    totalWon: 0,
                    totalLoss: 0,
                    totalGames: 0,
                    winningGames: 0,
                    wonRate: 0,
                    netProfit: 0,
                    profitMargin: 0
                },
                VIRTUAL: {
                    totalAmountSpent: 0,
                    totalWon: 0,
                    totalLoss: 0,
                    totalGames: 0,
                    winningGames: 0,
                    wonRate: 0,
                    netProfit: 0,
                    profitMargin: 0
                }
            };

            [...borletteAnalytics, ...megaMillionAnalytics, ...rouletteAnalytics, ...dominoAnalytics].forEach(item => {
                if (item._id && result[item._id]) {
                    result[item._id].totalAmountSpent += item.totalAmountSpent || 0;
                    result[item._id].totalWon += item.totalWon || 0;
                    result[item._id].totalLoss += item.totalLoss || 0;
                    result[item._id].totalGames += item.totalGames || 0;
                    result[item._id].winningGames += item.winningGames || 0;
                }
            });

            // Calculate overall metrics for both cash types
            ['REAL', 'VIRTUAL'].forEach(cashType => {
                // Won Rate
                result[cashType].wonRate = result[cashType].totalGames > 0
                    ? (result[cashType].winningGames / result[cashType].totalGames) * 100
                    : 0;

                // Net Profit (positive = profit, negative = loss)
                result[cashType].netProfit = result[cashType].totalWon - result[cashType].totalAmountSpent;

                // Profit Margin (as percentage)
                result[cashType].profitMargin = result[cashType].totalAmountSpent > 0
                    ? (result[cashType].netProfit / result[cashType].totalAmountSpent) * 100
                    : 0;
            });

            return result;
        };

        const cashTypeAnalytics = combineAnalyticsByCashType();

        return {
            status: 200,
            entity: {
                success: true,
                userDetails: {
                    // Basic user information
                    profile: user.toJSON(),

                    // Wallet information
                    wallet: wallet ? {
                        virtualBalance: wallet.virtualBalance,
                        realBalanceWithdrawable: wallet.realBalanceWithdrawable,
                        realBalanceNonWithdrawable: wallet.realBalanceNonWithdrawable,
                        totalRealBalance: wallet.realBalance,
                        pendingWithdrawals: wallet.pendingWithdrawals,
                        active: wallet.active
                    } : null,

                    // Loyalty information
                    loyalty: loyalty || null,

                    // Financial summary
                    financialSummary: {
                        totalDeposits: totalDeposits[0]?.total || 0,
                        totalWithdrawals: totalWithdrawals[0]?.total || 0,
                        currentBalance: wallet ?
                            wallet.virtualBalance + wallet.realBalance : 0
                    },

                    // Gaming activity
                    gamingActivity: {
                        totalGames: totalBorletteTickets + totalMegaMillionTickets + totalRouletteTickets + totalDominoGames,
                        borletteTickets: totalBorletteTickets,
                        megaMillionTickets: totalMegaMillionTickets,
                        rouletteTickets: totalRouletteTickets,
                        dominoGames: totalDominoGames,
                        recentBorletteTickets: borletteTickets,
                        recentMegaMillionTickets: megaMillionTickets,
                        recentRouletteTickets: rouletteTickets,
                        recentDominoGames: dominoGames
                    },

                    // ===== NEW: Cash Type Analytics =====
                    cashTypeAnalytics: cashTypeAnalytics,

                    // Individual game analytics by cash type (for detailed breakdown)
                    detailedCashTypeAnalytics: {
                        borlette: borletteAnalytics,
                        megaMillion: megaMillionAnalytics,
                        roulette: rouletteAnalytics,
                        domino: dominoAnalytics
                    },

                    // Recent activity
                    recentTransactions,
                    recentPayments: payments,
                    recentWithdrawals: withdrawals,

                    // Filter information
                    appliedFilters: {
                        startDate: startDate || null,
                        endDate: endDate || null,
                        dateFilterApplied: !!(startDate || endDate)
                    }
                }
            }
        };
    } catch (error) {
        console.error('Get user details error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to get user details'
            }
        };
    }
};

// ===== DOCUMENT VERIFICATION =====

export const verifyUserDocument = async (userId, { documentType }, adminUser) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        if (!['idProof', 'addressProof'].includes(documentType)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Invalid document type'
                }
            };
        }

        // Update document verification status
        const updateField = `${documentType}.verificationStatus`;
        const verificationDateField = `${documentType}.verificationDate`;
        const rejectionReasonField = `${documentType}.rejectionReason`;

        await User.findByIdAndUpdate(userId, {
            [updateField]: 'VERIFIED',
            [verificationDateField]: new Date(),
            [rejectionReasonField]: null
        });

        // Award XP for document verification
        await LoyaltyService.awardUserXP(
            userId,
            50, // XP amount for document verification
            'VERIFICATION',
            `Document verified: ${documentType}`,
            {
                documentType,
                verifiedBy: adminUser._id
            }
        );

        return {
            status: 200,
            entity: {
                success: true,
                message: `${documentType} verified successfully`
            }
        };
    } catch (error) {
        console.error('Verify document error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to verify document'
            }
        };
    }
};

export const rejectUserDocument = async (userId, { documentType, rejectionReason }, adminUser) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        if (!['idProof', 'addressProof'].includes(documentType)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Invalid document type'
                }
            };
        }

        if (!rejectionReason) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Rejection reason is required'
                }
            };
        }

        // Update document verification status
        const updateField = `${documentType}.verificationStatus`;
        const rejectionReasonField = `${documentType}.rejectionReason`;

        await User.findByIdAndUpdate(userId, {
            [updateField]: 'REJECTED',
            [rejectionReasonField]: rejectionReason
        });

        return {
            status: 200,
            entity: {
                success: true,
                message: `${documentType} rejected`
            }
        };
    } catch (error) {
        console.error('Reject document error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to reject document'
            }
        };
    }
};

// ===== LOYALTY & REWARDS MANAGEMENT =====

export const updateUserLoyalty = async (userId, { tier, xpAdjustment, reason }, adminUser) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        let result = { success: true };

        // Update loyalty tier if specified
        if (tier) {
            const validTiers = ['BRONZE', 'SILVER', 'GOLD', 'VIP'];
            if (!validTiers.includes(tier.toUpperCase())) {
                return {
                    status: 400,
                    entity: {
                        success: false,
                        error: 'Invalid loyalty tier'
                    }
                };
            }

            const tierResult = await LoyaltyService.manualTierUpgrade(
                userId,
                tier.toUpperCase(),
                adminUser._id,
                reason || 'Admin tier adjustment'
            );

            if (!tierResult.success) {
                return {
                    status: 500,
                    entity: {
                        success: false,
                        error: tierResult.error || 'Failed to update loyalty tier'
                    }
                };
            }

            result.tierUpdate = tierResult;
        }

        // Adjust XP if specified
        if (xpAdjustment && xpAdjustment !== 0) {
            const xpResult = await LoyaltyService.awardUserXP(
                userId,
                xpAdjustment,
                'ADJUSTMENT',
                reason || 'Admin XP adjustment',
                {
                    adjustedBy: adminUser._id
                }
            );

            if (!xpResult.success) {
                return {
                    status: 500,
                    entity: {
                        success: false,
                        error: xpResult.error || 'Failed to adjust XP'
                    }
                };
            }

            result.xpUpdate = xpResult;
        }

        return {
            status: 200,
            entity: {
                success: true,
                message: 'Loyalty updated successfully',
                result
            }
        };
    } catch (error) {
        console.error('Update loyalty error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to update loyalty'
            }
        };
    }
};

// ===== ACCOUNT MANAGEMENT =====

export const resetUserPassword = async (userId, { newPassword }, adminUser) => {
    try {
        if (!newPassword) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'New password is required'
                }
            };
        }

        if (newPassword.length < 6) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Password must be at least 6 characters long'
                }
            };
        }

        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 9);

        // Update user password
        await User.findByIdAndUpdate(userId, {
            password: hashedPassword
        });

        return {
            status: 200,
            entity: {
                success: true,
                message: 'Password reset successfully'
            }
        };
    } catch (error) {
        console.error('Reset password error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to reset password'
            }
        };
    }
};

export const resetUserPin = async (userId, adminUser) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        // Reset pin to null (user will need to set new pin)
        await User.findByIdAndUpdate(userId, {
            securePin: null
        });

        return {
            status: 200,
            entity: {
                success: true,
                message: 'PIN reset successfully'
            }
        };
    } catch (error) {
        console.error('Reset PIN error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to reset PIN'
            }
        };
    }
};

export const updateUserStatus = async (userId, { status, reason }, adminUser) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'User not found'
                }
            };
        }

        const validStatuses = ['active', 'suspended', 'banned'];
        if (!validStatuses.includes(status)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Invalid status'
                }
            };
        }

        // Update user status
        const isActive = status === 'active';
        await User.findByIdAndUpdate(userId, {
            isActive
        });

        // TODO: Log status change for audit trail
        // This could be implemented with a separate audit log model

        return {
            status: 200,
            entity: {
                success: true,
                message: `User status updated to ${status}`,
                newStatus: {
                    status,
                    isActive,
                    reason
                }
            }
        };
    } catch (error) {
        console.error('Update status error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to update status'
            }
        };
    }
};

// ===== BULK OPERATIONS =====

export const bulkUpdateUsers = async ({ userIds, action, data }, adminUser) => {
    try {
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'User IDs array is required'
                }
            };
        }

        if (!action) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Action is required'
                }
            };
        }

        const results = [];
        const validActions = ['suspend', 'activate', 'verify', 'updateTier'];

        if (!validActions.includes(action)) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Invalid action'
                }
            };
        }

        // Process each user
        for (const userId of userIds) {
            try {
                let result;

                switch (action) {
                    case 'suspend':
                        result = await updateUserStatus(userId, { status: 'suspended', reason: data.reason }, adminUser);
                        break;
                    case 'activate':
                        result = await updateUserStatus(userId, { status: 'active', reason: data.reason }, adminUser);
                        break;
                    case 'verify':
                        if (data.documentType) {
                            result = await verifyUserDocument(userId, { documentType: data.documentType }, adminUser);
                        }
                        break;
                    case 'updateTier':
                        if (data.tier) {
                            result = await updateUserLoyalty(userId, { tier: data.tier, reason: data.reason }, adminUser);
                        }
                        break;
                }

                results.push({
                    userId,
                    success: result?.entity?.success || false,
                    message: result?.entity?.message || 'Action completed'
                });
            } catch (error) {
                results.push({
                    userId,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        return {
            status: 200,
            entity: {
                success: true,
                message: `Bulk operation completed: ${successCount} succeeded, ${failureCount} failed`,
                results,
                summary: {
                    total: results.length,
                    succeeded: successCount,
                    failed: failureCount
                }
            }
        };
    } catch (error) {
        console.error('Bulk update error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to perform bulk update'
            }
        };
    }
};

// ===== DATA EXPORT =====

export const exportUsers = async ({ format = 'csv', filters = {} }, adminUser) => {
    try {
        // This is a simplified implementation
        // In production, you might want to use a job queue for large exports

        const users = await User.find(filters)
            .select('-password -securePin')
            .populate({
                path: 'wallet',
                model: 'Wallet',
                localField: '_id',
                foreignField: 'user'
            });

        // For now, return the data structure that can be processed by frontend
        return {
            status: 200,
            entity: {
                success: true,
                message: 'Export data prepared',
                data: users.map(user => ({
                    id: user._id,
                    userName: user.userName,
                    firstName: user.name?.firstName,
                    lastName: user.name?.lastName,
                    email: user.email,
                    phone: user.phone,
                    country: user.address?.country,
                    isActive: user.isActive,
                    registrationDate: user.createdAt,
                    lastLogin: user.sessionTracking?.lastLoginDate,
                    idProofStatus: user.idProof?.verificationStatus,
                    addressProofStatus: user.addressProof?.verificationStatus
                })),
                format,
                exportedAt: new Date(),
                exportedBy: adminUser._id
            }
        };
    } catch (error) {
        console.error('Export users error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to export users'
            }
        };
    }
};