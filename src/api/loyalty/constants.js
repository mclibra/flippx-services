export const LOYALTY_TIERS = {
	NONE: {
		name: 'None',
		weeklyWithdrawalLimit: 0,
		withdrawalTime: 72, // hours
		weeklyCashbackPercentage: 0,
		monthlyCashbackPercentage: 0,
		referralXP: 0,
		// NEW: No referral commissions for None tier
		referralCommissions: {
			borlette: { perPlay: 0, monthlyCap: 0 },
			roulette: { per100Spins: 0, monthlyCap: 0 },
			dominoes: { per100Wagered: 0, monthlyCap: 0 },
		},
	},
	SILVER: {
		name: 'Silver',
		weeklyWithdrawalLimit: 2300,
		withdrawalTime: 48, // hours
		weeklyCashbackPercentage: 0, // No cashback for Silver
		monthlyCashbackPercentage: 0,
		referralXP: 0,
		requirements: {
			depositAmount30Days: 150,
			daysPlayedPerWeek: 3,
			daysRequired: 30,
			requireIDVerification: true,
		},
		// NEW: No referral commissions for Silver tier
		referralCommissions: {
			borlette: { perPlay: 0, monthlyCap: 0 },
			roulette: { per100Spins: 0, monthlyCap: 0 },
			dominoes: { per100Wagered: 0, monthlyCap: 0 },
		},
	},
	GOLD: {
		name: 'Gold',
		weeklyWithdrawalLimit: 3350,
		withdrawalTime: 24, // hours
		weeklyCashbackPercentage: 0, // CHANGED: No weekly cashback
		monthlyCashbackPercentage: 0, // CHANGED: No monthly cashback
		referralXP: 8,
		requirements: {
			previousTier: 'SILVER',
			previousTierDays: 60,
			depositAmount60Days: 1000,
			daysPlayedPerWeek: 4,
			daysRequired: 60,
			// NEW: Additional requirements
			weeklySpendAmount: 150, // Must spend $150 per week
			dailySessionMinutes: 5, // Must stay 5 minutes per login
		},
		// NEW: 15-day no-win cashback
		noWinCashbackPercentage: 1, // 1% cashback if no win for 15 days
		noWinCashbackDays: 15,
		// NEW: Referral commissions for Gold
		referralCommissions: {
			borlette: { perPlay: 0.02, monthlyCap: 5500 },
			roulette: { per100Spins: 0.075, monthlyCap: 4000 },
			dominoes: { per100Wagered: 0.05, monthlyCap: 5500 },
		},
	},
	VIP: {
		name: 'VIP',
		weeklyWithdrawalLimit: 5500,
		withdrawalTime: 0, // same day (instant)
		weeklyCashbackPercentage: 0, // CHANGED: No weekly cashback
		monthlyCashbackPercentage: 0, // CHANGED: No monthly cashback
		referralXP: 12,
		requirements: {
			previousTier: 'GOLD',
			previousTierDays: 90,
			depositAmount90Days: 2000,
			daysPlayedPerWeek: 5,
			daysRequired: 90,
			// NEW: Additional requirements
			weeklySpendAmount: 200, // Must spend $200 per week
			dailyLoginRequired: true, // Must log in daily
			dailySessionMinutes: 5, // Must stay 5 minutes per login
		},
		// NEW: 15-day no-win cashback
		noWinCashbackPercentage: 3, // 3% cashback if no win for 15 days
		noWinCashbackDays: 15,
		// NEW: Referral commissions for VIP
		referralCommissions: {
			borlette: { perPlay: 0.04, monthlyCap: 10000 },
			roulette: { per100Spins: 0.15, monthlyCap: 8000 },
			dominoes: { per100Wagered: 0.10, monthlyCap: 10000 },
		},
	},
};

export const TIER_DOWNGRADES = {
	SILVER: { min: 30, max: 60 }, // days of inactivity to downgrade
	GOLD: { min: 30, max: 60 },
	VIP: { min: 30, max: 60 },
};

export const REFERRAL_QUALIFICATION_AMOUNT = 50; // $50 play to qualify for referral bonus

export const INACTIVITY_CHECK_DAYS = 7; // Start counting inactivity after 7 days of no play

// NEW: Minimum bet requirements for referral commissions
export const REFERRAL_MIN_BET_REQUIREMENTS = {
	borlette: 5, // $5 minimum per play
	roulette: 5, // $5 minimum per spin
	dominoes: 5, // $5 minimum per draw
};

// NEW: Session tracking constants
export const SESSION_REQUIREMENTS = {
	MIN_SESSION_MINUTES: 5, // Minimum 5 minutes per session
	SESSION_TIMEOUT_MINUTES: 30, // Session times out after 30 minutes of inactivity
};