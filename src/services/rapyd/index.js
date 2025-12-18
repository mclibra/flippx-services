import axios from 'axios';
import crypto from 'crypto';
import { rapydConfig } from '../../../config';

// Rapyd API base URL
const RAPYD_API_BASE_URL =
	rapydConfig.apiBaseUrl || 'https://sandboxapi.rapyd.net';

/**
 * Format JSON body for Rapyd signature
 * Rapyd requires: no whitespace, no trailing zeros, proper number formatting
 * The body string must match exactly what axios will send
 */
const formatBodyForSignature = body => {
	if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
		return '';
	}

	// Stringify without any whitespace (compact JSON)
	// CRITICAL: Must have NO whitespace, NO trailing zeros, proper number formatting
	// JSON.stringify() by default produces compact JSON with no whitespace
	// This exact string will be used for both signature AND request body
	return JSON.stringify(body);
};

/**
 * Generate Rapyd API signature
 * Rapyd requires HMAC-SHA256 signature for all API requests
 * Signature format: method + path + salt + timestamp + access_key + secret_key + body_string
 *
 * @param {string} method - HTTP method (lowercase)
 * @param {string} path - API path
 * @param {string} salt - Random salt
 * @param {string} timestamp - Unix timestamp
 * @param {string} bodyString - Body as JSON string (already stringified)
 */
const generateSignature = (method, path, salt, timestamp, bodyString = '') => {
	const accessKey = rapydConfig.accessKey;
	const secretKey = rapydConfig.secretKey;

	// Validate credentials are set
	if (!accessKey || !secretKey) {
		throw new Error('Rapyd access key and secret key must be configured');
	}

	// bodyString is already formatted - use it directly
	// Empty body should be empty string

	// Construct the string to sign exactly as Rapyd expects
	const toSign =
		method.toLowerCase() +
		path +
		salt +
		timestamp +
		accessKey +
		secretKey +
		bodyString;

	// Generate HMAC-SHA256 signature
	return crypto.createHmac('sha256', secretKey).update(toSign).digest('hex');
};

/**
 * Make authenticated request to Rapyd API
 */
const makeRapydRequest = async (method, path, body = null) => {
	const salt = crypto.randomBytes(16).toString('hex');
	const timestamp = Math.floor(Date.now() / 1000).toString();

	// Stringify body exactly as it will be sent to ensure signature matches
	// This is critical - the signature body MUST match the request body exactly
	let bodyString = '';
	if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
		bodyString = formatBodyForSignature(body);
	}

	// Generate signature using the exact body string that will be sent
	const signature = generateSignature(
		method,
		path,
		salt,
		timestamp,
		bodyString
	);

	const headers = {
		'Content-Type': 'application/json',
		access_key: rapydConfig.accessKey,
		salt: salt,
		timestamp: timestamp,
		signature: signature,
	};

	try {
		const config = {
			method,
			url: `${RAPYD_API_BASE_URL}${path}`,
			headers,
			// Prevent axios from transforming the data - send raw string as-is
			transformRequest: [
				data => {
					// If data is already a string, return it as-is (no transformation)
					if (typeof data === 'string') {
						return data;
					}
					// Otherwise, let axios handle it (shouldn't happen in our case)
					return data;
				},
			],
		};

		if (
			body &&
			(method === 'POST' || method === 'PUT' || method === 'PATCH')
		) {
			// Send body as stringified JSON to ensure exact match with signature
			// This guarantees the signature body matches the request body exactly
			// The transformRequest ensures axios doesn't reformat it
			config.data = bodyString;
		}

		const response = await axios(config);
		return response.data;
	} catch (error) {
		console.error('Rapyd API error:', {
			path,
			method,
			status: error.response?.status,
			data: error.response?.data,
			message: error.message,
		});
		throw error;
	}
};

/**
 * Create a checkout page for payment collection
 * Equivalent to Payoneer's createPaymentSession
 */
export const createCheckoutPage = async ({
	amount,
	currency = 'USD',
	description,
	completePaymentUrl,
	errorPaymentUrl,
	metadata = {},
	customerId,
	paymentMethodTypesInclude = [],
	paymentMethodTypesExclude = [],
}) => {
	try {
		const path = '/v1/checkout';

		// Build body object - ensure numbers are proper numbers, not strings
		const body = {
			amount: Number(amount), // Ensure it's a number, not string
			currency: String(currency),
			description: String(description),
			complete_payment_url: String(completePaymentUrl),
			error_payment_url: String(errorPaymentUrl),
		};

		// Only add metadata if it has content (Rapyd may reject empty objects)
		if (metadata && Object.keys(metadata).length > 0) {
			body.metadata = metadata;
		}

		// Add optional parameters
		if (customerId) {
			body.customer = String(customerId);
		}

		if (paymentMethodTypesInclude.length > 0) {
			body.payment_method_types_include = paymentMethodTypesInclude;
		}

		if (paymentMethodTypesExclude.length > 0) {
			body.payment_method_types_exclude = paymentMethodTypesExclude;
		}

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return {
				checkoutUrl: response.data?.redirect_url || response.data?.url,
				checkoutId: response.data?.id,
				paymentId: response.data?.payment?.id,
				...response.data,
			};
		}

		throw new Error(
			response.status?.message || 'Failed to create checkout page'
		);
	} catch (error) {
		console.error('Rapyd checkout creation error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to create checkout page with Rapyd'
		);
	}
};

/**
 * Get payment status
 * Equivalent to Payoneer's getPaymentSession
 */
