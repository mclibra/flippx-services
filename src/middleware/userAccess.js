import { UserAdminService } from '../services/admin/userAdminService';

/**
 * Middleware to validate user access permissions
 * Ensures users can only access their own data or data they're authorized to see
 */
export const validateUserAccess = (paramName = 'id') => {
    return async (req, res, next) => {
        try {
            const targetUserId = req.params[paramName];
            const requestingUser = req.user;

            if (!targetUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required',
                });
            }

            // Check if requesting user has permission to access target user's data
            const hasAccess = UserAdminService.validateUserAccess(requestingUser, targetUserId);

            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Unauthorized access to user data',
                });
            }

            // Add target user ID to request for convenience
            req.targetUserId = targetUserId;
            next();
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Access validation failed',
            });
        }
    };
};

/**
 * Middleware to log admin actions for audit trail
 */
export const logAdminAction = (action) => {
    return async (req, res, next) => {
        // Store original res.json to intercept the response
        const originalJson = res.json;

        res.json = function (data) {
            // Only log if the action was successful
            if (data.success) {
                const targetUserId = req.params.id || req.targetUserId;
                if (targetUserId && req.user.role === 'ADMIN') {
                    UserAdminService.createAuditLog(
                        targetUserId,
                        req.user._id,
                        action,
                        {
                            endpoint: req.originalUrl,
                            method: req.method,
                            body: req.body,
                            query: req.query,
                            userAgent: req.get('User-Agent'),
                            ip: req.ip || req.connection.remoteAddress,
                        },
                        req.body.reason || 'Admin action performed'
                    ).catch(error => {
                        console.error('Failed to create audit log:', error);
                    });
                }
            }

            // Call the original res.json with the data
            return originalJson.call(this, data);
        };

        next();
    };
};

/**
 * Middleware to check user limitations before performing actions
 */
export const checkUserLimitations = (actionType) => {
    return async (req, res, next) => {
        try {
            const userId = req.params.id || req.user._id;
            const { User } = await import('../api/user/model');
            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }

            const validation = UserAdminService.validateUserAction(user, actionType);

            if (!validation.allowed) {
                return res.status(403).json({
                    success: false,
                    error: `Action not allowed: ${validation.reason}`,
                    details: {
                        blockedBy: validation.blockedBy,
                        blockedAt: validation.blockedAt,
                    },
                });
            }

            next();
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to validate user limitations',
            });
        }
    };
};

/**
 * Rate limiting middleware for specific actions
 */
export const rateLimit = (windowMs, maxRequests) => {
    const requests = new Map();

    return (req, res, next) => {
        const key = `${req.user._id}_${req.originalUrl}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old entries
        if (requests.has(key)) {
            const userRequests = requests.get(key).filter(time => time > windowStart);
            requests.set(key, userRequests);
        }

        const userRequests = requests.get(key) || [];

        if (userRequests.length >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000),
            });
        }

        userRequests.push(now);
        requests.set(key, userRequests);
        next();
    };
};