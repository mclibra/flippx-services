import { generateToken, decryptToken } from '../../services/crypto';
import { jwtSign } from '../../services/jwt/';

export const login = async user => {
	try {
		const refreshToken = generateToken(user._id.toString());
		const accessToken = jwtSign({ id: user._id.toString() });
		return {
			status: 200,
			entity: {
				success: true,
				user: user,
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
		return {
			status: 200,
			entity: {
				success: true,
				refreshToken: generateToken(id),
				accessToken: jwtSign({ id }),
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
