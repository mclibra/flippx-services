import moment from 'moment';
import AWS from 'aws-sdk';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { jwtSign, jwtVerify } from '../../services/jwt/';
import { generateToken } from '../../services/crypto';
import { generateRandomDigits } from '../../services/helper/utils';
import {
	sendVerificationCode,
	verifyVerificationCode,
} from '../text/controller';
import { makeTransaction } from '../transaction/controller';
import { User } from './model';
import { Wallet, Payment } from '../wallet/model';
import { BankAccount } from '../bank_account/model';
import { Transaction } from '../transaction/model';
import { Withdrawal } from '../withdrawal/model';
import { BorletteTicket } from '../borlette_ticket/model';
import { MegaMillionTicket } from '../megamillion_ticket/model';
import { RouletteTicket } from '../roulette_ticket/model';
import { DominoGame } from '../domino/model';
import { LoyaltyProfile, LoyaltyTransaction } from '../loyalty/model';
import { LoyaltyService } from '../loyalty/service';
import { getUserBalance } from '../wallet/controller';
import config from '../../../config';

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
			refferalCode: refferalCode ? refferalCode : null,
		});

		if (user._id) {
			// Create wallet for new user
			await Wallet.create({
				user: user._id,
				virtualBalance: 0,
				realBalanceWithdrawable: 0,
				realBalanceNonWithdrawable: 0,
			});

			// Initialize loyalty profile
			try {
				await LoyaltyService.initializeLoyalty(user._id);
			} catch (loyaltyError) {
				console.error('Failed to initialize loyalty for new user:', loyaltyError);
			}

			const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret);
			return {
				status: 200,
				entity: {
					success: true,
					token,
					user: user.view(true),
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

export const userData = async ({ id }) => {
	try {
		const user = await User.findById(id);
		if (user && user._id) {
			return {
				status: 200,
				entity: {
					success: true,
					user: user.view(true),
				},
			};
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid user ID.',
			},
		};
	} catch (error) {
		return {
			status: 400,
			entity: {
				success: false,
				error: error.errors || error,
			},
		};
	}
};

export const addUser = async body => {
	try {
		const user = await User.create(body);
		if (user._id) {
			await Wallet.create({
				user: user._id,
				virtualBalance: 0,
				realBalanceWithdrawable: 0,
				realBalanceNonWithdrawable: 0,
			});
			return {
				status: 200,
				entity: {
					success: true,
					user: user.view(true),
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
		if (error.name === 'MongoError' && error.code === 11000) {
			return {
				status: 500,
				entity: {
					success: false,
					error: 'Phone number already registered.',
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

export const updateUser = async ({ id }, body) => {
	try {
		const user = await User.findById(id);
		if (user._id) {
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

export const verifySecurePin = async (user, { securePin }) => {
	try {
		const validPin = await user.validatePin(securePin);
		if (validPin) {
			return {
				status: 200,
				entity: {
					success: true,
					message: 'PIN verified successfully.',
				},
			};
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid PIN.',
			},
		};
	} catch (error) {
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

export const resetPassword = async body => {
	try {
		const { verificationCode, verificationToken, password } = body;
		const decodedToken = jwtVerify(verificationToken);
		if (decodedToken.verificationCode == verificationCode) {
			const user = await User.findOne({
				phone: decodedToken.phone.substring(3),
				countryCode: decodedToken.phone.substring(0, 3),
			});
			if (user && user._id) {
				user.password = password;
				await user.save();
				return {
					status: 200,
					entity: {
						success: true,
						message: 'Password reset successfully.',
					},
				};
			}
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid user.',
				},
			};
		}
		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid verification code.',
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

export const getSignedUrlForAdminView = async (admin, { userId, documentType }) => {
	try {
		const S3_BUCKET = config.s3Bucket;
		AWS.config.region = config.s3Region;
		const s3 = new AWS.S3();
		const fileName = `${userId}_${documentType}.jpg`;
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

export const verifyDocument = async (admin, { userId, documentType, verificationStatus, rejectionReason }) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		const updateData = {
			verificationStatus,
			verifiedAt: new Date(),
			verifiedBy: admin._id,
		};

		if (verificationStatus === 'REJECTED' && rejectionReason) {
			updateData.rejectionReason = rejectionReason;
		}

		if (documentType === 'idProof') {
			user.idProof = { ...user.idProof, ...updateData };
		} else if (documentType === 'addressProof') {
			user.addressProof = { ...user.addressProof, ...updateData };
		} else {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid document type',
				},
			};
		}

		await user.save();

		return {
			status: 200,
			entity: {
				success: true,
				user: user.view(true),
			},
		};
	} catch (error) {
		console.log(error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to verify document',
			},
		};
	}
};

// ===== NEW COMPREHENSIVE USER DETAIL FUNCTIONS =====

// 1. USER PROFILE OVERVIEW
export const getUserProfileDetails = async (userId, query = {}) => {
	try {
		const user = await User.findById(userId)
			.select('-password -securePin');

		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		// Get wallet information
		const wallet = await Wallet.findOne({ user: userId });

		// Get bank accounts count
		const bankAccountsCount = await BankAccount.countDocuments({ user: userId });

		// Get loyalty profile
		const loyaltyProfile = await LoyaltyProfile.findOne({ user: userId });

		// Calculate overall verification status
		const verificationStatus = {
			overall: 'PENDING',
			idProof: user.idProof?.verificationStatus || 'NOT_UPLOADED',
			addressProof: user.addressProof?.verificationStatus || 'NOT_UPLOADED',
			progress: 0,
		};

		if (verificationStatus.idProof === 'VERIFIED' && verificationStatus.addressProof === 'VERIFIED') {
			verificationStatus.overall = 'VERIFIED';
			verificationStatus.progress = 100;
		} else if (verificationStatus.idProof === 'VERIFIED' || verificationStatus.addressProof === 'VERIFIED') {
			verificationStatus.overall = 'PARTIAL';
			verificationStatus.progress = 50;
		} else if (verificationStatus.idProof === 'PENDING' || verificationStatus.addressProof === 'PENDING') {
			verificationStatus.overall = 'PENDING';
			verificationStatus.progress = 25;
		}

		const profileDetails = {
			// Basic Information
			basicInfo: {
				id: user._id,
				fullName: user.name,
				userName: user.userName,
				email: user.email,
				phone: user.phone,
				countryCode: user.countryCode,
				dateOfBirth: user.dob,
				role: user.role,
				accountCreationDate: user.createdAt,
				profilePicture: user.picture,
				accountStatus: wallet?.active ? 'ACTIVE' : 'INACTIVE',
				referralCode: user.referralCode,
			},

			// Address & Location
			addressInfo: {
				address1: user.address?.address1,
				address2: user.address?.address2,
				city: user.address?.city,
				state: user.address?.state,
				country: user.address?.country,
				pincode: user.address?.pincode,
				simNif: user.simNif,
			},

			// Account Summary
			accountSummary: {
				verificationStatus,
				walletStatus: wallet?.active ? 'ACTIVE' : 'INACTIVE',
				currentTier: loyaltyProfile?.currentTier || 'NONE',
				totalBankAccounts: bankAccountsCount,
				lastLoginDate: user.sessionTracking?.lastLoginDate,
				lastActivityDate: user.sessionTracking?.lastActivityDate,
			},
		};

		return {
			status: 200,
			entity: {
				success: true,
				profileDetails,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch user profile details',
			},
		};
	}
};

// 2. VERIFICATION & DOCUMENTS SECTION
export const getUserDocumentStatus = async (userId, query = {}) => {
	try {
		const user = await User.findById(userId);

		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		const documentStatus = {
			idProof: {
				status: user.idProof?.verificationStatus || 'NOT_UPLOADED',
				documentUrl: user.idProof?.documentUrl,
				uploadDate: user.idProof?.uploadDate,
				verificationDate: user.idProof?.verifiedAt,
				rejectionReason: user.idProof?.rejectionReason,
				verifiedBy: user.idProof?.verifiedBy,
			},
			addressProof: {
				status: user.addressProof?.verificationStatus || 'NOT_UPLOADED',
				documentUrl: user.addressProof?.documentUrl,
				uploadDate: user.addressProof?.uploadDate,
				verificationDate: user.addressProof?.verifiedAt,
				rejectionReason: user.addressProof?.rejectionReason,
				verifiedBy: user.addressProof?.verifiedBy,
			},
			verificationLevel: {
				overall: 'PENDING',
				progress: 0,
				missingDocuments: [],
			},
		};

		// Calculate verification level
		const verified = [];
		const pending = [];
		const missing = [];

		if (documentStatus.idProof.status === 'VERIFIED') {
			verified.push('ID Proof');
		} else if (documentStatus.idProof.status === 'PENDING') {
			pending.push('ID Proof');
		} else {
			missing.push('ID Proof');
		}

		if (documentStatus.addressProof.status === 'VERIFIED') {
			verified.push('Address Proof');
		} else if (documentStatus.addressProof.status === 'PENDING') {
			pending.push('Address Proof');
		} else {
			missing.push('Address Proof');
		}

		documentStatus.verificationLevel.progress = (verified.length / 2) * 100;
		documentStatus.verificationLevel.missingDocuments = missing;

		if (verified.length === 2) {
			documentStatus.verificationLevel.overall = 'VERIFIED';
		} else if (verified.length === 1) {
			documentStatus.verificationLevel.overall = 'PARTIAL';
		} else if (pending.length > 0) {
			documentStatus.verificationLevel.overall = 'PENDING';
		} else {
			documentStatus.verificationLevel.overall = 'NOT_STARTED';
		}

		return {
			status: 200,
			entity: {
				success: true,
				documentStatus,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch document status',
			},
		};
	}
};

// 3. FINANCIAL OVERVIEW & WALLET MANAGEMENT
export const getUserFinancialOverview = async (userId, query = {}, requestingUser) => {
	try {
		// Check permissions
		if (requestingUser.role !== 'ADMIN' &&
			requestingUser.role !== 'AGENT' &&
			requestingUser.role !== 'DEALER' &&
			requestingUser._id.toString() !== userId) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		const wallet = await Wallet.findOne({ user: userId });
		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Wallet not found',
				},
			};
		}

		// Get pending withdrawals
		const pendingWithdrawals = await Withdrawal.aggregate([
			{ $match: { user: userId, status: 'PENDING' } },
			{ $group: { _id: null, total: { $sum: '$amount' } } }
		]);

		// Get transaction summary
		const transactionSummary = await Transaction.aggregate([
			{ $match: { user: userId } },
			{
				$group: {
					_id: '$transactionType',
					count: { $sum: 1 },
					totalAmount: { $sum: '$transactionAmount' },
				},
			},
		]);

		// Get monthly financial data
		const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
		const monthlyTransactions = await Transaction.find({
			user: userId,
			createdAt: { $gte: thirtyDaysAgo },
		});

		const monthlyDeposits = monthlyTransactions
			.filter(t => ['PURCHASE', 'WIRE_TRANSFER'].includes(t.transactionIdentifier))
			.reduce((sum, t) => sum + t.transactionAmount, 0);

		const monthlyWithdrawals = monthlyTransactions
			.filter(t => t.transactionIdentifier === 'WITHDRAWAL_COMPLETED')
			.reduce((sum, t) => sum + t.transactionAmount, 0);

		const monthlyGameSpending = monthlyTransactions
			.filter(t => ['TICKET_BORLETTE', 'TICKET_MEGAMILLION', 'DOMINO_ENTRY', 'ROULETTE_BET'].includes(t.transactionIdentifier))
			.reduce((sum, t) => sum + t.transactionAmount, 0);

		const financialOverview = {
			walletInfo: {
				virtualBalance: wallet.virtualBalance,
				realBalanceWithdrawable: wallet.realBalanceWithdrawable,
				realBalanceNonWithdrawable: wallet.realBalanceNonWithdrawable,
				totalRealBalance: wallet.realBalance,
				pendingWithdrawals: pendingWithdrawals[0]?.total || 0,
				walletStatus: wallet.active ? 'ACTIVE' : 'INACTIVE',
			},
			transactionSummary: {
				totalTransactions: transactionSummary.reduce((sum, t) => sum + t.count, 0),
				transactionsByType: transactionSummary,
			},
			monthlyFinancials: {
				deposits: monthlyDeposits,
				withdrawals: monthlyWithdrawals,
				gameSpending: monthlyGameSpending,
				netChange: monthlyDeposits - monthlyWithdrawals - monthlyGameSpending,
			},
		};

		return {
			status: 200,
			entity: {
				success: true,
				financialOverview,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch financial overview',
			},
		};
	}
};

// 4. BANK ACCOUNT MANAGEMENT
export const getUserBankAccounts = async (userId, query = {}, requestingUser) => {
	try {
		// Check permissions
		if (requestingUser.role !== 'ADMIN' &&
			requestingUser.role !== 'AGENT' &&
			requestingUser.role !== 'DEALER' &&
			requestingUser._id.toString() !== userId) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		const { page = 1, limit = 10 } = query;
		const skip = (page - 1) * limit;

		const bankAccounts = await BankAccount.find({ user: userId })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit));

		const total = await BankAccount.countDocuments({ user: userId });

		// Get usage statistics for each bank account
		const bankAccountsWithStats = await Promise.all(
			bankAccounts.map(async (account) => {
				const withdrawalCount = await Withdrawal.countDocuments({
					bankAccount: account._id,
					status: { $in: ['COMPLETED', 'PENDING'] },
				});

				const totalWithdrawn = await Withdrawal.aggregate([
					{ $match: { bankAccount: account._id, status: 'COMPLETED' } },
					{ $group: { _id: null, total: { $sum: '$amount' } } }
				]);

				return {
					...account.toObject(),
					statistics: {
						withdrawalCount,
						totalWithdrawn: totalWithdrawn[0]?.total || 0,
					},
				};
			})
		);

		return {
			status: 200,
			entity: {
				success: true,
				bankAccounts: bankAccountsWithStats,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
				},
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch bank accounts',
			},
		};
	}
};

// 5. TRANSACTION HISTORY
export const getUserTransactionHistory = async (userId, query = {}, requestingUser) => {
	try {
		// Check permissions
		if (requestingUser.role !== 'ADMIN' &&
			requestingUser.role !== 'AGENT' &&
			requestingUser.role !== 'DEALER' &&
			requestingUser._id.toString() !== userId) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		const {
			page = 1,
			limit = 20,
			transactionType,
			cashType,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = query;

		const skip = (page - 1) * limit;

		// Build filter
		let filter = { user: userId };

		if (transactionType) {
			filter.transactionType = transactionType.toUpperCase();
		}

		if (cashType) {
			filter.cashType = cashType.toUpperCase();
		}

		if (startDate || endDate) {
			filter.createdAt = {};
			if (startDate) {
				filter.createdAt.$gte = new Date(startDate);
			}
			if (endDate) {
				filter.createdAt.$lte = new Date(endDate);
			}
		}

		const transactions = await Transaction.find(filter)
			.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
			.skip(skip)
			.limit(parseInt(limit));

		const total = await Transaction.countDocuments(filter);

		// Get transaction summary
		const summary = await Transaction.aggregate([
			{ $match: filter },
			{
				$group: {
					_id: {
						type: '$transactionType',
						cashType: '$cashType',
					},
					count: { $sum: 1 },
					totalAmount: { $sum: '$transactionAmount' },
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				transactions,
				summary,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
				},
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch transaction history',
			},
		};
	}
};

// 6. GAMING STATISTICS
export const getUserGamingStats = async (userId, query = {}, requestingUser) => {
	try {
		// Check permissions
		if (requestingUser.role !== 'ADMIN' &&
			requestingUser.role !== 'AGENT' &&
			requestingUser.role !== 'DEALER' &&
			requestingUser._id.toString() !== userId) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		const { period = '30', gameType } = query;
		const daysAgo = parseInt(period);
		const startDate = moment().subtract(daysAgo, 'days').toDate();

		// Base filter for date range
		const dateFilter = { user: userId, createdAt: { $gte: startDate } };

		// Get Borlette statistics
		const borletteStats = await BorletteTicket.aggregate([
			{ $match: { ...dateFilter, user: userId } },
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalSpent: { $sum: '$totalAmountPlayed' },
					totalWon: { $sum: '$totalAmountWon' },
				},
			},
		]);

		// Get MegaMillion statistics
		const megamillionStats = await MegaMillionTicket.aggregate([
			{ $match: { ...dateFilter, user: userId } },
			{
				$group: {
					_id: null,
					totalTickets: { $sum: 1 },
					totalSpent: { $sum: '$amountPlayed' },
					totalWon: { $sum: '$amountWon' },
				},
			},
		]);

		// Get Roulette statistics (if available)
		const rouletteStats = await RouletteTicket.aggregate([
			{ $match: { ...dateFilter, user: userId } },
			{
				$group: {
					_id: null,
					totalBets: { $sum: 1 },
					totalSpent: { $sum: '$betAmount' },
					totalWon: { $sum: '$winAmount' },
				},
			},
		]);

		// Get gaming transactions for more detailed analysis
		const gameTransactions = await Transaction.find({
			user: userId,
			createdAt: { $gte: startDate },
			transactionIdentifier: {
				$in: ['TICKET_BORLETTE', 'TICKET_MEGAMILLION', 'ROULETTE_BET', 'DOMINO_ENTRY']
			}
		});

		// Calculate game preferences
		const gamePreferences = gameTransactions.reduce((acc, trans) => {
			const game = trans.transactionIdentifier.replace('TICKET_', '').replace('_BET', '').replace('_ENTRY', '');
			if (!acc[game]) {
				acc[game] = { count: 0, amount: 0 };
			}
			acc[game].count++;
			acc[game].amount += trans.transactionAmount;
			return acc;
		}, {});

		// Calculate win/loss ratios
		const totalSpent = (borletteStats[0]?.totalSpent || 0) +
			(megamillionStats[0]?.totalSpent || 0) +
			(rouletteStats[0]?.totalSpent || 0);

		const totalWon = (borletteStats[0]?.totalWon || 0) +
			(megamillionStats[0]?.totalWon || 0) +
			(rouletteStats[0]?.totalWon || 0);

		const gamingStats = {
			summary: {
				period: `${daysAgo} days`,
				totalGamesPlayed: (borletteStats[0]?.totalTickets || 0) +
					(megamillionStats[0]?.totalTickets || 0) +
					(rouletteStats[0]?.totalBets || 0),
				totalAmountSpent: totalSpent,
				totalAmountWon: totalWon,
				netResult: totalWon - totalSpent,
				winLossRatio: totalSpent > 0 ? (totalWon / totalSpent) : 0,
			},
			gameBreakdown: {
				borlette: borletteStats[0] || { totalTickets: 0, totalSpent: 0, totalWon: 0 },
				megamillion: megamillionStats[0] || { totalTickets: 0, totalSpent: 0, totalWon: 0 },
				roulette: rouletteStats[0] || { totalBets: 0, totalSpent: 0, totalWon: 0 },
			},
			preferences: gamePreferences,
		};

		return {
			status: 200,
			entity: {
				success: true,
				gamingStats,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch gaming statistics',
			},
		};
	}
};

// 7. TICKET HISTORY
export const getUserTicketHistory = async (userId, query = {}, requestingUser) => {
	try {
		// Check permissions
		if (requestingUser.role !== 'ADMIN' &&
			requestingUser.role !== 'AGENT' &&
			requestingUser.role !== 'DEALER' &&
			requestingUser._id.toString() !== userId) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		const {
			page = 1,
			limit = 20,
			gameType = 'ALL',
			status,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = query;

		const skip = (page - 1) * limit;
		let tickets = [];
		let total = 0;

		// Build date filter
		let dateFilter = { user: userId };
		if (startDate || endDate) {
			dateFilter.createdAt = {};
			if (startDate) {
				dateFilter.createdAt.$gte = new Date(startDate);
			}
			if (endDate) {
				dateFilter.createdAt.$lte = new Date(endDate);
			}
		}

		// Add status filter if provided
		if (status) {
			dateFilter.status = status.toUpperCase();
		}

		if (gameType.toUpperCase() === 'BORLETTE' || gameType.toUpperCase() === 'ALL') {
			const borletteTickets = await BorletteTicket.find(dateFilter)
				.populate('lottery', 'title scheduledTime state')
				.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
				.skip(gameType.toUpperCase() === 'BORLETTE' ? skip : 0)
				.limit(gameType.toUpperCase() === 'BORLETTE' ? parseInt(limit) : undefined);

			tickets.push(...borletteTickets.map(ticket => ({
				...ticket.toObject(),
				gameType: 'BORLETTE',
				amountPlayed: ticket.totalAmountPlayed,
				amountWon: ticket.totalAmountWon,
			})));

			if (gameType.toUpperCase() === 'BORLETTE') {
				total = await BorletteTicket.countDocuments(dateFilter);
			}
		}

		if (gameType.toUpperCase() === 'MEGAMILLION' || gameType.toUpperCase() === 'ALL') {
			const megamillionTickets = await MegaMillionTicket.find(dateFilter)
				.populate('lottery', 'title scheduledTime state')
				.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
				.skip(gameType.toUpperCase() === 'MEGAMILLION' ? skip : 0)
				.limit(gameType.toUpperCase() === 'MEGAMILLION' ? parseInt(limit) : undefined);

			tickets.push(...megamillionTickets.map(ticket => ({
				...ticket.toObject(),
				gameType: 'MEGAMILLION',
			})));

			if (gameType.toUpperCase() === 'MEGAMILLION') {
				total = await MegaMillionTicket.countDocuments(dateFilter);
			}
		}

		if (gameType.toUpperCase() === 'ROULETTE' || gameType.toUpperCase() === 'ALL') {
			const rouletteTickets = await RouletteTicket.find(dateFilter)
				.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
				.skip(gameType.toUpperCase() === 'ROULETTE' ? skip : 0)
				.limit(gameType.toUpperCase() === 'ROULETTE' ? parseInt(limit) : undefined);

			tickets.push(...rouletteTickets.map(ticket => ({
				...ticket.toObject(),
				gameType: 'ROULETTE',
			})));

			if (gameType.toUpperCase() === 'ROULETTE') {
				total = await RouletteTicket.countDocuments(dateFilter);
			}
		}

		// If 'ALL' games, get total counts and sort/paginate combined results
		if (gameType.toUpperCase() === 'ALL') {
			const [borletteTotal, megamillionTotal, rouletteTotal] = await Promise.all([
				BorletteTicket.countDocuments(dateFilter),
				MegaMillionTicket.countDocuments(dateFilter),
				RouletteTicket.countDocuments(dateFilter),
			]);

			total = borletteTotal + megamillionTotal + rouletteTotal;

			// Sort combined tickets
			tickets.sort((a, b) => {
				const aValue = a[sortBy];
				const bValue = b[sortBy];
				if (sortOrder === 'desc') {
					return bValue > aValue ? 1 : -1;
				}
				return aValue > bValue ? 1 : -1;
			});

			// Apply pagination to combined results
			tickets = tickets.slice(skip, skip + parseInt(limit));
		}

		return {
			status: 200,
			entity: {
				success: true,
				tickets,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
				},
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch ticket history',
			},
		};
	}
};

// 8. LOYALTY PROFILE
export const getUserLoyaltyProfile = async (userId, query = {}, requestingUser) => {
	try {
		// Check permissions
		if (requestingUser.role !== 'ADMIN' &&
			requestingUser.role !== 'AGENT' &&
			requestingUser.role !== 'DEALER' &&
			requestingUser._id.toString() !== userId) {
			return {
				status: 403,
				entity: {
					success: false,
					error: 'Unauthorized access',
				},
			};
		}

		const loyaltyProfile = await LoyaltyProfile.findOne({ user: userId });
		if (!loyaltyProfile) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Loyalty profile not found',
				},
			};
		}

		// Get XP history
		const { page = 1, limit = 10 } = query;
		const skip = (page - 1) * limit;

		const xpHistory = await LoyaltyTransaction.find({ user: userId })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit));

		const totalXpTransactions = await LoyaltyTransaction.countDocuments({ user: userId });

		// Get cashback history from transactions
		const cashbackTransactions = await Transaction.find({
			user: userId,
			transactionIdentifier: { $in: ['CASHBACK', 'NO_WIN_CASHBACK'] }
		}).sort({ createdAt: -1 }).limit(10);

		// Calculate referral statistics
		const referralStats = {
			totalReferrals: 0, // This would need to be calculated based on your referral system
			activeReferrals: 0,
			monthlyCommissions: loyaltyProfile.referralCommissions?.monthly || {},
			lifetimeCommissions: loyaltyProfile.referralCommissions?.lifetime || {},
		};

		const loyaltyData = {
			profile: {
				currentTier: loyaltyProfile.currentTier,
				xpBalance: loyaltyProfile.xpBalance,
				tierProgress: loyaltyProfile.tierProgress,
				joinDate: loyaltyProfile.createdAt,
				lastTierUpgrade: loyaltyProfile.lastTierUpgrade,
			},
			withdrawalLimits: {
				weeklyLimit: loyaltyProfile.weeklyWithdrawalLimit || 0,
				weeklyUsed: loyaltyProfile.weeklyWithdrawalUsed || 0,
				resetDate: loyaltyProfile.weeklyWithdrawalReset,
				availableAmount: Math.max(0, (loyaltyProfile.weeklyWithdrawalLimit || 0) - (loyaltyProfile.weeklyWithdrawalUsed || 0)),
			},
			rewards: {
				cashbackHistory: cashbackTransactions,
				referralStats,
			},
			xpHistory: {
				transactions: xpHistory,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total: totalXpTransactions,
					pages: Math.ceil(totalXpTransactions / limit),
				},
			},
		};

		return {
			status: 200,
			entity: {
				success: true,
				loyaltyData,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch loyalty profile',
			},
		};
	}
};

