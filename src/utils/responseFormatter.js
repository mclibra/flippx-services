/**
 * Standardizes API responses across the application
 */
export class ResponseFormatter {
    /**
     * Format success response
     * @param {any} data - Response data
     * @param {string} message - Success message
     * @param {object} meta - Additional metadata
     * @returns {object} Formatted success response
     */
    static success(data, message = null, meta = {}) {
        return {
            success: true,
            data,
            message,
            meta,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format error response
     * @param {string|Error} error - Error message or Error object
     * @param {number} statusCode - HTTP status code
     * @param {object} details - Additional error details
     * @returns {object} Formatted error response
     */
    static error(error, statusCode = 500, details = {}) {
        return {
            success: false,
            error: typeof error === 'string' ? error : error.message,
            statusCode,
            details,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format paginated response
     * @param {array} data - Array of data items
     * @param {object} pagination - Pagination information
     * @param {string} message - Optional message
     * @param {object} meta - Additional metadata
     * @returns {object} Formatted paginated response
     */
    static paginated(data, pagination, message = null, meta = {}) {
        return {
            success: true,
            data,
            pagination: {
                page: parseInt(pagination.page) || 1,
                limit: parseInt(pagination.limit) || 20,
                total: parseInt(pagination.total) || 0,
                pages: Math.ceil((pagination.total || 0) / (pagination.limit || 20)),
                hasNext: (pagination.page || 1) < Math.ceil((pagination.total || 0) / (pagination.limit || 20)),
                hasPrev: (pagination.page || 1) > 1,
            },
            message,
            meta,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format validation error response
     * @param {array} validationErrors - Array of validation errors
     * @param {string} message - Error message
     * @returns {object} Formatted validation error response
     */
    static validationError(validationErrors, message = 'Validation failed') {
        return {
            success: false,
            error: message,
            statusCode: 400,
            details: {
                validationErrors,
                errorCount: validationErrors.length,
            },
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format unauthorized response
     * @param {string} message - Error message
     * @param {object} details - Additional details
     * @returns {object} Formatted unauthorized response
     */
    static unauthorized(message = 'Unauthorized access', details = {}) {
        return {
            success: false,
            error: message,
            statusCode: 401,
            details,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format forbidden response
     * @param {string} message - Error message
     * @param {object} details - Additional details
     * @returns {object} Formatted forbidden response
     */
    static forbidden(message = 'Access forbidden', details = {}) {
        return {
            success: false,
            error: message,
            statusCode: 403,
            details,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format not found response
     * @param {string} message - Error message
     * @param {object} details - Additional details
     * @returns {object} Formatted not found response
     */
    static notFound(message = 'Resource not found', details = {}) {
        return {
            success: false,
            error: message,
            statusCode: 404,
            details,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format rate limit response
     * @param {string} message - Error message
     * @param {number} retryAfter - Seconds until retry is allowed
     * @returns {object} Formatted rate limit response
     */
    static rateLimited(message = 'Too many requests', retryAfter = null) {
        return {
            success: false,
            error: message,
            statusCode: 429,
            details: {
                retryAfter,
            },
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format server error response
     * @param {string} message - Error message
     * @param {object} details - Additional details
     * @returns {object} Formatted server error response
     */
    static serverError(message = 'Internal server error', details = {}) {
        return {
            success: false,
            error: message,
            statusCode: 500,
            details,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format audit log response
     * @param {object} auditData - Audit trail data
     * @param {string} action - Action performed
     * @param {string} adminId - Admin who performed the action
     * @returns {object} Formatted audit response
     */
    static auditLog(auditData, action, adminId) {
        return {
            success: true,
            data: auditData,
            audit: {
                action,
                performedBy: adminId,
                timestamp: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format bulk operation response
     * @param {object} results - Bulk operation results
     * @param {string} operation - Operation performed
     * @returns {object} Formatted bulk operation response
     */
    static bulkOperation(results, operation) {
        const successCount = results.successful?.length || 0;
        const failureCount = results.failed?.length || 0;
        const totalCount = successCount + failureCount;

        return {
            success: failureCount === 0,
            data: results,
            summary: {
                operation,
                total: totalCount,
                successful: successCount,
                failed: failureCount,
                successRate: totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(2) + '%' : '0%',
            },
            message: failureCount === 0
                ? `${operation} completed successfully for all ${successCount} users`
                : `${operation} completed with ${successCount} successes and ${failureCount} failures`,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format analytics/statistics response
     * @param {object} data - Analytics data
     * @param {string} period - Time period for the analytics
     * @param {object} filters - Filters applied
     * @returns {object} Formatted analytics response
     */
    static analytics(data, period = null, filters = {}) {
        return {
            success: true,
            data,
            meta: {
                period,
                filters,
                generatedAt: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Wrap legacy response format to new format
     * @param {object} legacyResponse - Legacy response object
     * @returns {object} Formatted response
     */
    static fromLegacy(legacyResponse) {
        if (!legacyResponse || typeof legacyResponse !== 'object') {
            return this.serverError('Invalid response format');
        }

        const { status, entity } = legacyResponse;
        const isSuccess = status >= 200 && status < 300;

        if (isSuccess) {
            return {
                success: true,
                data: entity,
                statusCode: status,
                timestamp: new Date().toISOString(),
            };
        } else {
            return {
                success: false,
                error: entity?.error || 'An error occurred',
                statusCode: status,
                details: entity,
                timestamp: new Date().toISOString(),
            };
        }
    }
}