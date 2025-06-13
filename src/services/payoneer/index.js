import axios from 'axios';
import crypto from 'crypto';
import { payoneerConfig } from '../../../config';

// Create HTTP client with default config
const payoneerClient = axios.create({
	baseURL: payoneerConfig.apiBaseUrl,
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${payoneerConfig.apiKey}`,
		'Program-Id': payoneerConfig.programId,
	},
});

/**
 * Create a payment session with Payoneer
 */
export const createPaymentSession = async ({
	amount,
	currency = 'USD',
	description,
	successUrl,
	cancelUrl,
	metadata,
}) => {
	try {
		const response = await payoneerClient.post('/checkout/sessions', {
			amount,
			currency,
			description,
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata,
		});

		return response.data;
	} catch (error) {
		console.error(
			'Payoneer API error:',
			error.response?.data || error.message
		);
		throw new Error('Failed to create payment session with Payoneer');
	}
};

/**
 * Verify a payment session status
 */
export const getPaymentSession = async sessionId => {
	try {
		const response = await payoneerClient.get(
			`/checkout/sessions/${sessionId}`
		);
		return response.data;
	} catch (error) {
		console.error(
			'Payoneer API error:',
			error.response?.data || error.message
		);
		throw new Error('Failed to verify payment session with Payoneer');
	}
};

/**
 * Process a payout to a bank account
 */
export const createPayout = async ({
	payeeId, // Payoneer payee ID
	amount,
	currency = 'USD',
	description,
	reference,
	metadata,
}) => {
	try {
		const response = await payoneerClient.post('/payouts', {
			payee_id: payeeId,
			amount,
			currency,
			description,
			client_reference_id: reference,
			metadata,
		});

		return response.data;
	} catch (error) {
		console.error(
			'Payoneer API error:',
			error.response?.data || error.message
		);
		throw new Error('Failed to create payout with Payoneer');
	}
};

/**
 * Verify webhook signature
 */
export const verifyWebhookSignature = (payload, signature) => {
	const hmac = crypto.createHmac('sha256', payoneerConfig.webhookSecret);
	const expectedSignature = hmac.update(payload).digest('hex');
	return crypto.timingSafeEqual(
		// eslint-disable-next-line no-undef
		Buffer.from(signature),
		// eslint-disable-next-line no-undef
		Buffer.from(expectedSignature)
	);
};

/**
 * Create a Payoneer payee (for payouts)
 */
export const createPayee = async userData => {
	try {
		const response = await payoneerClient.post('/payees', {
			type: 'INDIVIDUAL',
			contact: {
				first_name: userData.name.firstName,
				last_name: userData.name.lastName,
				email: userData.email,
				country_code: userData.countryCode,
				phone_number: userData.phone,
			},
		});

		return response.data;
	} catch (error) {
		console.error(
			'Payoneer API error:',
			error.response?.data || error.message
		);
		throw new Error('Failed to create payee with Payoneer');
	}
};

export default {
	createPaymentSession,
	getPaymentSession,
	createPayout,
	verifyWebhookSignature,
	createPayee,
};
