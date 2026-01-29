#!/usr/bin/env node

const crypto = require('crypto');

// Test data
const urlPath = '/api/wallet/webhook/rapyd'; // Try without domain
const salt = 'owcXEL4SpFn9RXiT8r/HAQ==';
const timestamp = '1769695641';
const accessKey = 'rak_00CEBF28AD93F24EE91D';
const secretKey = 'rsk_e6454ed30566cbe411222631...';
const receivedSignature =
	'ZDU2NmQ2YzM1NGMwMjZmNzMyN2JkZGYzODFjNTkxZWY0MzRkNzI4ZjE4MzBjNDNmMGY4N2U3ZDc4Mjc2MWFmMA==';

// IMPORTANT: This must be the EXACT body string from the webhook
// Don't use JSON.stringify - capture the raw body
const bodyString =
	'{"id":"wh_837374deaac2e01ff61d031e4bdeb901","type":"PAYMENT_COMPLETED","data":{"id":"payment_3d157f3424f1aeca3608153ae4d243fe","amount":1.99,"status":"CLO"}}';

function generateRapydSignature(
	urlPath,
	salt,
	timestamp,
	accessKey,
	secretKey,
	bodyString
) {
	const toSign =
		urlPath + salt + timestamp + accessKey + secretKey + bodyString;
	const hmac = crypto.createHmac('sha256', secretKey);
	hmac.update(toSign);
	const hashHex = hmac.digest('hex');
	// Base64 encode the hex string as UTF-8
	return Buffer.from(hashHex, 'utf8').toString('base64');
}

console.log('Testing with path-only URL:');
const signature = generateRapydSignature(
	urlPath,
	salt,
	timestamp,
	accessKey,
	secretKey,
	bodyString
);
console.log('Generated:', signature);
console.log('Received: ', receivedSignature);
console.log('Match:', signature === receivedSignature);
console.log();

// Also try with full URL
const fullUrlPath = 'https://dev.api.getflippx.com/api/wallet/webhook/rapyd';
const signature2 = generateRapydSignature(
	fullUrlPath,
	salt,
	timestamp,
	accessKey,
	secretKey,
	bodyString
);
console.log('Testing with full URL:');
console.log('Generated:', signature2);
console.log('Match:', signature2 === receivedSignature);
