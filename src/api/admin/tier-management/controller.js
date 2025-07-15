import { TierRequirements } from './model';

// ===== TIER REQUIREMENTS MANAGEMENT =====

// Initialize default tier requirements (for setup)
export const initializeDefaultTierRequirements = async (adminUser) => {
    try {
        // Check if any tier requirements exist
        const existingCount = await TierRequirements.countDocuments();

        if (existingCount > 0) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Tier requirements already exist. Use update endpoints to modify.'
                }
            };
        }

        // Default configurations based on current constants
        const defaultTiers = [
            {
                name: 'NONE',
                benefits: {
                    weeklyWithdrawalLimit: 0,
                    withdrawalTime: 72,
                    weeklyCashbackPercentage: 0,
                    monthlyCashbackPercentage: 0,
                    referralXP: 0,
                    noWinCashbackPercentage: 0,
                    noWinCashbackDays: 0,
                },
                requirements: {},
                referralCommissions: {
                    borlette: { perPlay: 0, monthlyCap: 0 },
                    roulette: { per100Spins: 0, monthlyCap: 0 },
                    dominoes: { per100Wagered: 0, monthlyCap: 0 },
                },
                downgrades: { inactivityDaysMin: 30, inactivityDaysMax: 60 },
                createdBy: adminUser._id,
            },
            {
                name: 'SILVER',
                benefits: {
                    weeklyWithdrawalLimit: 2300,
                    withdrawalTime: 48,
                    weeklyCashbackPercentage: 0,
                    monthlyCashbackPercentage: 0,
                    referralXP: 0,
                    noWinCashbackPercentage: 0,
                    noWinCashbackDays: 0,
                },
                requirements: {
                    depositAmount30Days: 150,
                    daysPlayedPerWeek: 3,
                    daysRequired: 30,
                    requireIDVerification: true,
                },
                referralCommissions: {
                    borlette: { perPlay: 0, monthlyCap: 0 },
                    roulette: { per100Spins: 0, monthlyCap: 0 },
                    dominoes: { per100Wagered: 0, monthlyCap: 0 },
                },
                downgrades: { inactivityDaysMin: 30, inactivityDaysMax: 60 },
                createdBy: adminUser._id,
            },
            {
                name: 'GOLD',
                benefits: {
                    weeklyWithdrawalLimit: 3350,
                    withdrawalTime: 24,
                    weeklyCashbackPercentage: 0,
                    monthlyCashbackPercentage: 0,
                    referralXP: 8,
                    noWinCashbackPercentage: 1,
                    noWinCashbackDays: 15,
                },
                requirements: {
                    previousTier: 'SILVER',
                    previousTierDays: 60,
                    depositAmount60Days: 1000,
                    daysPlayedPerWeek: 4,
                    daysRequired: 60,
                    weeklySpendAmount: 150,
                    dailySessionMinutes: 5,
                },
                referralCommissions: {
                    borlette: { perPlay: 0.02, monthlyCap: 5500 },
                    roulette: { per100Spins: 0.075, monthlyCap: 4000 },
                    dominoes: { per100Wagered: 0.05, monthlyCap: 4000 },
                },
                downgrades: { inactivityDaysMin: 30, inactivityDaysMax: 60 },
                createdBy: adminUser._id,
            },
            {
                name: 'VIP',
                benefits: {
                    weeklyWithdrawalLimit: 5500,
                    withdrawalTime: 0,
                    weeklyCashbackPercentage: 0,
                    monthlyCashbackPercentage: 0,
                    referralXP: 12,
                    noWinCashbackPercentage: 3,
                    noWinCashbackDays: 15,
                },
                requirements: {
                    previousTier: 'GOLD',
                    previousTierDays: 90,
                    depositAmount90Days: 2000,
                    daysPlayedPerWeek: 5,
                    daysRequired: 90,
                    weeklySpendAmount: 200,
                    dailyLoginRequired: true,
                    dailySessionMinutes: 5,
                },
                referralCommissions: {
                    borlette: { perPlay: 0.04, monthlyCap: 10000 },
                    roulette: { per100Spins: 0.15, monthlyCap: 8000 },
                    dominoes: { per100Wagered: 0.10, monthlyCap: 8000 },
                },
                downgrades: { inactivityDaysMin: 30, inactivityDaysMax: 60 },
                createdBy: adminUser._id,
            },
        ];

        const createdTiers = await TierRequirements.insertMany(defaultTiers);

        return {
            status: 201,
            entity: {
                success: true,
                message: 'Default tier requirements initialized successfully',
                tiersCreated: createdTiers.length
            }
        };
    } catch (error) {
        console.error('Initialize default tier requirements error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to initialize default tier requirements'
            }
        };
    }
};

// Get all tier requirements
export const getTierRequirements = async (query) => {
    try {
        const { includeInactive = false } = query;

        const filter = includeInactive ? {} : { isActive: true };
        const tierRequirements = await TierRequirements.find(filter)
            .populate('createdBy', 'name userName')
            .populate('updatedBy', 'name userName')
            .sort({ createdAt: -1 });

        return {
            status: 200,
            entity: {
                success: true,
                tierRequirements
            }
        };
    } catch (error) {
        console.error('Get tier requirements error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to fetch tier requirements'
            }
        };
    }
};

// Get specific tier requirements
export const getTierRequirement = async (name) => {
    try {
        const tierRequirement = await TierRequirements.findOne({
            name: name.toUpperCase(),
            isActive: true
        })
            .populate('createdBy', 'name userName')
            .populate('updatedBy', 'name userName');

        if (!tierRequirement) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Tier requirement configuration not found'
                }
            };
        }

        return {
            status: 200,
            entity: {
                success: true,
                tierRequirement
            }
        };
    } catch (error) {
        console.error('Get tier requirement error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to fetch tier requirement'
            }
        };
    }
};

