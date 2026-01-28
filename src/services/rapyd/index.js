import crypto from 'crypto';
import https from 'https';
import { URL } from 'url';
import { rapydConfig } from '../../../config';

// Rapyd API base URL
const RAPYD_API_BASE_URL =
	rapydConfig.apiBaseUrl || 'https://sandboxapi.rapyd.net';

/**
 * Convert phone country code to ISO 3166-1 ALPHA-2 country code
 * Rapyd requires ISO country codes (e.g., "IN", "US") not phone codes (e.g., "+91", "+1")
 */
const convertPhoneCountryCodeToISO = phoneCountryCode => {
	if (!phoneCountryCode) {
		return 'US'; // Default to US
	}

	// Remove leading + if present
	const code = phoneCountryCode.replace(/^\+/, '').trim();

	// Mapping of common phone country codes to ISO codes
	const phoneToISOMap = {
		'1': 'US', // United States/Canada
		'91': 'IN', // India
		'44': 'GB', // United Kingdom
		'33': 'FR', // France
		'49': 'DE', // Germany
		'81': 'JP', // Japan
		'86': 'CN', // China
		'61': 'AU', // Australia
		'55': 'BR', // Brazil
		'52': 'MX', // Mexico
		'34': 'ES', // Spain
		'39': 'IT', // Italy
		'7': 'RU', // Russia
		'82': 'KR', // South Korea
		'65': 'SG', // Singapore
		'971': 'AE', // UAE
		'966': 'SA', // Saudi Arabia
		'27': 'ZA', // South Africa
		'31': 'NL', // Netherlands
		'46': 'SE', // Sweden
		'47': 'NO', // Norway
		'45': 'DK', // Denmark
		'358': 'FI', // Finland
		'41': 'CH', // Switzerland
		'43': 'AT', // Austria
		'32': 'BE', // Belgium
		'351': 'PT', // Portugal
		'30': 'GR', // Greece
		'48': 'PL', // Poland
		'420': 'CZ', // Czech Republic
		'36': 'HU', // Hungary
		'40': 'RO', // Romania
		'353': 'IE', // Ireland
		'64': 'NZ', // New Zealand
		'60': 'MY', // Malaysia
		'66': 'TH', // Thailand
		'84': 'VN', // Vietnam
		'62': 'ID', // Indonesia
		'63': 'PH', // Philippines
		'92': 'PK', // Pakistan
		'880': 'BD', // Bangladesh
		'94': 'LK', // Sri Lanka
		'95': 'MM', // Myanmar
		'977': 'NP', // Nepal
		'961': 'LB', // Lebanon
		'962': 'JO', // Jordan
		'20': 'EG', // Egypt
		'234': 'NG', // Nigeria
		'254': 'KE', // Kenya
		'233': 'GH', // Ghana
		'256': 'UG', // Uganda
		'255': 'TZ', // Tanzania
		'250': 'RW', // Rwanda
		'212': 'MA', // Morocco
		'213': 'DZ', // Algeria
		'216': 'TN', // Tunisia
		'218': 'LY', // Libya
		'220': 'GM', // Gambia
		'221': 'SN', // Senegal
		'222': 'MR', // Mauritania
		'223': 'ML', // Mali
		'224': 'GN', // Guinea
		'225': 'CI', // Côte d'Ivoire
		'226': 'BF', // Burkina Faso
		'227': 'NE', // Niger
		'228': 'TG', // Togo
		'229': 'BJ', // Benin
		'230': 'MU', // Mauritius
		'231': 'LR', // Liberia
		'232': 'SL', // Sierra Leone
		'235': 'TD', // Chad
		'236': 'CF', // Central African Republic
		'237': 'CM', // Cameroon
		'238': 'CV', // Cape Verde
		'239': 'ST', // São Tomé and Príncipe
		'240': 'GQ', // Equatorial Guinea
		'241': 'GA', // Gabon
		'242': 'CG', // Republic of the Congo
		'243': 'CD', // Democratic Republic of the Congo
		'244': 'AO', // Angola
		'245': 'GW', // Guinea-Bissau
		'246': 'IO', // British Indian Ocean Territory
		'247': 'AC', // Ascension Island
		'248': 'SC', // Seychelles
		'249': 'SD', // Sudan
		'251': 'ET', // Ethiopia
		'252': 'SO', // Somalia
		'253': 'DJ', // Djibouti
		'257': 'BI', // Burundi
		'258': 'MZ', // Mozambique
		'260': 'ZM', // Zambia
		'261': 'MG', // Madagascar
		'262': 'RE', // Réunion
		'263': 'ZW', // Zimbabwe
		'264': 'NA', // Namibia
		'265': 'MW', // Malawi
		'266': 'LS', // Lesotho
		'267': 'BW', // Botswana
		'268': 'SZ', // Eswatini
		'269': 'KM', // Comoros
		'290': 'SH', // Saint Helena
		'291': 'ER', // Eritrea
		'297': 'AW', // Aruba
		'298': 'FO', // Faroe Islands
		'299': 'GL', // Greenland
		'350': 'GI', // Gibraltar
		'352': 'LU', // Luxembourg
		'354': 'IS', // Iceland
		'356': 'MT', // Malta
		'357': 'CY', // Cyprus
		'370': 'LT', // Lithuania
		'371': 'LV', // Latvia
		'372': 'EE', // Estonia
		'373': 'MD', // Moldova
		'374': 'AM', // Armenia
		'375': 'BY', // Belarus
		'376': 'AD', // Andorra
		'377': 'MC', // Monaco
		'378': 'SM', // San Marino
		'379': 'VA', // Vatican City
		'380': 'UA', // Ukraine
		'381': 'RS', // Serbia
		'382': 'ME', // Montenegro
		'383': 'XK', // Kosovo
		'385': 'HR', // Croatia
		'386': 'SI', // Slovenia
		'387': 'BA', // Bosnia and Herzegovina
		'389': 'MK', // North Macedonia
		'590': 'BL', // Saint Barthélemy
		'591': 'BO', // Bolivia
		'592': 'GY', // Guyana
		'593': 'EC', // Ecuador
		'594': 'GF', // French Guiana
		'595': 'PY', // Paraguay
		'596': 'MQ', // Martinique
		'597': 'SR', // Suriname
		'598': 'UY', // Uruguay
		'599': 'CW', // Curaçao
		'670': 'TL', // East Timor
		'672': 'NF', // Norfolk Island
		'673': 'BN', // Brunei
		'674': 'NR', // Nauru
		'675': 'PG', // Papua New Guinea
		'676': 'TO', // Tonga
		'677': 'SB', // Solomon Islands
		'678': 'VU', // Vanuatu
		'679': 'FJ', // Fiji
		'680': 'PW', // Palau
		'681': 'WF', // Wallis and Futuna
		'682': 'CK', // Cook Islands
		'683': 'NU', // Niue
		'685': 'WS', // Samoa
		'686': 'KI', // Kiribati
		'687': 'NC', // New Caledonia
		'688': 'TV', // Tuvalu
		'689': 'PF', // French Polynesia
		'850': 'KP', // North Korea
		'852': 'HK', // Hong Kong
		'853': 'MO', // Macau
		'855': 'KH', // Cambodia
		'856': 'LA', // Laos
		'880': 'BD', // Bangladesh
		'886': 'TW', // Taiwan
		'960': 'MV', // Maldives
		'961': 'LB', // Lebanon
		'962': 'JO', // Jordan
		'963': 'SY', // Syria
		'964': 'IQ', // Iraq
		'965': 'KW', // Kuwait
		'966': 'SA', // Saudi Arabia
		'967': 'YE', // Yemen
		'968': 'OM', // Oman
		'970': 'PS', // Palestine
		'971': 'AE', // UAE
		'972': 'IL', // Israel
		'973': 'BH', // Bahrain
		'974': 'QA', // Qatar
		'975': 'BT', // Bhutan
		'976': 'MN', // Mongolia
		'977': 'NP', // Nepal
		'992': 'TJ', // Tajikistan
		'993': 'TM', // Turkmenistan
		'994': 'AZ', // Azerbaijan
		'995': 'GE', // Georgia
		'996': 'KG', // Kyrgyzstan
		'998': 'UZ', // Uzbekistan
	};

	// Check if we have a mapping
	if (phoneToISOMap[code]) {
		return phoneToISOMap[code];
	}

	// If no mapping found, try to use address.country if available, otherwise default to US
	console.warn(
		`No ISO mapping found for phone country code: ${phoneCountryCode}, defaulting to US`
	);
	return 'US';
};

