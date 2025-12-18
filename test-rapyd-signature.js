const crypto = require('crypto');

// Provided body (will be converted to compact JSON)
const body = {
	amount: '1.99',
	currency: 'USD',
	description: 'Plan Purchase - Starter Plan',
	complete_payment_url:
		'http://localhost:3000/api/wallet/purchase/success?session_id=vcash_68e3aab66e2ca74fe87fbf7b_1766075214287',
	error_payment_url:
		'http://localhost:3000/api/wallet/purchase/cancel?session_id=vcash_68e3aab66e2ca74fe87fbf7b_1766075214287',
	metadata: {
		userId: '68e3aab66e2ca74fe87fbf7b',
		sessionId: 'vcash_68e3aab66e2ca74fe87fbf7b_1766075214287',
		planId: '6943e570c8235ce4e54623df',
	},
};

// Provided salt
const salt = '736ae8e1b5348038b277d5c414627e1c';

// Request details
const method = 'post';
const path = '/v1/checkout';
const timestamp = '1766075214'; // From the logs

// Get credentials from environment or command line arguments
// Usage: node test-rapyd-signature.js <access_key> <secret_key>
const accessKey = "rak_00CEBF28AD93F24EE91D";
const secretKey = "rsk_e6454ed30566cbe411222631cb43d120708c3d6e71da71bc0c5dccfefd3148dd77e3342893fa8ec5";

if (!accessKey || !secretKey) {
	console.error('ERROR: RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY must be provided');
	console.error('Usage: node test-rapyd-signature.js <access_key> <secret_key>');
	console.error('Or set RAPYD_ACCESS_KEY and RAPYD_SECRET_KEY environment variables');
	process.exit(1);
}

console.log('=== Rapyd Signature Generation ===');
console.log('Access Key:', accessKey);
console.log('Secret Key:', secretKey ? secretKey.substring(0, 10) + '...' : 'NOT SET');
console.log('Salt:', salt);
console.log('Timestamp:', timestamp);
console.log('Method:', method);
console.log('Path:', path);
console.log('');

// Convert body to compact JSON string
const bodyString = JSON.stringify(body);
console.log('Body String:', bodyString);
console.log('Body String Length:', bodyString.length);
console.log('Body String Hex:', Buffer.from(bodyString, 'utf8').toString('hex'));
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
console.log('URL: https://sandboxapi.rapyd.net/v1/checkout');
console.log('Method: POST');
console.log('Body:', bodyString);
