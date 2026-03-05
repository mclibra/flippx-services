import crypto from 'crypto';
import AWS from 'aws-sdk';
import { jwtSign, jwtVerify } from '../../services/jwt/';
import { generateToken } from '../../services/crypto';
import { generateRandomDigits } from '../../services/helper/utils';
import {
	sendVerificationCode,
	verifyVerificationCode,
} from '../text/controller';
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
			throw 'Invalid phone number format. Please enter a valid phone number.';
		}
		const verificationCode = config.enableText
			? generateRandomDigits(4)
			: 1234;
		const message = `${verificationCode} is your OTP to register on Megacash. The OTP is valid for 5 minutes. Please contact MegaPay support.`;

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
		const errorMessage =
			typeof error === 'string'
				? error
				: error?.message ||
					error?.error ||
					'Unable to send verification code. Please check your phone number and try again.';
		return {
			status: 500,
			entity: {
				error: errorMessage,
			},
		};
	}
};

export const verifyOtp = async body => {
	try {
		const { countryCode, phone, verificationCode, verificationToken } =
			body;
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
		const errorMessage =
			typeof error === 'string'
				? error
				: error?.message ||
					error?.error ||
					'Invalid or expired verification code. Please request a new code.';
		return {
			status: 500,
			entity: {
				error: errorMessage,
			},
		};
	}
};

export const create = async body => {
	try {
		const {
			countryCode,
			phone,
			name,
			password,
			dob,
			refferalCode,
			countryName,
			countryISO,
		} = body;
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
					error: 'Phone number is already registered. Please use a different phone number or login.',
				},
			};
		}

		// Validate state code if address is provided
		if (body.address?.state) {
			const stateCode = String(body.address.state).trim().toUpperCase();
			if (!/^[A-Z]{2}$/.test(stateCode)) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'State must be a 2-digit uppercase code (e.g., "NY", "CA")',
					},
				};
			}
			body.address.state = stateCode;
		}

		// Create the user
		const user = await User.create({
			name,
			slugName,
			countryCode,
			countryName,
			countryISO,
			dob,
			password,
			phone,
			refferalCode: refferalCode ? refferalCode : null,
			address: body.address,
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
				const loyaltyResult =
					await LoyaltyService.initializeLoyaltyForUser(user._id);
				if (!loyaltyResult.success) {
					console.warn(
						`Failed to initialize loyalty for user ${user._id}:`,
						loyaltyResult.error
					);
					// Don't fail user creation if loyalty initialization fails
				}
			} catch (loyaltyError) {
				console.error(
					`Error initializing loyalty for user ${user._id}:`,
					loyaltyError
				);
				// Don't fail user creation if loyalty initialization fails
			}

			// **NEW: Process referral qualification if referral code exists**
			if (refferalCode) {
				try {
					const referralResult =
						await LoyaltyService.processReferralQualification(
							user._id
						);
					if (!referralResult.success) {
						console.warn(
							`Failed to process referral qualification for user ${user._id}:`,
							referralResult.error
						);
					}
				} catch (referralError) {
					console.error(
						`Error processing referral qualification for user ${user._id}:`,
						referralError
					);
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
				error: 'Unable to create account. Please check your registration details and try again.',
			},
		};
	} catch (error) {
		if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'Phone number is already registered. Please use a different phone number or login.',
				},
			};
		} else if (error.name === 'TokenExpiredError') {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Registration token has expired. Please complete the registration process again.',
				},
			};
		} else if (error.name === 'ValidationError') {
			const validationErrors = error.errors
				? Object.values(error.errors)
						.map(err => err.message)
						.join(', ')
				: 'Invalid registration details provided. Please check all fields and try again.';
			return {
				status: 400,
				entity: {
					success: false,
					error:
						validationErrors ||
						'Invalid registration details provided. Please check all fields and try again.',
				},
			};
		} else if (error.name === 'CastError') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid data format. Please check your registration details and try again.',
				},
			};
		}
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to create account. Please verify your information and try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
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
					error: 'Account temporarily locked due to multiple failed attempts. Please contact support for assistance.',
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
					error: 'Invalid secure PIN. Account temporarily locked due to multiple failed attempts. Please contact support for assistance.',
				},
			};
		}
		const remainingAttempts = 3 - failedAttempts[user._id.toString()];
		return {
			status: 403,
			entity: {
				success: false,
				error: `Invalid secure PIN. ${remainingAttempts} ${
					remainingAttempts === 1 ? 'attempt' : 'attempts'
				} remaining before account lock.`,
			},
		};
	} catch (error) {
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to verify secure PIN. Please try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
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
		if (decodedToken.phone !== `${countryCode}${phone}`) {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Invalid or mismatched reset token. Please request a new password reset.',
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
			status: 404,
			entity: {
				success: false,
				error: 'User account not found. Please verify your phone number and try again.',
			},
		};
	} catch (error) {
		if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'Phone number is already registered. Please use a different phone number.',
				},
			};
		} else if (error.name === 'TokenExpiredError') {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Password reset token has expired. Please request a new password reset.',
				},
			};
		} else if (error.name === 'JsonWebTokenError') {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Invalid password reset token. Please request a new password reset.',
				},
			};
		} else if (error.name === 'ValidationError') {
			const validationErrors = error.errors
				? Object.values(error.errors)
						.map(err => err.message)
						.join(', ')
				: 'Password does not meet requirements. Please ensure your password meets all criteria.';
			return {
				status: 400,
				entity: {
					success: false,
					error:
						validationErrors ||
						'Password does not meet requirements. Please ensure your password meets all criteria.',
				},
			};
		}
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to reset password. Please verify your information and try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
			},
		};
	}
};

