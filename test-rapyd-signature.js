const crypto = require('crypto');

// Provided body (will be converted to compact JSON)
const body = {
	payout_amount: 5,
	payout_method_type: 'xx_visaglobal_card',
	sender_currency: 'USD',
	sender_country: 'IN',
	beneficiary_country: 'IN',
	payout_currency: 'USD',
	sender_entity_type: 'individual',
	beneficiary_entity_type: 'individual',
	sender: {
		first_name: 'John',
		last_name: 'Doe',
		address: '123 First Street',
		city: 'Anytown',
		date_of_birth: '22/02/1980',
	},
	beneficiary: {
		first_name: 'Jane',
		last_name: 'Smith',
		card_number: '4111111111111111',
		card_expiration_month: '12',
		card_expiration_year: '25',
		state: 'MH',
	},
	description: 'Payout to card',
	purpose_code: 'other',
	beneficiary_relationship: 'self',
	statement_descriptor: 'spare parts',
};

// Request details
const method = 'post';
const path = '/v1/payouts';
const timestamp = Math.floor(Date.now() / 1000).toString();

// Provided salt
const salt = '123d5c414627e1c736ae8e1b5348038b' + timestamp;

// Get credentials from environment or command line arguments
// Usage: node test-rapyd-signature.js <access_key> <secret_key>
const accessKey = 'rak_00CEBF28AD93F24EE91D';
const secretKey =
	'rsk_e6454ed30566cbe411222631cb43d120708c3d6e71da71bc0c5dccfefd3148dd77e3342893fa8ec5';

if (!accessKey || !secretKey) {
	console.error(
		'ERROR: RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY must be provided'
	);
	console.error(
		'Usage: node test-rapyd-signature.js <access_key> <secret_key>'
	);
	console.error(
		'Or set RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY environment variables'
	);
	process.exit(1);
}

console.log('=== Rapyd Signature Generation ===');
console.log('Access Key:', accessKey);
console.log(
	'Secret Key:',
	secretKey ? secretKey.substring(0, 10) + '...' : 'NOT SET'
);
console.log('Salt:', salt);
console.log('Timestamp:', timestamp);
console.log('Method:', method);
console.log('Path:', path);
console.log('');

// Convert body to compact JSON string
const bodyString = JSON.stringify(body);
console.log('Body String:', bodyString);
console.log('Body String Length:', bodyString.length);
console.log(
	'Body String Hex:',
	Buffer.from(bodyString, 'utf8').toString('hex')
);
console.log('');

// Construct the string to sign
// Format: method + path + salt + timestamp + access_key + secret_key + body_string
const toSign =
	method.toLowerCase() +
	path +
	salt +
	timestamp +
	accessKey +
	secretKey +
	bodyString;

console.log('=== String to Sign ===');
console.log('Length:', toSign.length);
console.log('Preview:', toSign.substring(0, 100) + '...');
console.log('Full:', toSign);
console.log('Hex:', Buffer.from(toSign, 'utf8').toString('hex'));
console.log('');

// Generate HMAC-SHA256 signature
// CRITICAL: Rapyd requires BASE64 encoding of the HMAC-SHA256 hash
// Format: BASE64(HMAC-SHA256(secret_key, toSign))
const hmac = crypto.createHmac('sha256', secretKey);
hmac.update(toSign);
// Convert hex digest to BASE64 as per Rapyd documentation
const signature = Buffer.from(hmac.digest('hex')).toString('base64');

console.log('=== Generated Signature ===');
console.log('Signature:', signature);
console.log('Signature Length:', signature.length);
console.log('');

// Also show what headers should be sent
console.log('=== Request Headers ===');
console.log('access_key:', accessKey);
console.log('salt:', salt);
console.log('timestamp:', timestamp);
console.log('signature:', signature);
console.log('Content-Type: application/json');
console.log('');

// Show the full request details
console.log('=== Full Request Details ===');
console.log(`URL: https://sandboxapi.rapyd.net${path}`);
console.log('Method: POST');
console.log('Body:', bodyString);
console.log('');

// Generate complete curl command
const url = `https://sandboxapi.rapyd.net${path}`;
const curlCommand = `curl -X POST "${url}" \\
  -H "access_key: ${accessKey}" \\
  -H "salt: ${salt}" \\
  -H "timestamp: ${timestamp}" \\
  -H "signature: ${signature}" \\
  -H "Content-Type: application/json" \\
  -d '${bodyString}'`;

console.log('=== Complete cURL Command ===');
console.log(curlCommand);
