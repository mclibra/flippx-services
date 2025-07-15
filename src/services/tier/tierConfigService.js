import { TierRequirements } from '../../api/admin/tier-management/model';
import {
    LOYALTY_TIERS as FALLBACK_TIERS,
    TIER_DOWNGRADES as FALLBACK_DOWNGRADES,
    INACTIVITY_CHECK_DAYS as FALLBACK_INACTIVITY_DAYS
} from '../../api/loyalty/constants';

class TierConfigService {
    constructor() {
        this.cachedTiers = null;
        this.cacheExpiry = null;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    }

    // Get tier requirements from database with fallback to constants
    async getTierRequirements() {
        try {
            // Check cache first
            if (this.cachedTiers && this.cacheExpiry && Date.now() < this.cacheExpiry) {
                return this.cachedTiers;
            }

            // Fetch from database
            const dbTiers = await TierRequirements.getAsConstants();

            if (dbTiers && Object.keys(dbTiers).length > 0) {
                // Cache the result
                this.cachedTiers = dbTiers;
                this.cacheExpiry = Date.now() + this.cacheTimeout;
                return dbTiers;
            } else {
                // Fallback to constants if no DB config found
                console.warn('No tier requirements found in database, using fallback constants');
                return FALLBACK_TIERS;
            }
        } catch (error) {
            console.error('Error fetching tier requirements from database:', error);
            // Fallback to constants on error
            return FALLBACK_TIERS;
        }
    }

    // Get specific tier configuration
    async getTierConfig(tierName) {
        const allTiers = await this.getTierRequirements();
        return allTiers[tierName.toUpperCase()] || null;
    }

    // Get tier downgrade configuration
    async getTierDowngrades() {
        try {
            const tiers = await TierRequirements.find({ isActive: true });
            const downgrades = {};

            tiers.forEach(tier => {
                if (tier.tier !== 'NONE') {
                    downgrades[tier.tier] = {
                        min: tier.downgrades.inactivityDaysMin,
                        max: tier.downgrades.inactivityDaysMax
                    };
                }
            });

            return Object.keys(downgrades).length > 0 ? downgrades : FALLBACK_DOWNGRADES;
        } catch (error) {
            console.error('Error fetching tier downgrades from database:', error);
            return FALLBACK_DOWNGRADES;
        }
    }

    // Get inactivity check days (from constants for now, could be moved to DB)
    getInactivityCheckDays() {
        return FALLBACK_INACTIVITY_DAYS;
    }

    // Clear cache (useful when tier requirements are updated)
    clearCache() {
        this.cachedTiers = null;
        this.cacheExpiry = null;
    }

    // Validate if user meets tier requirements
    async validateTierRequirements(tierName, userProgress) {
        const tierConfig = await this.getTierConfig(tierName);
        if (!tierConfig || !tierConfig.requirements) {
            return { isValid: false, missingRequirements: ['Tier configuration not found'] };
        }

        const requirements = tierConfig.requirements;
        const missingRequirements = [];

        // Check each requirement
        if (requirements.depositAmount30Days && userProgress.totalDeposit30Days < requirements.depositAmount30Days) {
            missingRequirements.push(`Deposit amount 30 days: $${userProgress.totalDeposit30Days} < $${requirements.depositAmount30Days}`);
        }

        if (requirements.depositAmount60Days && userProgress.totalDeposit60Days < requirements.depositAmount60Days) {
            missingRequirements.push(`Deposit amount 60 days: $${userProgress.totalDeposit60Days} < $${requirements.depositAmount60Days}`);
        }

        if (requirements.depositAmount90Days && userProgress.totalDeposit90Days < requirements.depositAmount90Days) {
            missingRequirements.push(`Deposit amount 90 days: $${userProgress.totalDeposit90Days} < $${requirements.depositAmount90Days}`);
        }

        if (requirements.daysPlayedPerWeek && userProgress.daysPlayedThisWeek < requirements.daysPlayedPerWeek) {
            missingRequirements.push(`Days played per week: ${userProgress.daysPlayedThisWeek} < ${requirements.daysPlayedPerWeek}`);
        }

        if (requirements.weeklySpendAmount && (userProgress.weeklySpending || 0) < requirements.weeklySpendAmount) {
            missingRequirements.push(`Weekly spend amount: $${userProgress.weeklySpending || 0} < $${requirements.weeklySpendAmount}`);
        }

        if (requirements.dailySessionMinutes && (userProgress.dailySessionMinutesToday || 0) < requirements.dailySessionMinutes) {
            missingRequirements.push(`Daily session minutes: ${userProgress.dailySessionMinutesToday || 0} < ${requirements.dailySessionMinutes}`);
        }

        return {
            isValid: missingRequirements.length === 0,
            missingRequirements
        };
    }