export const update = async (user, body) => {
	try {
		// Handle address updates - merge with existing address if partial update
		if (body.address) {
			// Validate state code if provided
			if (body.address.state) {
				const stateCode = String(body.address.state)
					.trim()
					.toUpperCase();
				if (!/^[A-Z]{2}$/.test(stateCode)) {
					return {
						status: 400,
						entity: {
							success: false,
							error: 'State must be a 2-digit uppercase code (e.g., "NY", "CA")',
						},
					};
				}
				body.address.state = stateCode;
			}
			// If address is provided as an object, merge with existing address
			user.address = {
				...(user.address || {}),
				...(body.address || {}),
			};
			delete body.address; // Remove from body to avoid double assignment
		}

		// Handle bank account updates
		if (body.bankAccount !== undefined) {
			// Replace entire bank account array
			user.bankAccount = body.bankAccount;
			delete body.bankAccount; // Remove from body to avoid double assignment
		}

		// Handle name updates - merge with existing name if partial update
		if (body.name) {
			user.name = {
				...(user.name || {}),
				...(body.name || {}),
			};
			delete body.name; // Remove from body to avoid double assignment
		}

		// Handle country name and ISO code updates
		if (body.countryName !== undefined) {
			user.countryName = body.countryName;
			delete body.countryName;
		}
		if (body.countryISO !== undefined) {
			user.countryISO = body.countryISO
				? String(body.countryISO).trim().toUpperCase()
				: null;
			delete body.countryISO;
		}

		// Apply all other updates
		Object.assign(user, body);

		// Save the updated user
		const updateResponse = await user.save();

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
				error: 'Unable to update profile. Please check your information and try again.',
			},
		};
	} catch (error) {
		if (error.name === 'ValidationError') {
			const validationErrors = error.errors
				? Object.values(error.errors)
						.map(err => err.message)
						.join(', ')
				: 'Invalid profile information provided. Please check all fields and try again.';
			return {
				status: 400,
				entity: {
					success: false,
					error:
						validationErrors ||
						'Invalid profile information provided. Please check all fields and try again.',
				},
			};
		} else if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'Profile information conflicts with an existing account. Please use different information.',
				},
			};
		}
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to update profile. Please verify your information and try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
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
			if (!searchedUser) {
				return {
					status: 404,
					entity: {
						success: false,
						error: 'User account not found. Please verify the phone number and country code.',
					},
				};
			}
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
				status: 404,
				entity: {
					success: false,
					error: 'User account not found. Please verify the phone number and country code.',
				},
			};
		} else {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'You do not have permission to access this information.',
				},
			};
		}
	} catch (error) {
		const errorMessage =
			error?.message ||
			error?.error ||
			'Failed to retrieve user information. Please try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
			},
		};
	}
};

export const getMe = async userId => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User account not found.',
				},
			};
		}
		return {
			status: 200,
			entity: {
				success: true,
				user: user.view(true),
			},
		};
	} catch (error) {
		if (error.name === 'CastError') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid user ID format. Please verify your account information.',
				},
			};
		}
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to retrieve user information. Please try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
			},
		};
	}
};

export const getSelfImage = async user => {
	try {
		const S3_BUCKET = config.aws.s3BucketName;
		AWS.config.update(config.aws.config);
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
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to generate profile image URL. Please try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
			},
		};
	}
};

export const verifyReset = async body => {
	try {
		const { countryCode, phone } = body;
		const pattern = /^([0-9]){7,10}$/;
		if (!pattern.test(phone)) {
			throw 'Invalid phone number format. Please enter a valid phone number.';
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
			status: 404,
			entity: {
				success: false,
				error: 'Phone number not found. Please verify your phone number and country code.',
			},
		};
	} catch (error) {
		const errorMessage =
			typeof error === 'string'
				? error
				: error?.message ||
					error?.error ||
					'Unable to send password reset code. Please verify your phone number and try again.';
		return {
			status: 500,
			entity: {
				error: errorMessage,
			},
		};
	}
};

export const getSignedUrl = async (user, { fileType }) => {
	try {
		const S3_BUCKET = config.aws.s3BucketName;
		AWS.config.update(config.aws.config);
		const s3 = new AWS.S3();
		const normalizedFileType = (fileType || '').toLowerCase();
		const mimeTypeMap = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			bmp: 'image/bmp',
			svg: 'image/svg+xml',
			heic: 'image/heic',
			heif: 'image/heif',
			mp4: 'video/mp4',
			mov: 'video/quicktime',
			avi: 'video/x-msvideo',
			flv: 'video/x-flv',
			mkv: 'video/x-matroska',
			webm: 'video/webm',
		};
		const contentType = mimeTypeMap[normalizedFileType];
		if (!contentType) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Unsupported file format. Please upload an image (JPG, PNG, GIF, WebP, BMP, SVG, HEIC, HEIF) or video (MP4, MOV, AVI, FLV, MKV, WebM) file.`,
				},
			};
		}
		const randomKey = crypto.randomBytes(16).toString('hex');
		const fileName = `${user._id}_${randomKey}.${normalizedFileType}`;
		const s3Params = {
			Bucket: S3_BUCKET,
			Key: fileName,
			Expires: 60,
			ContentType: contentType,
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
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to generate file upload URL. Please try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
			},
		};
	}
};

export const getSignedUrlForDocument = async (
	user,
	{ fileType, documentType }
) => {
	try {
		const S3_BUCKET = config.aws.s3BucketName;
		AWS.config.update(config.aws.config);
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
		if (!fileType || !documentType) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'File type and document type are required. Please provide both parameters.',
				},
			};
		}
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to generate document upload URL. Please try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
			},
		};
	}
};
