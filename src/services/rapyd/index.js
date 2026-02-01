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

	// Generate HMAC-SHA256 signature
	// CRITICAL: Rapyd requires BASE64 encoding of the HMAC-SHA256 hash
	// Format: BASE64(HMAC-SHA256(secret_key, toSign))
	const hmac = crypto.createHmac('sha256', secretKey);
	hmac.update(toSign);
	// Convert hex digest to BASE64 as per Rapyd documentation
	const signature = Buffer.from(hmac.digest('hex')).toString('base64');

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
			req.write(bodyString, 'utf8');
		}

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
			country: String(country || rapydConfig.defaultCountry || 'US'),
			payment_method_type_categories: ['cash', 'card', 'ewallet'],
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
 * Create a beneficiary for bank account payouts
 * Required before creating bank account payouts
 *
 * @param {Object} params - Beneficiary parameters
 * @param {string} params.firstName - First name
 * @param {string} params.lastName - Last name
 * @param {string} params.email - Email address
 * @param {string} params.phoneNumber - Phone number
 * @param {string} params.country - ISO country code (e.g., 'US', 'IN')
 * @param {string} params.currency - Currency code (e.g., 'USD', 'INR')
 * @param {string} params.entityType - Entity type ('individual' or 'company')
 * @param {Object} params.bankAccountDetails - Bank account details
 * @param {string} params.bankAccountDetails.accountNumber - Account number
 * @param {string} params.bankAccountDetails.routingNumber - Routing number (for US accounts)
 * @param {string} [params.bankAccountDetails.bicSwift] - BIC/SWIFT code (for international accounts)
 * @param {string} [params.bankAccountDetails.bankName] - Bank name
 * @param {string} [params.address] - Street address
 * @param {string} [params.city] - City
 * @param {string} [params.state] - State/Province
 * @param {string} [params.postcode] - Postal/ZIP code
 * @param {string} [params.identificationType] - Identification type (default: 'identification_id')
 * @param {string} [params.identificationValue] - Identification value
 * @param {string} [params.merchantReferenceId] - Merchant reference ID
 * @param {string} [params.payoutMethodType] - Payout method type (e.g., 'us_general_bank')
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {Promise<Object>} Rapyd beneficiary data
 */
export const createBankAccountBeneficiary = async ({
	firstName,
	lastName,
	email,
	phoneNumber,
	country,
	currency,
	entityType,
	bankAccountDetails,
	address = null,
	city = null,
	state = null,
	postcode = null,
	identificationType = null,
	identificationValue = null,
	merchantReferenceId = null,
	payoutMethodType = null,
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
			category: 'bank',
			entity_type: entityType,
			metadata,
		};

		// Add address fields if provided
		if (address) {
			body.address = address;
		}
		if (city) {
			body.city = city;
		}
		if (state) {
			body.state = state;
		}
		if (postcode) {
			body.postcode = postcode;
		}

		// Add identification fields if provided
		if (identificationType) {
			body.identification_type = identificationType;
		}
		if (identificationValue) {
			body.identification_value = identificationValue;
		}

		// Add merchant reference ID if provided
		if (merchantReferenceId) {
			body.merchant_reference_id = merchantReferenceId;
		}

		// Add default_payout_method_type if provided
		if (payoutMethodType) {
			body.default_payout_method_type = payoutMethodType;
		}

		// Add bank account details (at root level as per Rapyd API)
		if (bankAccountDetails) {
			body.account_number = bankAccountDetails.accountNumber;

			// US accounts use routing number
			if (bankAccountDetails.routingNumber && country === 'US') {
				body.routing_number = bankAccountDetails.routingNumber;
			}

			// BIC/SWIFT is required for ALL accounts (US and non-US)
			if (bankAccountDetails.bicSwift) {
				body.bic_swift = bankAccountDetails.bicSwift;
			} else {
				// BIC/SWIFT is required for all accounts
				throw new Error(
					'BIC/SWIFT code is required for all bank accounts'
				);
			}

			if (bankAccountDetails.bankName) {
				body.bank_name = bankAccountDetails.bankName;
			}
		}

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message ||
				'Failed to create bank account beneficiary'
		);
	} catch (error) {
		console.error('Rapyd create bank account beneficiary error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to create bank account beneficiary in Rapyd'
		);
	}
};

