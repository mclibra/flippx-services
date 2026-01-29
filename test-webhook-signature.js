#!/usr/bin/env node

/**
 * Test script to validate Rapyd webhook signature
 * Usage: node test-webhook-signature.js
 */

const crypto = require('crypto');

// Test data from logs
const urlPath = 'https://dev.api.getflippx.com/api/wallet/webhook/rapyd';
const salt = 'owcXEL4SpFn9RXiT8r/HAQ==';
const timestamp = '1769695641';
const accessKey = process.env.RAPYD_ACCESS_KEY || 'rak_00CEBF28AD93F24EE91D';
const secretKey = process.env.RAPYD_SECRET_KEY || 'rsk_e6454ed30566cbe411222631...'; // Truncated for security
const receivedSignature = 'ZDU2NmQ2YzM1NGMwMjZmNzMyN2JkZGYzODFjNTkxZWY0MzRkNzI4ZjE4MzBjNDNmMGY4N2U3ZDc4Mjc2MWFmMA==';

// Sample webhook body (minified JSON)
const bodyString = JSON.stringify({
	id: 'wh_837374deaac2e01ff61d031e4bdeb901',
	type: 'PAYMENT_COMPLETED',
	data: {
		id: 'payment_3d157f3424f1aeca3608153ae4d243fe',
		amount: 1.99,
		status: 'CLO',
	},
});

console.log('Testing Rapyd webhook signature verification\n');
console.log('Parameters:');
console.log('  urlPath:', urlPath);
console.log('  salt:', salt);
console.log('  timestamp:', timestamp);
console.log('  accessKey:', accessKey.substring(0, 20) + '...');
console.log('  bodyString length:', bodyString.length);
console.log('  receivedSignature:', receivedSignature.substring(0, 50) + '...\n');

// Method 1: Direct base64 encoding
const toSign1 = urlPath + salt + timestamp + accessKey + secretKey + bodyString;
const hmac1 = crypto.createHmac('sha256', secretKey);
hmac1.update(toSign1);
const signature1 = hmac1.digest('base64');
console.log('Method 1 (direct base64):');
console.log('  Signature:', signature1.substring(0, 50) + '...');
console.log('  Length:', signature1.length);
console.log('  Match:', signature1 === receivedSignature);
console.log('');

// Method 2: Hex then base64 encode hex string (as UTF-8)
const hmac2 = crypto.createHmac('sha256', secretKey);
hmac2.update(toSign1);
const hashHex = hmac2.digest('hex');
const signature2 = Buffer.from(hashHex, 'utf8').toString('base64');
console.log('Method 2 (hex string -> base64 as UTF-8):');
console.log('  HashHex:', hashHex.substring(0, 50) + '...');
console.log('  HashHex length:', hashHex.length);
console.log('  Signature:', signature2.substring(0, 50) + '...');
console.log('  Length:', signature2.length);
console.log('  Match:', signature2 === receivedSignature);
console.log('  Decoded signature2:', Buffer.from(signature2, 'base64').toString('hex').substring(0, 50) + '...');
console.log('');

// Method 2b: Try with actual body from webhook (need to get it)
console.log('Note: The bodyString in this test is simplified.');
console.log('The actual webhook body might be different and needs to match exactly.');
console.log('');

// Method 3: Hex bytes -> base64
const hmac3 = crypto.createHmac('sha256', secretKey);
hmac3.update(toSign1);
const hashHex3 = hmac3.digest('hex');
const signature3 = Buffer.from(hashHex3, 'hex').toString('base64');
console.log('Method 3 (hex bytes -> base64):');
console.log('  Signature:', signature3.substring(0, 50) + '...');
console.log('  Length:', signature3.length);
console.log('  Match:', signature3 === receivedSignature);
console.log('');

// Decode received signature to see what it contains
try {
	const decodedReceived = Buffer.from(receivedSignature, 'base64');
	console.log('Received signature decoded:');
	console.log('  Length (bytes):', decodedReceived.length);
	console.log('  Hex:', decodedReceived.toString('hex').substring(0, 50) + '...');
	console.log('  UTF-8:', decodedReceived.toString('utf8').substring(0, 50));
} catch (e) {
	console.log('Error decoding received signature:', e.message);
}