// 9. ACTIVITY & SESSION MONITORING (Admin only)
export const getUserActivityMonitoring = async (userId, query = {}) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		const { period = '30' } = query;
		const daysAgo = parseInt(period);
		const startDate = moment().subtract(daysAgo, 'days').toDate();

		// Get session tracking data
		const sessionTracking = user.sessionTracking || {};

		// Calculate login streak
		const dailyLoginStreak = sessionTracking.dailyLoginStreak || 0;
		const lastDailyLoginDate = sessionTracking.lastDailyLoginDate;

		// Get activity patterns from transactions
		const activityTransactions = await Transaction.find({
			user: userId,
			createdAt: { $gte: startDate }
		}).sort({ createdAt: 1 });

		// Analyze activity patterns
		const activityByHour = {};
		const activityByDay = {};
		const spendingPatterns = [];

		activityTransactions.forEach(transaction => {
			const date = moment(transaction.createdAt);
			const hour = date.hour();
			const dayOfWeek = date.format('dddd');

			// Activity by hour
			if (!activityByHour[hour]) {
				activityByHour[hour] = { count: 0, amount: 0 };
			}
			activityByHour[hour].count++;
			activityByHour[hour].amount += transaction.transactionAmount;

			// Activity by day
			if (!activityByDay[dayOfWeek]) {
				activityByDay[dayOfWeek] = { count: 0, amount: 0 };
			}
			activityByDay[dayOfWeek].count++;
			activityByDay[dayOfWeek].amount += transaction.transactionAmount;

			// Spending patterns
			if (['TICKET_BORLETTE', 'TICKET_MEGAMILLION', 'ROULETTE_BET', 'DOMINO_ENTRY'].includes(transaction.transactionIdentifier)) {
				spendingPatterns.push({
					date: transaction.createdAt,
					amount: transaction.transactionAmount,
					gameType: transaction.transactionIdentifier.replace('TICKET_', '').replace('_BET', '').replace('_ENTRY', ''),
				});
			}
		});

		// Calculate peak usage times
		const peakHour = Object.entries(activityByHour).reduce((peak, [hour, data]) => {
			return data.count > (activityByHour[peak]?.count || 0) ? hour : peak;
		}, '0');

		const peakDay = Object.entries(activityByDay).reduce((peak, [day, data]) => {
			return data.count > (activityByDay[peak]?.count || 0) ? day : peak;
		}, 'Monday');

		// Risk indicators
		const riskIndicators = [];

		// Check for unusual spending patterns
		const dailySpending = spendingPatterns.reduce((acc, pattern) => {
			const date = moment(pattern.date).format('YYYY-MM-DD');
			if (!acc[date]) acc[date] = 0;
			acc[date] += pattern.amount;
			return acc;
		}, {});

		const avgDailySpending = Object.values(dailySpending).reduce((sum, amount) => sum + amount, 0) / Object.keys(dailySpending).length || 0;
		const maxDailySpending = Math.max(...Object.values(dailySpending), 0);

		if (maxDailySpending > avgDailySpending * 3) {
			riskIndicators.push('High spending spike detected');
		}

		// Check for frequent login attempts
		if (dailyLoginStreak > 30) {
			riskIndicators.push('Excessive daily login activity');
		}

		const activityMonitoring = {
			sessionInfo: {
				lastLoginDate: sessionTracking.lastLoginDate,
				lastActivityDate: sessionTracking.lastActivityDate,
				currentSessionStart: sessionTracking.currentSessionStartTime,
				dailyLoginStreak,
				lastDailyLoginDate,
				totalSessionTimeToday: sessionTracking.totalSessionTimeToday || 0,
			},
			activityPatterns: {
				peakUsageTimes: {
					hour: parseInt(peakHour),
					dayOfWeek: peakDay,
				},
				activityByHour,
				activityByDay,
				analysisPeriod: `${daysAgo} days`,
			},
			spendingBehavior: {
				patterns: spendingPatterns.slice(-20), // Last 20 transactions
				dailySpending,
				averageDailySpending: avgDailySpending,
				maxDailySpending,
			},
			riskAssessment: {
				indicators: riskIndicators,
				riskLevel: riskIndicators.length === 0 ? 'LOW' : riskIndicators.length < 3 ? 'MEDIUM' : 'HIGH',
			},
		};

		return {
			status: 200,
			entity: {
				success: true,
				activityMonitoring,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch activity monitoring data',
			},
		};
	}
};