/**
 * Create a beneficiary for card payouts
 * Required before creating card payouts
 *
 * @param {Object} params - Beneficiary parameters
 * @param {string} params.firstName - First name
 * @param {string} params.lastName - Last name
 * @param {string} params.email - Email address
 * @param {string} params.phoneNumber - Phone number
 * @param {string} params.country - ISO country code (e.g., 'NG', 'US')
 * @param {string} params.currency - Currency code (e.g., 'NGN', 'USD')
 * @param {string} params.entityType - Entity type ('individual' or 'company')
 * @param {Object} params.cardDetails - Card details
 * @param {string} params.cardDetails.cardNumber - Card number
 * @param {string} params.cardDetails.expirationMonth - Expiration month (01-12)
 * @param {string} params.cardDetails.expirationYear - Expiration year (2 or 4 digits)
 * @param {string} params.cardDetails.cvv - CVV code
 * @param {string} [params.address] - Street address
 * @param {string} [params.city] - City
 * @param {string} [params.state] - State/Province
 * @param {string} [params.postcode] - Postal/ZIP code
 * @param {string} [params.identificationType] - Identification type (default: 'identification_id')
 * @param {string} [params.identificationValue] - Identification value
 * @param {string} [params.merchantReferenceId] - Merchant reference ID
 * @param {string} [params.payoutMethodType] - Payout method type (e.g., 'xx_mastercardglobal_card')
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {Promise<Object>} Rapyd beneficiary data
 */
export const createCardBeneficiary = async ({
	firstName,
	lastName,
	email,
	phoneNumber,
	country,
	currency,
	entityType,
	cardDetails,
	address = null,
	city = null,
	state = null,
	postcode = null,
	identificationType = null,
	identificationValue = null,
	merchantReferenceId = null,
	payoutMethodType = null,
	metadata = {},
	requiredFields = null,
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
			category: 'card',
			entity_type: entityType,
			metadata,
		};

		// Add address fields if provided
		if (address) {
			body.address = address;
		}
		if (city) {
			body.city = city;
		}
		if (state) {
			body.state = state;
		}
		if (postcode) {
			body.postcode = postcode;
		}

		// Add identification fields if provided
		if (identificationType) {
			body.identification_type = identificationType;
		}
		if (identificationValue) {
			body.identification_value = identificationValue;
		}

		// Add merchant reference ID if provided
		if (merchantReferenceId) {
			body.merchant_reference_id = merchantReferenceId;
		}

		// Add default_payout_method_type if provided
		if (payoutMethodType) {
			body.default_payout_method_type = payoutMethodType;
		}

		// Add payment_type for card beneficiaries (required for some payment methods)
		// Default to "priority" as per Rapyd API example
		body.payment_type = 'priority';

		// Add card details (at root level as per Rapyd API)
		if (cardDetails) {
			body.card_number = cardDetails.cardNumber;
			body.card_expiration_month = cardDetails.expirationMonth;
			// Convert 2-digit year to 4-digit year for Rapyd API
			// Rapyd requires 4-digit year format (e.g., "2030" not "30")
			let expirationYear = cardDetails.expirationYear;
			if (expirationYear && expirationYear.length === 2) {
				// Convert 2-digit year to 4-digit (e.g., "30" -> "2030")
				expirationYear = '20' + expirationYear;
			}
			body.card_expiration_year = expirationYear;
			body.card_cvv = cardDetails.cvv;
		}

		// If required fields are provided, filter body to only include allowed fields
		// and ensure required fields are present
		if (requiredFields && requiredFields.beneficiary_required_fields) {
			const allowedFields =
				requiredFields.beneficiary_required_fields.map(
					field => field.name
				);
			const requiredFieldNames =
				requiredFields.beneficiary_required_fields
					.filter(field => field.required !== false)
					.map(field => field.name);

			// Log for debugging
			console.log(
				'[createCardBeneficiary] Allowed fields:',
				allowedFields
			);
			console.log(
				'[createCardBeneficiary] Required fields:',
				requiredFieldNames
			);

			// Filter body to only include allowed fields
			const filteredBody = {};
			for (const [key, value] of Object.entries(body)) {
				// Map our field names to Rapyd field names
				const rapydFieldName = key; // Most fields match
				if (
					allowedFields.includes(rapydFieldName) ||
					!requiredFields.beneficiary_required_fields.length
				) {
					filteredBody[key] = value;
				} else {
					console.log(
						`[createCardBeneficiary] Filtering out unallowed field: ${key}`
					);
				}
			}

			// Check for missing required fields
			for (const requiredField of requiredFieldNames) {
				if (
					filteredBody[requiredField] === undefined ||
					filteredBody[requiredField] === null
				) {
					console.warn(
						`[createCardBeneficiary] Missing required field: ${requiredField}`
					);
				}
			}

			// Use filtered body
			Object.assign(body, filteredBody);
		}

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to create card beneficiary'
		);
	} catch (error) {
		console.error('Rapyd create card beneficiary error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to create card beneficiary in Rapyd'
		);
	}
};

