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
import config from '../../../config';

const failedAttempts = {};

export const getAdminUserId = async () => {
	const admin = await User.findOne({
		role: 'ADMIN',
	});
	return admin.id;
};

export const list = async ({
	offset,
	key,
	limit,
	role,
	startDate,
	status,
	endDate,
	sortBy = 'createdAt',
}) => {
	try {
		let params = {};
		if (role) {
			params.role = role.toUpperCase();
		}
		if (startDate || endDate) {
			params['$and'] = [];
			if (startDate) {
				params['$and'].push({
					createdAt: {
						$gte: moment(parseInt(startDate)).toISOString(),
					},
				});
			}
			if (endDate) {
				params['$and'].push({
					createdAt: {
						$lte: moment(parseInt(endDate)).toISOString(),
					},
				});
			}
		}
		if (status) {
			params.isActive = status === 'ACTIVE' ? true : false;
		}
		if (key) {
			params['$or'] = [
				{
					'name.firstName': new RegExp(key, 'i'),
				},
				{
					'name.lastName': new RegExp(key, 'i'),
				},
				{
					phone: new RegExp(key, 'i'),
				},
				{
					userName: new RegExp(key, 'i'),
				},
			];
		}
		const users = await User.find(params)
			.limit(limit ? parseInt(limit) : 10)
			.skip(offset ? parseInt(offset) : 0)
			.sort({
				[sortBy]: 'desc',
			})
			.exec();
		const total = await User.count(params).exec();
		return {
			status: 200,
			entity: {
				success: true,
				users,
				total,
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
			refferalCode: refferalCode ? refferalCode.toLowerCase() : null,
		});

		if (user._id) {
			// Create wallet with zero balances (will be updated by transactions)
			const walletData = await Wallet.create({
				user: user._id,
				virtualBalance: 0,
				realBalance: 0,
			});

			// Add promotional virtual cash using makeTransaction
			await makeTransaction(
				user._id,
				user.role,
				'PROMOTIONAL_CREDIT',
				config.payoneerConfig.initialPromoAmount,
				null,
				null,
				null,
				'VIRTUAL'
			);

			// Handle referral bonus if applicable
			if (refferalCode) {
				const referralUser = await User.findOne({
					userName: refferalCode.toLowerCase(),
				});

				if (referralUser) {
					// Give bonus to referring user
					await makeTransaction(
						referralUser._id,
						referralUser.role,
						'REFER_BONUS',
						config.referralBonus,
						'USER',
						user._id,
						null,
						'VIRTUAL'
					);

					// Give bonus to new user
					await makeTransaction(
						user._id,
						user.role,
						'REFERRED_BONUS',
						config.referredBonus,
						'USER',
						referralUser._id,
						null,
						'VIRTUAL'
					);
				}
			}

			// Generate authentication tokens
			const refreshToken = generateToken(user._id.toString());
			const accessToken = jwtSign({ id: user._id.toString() });

			// Return success response
			return {
				status: 200,
				entity: {
					success: true,
					user: user.view(true),
					walletData,
					refreshToken,
					accessToken,
				},
			};
		}

		return {
			status: 500,
			entity: {
				success: false,
				error: 'Failed to create user account.',
			},
		};
	} catch (error) {
		console.log(error);

		if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 409,
				entity: {
					success: false,
					error: 'Phone number already registered.',
				},
			};
		} else if (error.name === 'ValidationError') {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid user data provided.',
				},
			};
		}

		return {
			status: 500,
			entity: {
				success: false,
				error: 'Internal server error during user creation.',
			},
		};
	}
};