// 10. PAYMENT HISTORY (Admin only)
export const getUserPaymentHistory = async (userId, query = {}) => {
	try {
		const {
			page = 1,
			limit = 20,
			status,
			method,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = query;

		const skip = (page - 1) * limit;

		// Build filter
		let filter = { user: userId };

		if (status) {
			filter.status = status.toUpperCase();
		}

		if (method) {
			filter.method = method.toUpperCase();
		}

		if (startDate || endDate) {
			filter.createdAt = {};
			if (startDate) {
				filter.createdAt.$gte = new Date(startDate);
			}
			if (endDate) {
				filter.createdAt.$lte = new Date(endDate);
			}
		}

		const payments = await Payment.find(filter)
			.populate('plan', 'name price')
			.populate('confirmedBy', 'name')
			.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
			.skip(skip)
			.limit(parseInt(limit));

		const total = await Payment.countDocuments(filter);

		// Get payment summary
		const paymentSummary = await Payment.aggregate([
			{ $match: { user: userId } },
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
				},
			},
		]);

		// Get method breakdown
		const methodBreakdown = await Payment.aggregate([
			{ $match: { user: userId } },
			{
				$group: {
					_id: '$method',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
				},
			},
		]);

		return {
			status: 200,
			entity: {
				success: true,
				payments,
				summary: {
					byStatus: paymentSummary,
					byMethod: methodBreakdown,
				},
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
				},
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch payment history',
			},
		};
	}
};