/**
 * Create a beneficiary for payouts (legacy wrapper function)
 * @deprecated Use createBankAccountBeneficiary or createCardBeneficiary instead
 */
export const createBeneficiary = async ({
	firstName,
	lastName,
	email,
	phoneNumber,
	country,
	currency,
	payoutMethodType,
	entityType,
	bankAccountDetails = null,
	cardDetails = null,
	metadata = {},
	address = null,
	city = null,
	state = null,
	postcode = null,
	identificationType = null,
	identificationValue = null,
	merchantReferenceId = null,
}) => {
	// Route to appropriate function based on provided details
	if (cardDetails) {
		return createCardBeneficiary({
			firstName,
			lastName,
			email,
			phoneNumber,
			country,
			currency,
			entityType,
			cardDetails,
			address,
			city,
			state,
			postcode,
			identificationType,
			identificationValue,
			merchantReferenceId,
			payoutMethodType,
			metadata,
		});
	} else if (bankAccountDetails) {
		return createBankAccountBeneficiary({
			firstName,
			lastName,
			email,
			phoneNumber,
			country,
			currency,
			entityType,
			bankAccountDetails,
			address,
			city,
			state,
			postcode,
			identificationType,
			identificationValue,
			merchantReferenceId,
			payoutMethodType,
			metadata,
		});
	} else {
		throw new Error(
			'Either bankAccountDetails or cardDetails must be provided'
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
	beneficiaryCountry = null,
	beneficiaryEntityType = 'individual',
	senderCountry = null,
	senderCurrency = null,
	senderEntityType = 'company',
	sender = null,
	eWalletId = null,
}) => {
	try {
		const path = '/v1/payouts';
		const body = {
			beneficiary: beneficiaryId,
			payout_amount: amount, // Use payout_amount instead of amount
			payout_currency: currency, // Use payout_currency instead of currency
			description,
			payout_method_type: payoutMethodType,
			metadata: {
				...metadata,
				client_reference_id: reference,
			},
		};

		// Add sender_currency (required)
		if (senderCurrency) {
			body.sender_currency = senderCurrency;
		} else {
			body.sender_currency = currency; // Default to same as payout currency
		}

		// Add beneficiary_country (required - must match beneficiary's country)
		if (beneficiaryCountry) {
			body.beneficiary_country = beneficiaryCountry;
		}

		// Add beneficiary_entity_type (required)
		if (beneficiaryEntityType) {
			body.beneficiary_entity_type = beneficiaryEntityType;
		}

		// Add sender_country (required)
		if (senderCountry) {
			body.sender_country = senderCountry;
		}

		// Add sender_entity_type (required)
		if (senderEntityType) {
			body.sender_entity_type = senderEntityType;
		}

		// Add sender object (required for company payouts)
		if (sender) {
			body.sender = sender;
		}

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
 * Get beneficiary details from Rapyd
 * @param {string} beneficiaryId - Rapyd beneficiary ID
 * @returns {Promise<Object>} Rapyd beneficiary data
 */
export const getBeneficiary = async beneficiaryId => {
	try {
		const path = `/v1/payouts/beneficiary/${beneficiaryId}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to get beneficiary'
		);
	} catch (error) {
		console.error('Rapyd get beneficiary error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get beneficiary from Rapyd'
		);
	}
};

/**
 * Delete a beneficiary from Rapyd
 * @param {string} beneficiaryId - Rapyd beneficiary ID
 * @returns {Promise<Object>} Rapyd response data
 */
export const deleteBeneficiary = async beneficiaryId => {
	try {
		const path = `/v1/payouts/beneficiary/${beneficiaryId}`;
		const response = await makeRapydRequest('DELETE', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to delete beneficiary'
		);
	} catch (error) {
		console.error('Rapyd delete beneficiary error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to delete beneficiary from Rapyd'
		);
	}
};

/**
 * List available payout method types for a country
 * @deprecated Use getPayoutMethodTypesByCurrency instead
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
 * Get all payout method types by currency
 * @param {string} payoutCurrency - Payout currency (e.g., 'USD')
 * @returns {Promise<Array>} Array of payout method types
 */
export const getPayoutMethodTypesByCurrency = async payoutCurrency => {
	try {
		const path = `/v1/payout_method_types?payout_currency=${payoutCurrency}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data || [];
		}

		throw new Error(
			response.status?.message || 'Failed to get payout method types'
		);
	} catch (error) {
		console.error(
			'Rapyd get payout method types by currency error:',
			error
		);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payout method types from Rapyd'
		);
	}
};

/**
 * Get payout method types by category
 * @param {string} category - Category (e.g., 'card', 'bank')
 * @param {string} payoutCurrency - Optional payout currency filter (e.g., 'USD')
 * @param {string} beneficiaryCountry - Optional beneficiary country code (e.g., 'US', 'IN')
 * @returns {Promise<Array>} Array of payout method types filtered by category
 */
export const getPayoutMethodTypesByCategory = async ({
	category,
	payoutCurrency = null,
	beneficiaryCountry = null,
}) => {
	try {
		const queryParams = [`category=${encodeURIComponent(category)}`];
		if (payoutCurrency) {
			queryParams.push(
				`payout_currency=${encodeURIComponent(payoutCurrency)}`
			);
		}
		if (beneficiaryCountry) {
			queryParams.push(
				`beneficiary_country=${encodeURIComponent(beneficiaryCountry)}`
			);
		}
		const path = `/v1/payout_method_types?${queryParams.join('&')}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data || [];
		}

		throw new Error(
			response.status?.message || 'Failed to get payout method types'
		);
	} catch (error) {
		console.error(
			'Rapyd get payout method types by category error:',
			error
		);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payout method types from Rapyd'
		);
	}
};

/**
 * Get required fields for a payout method type
 * @param {string} payoutMethodType - Payout method type (e.g., 'us_general_bank')
 * @param {string} senderCountry - Sender country code (e.g., 'US')
 * @param {string} senderCurrency - Sender currency (e.g., 'USD')
 * @param {string} beneficiaryCountry - Beneficiary country code (e.g., 'US')
 * @param {string} payoutCurrency - Payout currency (e.g., 'USD')
 * @param {string} senderEntityType - Sender entity type (e.g., 'company')
 * @param {string} beneficiaryEntityType - Beneficiary entity type (e.g., 'individual')
 * @param {number} payoutAmount - Payout amount
 * @returns {Promise<Object>} Required fields for the payout method type
 */
export const getPayoutRequiredFields = async ({
	payoutMethodType,
	senderCountry,
	senderCurrency,
	beneficiaryCountry,
	payoutCurrency,
	senderEntityType = 'company',
	beneficiaryEntityType = 'individual',
	payoutAmount = 0,
}) => {
	try {
		// Build query string manually for Node.js compatibility
		const queryParams = [
			`sender_country=${encodeURIComponent(senderCountry)}`,
			`sender_currency=${encodeURIComponent(senderCurrency)}`,
			`beneficiary_country=${encodeURIComponent(beneficiaryCountry)}`,
			`payout_currency=${encodeURIComponent(payoutCurrency)}`,
			`sender_entity_type=${encodeURIComponent(senderEntityType)}`,
			`beneficiary_entity_type=${encodeURIComponent(
				beneficiaryEntityType
			)}`,
			`payout_amount=${encodeURIComponent(String(payoutAmount))}`,
		].join('&');

		const path = `/v1/payout_methods/${payoutMethodType}/required_fields?${queryParams}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to get payout required fields'
		);
	} catch (error) {
		console.error('Rapyd get payout required fields error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payout required fields from Rapyd'
		);
	}
};

