import { Router } from 'express';
import { done } from '../../services/response/';
import { token, xApi } from '../../services/passport';
import {
	getUserLoyalty,
	getUserXPHistory,
	getLoyaltyProgress,
	checkWeeklyWithdrawalLimit,
	getWithdrawalTime,
	checkNoWinCashbackEligibility,
	updateSessionTime,
} from './controller';
import { LoyaltyService } from './service';

const router = new Router();

// Health check for tier configuration
router.get(
	'/tier-config-status',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		try {
			const TierConfigService = (await import('./service'))
				.LoyaltyService;
			const tierRequirements =
				await TierConfigService.getTierRequirements();

			done(res, {
				status: 200,
				entity: {
					success: true,
					tierConfigLoaded: !!tierRequirements,
					tierCount: Object.keys(tierRequirements || {}).length,
					tiers: Object.keys(tierRequirements || {}),
					timestamp: new Date().toISOString(),
				},
			});
		} catch (error) {
			console.error('Error checking tier config status:', error);
			done(res, {
				status: 500,
				entity: {
					success: false,
					error: 'Failed to check tier configuration status',
				},
			});
		}
	}
);

// Test tier progress calculation directly
router.get(
	'/test-tier-progress/:tier',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		try {
			const { tier } = req.params;
			const TierConfigService = (
				await import('../../services/tier/tierConfigService')
			).default;

			// Mock user progress data
			const mockProgress = {
				totalDeposit30Days: 100,
				totalDeposit60Days: 500,
				totalDeposit90Days: 1000,
				daysPlayedThisWeek: 2,
				weeklySpending: 100,
				dailySessionMinutesToday: 3,
				dailyLoginStreak: 5,
			};

			const progress = await TierConfigService.calculateTierProgress(
				tier,
				mockProgress
			);

			done(res, {
				status: 200,
				entity: {
					success: true,
					testTier: tier,
					progress,
					timestamp: new Date().toISOString(),
				},
			});
		} catch (error) {
			console.error('Error testing tier progress:', error);
			done(res, {
				status: 500,
				entity: {
					success: false,
					error: 'Failed to test tier progress calculation',
				},
			});
		}
	}
);

// Get user's loyalty profile
router.get('/profile', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserLoyalty(req.user._id))
);

// Get user's loyalty progress
router.get('/progress', xApi(), token({ required: true }), async (req, res) => {
	try {
		const result = await getLoyaltyProgress(req.user._id);
		done(res, result);
	} catch (error) {
		console.error('Error in loyalty progress endpoint:', error);
		done(res, {
			status: 500,
			entity: {
				success: false,
				error: 'Internal server error in loyalty progress endpoint',
			},
		});
	}
});

// Get user's XP transaction history
router.get('/xp-history', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserXPHistory(req.user._id, req.query))
);

// Check weekly withdrawal limit
router.get(
	'/withdrawal-limit',
	xApi(),
	token({ required: true }),
	async (req, res) =>
		done(res, await checkWeeklyWithdrawalLimit(req.user._id))
);

// Get withdrawal processing time
router.get(
	'/withdrawal-time',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getWithdrawalTime(req.user._id))
);

// NEW: Update session time (called periodically by frontend)
router.post(
	'/session-time',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const { sessionMinutes } = req.body;
		if (!sessionMinutes || sessionMinutes < 0) {
			return done(res, {
				status: 400,
				entity: {
					success: false,
					error: 'Valid sessionMinutes required',
				},
			});
		}
		done(res, await updateSessionTime(req.user._id, sessionMinutes));
	}
);

router.get(
	'/no-win-cashback/check',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const result = await checkNoWinCashbackEligibility(req.user._id);
		done(res, {
			status: 200,
			entity: {
				success: true,
				...result,
			},
		});
	}
);

// Get referral statistics
router.get(
	'/referral-stats',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const stats = await LoyaltyService.getUserReferralStats(req.user._id);
		done(res, {
			status: stats.success ? 200 : 500,
			entity: stats,
		});
	}
);

// Get cashback history
router.get(
	'/cashback-history',
	xApi(),
	token({ required: true }),
	async (req, res) => {
		const history = await LoyaltyService.getUserCashbackHistory(
			req.user._id
		);
		done(res, {
			status: history.success ? 200 : 500,
			entity: history,
		});
	}
);

export default router;
