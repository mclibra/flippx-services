import { User } from '../../user/model';
import { Wallet } from '../../wallet/model';
import { LoyaltyProfile } from '../../loyalty/model';

/**
 * Build search query for user filtering
 * @param {Object} filters - Filter parameters
 * @returns {Object} MongoDB query object
 */
export const buildUserSearchQuery = (filters) => {
    const {
        search,
        status,
        verificationStatus,
        country,
        registrationStartDate,
        registrationEndDate,
        lastLoginStartDate,
        lastLoginEndDate
    } = filters;

    const query = {};

    // Search functionality
    if (search) {
        query.$or = [
            { userName: new RegExp(search, 'i') },
            { email: new RegExp(search, 'i') },
            { phone: new RegExp(search, 'i') },
            { 'name.firstName': new RegExp(search, 'i') },
            { 'name.lastName': new RegExp(search, 'i') }
        ];
    }

    // Status filter
    if (status) {
        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'suspended' || status === 'banned') {
            query.isActive = false;
        }
    }

    // Country filter
    if (country) {
        query['address.country'] = new RegExp(country, 'i');
    }

    // Verification status filter
    if (verificationStatus) {
        if (verificationStatus === 'verified') {
            query.$and = [
                { 'idProof.verificationStatus': 'VERIFIED' },
                { 'addressProof.verificationStatus': 'VERIFIED' }
            ];
        } else if (verificationStatus === 'unverified') {
            query.$or = [
                { 'idProof.verificationStatus': { $in: ['NOT_UPLOADED', 'REJECTED'] } },
                { 'addressProof.verificationStatus': { $in: ['NOT_UPLOADED', 'REJECTED'] } }
            ];
        } else if (verificationStatus === 'pending') {
            query.$or = [
                { 'idProof.verificationStatus': 'PENDING' },
                { 'addressProof.verificationStatus': 'PENDING' }
            ];
        }
    }

    // Date range filters
    if (registrationStartDate || registrationEndDate) {
        query.createdAt = {};
        if (registrationStartDate) {
            query.createdAt.$gte = new Date(registrationStartDate);
        }
        if (registrationEndDate) {
            query.createdAt.$lte = new Date(registrationEndDate);
        }
    }

    if (lastLoginStartDate || lastLoginEndDate) {
        query['sessionTracking.lastLoginDate'] = {};
        if (lastLoginStartDate) {
            query['sessionTracking.lastLoginDate'].$gte = new Date(lastLoginStartDate);
        }
        if (lastLoginEndDate) {
            query['sessionTracking.lastLoginDate'].$lte = new Date(lastLoginEndDate);
        }
    }

    return query;
};

/**
 * Get user statistics summary
 * @param {String} userId - User ID
 * @returns {Object} User statistics
 */
export const getUserStatistics = async (userId) => {
    try {
        const user = await User.findById(userId);
        const wallet = await Wallet.findOne({ user: userId });
        const loyalty = await LoyaltyProfile.findOne({ user: userId });

        return {
            user: user ? user.view(true) : null,
            wallet: wallet ? {
                virtualBalance: wallet.virtualBalance,
                realBalance: wallet.realBalance,
                pendingWithdrawals: wallet.pendingWithdrawals
            } : null,
            loyalty: loyalty ? {
                currentTier: loyalty.currentTier,
                totalXP: loyalty.totalXP,
                referredUsers: loyalty.referralBenefits?.length || 0
            } : null
        };
    } catch (error) {
        console.error('Get user statistics error:', error);
        return null;
    }
};

/**
 * Validate user creation data
 * @param {Object} userData - User data to validate
 * @returns {Object} Validation result
 */