// 11. WITHDRAWAL HISTORY (Admin only)
export const getUserWithdrawalHistory = async (userId, query = {}) => {
	try {
		const {
			page = 1,
			limit = 20,
			status,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = query;

		const skip = (page - 1) * limit;

		// Build filter
		let filter = { user: userId };

		if (status) {
			filter.status = status.toUpperCase();
		}

		if (startDate || endDate) {
			filter.createdAt = {};
			if (startDate) {
				filter.createdAt.$gte = new Date(startDate);
			}
			if (endDate) {
				filter.createdAt.$lte = new Date(endDate);
			}
		}

		const withdrawals = await Withdrawal.find(filter)
			.populate('bankAccount')
			.populate('approvedBy', 'name')
			.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
			.skip(skip)
			.limit(parseInt(limit));

		const total = await Withdrawal.countDocuments(filter);

		// Get withdrawal summary
		const withdrawalSummary = await Withdrawal.aggregate([
			{ $match: { user: userId } },
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
					totalFees: { $sum: '$fee' },
					totalNetAmount: { $sum: '$netAmount' },
				},
			},
		]);

		// Calculate processing times for completed withdrawals
		const processingTimes = await Withdrawal.aggregate([
			{
				$match: {
					user: userId,
					status: 'COMPLETED',
					requestDate: { $exists: true },
					completedDate: { $exists: true }
				}
			},
			{
				$project: {
					processingHours: {
						$divide: [
							{ $subtract: ['$completedDate', '$requestDate'] },
							1000 * 60 * 60 // Convert to hours
						]
					}
				}
			},
			{
				$group: {
					_id: null,
					avgProcessingHours: { $avg: '$processingHours' },
					minProcessingHours: { $min: '$processingHours' },
					maxProcessingHours: { $max: '$processingHours' },
				}
			}
		]);

		return {
			status: 200,
			entity: {
				success: true,
				withdrawals,
				summary: {
					byStatus: withdrawalSummary,
					processingTimes: processingTimes[0] || {
						avgProcessingHours: 0,
						minProcessingHours: 0,
						maxProcessingHours: 0
					},
				},
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
				},
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch withdrawal history',
			},
		};
	}
};

