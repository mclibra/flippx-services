import {
	PinpointSMSVoiceV2Client,
	SendTextMessageCommand,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { aws, enableText } from '../../../config';
import { Invite } from './model';

const sanitizePhoneNumbers = phoneNumbers =>
	Array.from(
		new Set(
			(phoneNumbers || [])
				.filter(Boolean)
				.map(phone => `${phone}`.trim())
				.filter(phone => phone.length)
		)
	);

const buildSmsClient = () =>
	new PinpointSMSVoiceV2Client({
		region: aws.config.region,
		credentials: {
			accessKeyId: aws.config.accessKeyId,
			secretAccessKey: aws.config.secretAccessKey,
		},
	});

export const sendInvites = async ({ phoneNumbers, message }, user) => {
	try {
		if (!user?._id) {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Authentication required',
				},
			};
		}

		const sanitizedNumbers = sanitizePhoneNumbers(phoneNumbers);

		if (!sanitizedNumbers.length) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'At least one valid phone number is required',
				},
			};
		}

		// Build message with referrer username and bonus information
		const referrerUsername = user.userName || user.slugName || 'me';
		const defaultReferralMessage = `Join FlippX! Sign up using ${referrerUsername} as your referrer to get a bonus and start playing today!`;

		const messageToSend = (message || '').trim() || defaultReferralMessage;

		if (!messageToSend) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'A message is required to send invites',
				},
			};
		}

		let client = null;

		if (enableText) {
			client = buildSmsClient();
		}

		const results = [];

		for (const phone of sanitizedNumbers) {
			const attemptTime = new Date();

			const invite = await Invite.findOneAndUpdate(
				{ invitedBy: user._id, phone },
				{
					invitedBy: user._id,
					phone,
					message: messageToSend,
					status: 'PENDING',
					error: null,
					lastAttemptAt: attemptTime,
				},
				{
					new: true,
					upsert: true,
					setDefaultsOnInsert: true,
					runValidators: true,
				}
			);

			try {
				if (client) {
					const command = new SendTextMessageCommand({
						DestinationPhoneNumber: phone,
						OriginationIdentity: aws.originationNumber,
						MessageBody: messageToSend,
						Context: {
							MessageType: 'INVITE',
						},
					});

					await client.send(command);
				}

				invite.status = 'SENT';
				invite.sentAt = attemptTime;
				invite.error = null;
				await invite.save();

				results.push({
					phone,
					status: invite.status,
					sentAt: invite.sentAt,
				});
			} catch (error) {
				console.error(`Error sending invite to ${phone}:`, error);

				invite.status = 'FAILED';
				invite.error =
					error?.message ||
					(typeof error === 'string'
						? error
						: 'Failed to send invite');
				await invite.save();

				results.push({
					phone,
					status: invite.status,
					error: invite.error,
				});
			}
		}

		if (client?.destroy) {
			client.destroy();
		}

		return {
			status: 200,
			entity: {
				success: true,
				invites: results,
			},
		};
	} catch (error) {
		console.error('Error sending invites:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error?.message || error,
			},
		};
	}
};

export const getInviteStatuses = async ({ phoneNumbers }, user) => {
	try {
		if (!user?._id) {
			return {
				status: 401,
				entity: {
					success: false,
					error: 'Authentication required',
				},
			};
		}

		const sanitizedNumbers = sanitizePhoneNumbers(phoneNumbers);

		if (!sanitizedNumbers.length) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'At least one valid phone number is required',
				},
			};
		}

		const invites = await Invite.find({
			invitedBy: user._id,
			phone: { $in: sanitizedNumbers },
		})
			.sort({ lastAttemptAt: -1 })
			.lean();

		const inviteMap = invites.reduce((acc, invite) => {
			acc.set(invite.phone, invite);
			return acc;
		}, new Map());

		const results = sanitizedNumbers.map(phone => {
			if (!inviteMap.has(phone)) {
				return {
					phone,
					status: 'NOT_FOUND',
				};
			}

			const invite = inviteMap.get(phone);

			return {
				phone,
				status: invite.status,
				sentAt: invite.sentAt,
				lastAttemptAt: invite.lastAttemptAt,
				error: invite.error,
			};
		});

		return {
			status: 200,
			entity: {
				success: true,
				invites: results,
			},
		};
	} catch (error) {
		console.error('Error getting invite statuses:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error?.message || error,
			},
		};
	}
};