/**
 * Check card eligibility for payout
 * @param {string} cardNumber - Card number
 * @param {string} transactionType - Transaction type (default: 'all')
 * @returns {Promise<Object>} Card eligibility data including AFT (Account Funding Transaction) support
 */
export const checkCardEligibility = async ({
	cardNumber,
	transactionType = 'all',
}) => {
	try {
		const path = '/v1/cards/eligibility';
		const body = {
			card_number: cardNumber,
			transaction_type: transactionType,
		};

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		// Log full error response for debugging
		console.error(
			'[checkCardEligibility] Rapyd API returned non-success status:',
			JSON.stringify(response.status, null, 2)
		);

		throw new Error(
			response.status?.message || 'Failed to check card eligibility'
		);
	} catch (error) {
		// Log full error details for debugging
		console.error('[checkCardEligibility] Full error details:', {
			message: error.message,
			responseStatus: error.response?.status,
			responseData: error.response?.data,
			errorCode: error.response?.data?.status?.error_code,
			errorMessage: error.response?.data?.status?.message,
			fullResponse: JSON.stringify(error.response?.data, null, 2),
		});

		// Include error code in the error message for better debugging
		const errorCode = error.response?.data?.status?.error_code;
		const errorMessage =
			error.response?.data?.status?.message ||
			error.message ||
			'Failed to check card eligibility from Rapyd';

		const fullErrorMessage = errorCode
			? `${errorMessage} (Error Code: ${errorCode})`
			: errorMessage;

		throw new Error(fullErrorMessage);
	}
};

