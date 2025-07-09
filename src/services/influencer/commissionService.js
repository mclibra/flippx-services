import { Influencer } from '../../api/influencer/model';
import { InfluencerCommission } from '../../api/influencer_commission/model';
import { User } from '../../api/user/model';
import { LoyaltyTransaction } from '../../api/loyalty/model';
import { makeTransaction } from '../../api/transaction/controller';
import moment from 'moment';

// Default influencer commission rates
const INFLUENCER_COMMISSIONS = {
    borlette: { perPlay: 0.25, monthlyCap: 15000 },
    roulette: { per100Spins: 0.35, monthlyCap: 15000 },
    dominoes: { per100Wagered: 0.30, monthlyCap: 15000 },
};

// Minimum bet requirements
const MIN_BET_REQUIREMENTS = {
    borlette: 5,
    roulette: 5,
    dominoes: 5,
};

class InfluencerCommissionService {
    // Process influencer commission
    static async processInfluencerCommission(refereeId, gameType, playAmount, playId) {
        try {
            // Check minimum bet requirement
            const minBet = MIN_BET_REQUIREMENTS[gameType.toLowerCase()];
            if (!minBet || playAmount < minBet) {
                return {
                    success: false,
                    message: `Minimum bet of ${minBet} required for referral commission`
                };
            }

            // Find the referee user
            const referee = await User.findById(refereeId);
            if (!referee || !referee.refferalCode) {
                return { success: false, message: 'User or referral code not found' };
            }

            // Find the referrer (influencer) based on referee's referral code
            const referrer = await User.findOne({
                userName: referee.refferalCode.toLowerCase(),
            });
            if (!referrer) {
                return { success: false, message: 'Referrer not found' };
            }

            // Check if referrer is an active influencer
            const influencerContract = await Influencer.findOne({
                user: referrer._id,
                contractStatus: 'ACTIVE',
            });

            if (!influencerContract) {
                return { success: false, message: 'Referrer is not an active influencer' };
            }

            // Check contract validity
            const now = moment();
            if (influencerContract.contractEndDate && moment(influencerContract.contractEndDate).isBefore(now)) {
                // Update contract status
                influencerContract.contractStatus = 'EXPIRED';
                await influencerContract.save();
                return { success: false, message: 'Influencer contract has expired' };
            }

            // Get commission configuration
            const commissionConfig = influencerContract.commissionRates[gameType.toLowerCase()];
            if (!commissionConfig) {
                return { success: false, message: 'No commission configured for this game type' };
            }

            // Check monthly cap
            const monthKey = moment().format('YYYY-MM');
            const monthlyCommissions = await InfluencerCommission.aggregate([
                {
                    $match: {
                        influencer: referrer._id.toString(),
                        monthKey: monthKey,
                        processed: true,
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalEarned: { $sum: '$commissionAmount' },
                    },
                },
            ]);

            const monthlyEarned = monthlyCommissions.length > 0 ? monthlyCommissions[0].totalEarned : 0;

            if (monthlyEarned >= commissionConfig.monthlyCap) {
                return { success: false, message: 'Monthly commission cap reached' };
            }

            // Calculate commission based on game type
            let commissionAmount = 0;
            let commissionRate = 0;

            switch (gameType.toLowerCase()) {
                case 'borlette':
                    commissionAmount = commissionConfig.perPlay;
                    commissionRate = commissionConfig.perPlay;
                    break;

                case 'roulette': {
                    // Commission per 100 spins
                    const spinHistory = await InfluencerCommission.aggregate([
                        {
                            $match: {
                                influencer: referrer._id.toString(),
                                gameType: 'ROULETTE',
                                monthKey: monthKey,
                            },
                        },
                        {
                            $group: {
                                _id: null,
                                totalSpins: { $sum: 1 },
                            },
                        },
                    ]);

                    const totalSpins = spinHistory.length > 0 ? spinHistory[0].totalSpins : 0;
                    const previousHundreds = Math.floor(totalSpins / 100);
                    const currentHundreds = Math.floor((totalSpins + 1) / 100);

                    if (currentHundreds > previousHundreds) {
                        commissionAmount = commissionConfig.per100Spins;
                        commissionRate = commissionConfig.per100Spins;
                    }
                    break;
                }

                case 'dominoes': {
                    // Commission per $100 wagered
                    const wagerHistory = await InfluencerCommission.aggregate([
                        {
                            $match: {
                                influencer: referrer._id.toString(),
                                gameType: 'DOMINOES',
                                monthKey: monthKey,
                            },
                        },
                        {
                            $group: {
                                _id: null,
                                totalWagered: { $sum: '$playAmount' },
                            },
                        },
                    ]);

                    const previousWagered = wagerHistory.length > 0 ? wagerHistory[0].totalWagered : 0;
                    const totalWagered = previousWagered + playAmount;
                    const previousHundreds = Math.floor(previousWagered / 100);
                    const currentHundreds = Math.floor(totalWagered / 100);

                    if (currentHundreds > previousHundreds) {
                        commissionAmount = commissionConfig.per100Wagered * (currentHundreds - previousHundreds);
                        commissionRate = commissionConfig.per100Wagered;
                    }
                    break;
                }
            }

            // Create commission record even if amount is 0 (for tracking)
            const commission = await InfluencerCommission.create({
                influencer: referrer._id,
                referee: refereeId,
                gameType: gameType.toUpperCase(),
                playId,
                playAmount,
                commissionAmount,
                commissionRate,
                contractId: influencerContract._id,
                processed: commissionAmount > 0,
                processedDate: commissionAmount > 0 ? new Date() : null,
                monthKey,
                isCapReached: false,
            });

            // If commission amount is greater than 0, process payment
            if (commissionAmount > 0) {
                // Ensure we don't exceed monthly cap
                const remainingCap = commissionConfig.monthlyCap - monthlyEarned;
                commissionAmount = Math.min(commissionAmount, remainingCap);

                // Update commission amount if capped
                if (commissionAmount < commission.commissionAmount) {
                    commission.commissionAmount = commissionAmount;
                    commission.isCapReached = true;
                    await commission.save();
                }

                // FIXED: Use makeTransaction instead of direct wallet update
                await makeTransaction(
                    referrer._id.toString(),
                    'USER',
                    'REFERRAL_COMMISSION',
                    commissionAmount,
                    playId,
                    'REAL'
                );

                // Create loyalty transaction for tracking
                await LoyaltyTransaction.create({
                    user: referrer._id.toString(),
                    transactionType: 'REFERRAL_COMMISSION',
                    xpAmount: 0, // Commissions are cash, not XP
                    description: `Influencer ${gameType} commission from ${referee.userName || 'user'}`,
                    reference: {
                        commissionType: gameType.toUpperCase(),
                        commissionAmount,
                        referredUser: refereeId,
                        playId,
                        playAmount,
                        isInfluencer: true,
                    },
                    previousBalance: 0,
                    newBalance: 0,
                    tier: 'INFLUENCER',
                });

                // Update influencer total earned
                influencerContract.totalEarned += commissionAmount;
                influencerContract.lastPayoutDate = new Date();
                await influencerContract.save();

                return {
                    success: true,
                    message: `Influencer commission of ${commissionAmount.toFixed(2)} credited`,
                    commissionAmount,
                    isInfluencer: true,
                };
            }

            return {
                success: true,
                message: 'Play tracked, no commission earned yet',
                commissionAmount: 0,
                isInfluencer: true,
            };

        } catch (error) {
            console.error('Error processing influencer commission:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if user is influencer
    static async isUserInfluencer(userId) {
        try {
            const contract = await Influencer.findOne({
                user: userId,
                contractStatus: 'ACTIVE',
            });

            return !!contract;
        } catch (error) {
            console.error('Error checking influencer status:', error);
            return false;
        }
    }

    // Get influencer commission rates
    static async getInfluencerCommissionRates(userId) {
        try {
            const contract = await Influencer.findOne({
                user: userId,
                contractStatus: 'ACTIVE',
            });

            if (!contract) {
                return null;
            }

            return contract.commissionRates;
        } catch (error) {
            console.error('Error getting influencer commission rates:', error);
            return null;
        }
    }

    // Reset monthly caps for all influencers
    static async resetMonthlyInfluencerCaps() {
        try {
            // This would be called by a cron job
            const monthKey = moment().format('YYYY-MM');

            console.log(`Resetting influencer commission caps for month: ${monthKey}`);

            // The cap is tracked per month using monthKey in InfluencerCommission
            // No need to update anything as the new month will automatically have 0 earned

            return { success: true, message: 'Monthly caps reset process completed' };
        } catch (error) {
            console.error('Error resetting influencer monthly caps:', error);
            return { success: false, error: error.message };
        }
    }
}

export default InfluencerCommissionService;