// Create new tier requirements
export const createTierRequirement = async (body, adminUser) => {
    try {
        const {
            name,
            benefits = {},
            requirements = {},
            referralCommissions = {},
            downgrades = {}
        } = body;

        if (!name) {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Tier and name are required'
                }
            };
        }

        // Check if tier already exists
        const existingTier = await TierRequirements.findOne({
            name: name.toUpperCase()
        });

        if (existingTier) {
            return {
                status: 409,
                entity: {
                    success: false,
                    error: 'Tier requirement configuration already exists'
                }
            };
        }

        // Set default values for nested objects
        const tierData = {
            name: name.toUpperCase(),
            benefits: {
                weeklyWithdrawalLimit: benefits.weeklyWithdrawalLimit || 0,
                withdrawalTime: benefits.withdrawalTime || 72,
                weeklyCashbackPercentage: benefits.weeklyCashbackPercentage || 0,
                monthlyCashbackPercentage: benefits.monthlyCashbackPercentage || 0,
                referralXP: benefits.referralXP || 0,
                noWinCashbackPercentage: benefits.noWinCashbackPercentage || 0,
                noWinCashbackDays: benefits.noWinCashbackDays || 0,
            },
            requirements: {
                previousTier: requirements.previousTier || null,
                previousTierDays: requirements.previousTierDays || 0,
                depositAmount30Days: requirements.depositAmount30Days || 0,
                depositAmount60Days: requirements.depositAmount60Days || 0,
                depositAmount90Days: requirements.depositAmount90Days || 0,
                daysPlayedPerWeek: requirements.daysPlayedPerWeek || 0,
                weeklySpendAmount: requirements.weeklySpendAmount || 0,
                dailySessionMinutes: requirements.dailySessionMinutes || 0,
                daysRequired: requirements.daysRequired || 0,
                requireIDVerification: requirements.requireIDVerification || false,
                dailyLoginRequired: requirements.dailyLoginRequired || false,
            },
            referralCommissions: {
                borlette: {
                    perPlay: referralCommissions.borlette?.perPlay || 0,
                    monthlyCap: referralCommissions.borlette?.monthlyCap || 0,
                },
                roulette: {
                    per100Spins: referralCommissions.roulette?.per100Spins || 0,
                    monthlyCap: referralCommissions.roulette?.monthlyCap || 0,
                },
                dominoes: {
                    per100Wagered: referralCommissions.dominoes?.per100Wagered || 0,
                    monthlyCap: referralCommissions.dominoes?.monthlyCap || 0,
                },
            },
            downgrades: {
                inactivityDaysMin: downgrades.inactivityDaysMin || 30,
                inactivityDaysMax: downgrades.inactivityDaysMax || 60,
            },
            createdBy: adminUser._id,
        };

        const tierRequirement = await TierRequirements.create(tierData);

        return {
            status: 201,
            entity: {
                success: true,
                message: 'Tier requirement created successfully',
                tierRequirement
            }
        };
    } catch (error) {
        console.error('Create tier requirement error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to create tier requirement'
            }
        };
    }
};

// Update tier requirements
export const updateTierRequirement = async (name, body, adminUser) => {
    try {
        const existingTier = await TierRequirements.findOne({
            name: name.toUpperCase(),
            isActive: true
        });

        if (!existingTier) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Tier requirement configuration not found'
                }
            };
        }

        const {
            benefits,
            requirements,
            referralCommissions,
            downgrades
        } = body;

        if (benefits) {
            existingTier.benefits = {
                ...existingTier.benefits,
                ...benefits
            };
        }

        if (requirements) {
            existingTier.requirements = {
                ...existingTier.requirements,
                ...requirements
            };
        }

        if (referralCommissions) {
            existingTier.referralCommissions = {
                borlette: {
                    ...existingTier.referralCommissions.borlette,
                    ...referralCommissions.borlette
                },
                roulette: {
                    ...existingTier.referralCommissions.roulette,
                    ...referralCommissions.roulette
                },
                dominoes: {
                    ...existingTier.referralCommissions.dominoes,
                    ...referralCommissions.dominoes
                }
            };
        }

        if (downgrades) {
            existingTier.downgrades = {
                ...existingTier.downgrades,
                ...downgrades
            };
        }

        existingTier.updatedBy = adminUser._id;

        await existingTier.save();

        return {
            status: 200,
            entity: {
                success: true,
                message: 'Tier requirement updated successfully',
                tierRequirement: existingTier
            }
        };
    } catch (error) {
        console.error('Update tier requirement error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to update tier requirement'
            }
        };
    }
};

// Deactivate tier requirements (soft delete)
export const deactivateTierRequirement = async (name, adminUser) => {
    try {
        const tierRequirement = await TierRequirements.findOne({
            name: name.toUpperCase(),
            isActive: true
        });

        if (!tierRequirement) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Tier requirement configuration not found'
                }
            };
        }

        // Prevent deactivating NONE tier
        if (tier.toUpperCase() === 'NONE') {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Cannot deactivate NONE tier'
                }
            };
        }

        tierRequirement.isActive = false;
        tierRequirement.updatedBy = adminUser._id;

        await tierRequirement.save();

        return {
            status: 200,
            entity: {
                success: true,
                message: 'Tier requirement deactivated successfully'
            }
        };
    } catch (error) {
        console.error('Deactivate tier requirement error:', error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.message || 'Failed to deactivate tier requirement'
            }
        };
    }
};