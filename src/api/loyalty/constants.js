export const LOYALTY_TIERS = {
	NONE: {
		name: 'None',
		weeklyWithdrawalLimit: 0,
		withdrawalTime: 72, // hours
		cashbackPercentage: 0,
		referralXP: 0,
	},
	SILVER: {
		name: 'Silver',
		weeklyWithdrawalLimit: 2300,
		withdrawalTime: 48, // hours
		cashbackPercentage: 0,
		referralXP: 0,
		requirements: {
			depositAmount30Days: 150,
			daysPlayedPerWeek: 3,
			daysRequired: 30,
		},
	},
	GOLD: {
		name: 'Gold',
		weeklyWithdrawalLimit: 3350,
		withdrawalTime: 24, // hours
		cashbackPercentage: 2,
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
		cashbackPercentage: 5,
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
	SILVER: 30, // days of inactivity to downgrade
	GOLD: 45,
	VIP: 60,
};

export const REFERRAL_QUALIFICATION_AMOUNT = 50; // $50 play to qualify for referral bonus