/**
 * Get required fields for a payment method type
 * @param {string} paymentMethodType - Payment method type (e.g., 'xx_mastercardglobal_card')
 * @param {string} country - Country code (e.g., 'IN')
 * @param {string} currency - Currency code (e.g., 'USD')
 * @returns {Promise<Object>} Required fields for the payment method type
 */
export const getPaymentMethodRequiredFields = async ({
	paymentMethodType,
	country,
	currency = 'USD',
}) => {
	try {
		// Build query string manually for Node.js compatibility
		const queryParams = [
			`country=${encodeURIComponent(country)}`,
			`currency=${encodeURIComponent(currency)}`,
		].join('&');

		const path = `/v1/payment_methods/${paymentMethodType}/required_fields?${queryParams}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message ||
				'Failed to get payment method required fields'
		);
	} catch (error) {
		console.error('Rapyd get payment method required fields error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payment method required fields from Rapyd'
		);
	}
};

/**
 * Get payment methods by country
 * Returns available payment methods for a specific country
 */
export const getPaymentMethodsByCountry = async (country = 'US') => {
	try {
		const path = `/v1/payment_methods/countries/${country}`;
		const response = await makeRapydRequest('GET', path);

		console.log('[Rapyd Payment Methods] API Response:', {
			country,
			status: response.status?.status,
			data: response.data,
			fullResponse: JSON.stringify(response, null, 2),
		});

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message ||
				'Failed to get payment methods by country'
		);
	} catch (error) {
		console.error('Rapyd get payment methods by country error:', {
			country,
			error: error.message,
			response: error.response?.data,
		});
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payment methods by country from Rapyd'
		);
	}
};

/**
 * Verify webhook signature from Rapyd
 * According to Rapyd documentation:
 * signature = BASE64 ( HASH ( url_path + salt + timestamp + access_key + secret_key + body_string ) )
 * where HASH is HMAC-SHA256
 */
export const verifyWebhookSignature = (
	urlPath,
	payload,
	signature,
	timestamp,
	salt
) => {
	try {
		const secretKey = rapydConfig.secretKey;
		const accessKey = rapydConfig.accessKey;

		// Rapyd webhook signature is calculated as:
		// HMAC-SHA256(url_path + salt + timestamp + access_key + secret_key + body_string)
		// The result is hex (64 characters), then base64 encoded
		const toSign =
			urlPath + salt + timestamp + accessKey + secretKey + payload;
		const hmac = crypto.createHmac('sha256', secretKey);
		hmac.update(toSign);

		// Rapyd signature encoding: BASE64 ( HASH ( ... ) )
		// Based on received signature length (88 chars), Rapyd uses hex->base64 encoding
		// Get hex representation first (64 hex chars = 32 bytes), then base64 encode the hex string
		const hashHex = hmac.digest('hex');
		// Base64 encode the hex string as UTF-8 (not the bytes)
		const expectedSignature = Buffer.from(hashHex, 'utf8').toString(
			'base64'
		);

		// Compare the base64 strings directly
		// Both signatures should be base64 encoded
		const isValid = signature === expectedSignature;

		if (!isValid) {
			// Decode both signatures to see what they contain
			const receivedDecoded = Buffer.from(signature, 'base64').toString(
				'hex'
			);
			const expectedDecoded = Buffer.from(
				expectedSignature,
				'base64'
			).toString('hex');
			console.error('Signature mismatch:', {
				received: signature.substring(0, 50) + '...',
				expected: expectedSignature.substring(0, 50) + '...',
				receivedLength: signature.length,
				expectedLength: expectedSignature.length,
				receivedDecodedHex: receivedDecoded.substring(0, 50) + '...',
				expectedDecodedHex: expectedDecoded.substring(0, 50) + '...',
				urlPath: urlPath,
				hashHex: hashHex.substring(0, 50) + '...',
				toSignPreview: toSign.substring(0, 100) + '...',
			});
		}

		return isValid;
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

/**
 * Normalize country code to ISO 3166-1 ALPHA-2 format
 * Handles phone codes, full country names, and ISO codes
 * @param {string} countryInput - Country code, name, or phone code
 * @returns {string} ISO 3166-1 ALPHA-2 country code (default: 'US')
 */
export const normalizeCountryToISO = countryInput => {
	if (!countryInput) {
		return rapydConfig.defaultCountry || 'US';
	}

	const normalized = String(countryInput).trim().toUpperCase();

	// If already a 2-letter ISO code, return it
	if (/^[A-Z]{2}$/.test(normalized)) {
		return normalized;
	}

	// Handle phone codes (e.g., +1, +44, +91)
	if (normalized.startsWith('+')) {
		const phoneCode = normalized.substring(1);
		const phoneCodeToCountry = {
			1: 'US', // United States/Canada
			44: 'GB', // United Kingdom
			91: 'IN', // India
			33: 'FR', // France
			49: 'DE', // Germany
			86: 'CN', // China
			81: 'JP', // Japan
			52: 'MX', // Mexico
			55: 'BR', // Brazil
			61: 'AU', // Australia
			34: 'ES', // Spain
			39: 'IT', // Italy
			7: 'RU', // Russia
			82: 'KR', // South Korea
		};
		if (phoneCodeToCountry[phoneCode]) {
			return phoneCodeToCountry[phoneCode];
		}
	}

	// Map common country names to ISO codes
	const countryNameMap = {
		'UNITED STATES': 'US',
		'UNITED STATES OF AMERICA': 'US',
		USA: 'US',
		US: 'US',
		'UNITED KINGDOM': 'GB',
		UK: 'GB',
		'GREAT BRITAIN': 'GB',
		INDIA: 'IN',
		FRANCE: 'FR',
		GERMANY: 'DE',
		CHINA: 'CN',
		JAPAN: 'JP',
		MEXICO: 'MX',
		BRAZIL: 'BR',
		AUSTRALIA: 'AU',
		CANADA: 'CA',
		SPAIN: 'ES',
		ITALY: 'IT',
		RUSSIA: 'RU',
		'SOUTH KOREA': 'KR',
		KOREA: 'KR',
		DOMINICAN: 'DO',
		'DOMINICAN REPUBLIC': 'DO',
		HAITI: 'HT',
		PUERTO: 'PR',
		'PUERTO RICO': 'PR',
	};

	if (countryNameMap[normalized]) {
		return countryNameMap[normalized];
	}

	// Default fallback
	console.warn(
		`[Rapyd] Could not normalize country code: ${countryInput}, using default: ${
			rapydConfig.defaultCountry || 'US'
		}`
	);
	return rapydConfig.defaultCountry || 'US';
};

export default {
	createCheckoutPage,
	getPaymentStatus,
	createCustomer,
	createBeneficiary, // Legacy wrapper function
	createBankAccountBeneficiary,
	createCardBeneficiary,
	createPayout,
	getPayoutStatus,
	getPayoutMethodTypes,
	getPayoutMethodTypesByCurrency,
	getPayoutMethodTypesByCategory,
	getPaymentMethodsByCountry,
	getBeneficiary,
	deleteBeneficiary,
	verifyWebhookSignature,
	mapPaymentStatus,
	mapPayoutStatus,
	normalizeCountryToISO,
};