    // Calculate tier progress for display
    async calculateTierProgress(currentTier, userProgress) {
        const allTiers = await this.getTierRequirements();
        const nextTierName = this.getNextTier(currentTier);

        if (!nextTierName) {
            return {
                nextTier: null,
                message: "You've reached the highest tier!"
            };
        }

        const nextTierConfig = allTiers[nextTierName];
        if (!nextTierConfig) {
            return {
                nextTier: null,
                message: "Tier configuration not found"
            };
        }

        const requirements = nextTierConfig.requirements;
        const progress = {
            nextTier: nextTierName
        };

        // Calculate progress for each requirement
        if (requirements.depositAmount30Days) {
            progress.depositProgress30Days = {
                current: userProgress.totalDeposit30Days || 0,
                required: requirements.depositAmount30Days,
                percentage: Math.min(100, ((userProgress.totalDeposit30Days || 0) / requirements.depositAmount30Days) * 100)
            };
        }

        if (requirements.depositAmount60Days) {
            progress.depositProgress60Days = {
                current: userProgress.totalDeposit60Days || 0,
                required: requirements.depositAmount60Days,
                percentage: Math.min(100, ((userProgress.totalDeposit60Days || 0) / requirements.depositAmount60Days) * 100)
            };
        }

        if (requirements.depositAmount90Days) {
            progress.depositProgress90Days = {
                current: userProgress.totalDeposit90Days || 0,
                required: requirements.depositAmount90Days,
                percentage: Math.min(100, ((userProgress.totalDeposit90Days || 0) / requirements.depositAmount90Days) * 100)
            };
        }

        if (requirements.daysPlayedPerWeek) {
            progress.playProgress = {
                current: userProgress.daysPlayedThisWeek || 0,
                required: requirements.daysPlayedPerWeek,
                percentage: Math.min(100, ((userProgress.daysPlayedThisWeek || 0) / requirements.daysPlayedPerWeek) * 100)
            };
        }

        if (requirements.weeklySpendAmount) {
            progress.spendingProgress = {
                current: userProgress.weeklySpending || 0,
                required: requirements.weeklySpendAmount,
                percentage: Math.min(100, ((userProgress.weeklySpending || 0) / requirements.weeklySpendAmount) * 100)
            };
        }

        if (requirements.dailySessionMinutes) {
            progress.sessionProgress = {
                current: userProgress.dailySessionMinutesToday || 0,
                required: requirements.dailySessionMinutes,
                percentage: Math.min(100, ((userProgress.dailySessionMinutesToday || 0) / requirements.dailySessionMinutes) * 100)
            };
        }

        if (requirements.dailyLoginRequired) {
            progress.dailyLoginProgress = {
                current: userProgress.dailyLoginStreak || 0,
                required: 7, // Minimum 7 days consecutive
                percentage: Math.min(100, ((userProgress.dailyLoginStreak || 0) / 7) * 100)
            };
        }

        return progress;
    }

    // Helper method to get next tier
    getNextTier(currentTier) {
        const tierOrder = ['NONE', 'SILVER', 'GOLD', 'VIP'];
        const currentIndex = tierOrder.indexOf(currentTier);
        return currentIndex >= 0 && currentIndex < tierOrder.length - 1
            ? tierOrder[currentIndex + 1]
            : null;
    }

    // Get tier benefits for a specific tier
    async getTierBenefits(tierName) {
        const tierConfig = await this.getTierConfig(tierName);
        return tierConfig ? {
            weeklyWithdrawalLimit: tierConfig.weeklyWithdrawalLimit,
            withdrawalTime: tierConfig.withdrawalTime,
            weeklyCashbackPercentage: tierConfig.weeklyCashbackPercentage,
            monthlyCashbackPercentage: tierConfig.monthlyCashbackPercentage,
            referralXP: tierConfig.referralXP,
            noWinCashbackPercentage: tierConfig.noWinCashbackPercentage,
            noWinCashbackDays: tierConfig.noWinCashbackDays,
            referralCommissions: tierConfig.referralCommissions
        } : null;
    }

    // Initialize default tier requirements if none exist
    async initializeDefaultTiers(adminUserId) {
        try {
            const existingCount = await TierRequirements.countDocuments();
            if (existingCount === 0) {
                // Convert current constants to database entries
                const tierEntries = Object.entries(FALLBACK_TIERS).map(([tier, config]) => ({
                    tier,
                    name: config.name,
                    benefits: {
                        weeklyWithdrawalLimit: config.weeklyWithdrawalLimit,
                        withdrawalTime: config.withdrawalTime,
                        weeklyCashbackPercentage: config.weeklyCashbackPercentage || 0,
                        monthlyCashbackPercentage: config.monthlyCashbackPercentage || 0,
                        referralXP: config.referralXP || 0,
                        noWinCashbackPercentage: config.noWinCashbackPercentage || 0,
                        noWinCashbackDays: config.noWinCashbackDays || 0,
                    },
                    requirements: config.requirements || {},
                    referralCommissions: config.referralCommissions || {
                        borlette: { perPlay: 0, monthlyCap: 0 },
                        roulette: { per100Spins: 0, monthlyCap: 0 },
                        dominoes: { per100Wagered: 0, monthlyCap: 0 },
                    },
                    downgrades: {
                        inactivityDaysMin: FALLBACK_DOWNGRADES[tier]?.min || 30,
                        inactivityDaysMax: FALLBACK_DOWNGRADES[tier]?.max || 60,
                    },
                    createdBy: adminUserId,
                    isActive: true
                }));

                await TierRequirements.insertMany(tierEntries);
                this.clearCache(); // Clear cache after initialization
                console.log('Default tier requirements initialized successfully');
            }
        } catch (error) {
            console.error('Error initializing default tier requirements:', error);
            throw error;
        }
    }
}

// Export singleton instance
export default new TierConfigService();