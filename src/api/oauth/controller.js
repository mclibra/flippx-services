import { generateToken, decryptToken } from '../../services/crypto';
import { jwtSign } from '../../services/jwt/';
import { User } from '../user/model';
import { LoyaltyService } from '../loyalty/service';
import moment from 'moment';

export const login = async user => {
	try {
		const refreshToken = generateToken(user._id.toString());
		const accessToken = jwtSign({ id: user._id.toString(), userName: user.userName, role: user.role, });

		// NEW: Update session tracking
		const now = moment();
		const today = moment().startOf('day');

		// Check if this is a new daily login
		let isNewDailyLogin = false;
		if (!user.sessionTracking.lastDailyLoginDate ||
			!moment(user.sessionTracking.lastDailyLoginDate).isSame(today, 'day')) {
			isNewDailyLogin = true;

			// Update daily login streak
			const lastLogin = user.sessionTracking.lastDailyLoginDate;
			if (lastLogin && moment(lastLogin).add(1, 'day').isSame(today, 'day')) {
				// Consecutive day login
				user.sessionTracking.dailyLoginStreak = (user.sessionTracking.dailyLoginStreak || 0) + 1;
			} else {
				// Streak broken
				user.sessionTracking.dailyLoginStreak = 1;
			}

			user.sessionTracking.lastDailyLoginDate = now.toDate();
			user.sessionTracking.dailySessionMinutesToday = 0;
			user.sessionTracking.totalSessionTimeToday = 0;
		}

		// Update login timestamps
		user.sessionTracking.lastLoginDate = now.toDate();
		user.sessionTracking.lastActivityDate = now.toDate();
		user.sessionTracking.currentSessionStartTime = now.toDate();
		user.sessionTracking.sessionTimeUpdatedDate = now.toDate();

		await user.save();

		// Track daily login for loyalty
		if (isNewDailyLogin) {
			try {
				await LoyaltyService.recordDailyLogin(user._id.toString());
			} catch (error) {
				console.error('Error recording daily login for loyalty:', error);
			}
		}

		return {
			status: 200,
			entity: {
				success: true,
				user: user.view(true),
				refreshToken,
				accessToken,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const token = async query => {
	try {
		const id = decryptToken(query.refresh_token || query.refreshToken);
		if (!id) {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Invalid token.',
				},
			};
		}

		// Update last activity when refreshing token
		const user = await User.findById(id);
		if (user) {
			user.sessionTracking.lastActivityDate = new Date();
			await user.save();
		}

		return {
			status: 200,
			entity: {
				success: true,
				refreshToken: generateToken(id),
				accessToken: jwtSign({ id: user._id.toString(), userName: user.userName, role: user.role, }),
			},
		};
	} catch (error) {
		return {
			status: 401,
			entity: {
				success: false,
				error: error.errors || 'Invalid token.',
			},
		};
	}
};