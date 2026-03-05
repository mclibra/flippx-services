const crypto = require('crypto');

// Request details
const method = 'get';
const path =
	'/v1/payouts/beneficiary/beneficiary_7650447a0d2a8faf65879b4abbeb58ed';
const timestamp = Math.floor(Date.now() / 1000).toString();

// Provided salt
const salt = '123d5c414627e1c736ae8e1b5348038b' + timestamp;

// Get credentials from environment or command line arguments
// Usage: node test-rapyd-signature-get.js <access_key> <secret_key>
const accessKey = 'rak_00CEBF28AD93F24EE91D';
const secretKey =
	'rsk_e6454ed30566cbe411222631cb43d120708c3d6e71da71bc0c5dccfefd3148dd77e3342893fa8ec5';

if (!accessKey || !secretKey) {
	console.error(
		'ERROR: RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY must be provided'
	);
	console.error(
		'Usage: node test-rapyd-signature-get.js <access_key> <secret_key>'
	);
	console.error(
		'Or set RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY environment variables'
	);
	process.exit(1);
}

console.log('=== Rapyd Signature Generation (GET Request) ===');
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

// For GET requests, body string is empty
const bodyString = '';
console.log('Body String: (empty for GET requests)');
console.log('Body String Length:', bodyString.length);
console.log('');

// Construct the string to sign
// Format: method + path + salt + timestamp + access_key + secret_key + body_string
// For GET requests, body_string is empty
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
console.log('');

// Show the full request details
console.log('=== Full Request Details ===');
console.log(`URL: https://sandboxapi.rapyd.net${path}`);
console.log('Method: GET');
console.log('Body: (none for GET requests)');
console.log('');

// Generate complete curl command
const url = `https://sandboxapi.rapyd.net${path}`;
const curlCommand = `curl -X GET "${url}" \\
  -H "access_key: ${accessKey}" \\
  -H "salt: ${salt}" \\
  -H "timestamp: ${timestamp}" \\
  -H "signature: ${signature}"`;

console.log('=== Complete cURL Command ===');
console.log(curlCommand);