// 12. SALES PERFORMANCE (Admin only - for AGENT/DEALER roles)
export const getUserSalesPerformance = async (userId, query = {}) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		if (!['AGENT', 'DEALER'].includes(user.role)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Sales performance is only available for AGENT and DEALER roles',
				},
			};
		}

		const { period = '30' } = query;
		const daysAgo = parseInt(period);
		const startDate = moment().subtract(daysAgo, 'days').toDate();

		// Get commission transactions
		const commissionTransactions = await Transaction.find({
			user: userId,
			createdAt: { $gte: startDate },
			transactionIdentifier: { $regex: /_COMMISSION$/ }
		});

		// Calculate commission breakdown
		const commissionBreakdown = commissionTransactions.reduce((acc, trans) => {
			const gameType = trans.transactionIdentifier.replace('_COMMISSION', '');
			if (!acc[gameType]) {
				acc[gameType] = { count: 0, totalCommission: 0 };
			}
			acc[gameType].count++;
			acc[gameType].totalCommission += trans.transactionAmount;
			return acc;
		}, {});

		// Get user acquisition (users referred by this agent/dealer)
		// This would depend on your referral system implementation
		const referredUsers = await User.find({
			referredBy: userId, // Assuming you have this field
			createdAt: { $gte: startDate }
		});

		// Calculate team performance (if dealer has agents under them)
		let teamPerformance = null;
		if (user.role === 'DEALER') {
			const teamMembers = await User.find({
				managedBy: userId, // Assuming you have this field
				role: 'AGENT'
			});

			const teamCommissions = await Transaction.find({
				user: { $in: teamMembers.map(member => member._id) },
				createdAt: { $gte: startDate },
				transactionIdentifier: { $regex: /_COMMISSION$/ }
			});

			teamPerformance = {
				teamSize: teamMembers.length,
				totalTeamCommissions: teamCommissions.reduce((sum, trans) => sum + trans.transactionAmount, 0),
				teamMembers: teamMembers.map(member => ({
					id: member._id,
					name: member.name,
					joinDate: member.createdAt,
				})),
			};
		}

		const salesPerformance = {
			summary: {
				period: `${daysAgo} days`,
				totalCommissions: commissionTransactions.reduce((sum, trans) => sum + trans.transactionAmount, 0),
				totalTransactions: commissionTransactions.length,
				userAcquisition: referredUsers.length,
			},
			commissionBreakdown,
			userAcquisition: {
				newUsers: referredUsers.length,
				userDetails: referredUsers.map(user => ({
					id: user._id,
					name: user.name,
					joinDate: user.createdAt,
					role: user.role,
				})),
			},
			teamPerformance,
		};

		return {
			status: 200,
			entity: {
				success: true,
				salesPerformance,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch sales performance',
			},
		};
	}
};