/**
 * Convert country name or code to ISO 3166-1 ALPHA-2 country code
 * Handles phone codes, full country names, and ISO codes
 * Rapyd requires ISO country codes (e.g., "IN", "US")
 */
export const normalizeCountryToISO = countryInput => {
	if (!countryInput) {
		return 'US'; // Default to US
	}

	const input = String(countryInput).trim();

	// If it's already a 2-letter uppercase code, validate and return
	if (/^[A-Z]{2}$/.test(input)) {
		return input;
	}

	// If it's a 2-letter lowercase code, uppercase it
	if (/^[a-z]{2}$/.test(input)) {
		return input.toUpperCase();
	}

	// Check if it's a phone country code (starts with + or is numeric)
	if (/^\+?\d+$/.test(input)) {
		return convertPhoneCountryCodeToISO(input);
	}

	// Mapping of common country names to ISO codes
	const countryNameToISOMap = {
		// Common variations
		'united states': 'US',
		'united states of america': 'US',
		'usa': 'US',
		'us': 'US',
		'india': 'IN',
		'united kingdom': 'GB',
		'uk': 'GB',
		'great britain': 'GB',
		'france': 'FR',
		'germany': 'DE',
		'japan': 'JP',
		'china': 'CN',
		'australia': 'AU',
		'brazil': 'BR',
		'mexico': 'MX',
		'spain': 'ES',
		'italy': 'IT',
		'russia': 'RU',
		'russian federation': 'RU',
		'south korea': 'KR',
		'korea': 'KR',
		'singapore': 'SG',
		'uae': 'AE',
		'united arab emirates': 'AE',
		'saudi arabia': 'SA',
		'south africa': 'ZA',
		'netherlands': 'NL',
		'sweden': 'SE',
		'norway': 'NO',
		'denmark': 'DK',
		'finland': 'FI',
		'switzerland': 'CH',
		'austria': 'AT',
		'belgium': 'BE',
		'portugal': 'PT',
		'greece': 'GR',
		'poland': 'PL',
		'czech republic': 'CZ',
		'hungary': 'HU',
		'romania': 'RO',
		'ireland': 'IE',
		'new zealand': 'NZ',
		'malaysia': 'MY',
		'thailand': 'TH',
		'vietnam': 'VN',
		'indonesia': 'ID',
		'philippines': 'PH',
		'pakistan': 'PK',
		'bangladesh': 'BD',
		'sri lanka': 'LK',
		'myanmar': 'MM',
		'nepal': 'NP',
		'lebanon': 'LB',
		'jordan': 'JO',
		'egypt': 'EG',
		'nigeria': 'NG',
		'kenya': 'KE',
		'ghana': 'GH',
		'uganda': 'UG',
		'tanzania': 'TZ',
		'rwanda': 'RW',
		'morocco': 'MA',
		'algeria': 'DZ',
		'tunisia': 'TN',
		'libya': 'LY',
		'canada': 'CA',
		'argentina': 'AR',
		'chile': 'CL',
		'colombia': 'CO',
		'peru': 'PE',
		'venezuela': 'VE',
		'ecuador': 'EC',
		'bolivia': 'BO',
		'paraguay': 'PY',
		'uruguay': 'UY',
		'israel': 'IL',
		'turkey': 'TR',
		'iran': 'IR',
		'iraq': 'IQ',
		'kuwait': 'KW',
		'qatar': 'QA',
		'bahrain': 'BH',
		'oman': 'OM',
		'yemen': 'YE',
		'afghanistan': 'AF',
		'kazakhstan': 'KZ',
		'uzbekistan': 'UZ',
		'kyrgyzstan': 'KG',
		'tajikistan': 'TJ',
		'turkmenistan': 'TM',
		'azerbaijan': 'AZ',
		'georgia': 'GE',
		'armenia': 'AM',
		'ukraine': 'UA',
		'belarus': 'BY',
		'moldova': 'MD',
		'croatia': 'HR',
		'serbia': 'RS',
		'bulgaria': 'BG',
		'slovakia': 'SK',
		'slovenia': 'SI',
		'estonia': 'EE',
		'latvia': 'LV',
		'lithuania': 'LT',
		'iceland': 'IS',
		'liechtenstein': 'LI',
		'luxembourg': 'LU',
		'malta': 'MT',
		'cyprus': 'CY',
		'monaco': 'MC',
		'san marino': 'SM',
		'andorra': 'AD',
		'vatican': 'VA',
		'vatican city': 'VA',
	};

	// Try to find in country name map (case-insensitive)
	const normalizedInput = input.toLowerCase();
	if (countryNameToISOMap[normalizedInput]) {
		return countryNameToISOMap[normalizedInput];
	}

	// If no match found, try phone code conversion as fallback
	if (/^\+?\d+$/.test(input)) {
		return convertPhoneCountryCodeToISO(input);
	}

	// If still no match, log warning and default to US
	console.warn(
		`Could not normalize country "${input}" to ISO code, defaulting to US`
	);
	return 'US';
};

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
	paymentMethodTypesInclude = [],
	paymentMethodTypesExclude = [],
	paymentMethodTypeCategories = [],
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

		if (paymentMethodTypesInclude.length > 0) {
			body.payment_method_types_include = paymentMethodTypesInclude;
		}

		if (paymentMethodTypesExclude.length > 0) {
			body.payment_method_types_exclude = paymentMethodTypesExclude;
		}

		if (paymentMethodTypeCategories.length > 0) {
			body.payment_method_type_categories = paymentMethodTypeCategories;
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
 * Matches Rapyd API structure: flat structure with category, entity_type, etc.
 */
export const createBeneficiary = async ({
	firstName,
	lastName,
	email,
	phoneNumber,
	country,
	currency,
	bankAccountDetails,
	address = null,
	city = null,
	state = null,
	postcode = null,
	identificationType = null,
	identificationValue = null,
	merchantReferenceId = null,
	bicSwift = null,
	routingNumber = null,
}) => {
	try {
		const path = '/v1/payouts/beneficiary';

		// Validate required fields
		if (!firstName || !lastName || !country || !currency) {
			throw new Error(
				'Missing required fields: firstName, lastName, country, and currency are required'
			);
		}

		if (
			!bankAccountDetails ||
			!bankAccountDetails.bankName ||
			!bankAccountDetails.accountNumber
		) {
			throw new Error(
				'Bank account details (bankName, accountNumber) are required'
			);
		}

		// Build body according to Rapyd API structure
		const body = {
			category: 'bank',
			bank_name: String(bankAccountDetails.bankName),
			country: String(country),
			currency: String(currency),
			entity_type: 'individual',
			first_name: String(firstName),
			last_name: String(lastName),
			account_number: String(bankAccountDetails.accountNumber),
		};

		// Add optional email
		if (email) {
			body.email = String(email);
		}

		// Add optional phone number
		if (phoneNumber) {
			body.phone_number = String(phoneNumber);
		}

		// Add address fields (required by Rapyd but we'll make them optional with defaults)
		if (address) {
			body.address = String(address);
		} else {
			// Use a default address if not provided
			body.address = 'Not provided';
		}

		if (city) {
			body.city = String(city);
		} else {
			body.city = 'Not provided';
		}

		if (state) {
			body.state = String(state);
		} else if (country === 'US') {
			// For US, state might be required
			body.state = 'Not provided';
		}

		if (postcode) {
			body.postcode = String(postcode);
		} else {
			body.postcode = '00000';
		}

		// Add identification (required by Rapyd)
		if (identificationType && identificationValue) {
			body.identification_type = String(identificationType);
			body.identification_value = String(identificationValue);
		} else {
			// Use default identification if not provided
			// Note: This might need to be adjusted based on your requirements
			body.identification_type = 'identification_id';
			body.identification_value = 'NOT_PROVIDED';
		}

		// Add merchant reference ID if provided
		if (merchantReferenceId) {
			body.merchant_reference_id = String(merchantReferenceId);
		}

		// Add BIC/SWIFT code if provided (for international transfers)
		if (bicSwift) {
			body.bic_swift = String(bicSwift);
		}

		// For US accounts, routing number might be needed instead of BIC
		// Note: Rapyd API might accept routing_number for US accounts
		// Check Rapyd documentation for your specific use case
		if (routingNumber && country === 'US') {
			// Some Rapyd endpoints might accept routing_number
			// If your API version supports it, uncomment:
			// body.routing_number = String(routingNumber);
		}

		const response = await makeRapydRequest('POST', path, body);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to create beneficiary'
		);
	} catch (error) {
		console.error('Rapyd create beneficiary error:', {
			message: error.message,
			response: error.response?.data,
		});
		throw new Error(
			error.response?.data?.status?.message ||
				error.message ||
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
			amount: String(amount), // Convert to string as per Rapyd requirements
			currency: String(currency),
			description: String(description),
			payout_method_type: String(payoutMethodType),
			metadata: {
				...metadata,
				client_reference_id: String(reference),
			},
		};

		// Add eWallet if provided
		// Note: Rapyd may require an eWallet for payouts. Ensure your Rapyd account
		// has a wallet configured or pass the eWalletId parameter.
		if (eWalletId) {
			body.ewallet = String(eWalletId);
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
 * Get available payment methods for a country
 * This helps identify correct payment method type codes
 */
export const getPaymentMethods = async (country, currency) => {
	try {
		const path = `/v1/payment_methods?country=${country}&currency=${currency}`;
		const response = await makeRapydRequest('GET', path);

		if (response.status?.status === 'SUCCESS') {
			return response.data;
		}

		throw new Error(
			response.status?.message || 'Failed to get payment methods'
		);
	} catch (error) {
		console.error('Rapyd get payment methods error:', error);
		throw new Error(
			error.response?.data?.status?.message ||
				'Failed to get payment methods from Rapyd'
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

export { convertPhoneCountryCodeToISO };

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
	convertPhoneCountryCodeToISO,
	normalizeCountryToISO,
};
