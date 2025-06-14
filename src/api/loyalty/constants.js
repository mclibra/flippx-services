export const LOYALTY_TIERS = {
	NONE: {
		name: 'None',
		weeklyWithdrawalLimit: 0,
		withdrawalTime: 72, // hours
		weeklyCashbackPercentage: 0,
		monthlyCashbackPercentage: 0,
		referralXP: 0,
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
	},
	GOLD: {
		name: 'Gold',
		weeklyWithdrawalLimit: 3350,
		withdrawalTime: 24, // hours
		weeklyCashbackPercentage: 2, // 2% weekly cashback on losses
		monthlyCashbackPercentage: 0,
		referralXP: 8,
		requirements: {
			previousTier: 'SILVER',
			previousTierDays: 60,
			depositAmount60Days: 1000,
			daysPlayedPerWeek: 4,
			daysRequired: 60,
		},
	},
	VIP: {
		name: 'VIP',
		weeklyWithdrawalLimit: 5500,
		withdrawalTime: 0, // same day (instant)
		weeklyCashbackPercentage: 0, // VIP gets monthly cashback instead
		monthlyCashbackPercentage: 5, // 5% monthly cashback on losses
		referralXP: 12,
		requirements: {
			previousTier: 'GOLD',
			previousTierDays: 90,
			depositAmount90Days: 2000,
			daysPlayedPerWeek: 5,
			daysRequired: 90,
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