export const validateUserCreationData = (userData) => {
    const errors = [];
    const {
        firstName,
        lastName,
        email,
        phone,
        countryCode,
        dob,
        password
    } = userData;

    // Required field validation
    if (!firstName) errors.push('First name is required');
    if (!lastName) errors.push('Last name is required');
    if (!email) errors.push('Email is required');
    if (!phone) errors.push('Phone is required');
    if (!countryCode) errors.push('Country code is required');
    if (!dob) errors.push('Date of birth is required');
    if (!password) errors.push('Password is required');

    // Email validation
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('Invalid email format');
    }

    // Password validation
    if (password && password.length < 6) {
        errors.push('Password must be at least 6 characters');
    }

    // Phone validation (basic)
    if (phone && !/^\d+$/.test(phone)) {
        errors.push('Phone must contain only numbers');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Check if user exists by email or phone
 * @param {String} email - Email to check
 * @param {String} phone - Phone to check
 * @param {String} excludeUserId - User ID to exclude from check (for updates)
 * @returns {Object} Existence check result
 */
export const checkUserExists = async (email, phone, excludeUserId = null) => {
    try {
        const query = {
            $or: [{ email }, { phone }]
        };

        if (excludeUserId) {
            query._id = { $ne: excludeUserId };
        }

        const existingUser = await User.findOne(query);

        return {
            exists: !!existingUser,
            conflictField: existingUser ? (existingUser.email === email ? 'email' : 'phone') : null,
            user: existingUser
        };
    } catch (error) {
        console.error('Check user exists error:', error);
        return { exists: false, error: error.message };
    }
};

/**
 * Generate user export data
 * @param {Array} users - Array of user objects
 * @returns {Array} Formatted export data
 */
export const formatUsersForExport = (users) => {
    return users.map(user => ({
        'User ID': user._id,
        'Username': user.userName,
        'First Name': user.name?.firstName || '',
        'Last Name': user.name?.lastName || '',
        'Email': user.email || '',
        'Phone': user.phone || '',
        'Country Code': user.countryCode || '',
        'Country': user.address?.country || '',
        'City': user.address?.city || '',
        'Status': user.isActive ? 'Active' : 'Inactive',
        'Registration Date': user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '',
        'Last Login': user.sessionTracking?.lastLoginDate ? new Date(user.sessionTracking.lastLoginDate).toLocaleDateString() : 'Never',
        'ID Proof Status': user.idProof?.verificationStatus || 'NOT_UPLOADED',
        'Address Proof Status': user.addressProof?.verificationStatus || 'NOT_UPLOADED',
        'Role': user.role || 'USER'
    }));
};

/**
 * Get verification status summary
 * @param {Object} user - User object
 * @returns {Object} Verification summary
 */
export const getVerificationSummary = (user) => {
    const idStatus = user.idProof?.verificationStatus || 'NOT_UPLOADED';
    const addressStatus = user.addressProof?.verificationStatus || 'NOT_UPLOADED';

    let overallStatus = 'unverified';
    if (idStatus === 'VERIFIED' && addressStatus === 'VERIFIED') {
        overallStatus = 'verified';
    } else if (idStatus === 'PENDING' || addressStatus === 'PENDING') {
        overallStatus = 'pending';
    }

    return {
        overall: overallStatus,
        idProof: idStatus,
        addressProof: addressStatus,
        documentsNeeded: [
            ...(idStatus === 'NOT_UPLOADED' ? ['ID Proof'] : []),
            ...(addressStatus === 'NOT_UPLOADED' ? ['Address Proof'] : [])
        ]
    };
};

/**
 * Calculate user engagement metrics
 * @param {Object} userActivity - User activity data
 * @returns {Object} Engagement metrics
 */
export const calculateEngagementMetrics = (userActivity) => {
    const {
        totalGames = 0,
        borletteTickets = 0,
        megaMillionTickets = 0,
        rouletteTickets = 0,
        dominoGames = 0,
        lastLoginDate,
        registrationDate,
        sessionCount = 0
    } = userActivity;

    const now = new Date();
    const regDate = new Date(registrationDate);
    const lastLogin = lastLoginDate ? new Date(lastLoginDate) : null;

    // Days since registration
    const daysSinceRegistration = Math.floor((now - regDate) / (1000 * 60 * 60 * 24));

    // Days since last login
    const daysSinceLastLogin = lastLogin ? Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24)) : null;

    // Engagement level
    let engagementLevel = 'low';
    if (totalGames > 50 && daysSinceLastLogin < 7) {
        engagementLevel = 'high';
    } else if (totalGames > 10 && daysSinceLastLogin < 30) {
        engagementLevel = 'medium';
    }

    return {
        daysSinceRegistration,
        daysSinceLastLogin,
        engagementLevel,
        gamesPerDay: daysSinceRegistration > 0 ? (totalGames / daysSinceRegistration).toFixed(2) : 0,
        isActive: daysSinceLastLogin < 30,
        gameTypeDistribution: {
            borlette: borletteTickets,
            megaMillion: megaMillionTickets,
            roulette: rouletteTickets,
            domino: dominoGames
        }
    };
};

export default {
    buildUserSearchQuery,
    getUserStatistics,
    validateUserCreationData,
    checkUserExists,
    formatUsersForExport,
    getVerificationSummary,
    calculateEngagementMetrics
};