export const verifyReset = async ({ countryCode, phone, dob }) => {
	try {
		const pattern = /^([0-9]){7,10}$/;
		if (!pattern.test(phone)) {
			throw 'Invalid phone number.';
		}
		const user = await User.findOne({
			countryCode: countryCode,
			phone: phone,
			dob: dob,
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
					success: true,
					verificationToken: response.entity.verificationToken,
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: 'Invalid phone number and/or date of birth.',
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

export const verifySecurePin = async (user, { securePin }) => {
	try {
		if (!user.isActive) {
			return {
				status: 403,
				entity: {
					success: false,
					error: `Your account has been blocked. Please contact MegaPay support.`,
				},
			};
		}
		const valid = await user.validatePin(securePin);
		if (valid) {
			if (failedAttempts[user._id.toString()]) {
				delete failedAttempts[user._id.toString()];
			}
			return {
				status: 200,
				entity: {
					success: true,
				},
			};
		}
		failedAttempts[user._id.toString()] = failedAttempts[
			user._id.toString()
		]
			? failedAttempts[user._id.toString()] + 1
			: 1;
		setTimeout(
			userId => {
				if (failedAttempts[userId]) {
					delete failedAttempts[userId];
				}
			},
			1000 * 60 * 5,
			user._id.toString()
		);
		if (failedAttempts[user._id.toString()] >= 3) {
			user.isActive = false;
			await user.save();
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
						: `Invalid secure pin. You have ${
								3 - failedAttempts[user._id.toString()]
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

export const addUser = async body => {
	try {
		body.slugName = `${body.name.firstName}${body.name.lastName}`;
		const user = await User.create(body);
		if (user._id) {
			let walletData = {
				user: user._id,
			};
			if (body.initialAmount) {
				walletData.totalBalance = parseFloat(body.initialAmount);
			}
			await Wallet.create(walletData);
			return {
				status: 200,
				entity: {
					success: true,
					user: user.view(true),
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

export const userData = async params => {
	try {
		const user = await User.findById(params.id);
		if (user._id) {
			const walletDataResponse = await getUserBalance({ _id: params.id });
			return {
				status: 200,
				entity: {
					success: true,
					user,
					walletData: walletDataResponse.entity.success
						? walletDataResponse.entity.walletData
						: {},
				},
			};
		}
		return {
			status: 500,
			entity: {
				success: false,
				error: 'Invalid user ID.',
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

export const getSignedUrl = async ({ _id }, { fileName }) => {
	try {
		AWS.config.update(config.aws.config);
		const date = new Date();
		const key = `${
			config.env
		}/${_id}/${date.getFullYear()}/${date.getMonth()}/${date.getDate()}/${fileName}`;
		const params = {
			Bucket: config.aws.s3BucketName,
			Key: key,
			Expires: parseInt(config.signedurlExpireTime),
			ACL: 'bucket-owner-full-control',
			// ContentType: "text/csv"
		};
		const s3 = new AWS.S3({
			signatureVersion: 'v4',
			region: 'us-east-2',
		});
		const preSignedURL = await s3.getSignedUrl('putObject', params);
		return {
			status: 200,
			entity: {
				success: true,
				preSignedURL,
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

export const getUserInfo = async ({ _id, role, countryCode }, body) => {
	try {
		console.log(_id, role, countryCode);
		// let { _id, role, countryCode } = user
		if (role === 'ADMIN' && body.countryCode) {
			countryCode = body.countryCode;
		}
		let criteria = {
			countryCode: countryCode,
			phone: body.phone,
			isActive: true,
		};
		if (role === 'USER' || role === 'AGENT') {
			criteria.role = 'USER';
		} else if (role === 'DEALER') {
			criteria.role = 'AGENT';
		}
		let user = null;
		if (role === 'ADMIN') {
			user = await User.findOne(criteria);
		} else {
			user = await User.findOne(criteria).select('name phone').exec();
		}
		if (user) {
			let walletData = null;
			if (role === 'ADMIN') {
				walletData = await Wallet.findOne({
					user: user._id,
				});
			}
			return {
				status: 200,
				entity: {
					success: true,
					user,
					walletData,
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

export const getSelfImage = async ({ _id }) => {
	try {
		const user = await User.findById(_id).select('picture');
		return {
			status: 200,
			entity: {
				success: true,
				user,
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

export const update = async (user, body) => {
	try {
		const updateResponse = await Object.assign(user, body).save();
		return {
			status: 200,
			entity: {
				success: true,
				user: updateResponse,
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

export const updateUser = async ({ id }, body) => {
	try {
		const user = await User.findById(id);
		if (user) {
			const updateResponse = await Object.assign(user, body).save();
			return {
				status: 200,
				entity: {
					success: true,
					user: updateResponse,
				},
			};
		}
		throw 'Invalid user details.';
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

export const getSignedUrlForDocument = async (
	{ _id },
	{ documentType, fileName }
) => {
	try {
		AWS.config.update(config.aws.config);
		if (!['idProof', 'addressProof'].includes(documentType)) {
			throw 'Invalid document type. Must be "idProof" or "addressProof".';
		}

		const date = new Date();
		const key = `${
			config.env
		}/${_id}/documents/${documentType}/${date.getFullYear()}/${date.getMonth()}/${date.getDate()}/${fileName}`;
		const params = {
			Bucket: config.aws.s3BucketName,
			Key: key,
			Expires: parseInt(config.signedurlExpireTime),
			ACL: 'private', // Documents should be private
		};
		const s3 = new AWS.S3({
			signatureVersion: 'v4',
			region: 'us-east-2',
		});
		const preSignedURL = await s3.getSignedUrl('putObject', params);

		// Update user's document status to PENDING
		const user = await User.findById(_id);
		if (!user) {
			throw 'User not found.';
		}
		user[documentType].documentUrl =
			`https://${config.aws.s3BucketName}.s3.amazonaws.com/${key}`;
		user[documentType].uploadDate = new Date();
		user[documentType].verificationStatus = 'PENDING';
		user[documentType].rejectionReason = null;
		await user.save();

		return {
			status: 200,
			entity: {
				success: true,
				preSignedURL,
				documentUrl: user[documentType].documentUrl,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					typeof error === 'string' ? error : error.errors || error,
			},
		};
	}
};

export const getSignedUrlForAdminView = async (
	{ role },
	{ userId, documentType }
) => {
	try {
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized. Only admins can view documents.',
				},
			};
		}

		AWS.config.update(config.aws.config);
		if (!['idProof', 'addressProof'].includes(documentType)) {
			throw 'Invalid document type. Must be "idProof" or "addressProof".';
		}

		const userToView = await User.findById(userId);
		if (!userToView || !userToView[documentType].documentUrl) {
			return {
				status: 404,
				entity: {
					success: false,
					error: `Document not found for user ${userId} and type ${documentType}.`,
				},
			};
		}

		// Extract key from the stored documentUrl
		const s3BucketName = config.aws.s3BucketName;
		const documentUrl = userToView[documentType].documentUrl;
		const key = documentUrl.substring(
			documentUrl.indexOf(s3BucketName) + s3BucketName.length + 1
		);

		const params = {
			Bucket: s3BucketName,
			Key: key,
			Expires: parseInt(config.signedurlExpireTime),
		};
		const s3 = new AWS.S3({
			signatureVersion: 'v4',
			region: 'us-east-2',
		});
		const preSignedURL = await s3.getSignedUrl('getObject', params);

		return {
			status: 200,
			entity: {
				success: true,
				preSignedURL,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					typeof error === 'string' ? error : error.errors || error,
			},
		};
	}
};

export const verifyDocument = async (
	{ role },
	{ userId, documentType, status, rejectionReason = null }
) => {
	try {
		if (role !== 'ADMIN') {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized. Only admins can verify documents.',
				},
			};
		}

		if (!['idProof', 'addressProof'].includes(documentType)) {
			throw 'Invalid document type. Must be "idProof" or "addressProof".';
		}

		if (!['VERIFIED', 'REJECTED'].includes(status)) {
			throw 'Invalid verification status. Must be "VERIFIED" or "REJECTED".';
		}

		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found.',
				},
			};
		}

		user[documentType].verificationStatus = status;
		user[documentType].rejectionReason =
			status === 'REJECTED' ? rejectionReason : null;
		await user.save();

		return {
			status: 200,
			entity: {
				success: true,
				user: user.view(true),
				message: `Document type ${documentType} for user ${userId} marked as ${status}.`,
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error:
					typeof error === 'string' ? error : error.errors || error,
			},
		};
	}
};
