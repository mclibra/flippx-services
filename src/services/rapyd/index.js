import crypto from 'crypto';
import https from 'https';
import { URL } from 'url';
import { rapydConfig } from '../../../config';

// Rapyd API base URL
const RAPYD_API_BASE_URL =
	rapydConfig.apiBaseUrl || 'https://sandboxapi.rapyd.net';

/**
 * Recursively convert all numbers in an object to strings
 * Rapyd requires numbers to be strings to avoid signature issues
 */
const convertNumbersToStrings = obj => {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (typeof obj === 'number') {
		return String(obj);
	}

	if (Array.isArray(obj)) {
		return obj.map(item => convertNumbersToStrings(item));
	}

	if (typeof obj === 'object') {
		const result = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = convertNumbersToStrings(value);
		}
		return result;
	}

	return obj;
};

/**
 * Format JSON body for Rapyd signature
 * Rapyd requires: no whitespace, no trailing zeros, proper number formatting
 * The body string must match exactly what will be sent in the HTTP request
 */
const formatBodyForSignature = body => {
	if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
		console.log('[Rapyd Body Format] Empty body, returning empty string');
		return '';
	}

	console.log(
		'[Rapyd Body Format] Input body:',
		JSON.stringify(body, null, 2)
	);

	// CRITICAL: Rapyd signature requirements:
	// 1. NO whitespace (except inside strings)
	// 2. NO trailing zeros or decimal points (or wrap numbers in strings)
	// 3. The exact string used for signature MUST match the request body exactly

	// Convert all numbers to strings as per Rapyd's error message:
	// "Remove trailing zeroes and decimal points, or wrap numbers in a string"
	const bodyWithStringNumbers = convertNumbersToStrings(body);

	console.log(
		'[Rapyd Body Format] Body after number conversion:',
		JSON.stringify(bodyWithStringNumbers, null, 2)
	);

	// JSON.stringify() produces compact JSON with no whitespace by default
	// This exact string will be used for both signature AND request body
	// We must ensure no additional formatting is applied
	const bodyString = JSON.stringify(bodyWithStringNumbers);

	console.log('[Rapyd Body Format] Stringified body:', {
		bodyString,
		bodyStringLength: bodyString.length,
		bodyStringBytes: Buffer.from(bodyString, 'utf8')
			.toString('hex')
			.substring(0, 200),
		hasNewlines: bodyString.includes('\n') || bodyString.includes('\r'),
		hasTabs: bodyString.includes('\t'),
		hasDoubleSpaces: bodyString.includes('  '),
		firstChar: bodyString.charCodeAt(0),
		lastChar: bodyString.charCodeAt(bodyString.length - 1),
	});

	// Verify it's compact (no newlines or extra spaces)
	// This is a sanity check - JSON.stringify should already produce compact JSON
	if (bodyString.includes('\n') || bodyString.includes('\r')) {
		throw new Error(
			'Body string contains unexpected whitespace - this will break Rapyd signature'
		);
	}

	return bodyString;
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

	// Verify credential format (access key should start with 'rak_', secret with 'rsk_')
	if (!accessKey.startsWith('rak_')) {
		console.warn(
			'[Rapyd Warning] Access key format may be incorrect. Expected format: rak_...'
		);
	}
	if (!secretKey.startsWith('rsk_')) {
		console.warn(
			'[Rapyd Warning] Secret key format may be incorrect. Expected format: rsk_...'
		);
	}

	// bodyString is already formatted - use it directly
	// Empty body should be empty string

	// Construct the string to sign exactly as Rapyd expects
	// CRITICAL: Rapyd requires secretKey in the string to sign (unusual but required)
	// Format: method + uri_path + salt + timestamp + access_key + secret_key + body_string
	// Then: HMAC-SHA256(secret_key, toSign)
	const toSign =
		method.toLowerCase() +
		path +
		salt +
		timestamp +
		accessKey +
		secretKey +
		bodyString;

	// Detailed logging for signature calculation
	console.log('[Rapyd Signature] Calculating signature:', {
		method: method.toLowerCase(),
		path,
		pathLength: path.length,
		salt,
		timestamp,
		accessKey: accessKey.substring(0, 10) + '...',
		secretKeyLength: secretKey.length,
		bodyStringLength: bodyString.length,
		bodyStringHex: Buffer.from(bodyString, 'utf8')
			.toString('hex')
			.substring(0, 100),
		bodyStringHasNewlines:
			bodyString.includes('\n') || bodyString.includes('\r'),
		bodyStringHasSpaces: bodyString.includes('  '), // double spaces
		toSignLength: toSign.length,
		toSignPreview: toSign.substring(0, 100) + '...',
		// Log the exact components being concatenated
		toSignComponents: {
			method: method.toLowerCase(),
			path,
			salt,
			timestamp,
			accessKey,
			secretKey: secretKey.substring(0, 10) + '...',
			bodyString: bodyString.substring(0, 50) + '...',
		},
		// Log the full toSign string (be careful with secrets in production)
		toSignFull: toSign,
		toSignHex: Buffer.from(toSign, 'utf8').toString('hex'),
		toSignHexLength: Buffer.from(toSign, 'utf8').toString('hex').length,
		toSignHasNewlines: toSign.includes('\n') || toSign.includes('\r'),
		// Log each component's hex to verify exact bytes
		componentsHex: {
			method: Buffer.from(method.toLowerCase(), 'utf8').toString('hex'),
			path: Buffer.from(path, 'utf8').toString('hex'),
			salt: Buffer.from(salt, 'utf8').toString('hex'),
			timestamp: Buffer.from(timestamp, 'utf8').toString('hex'),
			accessKey: Buffer.from(accessKey, 'utf8').toString('hex'),
			secretKey:
				Buffer.from(secretKey, 'utf8')
					.toString('hex')
					.substring(0, 50) + '...',
			bodyString:
				Buffer.from(bodyString, 'utf8')
					.toString('hex')
					.substring(0, 100) + '...',
		},
	});

	// Generate HMAC-SHA256 signature
	// CRITICAL: Rapyd requires BASE64 encoding of the HMAC-SHA256 hash
	// Format: BASE64(HMAC-SHA256(secret_key, toSign))
	const hmac = crypto.createHmac('sha256', secretKey);
	hmac.update(toSign);
	// Convert hex digest to BASE64 as per Rapyd documentation
	const signature = Buffer.from(hmac.digest('hex')).toString('base64');

	console.log('[Rapyd Signature] Generated signature:', {
		signature: signature.substring(0, 20) + '...',
		signatureLength: signature.length,
		signatureFull: signature,
	});

	return signature;
};

