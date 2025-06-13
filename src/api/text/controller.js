import { jwtSign, jwtVerify } from '../../services/jwt/';
import { otpExpiresIn, aws, enableText } from '../../../config';
import { Text } from './model';
import {
	PinpointSMSVoiceV2Client,
	SendTextMessageCommand,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';

/**
 * Sends a text message using AWS PinpointSMSVoiceV2
 */
export const sendMessage = async body => {
	try {
		// Create a record in the database first
		const response = await Text.create(body);

		if (response._id) {
			let textResponse = false;

			try {
				if (enableText) {
					// Initialize the AWS client with proper configuration
					const client = new PinpointSMSVoiceV2Client({
						region: aws.config.region,
						credentials: {
							accessKeyId: aws.config.accessKeyId,
							secretAccessKey: aws.config.secretAccessKey,
						},
					});

					// Prepare the SMS sending command with required parameters
					const sendParams = {
						DestinationPhoneNumber: body.phone,
						OriginationIdentity: aws.originationNumber,
						MessageBody: body.message,
						Context: {
							MessageType: body.verificationCode
								? 'VERIFICATION'
								: 'NOTIFICATION',
						},
						DryRun: !enableText,
					};

					const command = new SendTextMessageCommand(sendParams);

					// Send the SMS
					const result = await client.send(command);
					console.log('SMS sent successfully:', result);
					textResponse = result && result.MessageId;
				} else {
					textResponse = true;
				}
			} catch (smsError) {
				console.error('AWS SMS sending error:', smsError);
			}

			if (textResponse) {
				return {
					status: 200,
					entity: {
						success: true,
						...response.toObject(),
					},
				};
			}
		} else {
			await response.delete();
		}

		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid Parameters',
			},
		};
	} catch (error) {
		console.log('Error sending SMS:', error);
		return {
			status: 500,
			entity: {
				error:
					typeof error === 'string'
						? error
						: 'An error occurred while sending the message',
			},
		};
	}
};

/**
 * Sends a verification code via SMS and returns a verification token
 */
export const sendVerificationCode = async ({
	phone,
	message,
	verificationCode,
}) => {
	try {
		const response = await sendMessage({
			phone,
			message,
			verificationCode,
		});

		if (response.status === 200) {
			return {
				status: 200,
				entity: {
					success: true,
					verificationToken: jwtSign(
						{ phone, verificationCode },
						{ expiresIn: otpExpiresIn }
					),
				},
			};
		}

		return response;
	} catch (error) {
		return {
			status: 500,
			entity: {
				error:
					typeof error === 'string'
						? error
						: 'An error occurred while sending verification code',
			},
		};
	}
};

/**
 * Verifies a verification code against a token
 */
export const verifyVerificationCode = async ({
	phone,
	verificationCode,
	verificationToken,
}) => {
	try {
		const decodedToken = jwtVerify(verificationToken);

		if (
			decodedToken.phone == phone &&
			decodedToken.verificationCode == verificationCode
		) {
			return {
				status: 200,
				entity: {
					success: true,
					signUpToken: jwtSign(
						{ phone },
						{ expiresIn: otpExpiresIn }
					),
				},
			};
		}

		return {
			status: 400,
			entity: {
				success: false,
				error: 'Invalid verification code.',
			},
		};
	} catch (error) {
		return {
			status: 400,
			entity: {
				success: false,
				error:
					error.name == 'TokenExpiredError'
						? 'OTP has expired.'
						: 'Invalid verification code.',
			},
		};
	}
};