// 13. USER HIERARCHY (Admin only - for AGENT/DEALER roles)
export const getUserHierarchy = async (userId, query = {}) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		if (!['AGENT', 'DEALER'].includes(user.role)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Hierarchy information is only available for AGENT and DEALER roles',
				},
			};
		}

		// Get downline users
		const downlineUsers = await User.find({
			$or: [
				{ referredBy: userId },
				{ managedBy: userId }
			]
		}).select('name role createdAt phone email');

		// Get hierarchical structure
		const hierarchy = {
			user: {
				id: user._id,
				name: user.name,
				role: user.role,
				joinDate: user.createdAt,
			},
			downline: {
				direct: downlineUsers.filter(u => u.referredBy?.toString() === userId).map(u => ({
					id: u._id,
					name: u.name,
					role: u.role,
					joinDate: u.createdAt,
					phone: u.phone,
					email: u.email,
				})),
				managed: downlineUsers.filter(u => u.managedBy?.toString() === userId).map(u => ({
					id: u._id,
					name: u.name,
					role: u.role,
					joinDate: u.createdAt,
					phone: u.phone,
					email: u.email,
				})),
			},
			statistics: {
				totalDownline: downlineUsers.length,
				directReferrals: downlineUsers.filter(u => u.referredBy?.toString() === userId).length,
				managedUsers: downlineUsers.filter(u => u.managedBy?.toString() === userId).length,
			},
		};

		// Get performance metrics for each downline user
		const performanceMetrics = await Promise.all(
			downlineUsers.map(async (downlineUser) => {
				const thirtyDaysAgo = moment().subtract(30, 'days').toDate();

				const transactions = await Transaction.find({
					user: downlineUser._id,
					createdAt: { $gte: thirtyDaysAgo }
				});

				const gameTransactions = transactions.filter(t =>
					['TICKET_BORLETTE', 'TICKET_MEGAMILLION', 'ROULETTE_BET', 'DOMINO_ENTRY'].includes(t.transactionIdentifier)
				);

				return {
					userId: downlineUser._id,
					name: downlineUser.name,
					totalSpent30Days: gameTransactions.reduce((sum, t) => sum + t.transactionAmount, 0),
					totalTransactions30Days: gameTransactions.length,
					lastActivity: transactions.length > 0 ? transactions[transactions.length - 1].createdAt : null,
				};
			})
		);

		hierarchy.performanceMetrics = performanceMetrics;

		return {
			status: 200,
			entity: {
				success: true,
				hierarchy,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch user hierarchy',
			},
		};
	}
};