export const getPaymentStatus = async paymentId => {
	try {
		const path = `/v1/payments/${paymentId}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to get payment status'
		);
	} catch (error) {
		console.error('Rapyd get payment status error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payment status from Rapyd'
		);
	}
};

/**
 * Create a customer in Rapyd
 * Useful for storing customer payment methods
 */
export const createCustomer = async ({
	email,
	phoneNumber,
	firstName,
	lastName,
	metadata = {},
}) => {
	try {
		const path = '/v1/customers';
		const body = {
			email,
			phone_number: phoneNumber,
			first_name: firstName,
			last_name: lastName,
			metadata,
		};

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to create customer'
		);
	} catch (error) {
		console.error('Rapyd create customer error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to create customer in Rapyd'
		);
	}
};

/**
 * Create a beneficiary for payouts
 * Required before creating payouts
 */
export const createBeneficiary = async ({
	firstName,
	lastName,
	email,
	phoneNumber,
	country,
	currency,
	payoutMethodType,
	beneficiaryType = 'individual',
	bankAccountDetails = null,
	cardDetails = null,
	metadata = {},
}) => {
	try {
		const path = '/v1/payouts/beneficiary';
		const body = {
			first_name: firstName,
			last_name: lastName,
			email,
			phone_number: phoneNumber,
			country,
			currency,
			payout_method_type: payoutMethodType,
			beneficiary_type: beneficiaryType,
			metadata,
		};

		// Add bank account details if provided
		if (bankAccountDetails) {
			body.bank_account = {
				name: bankAccountDetails.accountHolderName,
				account_number: bankAccountDetails.accountNumber,
				routing_number: bankAccountDetails.routingNumber,
				account_type:
					bankAccountDetails.accountType?.toLowerCase() || 'checking',
				bank_name: bankAccountDetails.bankName,
				country: bankAccountDetails.country || country,
			};
		}

		// Add card details if provided
		if (cardDetails) {
			body.card = {
				name: cardDetails.cardholderName,
				number: cardDetails.cardNumber,
				expiration_month: cardDetails.expirationMonth,
				expiration_year: cardDetails.expirationYear,
				cvv: cardDetails.cvv,
			};
		}

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to create beneficiary'
		);
	} catch (error) {
		console.error('Rapyd create beneficiary error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to create beneficiary in Rapyd'
		);
	}
};

/**
 * Create a payout to transfer funds to beneficiary
 * Equivalent to Payoneer's createPayout
 */
export const createPayout = async ({
	beneficiaryId,
	amount,
	currency = 'USD',
	description,
	reference,
	metadata = {},
	payoutMethodType,
	eWalletId = null,
}) => {
	try {
		const path = '/v1/payouts';
		const body = {
			beneficiary: beneficiaryId,
			amount,
			currency,
			description,
			payout_method_type: payoutMethodType,
			metadata: {
				...metadata,
				client_reference_id: reference,
			},
		};

		// Add eWallet if provided
		if (eWalletId) {
			body.ewallet = eWalletId;
		}

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(response.status?.message || 'Failed to create payout');
	} catch (error) {
		console.error('Rapyd create payout error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to create payout with Rapyd'
		);
	}
};

/**
 * Get payout status
 */
export const getPayoutStatus = async payoutId => {
	try {
		const path = `/v1/payouts/${payoutId}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to get payout status'
		);
	} catch (error) {
		console.error('Rapyd get payout status error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payout status from Rapyd'
		);
	}
};

/**
 * List available payout method types for a country
 */
export const getPayoutMethodTypes = async (country, currency) => {
	try {
		const path = `/v1/payouts/supported_types?country=${country}&currency=${currency}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to get payout method types'
		);
	} catch (error) {
		console.error('Rapyd get payout method types error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payout method types from Rapyd'
		);
	}
};

/**
 * Verify webhook signature from Rapyd
 */
export const verifyWebhookSignature = (payload, signature, timestamp, salt) => {
	try {
		const secretKey = rapydConfig.secretKey;
		const accessKey = rapydConfig.accessKey;

		// Rapyd webhook signature is calculated as:
		// HMAC-SHA256(salt + timestamp + accessKey + secretKey + body)
		const toSign = salt + timestamp + accessKey + secretKey + payload;
		const expectedSignature = crypto
			.createHmac('sha256', secretKey)
			.update(toSign)
			.digest('hex');

		return crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature)
		);
	} catch (error) {
		console.error('Rapyd webhook signature verification error:', error);
		return false;
	}
};

/**
 * Map Rapyd payment status to internal status
 */
export const mapPaymentStatus = rapydStatus => {
	const statusMap = {
		CLO: 'COMPLETED', // Closed/Completed
		ACT: 'PENDING', // Active
		CAN: 'CANCELLED', // Cancelled
		ERR: 'FAILED', // Error
		REV: 'FAILED', // Reversed
	};

	return statusMap[rapydStatus] || 'PENDING';
};

/**
 * Map Rapyd payout status to internal status
 */
export const mapPayoutStatus = rapydStatus => {
	const statusMap = {
		CLO: 'COMPLETED', // Closed/Completed
		ACT: 'PROCESSING', // Active/Processing
		CAN: 'CANCELLED', // Cancelled
		ERR: 'FAILED', // Error
		REV: 'FAILED', // Reversed
	};

	return statusMap[rapydStatus] || 'PENDING';
};

export default {
	createCheckoutPage,
	getPaymentStatus,
	createCustomer,
	createBeneficiary,
	createPayout,
	getPayoutStatus,
	getPayoutMethodTypes,
	verifyWebhookSignature,
	mapPaymentStatus,
	mapPayoutStatus,
};
