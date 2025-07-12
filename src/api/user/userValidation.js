import Joi from 'joi';

export const UserValidationSchemas = {
    // Balance adjustment validation
    balanceAdjustment: Joi.object({
        cashType: Joi.string().valid('VIRTUAL', 'REAL').required(),
        amount: Joi.number().positive().required(),
        adjustmentType: Joi.string().valid('CREDIT', 'DEBIT').required(),
        reason: Joi.string().min(10).max(500).required(),
    }),

    // User suspension validation
    userSuspension: Joi.object({
        action: Joi.string().valid('SUSPEND', 'REACTIVATE').required(),
        reason: Joi.string().min(10).max(500).required(),
    }),

    // Role change validation
    roleChange: Joi.object({
        newRole: Joi.string().valid('USER', 'AGENT', 'DEALER').required(),
        reason: Joi.string().min(10).max(500).required(),
    }),

    // Password reset validation
    passwordReset: Joi.object({
        newPassword: Joi.string().min(6).max(100).required(),
        reason: Joi.string().min(10).max(500).required(),
    }),

    // PIN reset validation
    pinReset: Joi.object({
        newPin: Joi.string().length(4).pattern(/^[0-9]+$/).required(),
        reason: Joi.string().min(10).max(500).required(),
    }),

    // Tier upgrade validation
    tierUpgrade: Joi.object({
        targetTier: Joi.string().valid('BRONZE', 'SILVER', 'GOLD', 'VIP').required(),
        reason: Joi.string().min(10).max(500).required(),
    }),

    // Notification validation
    notification: Joi.object({
        title: Joi.string().min(1).max(100).required(),
        message: Joi.string().min(1).max(1000).required(),
        type: Joi.string().valid('INFO', 'WARNING', 'ERROR', 'SUCCESS').default('INFO'),
        priority: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'URGENT').default('NORMAL'),
    }),

    // Basic list query validation
    listQuery: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        search: Joi.string().max(100).optional(),
        role: Joi.string().valid('USER', 'AGENT', 'DEALER').optional(),
        status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
        sortBy: Joi.string().valid('createdAt', 'name', 'email', 'role', 'lastLogin').default('createdAt'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
        // Transaction filters
        transactionType: Joi.string().optional(),
        cashType: Joi.string().valid('VIRTUAL', 'REAL').optional(),
        // Gaming filters
        gameType: Joi.string().valid('BORLETTE', 'MEGAMILLION', 'ROULETTE', 'DOMINO', 'ALL').default('ALL'),
        // Payment filters
        method: Joi.string().optional(),
    }),

    // Date range validation
    dateRange: Joi.object({
        startDate: Joi.date().iso().optional(),
        endDate: Joi.date().iso().when('startDate', {
            is: Joi.exist(),
            then: Joi.date().min(Joi.ref('startDate')),
            otherwise: Joi.date().iso()
        }).optional(),
        period: Joi.number().integer().min(1).max(365).default(30),
    }),

    // Combined schemas for common use cases
    listWithDate: Joi.object({
        // List query parameters
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        search: Joi.string().max(100).optional(),
        role: Joi.string().valid('USER', 'AGENT', 'DEALER').optional(),
        status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
        sortBy: Joi.string().valid('createdAt', 'name', 'email', 'role', 'lastLogin').default('createdAt'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
        transactionType: Joi.string().optional(),
        cashType: Joi.string().valid('VIRTUAL', 'REAL').optional(),
        gameType: Joi.string().valid('BORLETTE', 'MEGAMILLION', 'ROULETTE', 'DOMINO', 'ALL').default('ALL'),
        method: Joi.string().optional(),
        // Date range parameters
        startDate: Joi.date().iso().optional(),
        endDate: Joi.date().iso().when('startDate', {
            is: Joi.exist(),
            then: Joi.date().min(Joi.ref('startDate')),
            otherwise: Joi.date().iso()
        }).optional(),
        period: Joi.number().integer().min(1).max(365).default(30),
    }),

    // Document verification validation
    documentVerification: Joi.object({
        userId: Joi.string().required(),
        documentType: Joi.string().valid('idProof', 'addressProof').required(),
        verificationStatus: Joi.string().valid('PENDING', 'VERIFIED', 'REJECTED').required(),
        rejectionReason: Joi.string().when('verificationStatus', {
            is: 'REJECTED',
            then: Joi.string().min(10).max(500).required(),
            otherwise: Joi.string().optional()
        }),
    }),

    // User creation validation
    userCreation: Joi.object({
        countryCode: Joi.string().required(),
        phone: Joi.string().pattern(/^[0-9]{7,15}$/).required(),
        email: Joi.string().email().optional(),
        name: Joi.object({
            firstName: Joi.string().min(1).max(50).required(),
            lastName: Joi.string().min(1).max(50).required(),
        }).required(),
        password: Joi.string().min(6).max(100).required(),
        role: Joi.string().valid('USER', 'AGENT', 'DEALER').default('USER'),
        dob: Joi.string().required(),
    }),

    // User update validation
    userUpdate: Joi.object({
        email: Joi.string().email().optional(),
        name: Joi.object({
            firstName: Joi.string().min(1).max(50).optional(),
            lastName: Joi.string().min(1).max(50).optional(),
        }).optional(),
        address: Joi.object({
            address1: Joi.string().max(200).optional(),
            address2: Joi.string().max(200).optional(),
            city: Joi.string().max(100).optional(),
            state: Joi.string().max(100).optional(),
            country: Joi.string().max(100).optional(),
            pincode: Joi.string().max(20).optional(),
        }).optional(),
        simNif: Joi.string().max(50).optional(),
    }),

    // Bulk operations validation
    bulkOperation: Joi.object({
        userIds: Joi.array().items(Joi.string()).min(1).max(100).required(),
        operation: Joi.string().valid('SUSPEND', 'REACTIVATE', 'ROLE_CHANGE', 'TIER_UPGRADE').required(),
        data: Joi.object().when('operation', {
            switch: [
                {
                    is: 'SUSPEND',
                    then: Joi.object({
                        reason: Joi.string().min(10).max(500).required(),
                    }).required()
                },
                {
                    is: 'REACTIVATE',
                    then: Joi.object({
                        reason: Joi.string().min(10).max(500).required(),
                    }).required()
                },
                {
                    is: 'ROLE_CHANGE',
                    then: Joi.object({
                        newRole: Joi.string().valid('USER', 'AGENT', 'DEALER').required(),
                        reason: Joi.string().min(10).max(500).required(),
                    }).required()
                },
                {
                    is: 'TIER_UPGRADE',
                    then: Joi.object({
                        targetTier: Joi.string().valid('BRONZE', 'SILVER', 'GOLD', 'VIP').required(),
                        reason: Joi.string().min(10).max(500).required(),
                    }).required()
                }
            ]
        }),
        reason: Joi.string().min(10).max(500).required(),
    }),

    // Risk assessment validation
    riskAssessment: Joi.object({
        userIds: Joi.array().items(Joi.string()).optional(),
        riskLevel: Joi.string().valid('LOW', 'MEDIUM', 'HIGH').optional(),
        includeFactors: Joi.boolean().default(true),
        updateUserRecords: Joi.boolean().default(true),
    }),

    // Data export validation
    dataExport: Joi.object({
        userId: Joi.string().required(),
        includeTransactions: Joi.boolean().default(true),
        includeLoyalty: Joi.boolean().default(true),
        includeDocuments: Joi.boolean().default(false), // Sensitive data
        format: Joi.string().valid('json', 'csv').default('json'),
        dateRange: Joi.object({
            startDate: Joi.date().iso().optional(),
            endDate: Joi.date().iso().optional(),
        }).optional(),
    }),

    // Admin note validation
    adminNote: Joi.object({
        userId: Joi.string().required(),
        note: Joi.string().min(10).max(1000).required(),
        category: Joi.string().valid('GENERAL', 'SECURITY', 'FINANCIAL', 'COMPLIANCE', 'SUPPORT').default('GENERAL'),
    }),

    // Account limitations validation
    accountLimitations: Joi.object({
        userId: Joi.string().required(),
        limitations: Joi.object({
            depositBlocked: Joi.boolean().default(false),
            withdrawalBlocked: Joi.boolean().default(false),
            gamePlayBlocked: Joi.boolean().default(false),
        }).required(),
        reason: Joi.string().min(10).max(500).required(),
    }),
};

// Helper function to validate request data
export const validateRequest = (schema, data) => {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false,
    });

    if (error) {
        const details = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value,
        }));

        return {
            isValid: false,
            errors: details,
            data: null,
        };
    }

    return {
        isValid: true,
        errors: null,
        data: value,
    };
};