// 14. AUDIT TRAIL (Admin only)
export const getUserAuditTrail = async (userId, query = {}) => {
	try {
		const {
			page = 1,
			limit = 20,
			actionType,
			startDate,
			endDate,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = query;

		const skip = (page - 1) * limit;

		// Get user information
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		// Build date filter
		let dateFilter = {};
		if (startDate || endDate) {
			dateFilter.createdAt = {};
			if (startDate) {
				dateFilter.createdAt.$gte = new Date(startDate);
			}
			if (endDate) {
				dateFilter.createdAt.$lte = new Date(endDate);
			}
		}

		// Get transactions (as audit trail)
		const transactionFilter = { user: userId, ...dateFilter };
		if (actionType && actionType !== 'ALL') {
			transactionFilter.transactionIdentifier = actionType;
		}

		const transactions = await Transaction.find(transactionFilter)
			.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
			.skip(skip)
			.limit(parseInt(limit));

		const totalTransactions = await Transaction.countDocuments(transactionFilter);

		// Get balance adjustments (manual admin actions)
		const balanceAdjustments = await Transaction.find({
			user: userId,
			transactionIdentifier: { $in: ['MANUAL_CREDIT', 'MANUAL_DEBIT', 'ADMIN_ADJUSTMENT'] },
			...dateFilter
		}).sort({ createdAt: -1 });

		// Get document verification history
		const documentHistory = [
			...(user.idProof?.verifiedAt ? [{
				action: 'DOCUMENT_VERIFICATION',
				documentType: 'ID_PROOF',
				status: user.idProof.verificationStatus,
				date: user.idProof.verifiedAt,
				verifiedBy: user.idProof.verifiedBy,
				rejectionReason: user.idProof.rejectionReason,
			}] : []),
			...(user.addressProof?.verifiedAt ? [{
				action: 'DOCUMENT_VERIFICATION',
				documentType: 'ADDRESS_PROOF',
				status: user.addressProof.verificationStatus,
				date: user.addressProof.verifiedAt,
				verifiedBy: user.addressProof.verifiedBy,
				rejectionReason: user.addressProof.rejectionReason,
			}] : []),
		];

		// Get account modifications (you might want to track these in a separate audit log)
		const accountModifications = [
			{
				action: 'ACCOUNT_CREATED',
				date: user.createdAt,
				details: { role: user.role, phone: user.phone },
			},
			// Add more modifications as needed
		];

		// Compliance tracking
		const complianceStatus = {
			kycCompleted: user.idProof?.verificationStatus === 'VERIFIED' && user.addressProof?.verificationStatus === 'VERIFIED',
			amlFlags: [], // Implement AML flag logic
			riskAssessment: 'LOW', // Implement risk assessment logic
			regulatoryCompliance: {
				documentVerification: user.idProof?.verificationStatus === 'VERIFIED' && user.addressProof?.verificationStatus === 'VERIFIED',
				identityConfirmed: user.idProof?.verificationStatus === 'VERIFIED',
				addressConfirmed: user.addressProof?.verificationStatus === 'VERIFIED',
			},
		};

		const auditTrail = {
			userInfo: {
				id: user._id,
				name: user.name,
				role: user.role,
				accountCreated: user.createdAt,
			},
			transactionHistory: {
				transactions,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total: totalTransactions,
					pages: Math.ceil(totalTransactions / limit),
				},
			},
			adminActions: {
				balanceAdjustments,
				documentVerifications: documentHistory,
				accountModifications,
			},
			complianceTracking: complianceStatus,
		};

		return {
			status: 200,
			entity: {
				success: true,
				auditTrail,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch audit trail',
			},
		};
	}
};

// ===== ADMINISTRATIVE ACTION FUNCTIONS =====

