import moment from 'moment';
import AWS from 'aws-sdk';
import { jwtSign, jwtVerify } from '../../services/jwt/';
import { generateToken } from '../../services/crypto';
import { generateRandomDigits } from '../../services/helper/utils';
import {
	sendVerificationCode,
	verifyVerificationCode,
} from '../text/controller';
import { makeTransaction } from '../transaction/controller';
import { User } from './model';
import { Wallet } from '../wallet/model';
import { getUserBalance } from '../wallet/controller';
import { LoyaltyService } from '../loyalty/service';
import config from '../../../config';

const failedAttempts = {};

export const getAdminUserId = async () => {
	const admin = await User.findOne({
		role: 'ADMIN',
	});
	return admin.id;
};

export const sendOtp = async body => {
	try {
		const { countryCode, phone } = body;
		const pattern = /^([0-9]){7,10}$/;
		if (!pattern.test(phone)) {
			throw 'Invalid phone number.';
		}
		const verificationCode = config.enableText
			? generateRandomDigits(4)
			: 1234;
		const message = `${verificationCode} is your OTP to register on Megacash. The OTP is valid for 5 minutes. Please contact MegaPay support.`;

		console.log('verificationCode => ', verificationCode);
		const response = await sendVerificationCode({
			phone: `${countryCode}${phone}`,
			verificationCode,
			message,
		});
		if (response.entity.error) {
			throw response.entity.error;
		}
		return {
			status: 200,
			entity: {
				verificationToken: response.entity.verificationToken,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const verifyOtp = async body => {
	try {
		const { countryCode, phone, verificationCode, verificationToken } =
			body;
		console.log(
			'countryCode, phone, verificationCode, verificationToken => ',
			countryCode,
			phone,
			verificationCode,
			verificationToken
		);
		const response = await verifyVerificationCode({
			phone: `${countryCode}${phone}`,
			verificationCode,
			verificationToken,
		});
		if (response.entity.error) {
			throw response.entity.error;
		}
		return {
			status: 200,
			entity: {
				signUpToken: response.entity.signUpToken,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const create = async body => {
	try {
		const { countryCode, phone, name, password, dob, refferalCode } = body;
		const slugName = `${name.firstName}${name.lastName}`;

		// Check if user already exists
		const existingUser = await User.findOne({
			countryCode,
			phone,
		});

		if (existingUser) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'Phone number already registered.',
				},
			};
		}

		// Create the user
		const user = await User.create({
			name,
			slugName,
			countryCode,
			dob,
			password,
			phone,
			refferalCode: refferalCode ? refferalCode : null,
		});

		if (user._id) {
			// Create wallet for the user
			await Wallet.create({
				user: user._id,
				realBalance: 0,
				virtualBalance: 0,
			});

			// **NEW: Initialize loyalty profile for the user**
			try {
				const loyaltyResult = await LoyaltyService.initializeLoyaltyForUser(user._id);
				if (!loyaltyResult.success) {
					console.warn(`Failed to initialize loyalty for user ${user._id}:`, loyaltyResult.error);
					// Don't fail user creation if loyalty initialization fails
				} else {
					console.log(`Loyalty profile initialized for user ${user._id}`);
				}
			} catch (loyaltyError) {
				console.error(`Error initializing loyalty for user ${user._id}:`, loyaltyError);
				// Don't fail user creation if loyalty initialization fails
			}

			// **NEW: Process referral qualification if referral code exists**
			if (refferalCode) {
				try {
					const referralResult = await LoyaltyService.processReferralQualification(user._id);
					if (!referralResult.success) {
						console.warn(`Failed to process referral qualification for user ${user._id}:`, referralResult.error);
					} else {
						console.log(`Referral qualification processed for user ${user._id}`, referralResult);
					}
				} catch (referralError) {
					console.error(`Error processing referral qualification for user ${user._id}:`, referralError);
				}
			}

			const refreshToken = generateToken(user._id.toString());
			const accessToken = jwtSign({ id: user._id.toString() });

			return {
				status: 200,
				entity: {
					success: true,
					user: user.view(true),
					refreshToken,
					accessToken,
				},
			};
		}

		return {
			status: 500,
			entity: {
				success: false,
				error: 'Invalid parameters.',
			},
		};
	} catch (error) {
		console.log(error);
		if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Phone number already registered.',
				},
			};
		} else if (error.name === 'TokenExpiredError') {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Signup token has expired.',
				},
			};
		} else if (error.name === 'ValidationError') {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid parameters passed.',
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const verifySecurePin = async (user, { securePin }) => {
	try {
		if (failedAttempts[user._id.toString()] > 2) {
			return {
				status: 403,
				entity: {
					success: false,
					error: `Your account has been blocked due to 3 failed attempts. Please contact MegaPay support.`,
				},
			};
		}
		const validatePin = await user.validatePin(securePin);
		if (validatePin) {
			failedAttempts[user._id.toString()] = 0;
			return {
				status: 200,
				entity: {
					success: true,
				},
			};
		}
		if (!failedAttempts[user._id.toString()]) {
			failedAttempts[user._id.toString()] = 1;
		} else {
			failedAttempts[user._id.toString()] += 1;
		}
		if (failedAttempts[user._id.toString()] > 2) {
			return {
				status: 403,
				entity: {
					success: false,
					error: `Invalid secure pin. Your account has been blocked due to 3 failed attempts. Please contact MegaPay support.`,
				},
			};
		}
		return {
			status: 403,
			entity: {
				success: false,
				error:
					failedAttempts[user._id.toString()] > 2
						? `Invalid secure pin. Your account has been blocked. Please contact MegaPay support.`
						: `Invalid secure pin. You have ${3 - failedAttempts[user._id.toString()]
						} attempt left.`,
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

export const resetPassword = async ({
	verificationToken,
	password,
	countryCode,
	phone,
}) => {
	try {
		const decodedToken = jwtVerify(verificationToken);
		console.log(decodedToken);
		if (decodedToken.phone !== `${countryCode}${phone}`) {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid token passed.',
				},
			};
		}
		const user = await User.findOne({
			countryCode: countryCode,
			phone: phone,
		});
		if (user) {
			user.password = password;
			await user.save();
			const refreshToken = generateToken(user._id.toString());
			const accessToken = jwtSign({ id: user._id.toString() });
			return {
				status: 200,
				entity: {
					success: true,
					user: user.view(true),
					refreshToken,
					accessToken,
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: 'Invalid token passed.',
			},
		};
	} catch (error) {
		console.log(error);
		if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Phone number already registered.',
				},
			};
		} else if (error.name === 'TokenExpiredError') {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Signup token has expired.',
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const update = async (user, body) => {
	try {
		const updateResponse = await Object.assign(user, body).save();
		if (updateResponse._id) {
			return {
				status: 200,
				entity: {
					success: true,
					user: updateResponse.view(true),
				},
			};
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid parameters.',
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 409,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const getUserInfo = async (user, { userPhone, countryCode }) => {
	try {
		if (user.role === 'DEALER' || user.role === 'ADMIN') {
			const searchedUser = await User.findOne({
				phone: userPhone,
				countryCode: countryCode,
			});
			if (searchedUser._id) {
				const walletDataResponse = await getUserBalance({
					_id: searchedUser._id,
				});
				return {
					status: 200,
					entity: {
						success: true,
						user: searchedUser.view(true),
						walletData: walletDataResponse.entity.success
							? walletDataResponse.entity.balance
							: {},
					},
				};
			}
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Invalid user.',
				},
			};
		} else {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'You are not authorized to perform this action.',
				},
			};
		}
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

export const getSelfImage = async user => {
	try {
		const S3_BUCKET = config.s3Bucket;
		AWS.config.region = config.s3Region;
		const s3 = new AWS.S3();
		const fileName = `${user._id}_profile_pic.jpg`;
		const s3Params = {
			Bucket: S3_BUCKET,
			Key: fileName,
			Expires: 60,
		};
		const signedUrl = s3.getSignedUrl('getObject', s3Params);
		return {
			status: 200,
			entity: {
				success: true,
				signedUrl,
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

export const verifyReset = async body => {
	try {
		const { countryCode, phone } = body;
		const pattern = /^([0-9]){7,10}$/;
		if (!pattern.test(phone)) {
			throw 'Invalid phone number.';
		}
		const user = await User.findOne({
			countryCode: countryCode,
			phone: phone,
		});
		if (user) {
			const verificationCode = config.enableText
				? generateRandomDigits(4)
				: 1234;
			const message = `${verificationCode} is your OTP to reset password on Megacash. The OTP is valid for 5 minutes. Please contact MegaPay support.`;

			console.log('verificationCode => ', verificationCode);
			const response = await sendVerificationCode({
				phone: `${countryCode}${phone}`,
				verificationCode,
				message,
			});
			if (response.entity.error) {
				throw response.entity.error;
			}
			return {
				status: 200,
				entity: {
					verificationToken: response.entity.verificationToken,
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: 'Invalid phone number.',
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				error: typeof error === 'string' ? error : 'An error occurred',
			},
		};
	}
};

export const getSignedUrl = async (user, { fileType }) => {
	try {
		const S3_BUCKET = config.s3Bucket;
		AWS.config.region = config.s3Region;
		const s3 = new AWS.S3();
		const fileName = `${user._id}_profile_pic.${fileType}`;
		const s3Params = {
			Bucket: S3_BUCKET,
			Key: fileName,
			Expires: 60,
			ContentType: `image/${fileType}`,
			ACL: 'public-read',
		};
		const signedUrl = s3.getSignedUrl('putObject', s3Params);
		return {
			status: 200,
			entity: {
				success: true,
				signedUrl,
				fileName,
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

export const getSignedUrlForDocument = async (user, { fileType, documentType }) => {
	try {
		const S3_BUCKET = config.s3Bucket;
		AWS.config.region = config.s3Region;
		const s3 = new AWS.S3();
		const fileName = `${user._id}_${documentType}.${fileType}`;
		const s3Params = {
			Bucket: S3_BUCKET,
			Key: fileName,
			Expires: 60,
			ContentType: `image/${fileType}`,
			ACL: 'public-read',
		};
		const signedUrl = s3.getSignedUrl('putObject', s3Params);
		return {
			status: 200,
			entity: {
				success: true,
				signedUrl,
				fileName,
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