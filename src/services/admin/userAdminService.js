import { User } from '../../api/user/model';


/**
 * User Administration Service
 * Provides utility functions for user management, audit trails, and administrative operations
 */
export class UserAdminService {

    /**
     * Creates an audit log entry for administrative actions
     */
    static async createAuditLog(userId, adminId, action, details = {}, reason = null) {
        try {
            // Add admin note to user
            const user = await User.findById(userId);
            if (user && user.addAdminNote) {
                await user.addAdminNote(
                    `${action}: ${reason || 'No reason provided'}. Details: ${JSON.stringify(details)}`,
                    adminId,
                    'GENERAL'
                );
            }

            return { success: true };
        } catch (error) {
            console.error('Error creating audit log:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Validates user permissions for accessing another user's data
     */
    static validateUserAccess(requestingUser, targetUserId) {
        // Admin can access anyone
        if (requestingUser.role === 'ADMIN') {
            return true;
        }

        // Users can access their own data
        if (requestingUser._id.toString() === targetUserId) {
            return true;
        }

        // Agents and dealers can access users in their hierarchy
        if (['AGENT', 'DEALER'].includes(requestingUser.role)) {
            return true; // Simplified for now - implement proper hierarchy check
        }

        return false;
    }

    /**
     * Validates if user can perform specific action based on limitations
     */
    static validateUserAction(user, action) {
        if (!user.limitations) {
            return { allowed: true };
        }

        const limitationMap = {
            deposit: 'depositBlocked',
            withdrawal: 'withdrawalBlocked',
            gameplay: 'gamePlayBlocked',
        };

        const isBlocked = user.limitations[limitationMap[action]];

        return {
            allowed: !isBlocked,
            reason: isBlocked ? user.limitations.reasonForLimitations : null,
            blockedBy: isBlocked ? user.limitations.limitationsSetBy : null,
            blockedAt: isBlocked ? user.limitations.limitationsSetAt : null,
        };
    }
}