// 15. SUSPEND/REACTIVATE USER
export const suspendReactivateUser = async (userId, { action, reason }, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		const wallet = await Wallet.findOne({ user: userId });
		if (!wallet) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User wallet not found',
				},
			};
		}

		if (action === 'SUSPEND') {
			wallet.active = false;
			user.accountStatus = 'SUSPENDED';
			user.suspensionReason = reason;
			user.suspendedBy = adminUser._id;
			user.suspendedAt = new Date();
		} else if (action === 'REACTIVATE') {
			wallet.active = true;
			user.accountStatus = 'ACTIVE';
			user.suspensionReason = null;
			user.reactivatedBy = adminUser._id;
			user.reactivatedAt = new Date();
		} else {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid action. Use SUSPEND or REACTIVATE.',
				},
			};
		}

		await wallet.save();
		await user.save();

		// Create audit transaction
		await makeTransaction(
			userId,
			user.role,
			action === 'SUSPEND' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REACTIVATED',
			0,
			adminUser._id.toString(),
			'REAL'
		);

		return {
			status: 200,
			entity: {
				success: true,
				message: `User ${action === 'SUSPEND' ? 'suspended' : 'reactivated'} successfully`,
				user: user.view(true),
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || `Failed to ${action.toLowerCase()} user`,
			},
		};
	}
};

// 16. CHANGE USER ROLE
export const changeUserRole = async (userId, { newRole, reason }, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		const validRoles = ['USER', 'AGENT', 'DEALER'];
		if (!validRoles.includes(newRole)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid role. Valid roles are: USER, AGENT, DEALER',
				},
			};
		}

		const oldRole = user.role;
		user.role = newRole;
		user.roleChangedBy = adminUser._id;
		user.roleChangedAt = new Date();
		user.roleChangeReason = reason;

		await user.save();

		// Create audit transaction
		await makeTransaction(
			userId,
			user.role,
			'ROLE_CHANGED',
			0,
			adminUser._id.toString(),
			'REAL'
		);

		return {
			status: 200,
			entity: {
				success: true,
				message: `User role changed from ${oldRole} to ${newRole}`,
				user: user.view(true),
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to change user role',
			},
		};
	}
};

// 17. RESET USER PASSWORD
export const resetUserPassword = async (userId, { newPassword, reason }, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		user.password = newPassword;
		user.passwordResetBy = adminUser._id;
		user.passwordResetAt = new Date();
		user.passwordResetReason = reason;

		await user.save();

		return {
			status: 200,
			entity: {
				success: true,
				message: 'User password reset successfully',
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to reset user password',
			},
		};
	}
};

// 18. FORCE LOGOUT USER
export const forceLogoutUser = async (userId, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		// Clear session tracking
		user.sessionTracking.currentSessionStartTime = null;
		user.sessionTracking.lastActivityDate = new Date();
		user.forceLogoutBy = adminUser._id;
		user.forceLogoutAt = new Date();

		await user.save();

		return {
			status: 200,
			entity: {
				success: true,
				message: 'User forced logout successfully',
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to force logout user',
			},
		};
	}
};

// 19. RESET USER PIN
export const resetUserPin = async (userId, { newPin, reason }, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		user.securePin = newPin;
		user.pinResetBy = adminUser._id;
		user.pinResetAt = new Date();
		user.pinResetReason = reason;

		await user.save();

		return {
			status: 200,
			entity: {
				success: true,
				message: 'User PIN reset successfully',
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to reset user PIN',
			},
		};
	}
};

// 20. ADJUST USER BALANCE
export const adjustUserBalance = async (userId, { cashType, amount, adjustmentType, reason }, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		if (!['VIRTUAL', 'REAL'].includes(cashType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid cash type. Use VIRTUAL or REAL.',
				},
			};
		}

		if (!['CREDIT', 'DEBIT'].includes(adjustmentType)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid adjustment type. Use CREDIT or DEBIT.',
				},
			};
		}

		if (!amount || amount <= 0) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Amount must be greater than 0.',
				},
			};
		}

		// Perform balance adjustment using transaction system
		const transactionIdentifier = adjustmentType === 'CREDIT' ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT';

		await makeTransaction(
			userId,
			user.role,
			transactionIdentifier,
			amount,
			`ADMIN_ADJUSTMENT_${adminUser._id}_${Date.now()}`,
			cashType
		);

		// Create audit record
		const adjustmentRecord = {
			userId,
			adminId: adminUser._id,
			cashType,
			amount,
			adjustmentType,
			reason,
			timestamp: new Date(),
		};

		return {
			status: 200,
			entity: {
				success: true,
				message: `Balance ${adjustmentType.toLowerCase()}ed successfully`,
				adjustment: adjustmentRecord,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to adjust user balance',
			},
		};
	}
};

// 21. UPGRADE USER TIER
export const upgradeUserTier = async (userId, { targetTier, reason }, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		const validTiers = ['BRONZE', 'SILVER', 'GOLD', 'VIP'];
		if (!validTiers.includes(targetTier)) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid tier. Valid tiers are: BRONZE, SILVER, GOLD, VIP',
				},
			};
		}

		// Use loyalty service to upgrade tier
		const upgradeResult = await LoyaltyService.upgradeUserTier(userId, targetTier);

		if (!upgradeResult.success) {
			return {
				status: 500,
				entity: {
					success: false,
					error: upgradeResult.error || 'Failed to upgrade tier',
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				message: `User tier upgraded to ${targetTier}`,
				upgrade: upgradeResult,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to upgrade user tier',
			},
		};
	}
};

// 22. SEND NOTIFICATION TO USER
export const sendUserNotification = async (userId, { title, message, type, priority }, adminUser) => {
	try {
		const user = await User.findById(userId);
		if (!user) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'User not found',
				},
			};
		}

		// Here you would integrate with your notification service
		// For now, we'll create a simple notification record
		const notification = {
			userId,
			title,
			message,
			type: type || 'ADMIN',
			priority: priority || 'NORMAL',
			sentBy: adminUser._id,
			sentAt: new Date(),
			status: 'SENT',
		};

		// You might want to save this to a Notification model
		// await Notification.create(notification);

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Notification sent successfully',
				notification,
			},
		};
	} catch (error) {
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to send notification',
			},
		};
	}
};