/* eslint-disable no-undef */
import path from 'path';
import merge from 'lodash/merge';
import dotenv from 'dotenv-safe';

// Load environment variables from .env file in non-production environments
if (process.env.NODE_ENV !== 'production') {
	dotenv.load({
		path: path.join(__dirname, '.env.development'),
		sample: path.join(__dirname, '.env.example'),
	});
}

/**
 * Require environment variable or throw meaningful error
 * @param {string} name - Environment variable name
 * @param {string} [defaultValue] - Optional default value if not required
 * @returns {string} Environment variable value
 */
const getEnv = (name, defaultValue) => {
	if (defaultValue !== undefined && !process.env[name]) {
		return defaultValue;
	}

	if (!process.env[name]) {
		throw new Error(`Environment variable ${name} is required`);
	}

	return process.env[name];
};

const environments = {
	develop: {
		adminData: {
			name: {
				firstName: 'Pratik',
				lastName: 'Raj',
			},
			email: 'pratikraj26@gmail.com',
			countryCode: '+91',
			phone: '8447227929',
			password: getEnv('ADMIN_PASSWORD', 'password'),
			username: 'pratikraj',
			slugName: 'pratikraj',
			dob: '1990-12-31',
			role: 'ADMIN',
			isActive: true,
		},
		systemData: {
			name: {
				firstName: 'System',
				lastName: 'Account',
			},
			email: 'system@megapay.io',
			countryCode: 'SYSTEM',
			phone: 'SYSTEM',
			password: getEnv('SYSTEM_PASSWORD', 'password'),
			userName: 'system',
			slugName: 'systemaccount',
			dob: '1990-12-31',
			role: 'SYSTEM',
			isActive: true,
		},
		dominoConfigData: {
			turnTimeLimit: 30,
			houseEdge: 10,
			entryFees: [5, 10, 20, 30, 50, 100],
			maxPlayersPerRoom: 4,
			isActive: true,
			computerPlayerNames: ['Bot_Alpha', 'Bot_Beta', 'Bot_Gamma', 'Bot_Delta'],
			newGameDelay: 30,
		}
	},

	production: {
		adminData: {
			name: {
				firstName: 'Mitch',
				lastName: 'Brutus',
			},
			email: 'mitchluvmusic@gmail.com',
			countryCode: '+1',
			phone: '6179593646',
			password: getEnv('ADMIN_PASSWORD', 'Meg@p@y#321'),
			username: 'mitchbrutus',
			slugName: 'mitchbrutus',
			dob: '1990-12-31',
			role: 'ADMIN',
			isActive: true,
		},
	},
};

// Base config used across all environments
const baseConfig = {
	env: getEnv('NODE_ENV', 'develop'),
	root: path.join(__dirname, '..'),
	port: getEnv('PORT', '8080'),
	ip: getEnv('IP', '0.0.0.0'),
	apiRoot: getEnv('API_ROOT', '/api'),
	xApiKey: getEnv('X_API_KEY'),
	jwtSecret: getEnv('JWT_SECRET'),
	secretSalt: getEnv('SECRET_SALT'),
	adminKey: getEnv('ADMIN_KEY'),
	otpExpiresIn: 60 * 5,
	enableText: getEnv('ENABLE_TEXT', 'true') === 'true',
	referralBonus: 4,
	referredBonus: 20,
	joiningBonus: 20,

	mongo: {
		uri: getEnv('MONGO_URI'),
		options: {
			debug: false,
		},
	},

	plivoConfig: {
		AUTH_ID: getEnv('PLIVO_AUTH_ID'),
		AUTH_TOKEN: getEnv('PLIVO_AUTH_TOKEN'),
		sender: getEnv('PLIVO_SENDER'),
	},

	aws: {
		signedurlExpireTime: 10000,
		s3BucketName: getEnv('AWS_S3_BUCKET', 'user-images'),
		originationNumber: getEnv('AWS_SMS_ORIGINATION_NUMBER'),
		config: {
			accessKeyId: getEnv('AWS_ACCESS_KEY_ID'),
			secretAccessKey: getEnv('AWS_SECRET_ACCESS_KEY'),
			region: getEnv('AWS_REGION', 'us-east-1'),
		},
	},

	rapidAPI: {
		apiHost: getEnv('RAPID_API_HOST'),
		apiKey: getEnv('RAPID_API_KEY'),
	},

	payoneerConfig: {
		apiBaseUrl: getEnv('PAYONEER_API_URL'),
		apiKey: getEnv('PAYONEER_API_KEY'),
		programId: getEnv('PAYONEER_PROGRAM_ID'),
		webhookSecret: getEnv('PAYONEER_WEBHOOK_SECRET'),
		conversionRate: 0.2, // 20% of virtual cash becomes real cash
		minPurchaseAmount: 20,
		maxPurchaseAmount: 1000,
		minWithdrawalAmount: 50,
		initialPromoAmount: 100,
	},

	transactionText: {
		amountCredited: {
			user: `Un montant de $amount gourdes a été ajouté sur votre compte MEGA PAY par $crediterName Votre solde actuel est $walletBalance`,
		},
		amountDebited: {
			user: `Un montant de $amount gourdes a été rétiré de votre compte MEGA PAY par $debiterName Votre solde actuel est $walletBalance`,
		},
	},
};

// Get current environment or default to 'develop'
export const env = process.env.NODE_ENV || 'develop';

// Create the final config by merging base config with environment-specific config
const config = merge({}, baseConfig, environments[env] || {});

// Export the entire config object
export default config;

// Also export individual config properties for direct import
export const mongo = config.mongo;
export const port = config.port;
export const ip = config.ip;
export const apiRoot = config.apiRoot;
export const xApiKey = config.xApiKey;
export const jwtSecret = config.jwtSecret;
export const secretSalt = config.secretSalt;
export const adminKey = config.adminKey;
export const otpExpiresIn = config.otpExpiresIn;
export const enableText = config.enableText;
export const referralBonus = config.referralBonus;
export const referredBonus = config.referredBonus;
export const joiningBonus = config.joiningBonus;
export const plivoConfig = config.plivoConfig;
export const aws = config.aws;
export const rapidAPI = config.rapidAPI;
export const payoneerConfig = config.payoneerConfig;
export const transactionText = config.transactionText;
export const adminData = config.adminData;
