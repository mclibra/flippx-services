/* eslint-disable no-undef */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { secretSalt } from '../../../config';

const aad = Buffer.from('0123456789', 'hex');

export const generateToken = code => {
	const nonce = randomBytes(12);
	const cipher = createCipheriv('aes-192-gcm', secretSalt, nonce);

	cipher.setAAD(aad, {
		plaintextLength: Buffer.byteLength(code),
	});

	const token = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return Buffer.concat([nonce, authTag, token])
		.toString('base64')
		.replace(/\//g, '_')
		.replace(/\+/g, '.')
		.replace(/=/g, '-');
};

export const decryptToken = token => {
	const rawData = Buffer.from(
		token.replace(/_/g, '/').replace(/\./g, '+').replace(/-/g, '='),
		'base64'
	);
	let nonce = rawData.slice(0, 12);
	let authTag = rawData.slice(12, 28);
	let data = rawData.slice(28);

	const decipher = createDecipheriv('aes-192-gcm', secretSalt, nonce);
	decipher.setAuthTag(authTag);
	decipher.setAAD(aad, {
		plaintextLength: token.length,
	});

	try {
		return decipher.update(data, 'binary', 'utf8') + decipher.final('utf8');
	} catch (err) {
		return null;
	}
};