/**
 * Make authenticated request to Rapyd API
 * Uses native https module to ensure exact body string matching for signature
 */
const makeRapydRequest = async (method, path, body = null) => {
	const salt = crypto.randomBytes(16).toString('hex');
	const timestamp = Math.floor(Date.now() / 1000).toString();

	// CRITICAL: Parse URL first to get the exact path that will be used in the request
	// The path used in signature MUST match the path in the actual HTTP request
	const url = new URL(`${RAPYD_API_BASE_URL}${path}`);
	const hostname = url.hostname;
	// Use the exact path from URL (pathname + search) for both signature and request
	const requestPath = url.pathname + url.search;

	// Stringify body exactly as it will be sent to ensure signature matches
	// This is critical - the signature body MUST match the request body exactly
	let bodyString = '';
	if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
		bodyString = formatBodyForSignature(body);
	}

	// Generate signature using the exact path and body string that will be sent
	// CRITICAL: Use requestPath (not path) to ensure signature matches actual request
	const signature = generateSignature(
		method,
		requestPath, // Use requestPath instead of path to ensure exact match
		salt,
		timestamp,
		bodyString
	);

	// Debug logging - show what we're about to sign and send
	console.log('[Rapyd Request] Request preparation:', {
		method: method.toUpperCase(),
		path: requestPath,
		bodyStringLength: bodyString.length,
		bodyStringPreview:
			bodyString.substring(0, 100) +
			(bodyString.length > 100 ? '...' : ''),
		bodyStringHex: Buffer.from(bodyString, 'utf8')
			.toString('hex')
			.substring(0, 100),
		salt,
		timestamp,
		signature: signature.substring(0, 20) + '...',
	});

	// Generate idempotency key (timestamp-based unique identifier)
	const idempotency = Date.now().toString();

	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		access_key: rapydConfig.accessKey,
		salt: salt,
		timestamp: timestamp,
		signature: signature,
		idempotency: idempotency,
		'User-Agent': 'Node.js',
	};

	// Add Content-Length if there's a body
	if (bodyString) {
		headers['Content-Length'] = Buffer.byteLength(bodyString, 'utf8');
	}

	return new Promise((resolve, reject) => {
		const options = {
			hostname: hostname,
			port: 443,
			path: requestPath,
			method: method.toUpperCase(),
			headers: headers,
		};

		const req = https.request(options, res => {
			let responseData = '';

			res.on('data', chunk => {
				responseData += chunk;
			});

			res.on('end', () => {
				try {
					const parsedData = JSON.parse(responseData);

					if (res.statusCode >= 200 && res.statusCode < 300) {
						resolve(parsedData);
					} else {
						const error = new Error(
							parsedData.status?.message ||
								`Request failed with status code ${res.statusCode}`
						);
						error.response = {
							status: res.statusCode,
							data: parsedData,
						};
						reject(error);
					}
				} catch (parseError) {
					const error = new Error(
						`Failed to parse response: ${parseError.message}`
					);
					error.response = {
						status: res.statusCode,
						data: responseData,
					};
					reject(error);
				}
			});
		});

		req.on('error', error => {
			console.error('Rapyd API request error:', {
				path: requestPath,
				method: method.toUpperCase(),
				message: error.message,
			});
			reject(error);
		});

		// Write the exact body string (no transformation)
		if (bodyString) {
			console.log('[Rapyd Request] Writing body to request:', {
				bodyString,
				bodyStringLength: bodyString.length,
				bodyStringBytes: Buffer.from(bodyString, 'utf8')
					.toString('hex')
					.substring(0, 200),
				hasNewlines:
					bodyString.includes('\n') || bodyString.includes('\r'),
				hasTabs: bodyString.includes('\t'),
				hasDoubleSpaces: bodyString.includes('  '),
				contentLength: Buffer.byteLength(bodyString, 'utf8'),
			});
			req.write(bodyString, 'utf8');
			console.log('[Rapyd Request] Body written successfully');
		}

		console.log('[Rapyd Request] Request options:', {
			hostname,
			port: 443,
			path: requestPath,
			method: method.toUpperCase(),
			headers: {
				...headers,
				signature: headers.signature.substring(0, 20) + '...',
			},
		});

		req.end();
	}).catch(error => {
		// Enhanced error logging for debugging signature issues
		const errorDetails = {
			path: requestPath,
			method: method.toUpperCase(),
			status: error.response?.status,
			data: error.response?.data,
			message: error.message,
		};

		// If it's a signature error, log the details used for signature calculation
		if (
			error.response?.status === 401 ||
			error.response?.data?.status?.error_code ===
				'UNAUTHENTICATED_API_CALL'
		) {
			errorDetails.signatureDebug = {
				method: method.toLowerCase(),
				path: requestPath,
				salt,
				timestamp,
				bodyStringLength: bodyString.length,
				bodyStringPreview:
					bodyString.substring(0, 100) +
					(bodyString.length > 100 ? '...' : ''),
			};
		}

		console.error('Rapyd API error:', errorDetails);
		throw error;
	});
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
	paymentMethodTypeCategories = [],
	paymentMethodTypesExclude = [],
	country = null,
}) => {
	try {
		const path = '/v1/checkout';

		// Build body object
		// CRITICAL: Rapyd requires numbers to be strings to avoid signature issues
		// Error message says: "Remove trailing zeroes and decimal points, or wrap numbers in a string"
		const body = {
			amount: String(amount), // Convert to string as per Rapyd requirements
			currency: String(currency),
			description: String(description),
			complete_payment_url: String(completePaymentUrl),
			error_payment_url: String(errorPaymentUrl),
			// Country is required by Rapyd API
			country: String(country || rapydConfig.defaultCountry || 'US'),
		};

		// Only add metadata if it has content (Rapyd may reject empty objects)
		// Convert all numeric values in metadata to strings
		if (metadata && Object.keys(metadata).length > 0) {
			const stringifiedMetadata = {};
			for (const [key, value] of Object.entries(metadata)) {
				// Convert numbers to strings, keep other types as-is
				if (typeof value === 'number') {
					stringifiedMetadata[key] = String(value);
				} else {
					stringifiedMetadata[key] = value;
				}
			}
			body.metadata = stringifiedMetadata;
		}

		// Add optional parameters
		if (customerId) {
			body.customer = String(customerId);
		}

		if (paymentMethodTypeCategories.length > 0) {
			body.payment_method_type_categories = paymentMethodTypeCategories;
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
