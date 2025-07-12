import { Router } from 'express';
import { done } from '../../services/response/';
import { xApi, token } from '../../services/passport';
import {
	sendOtp,
	verifyOtp,
	verifySecurePin,
	create,
	update,
	getUserInfo,
	getSelfImage,
	verifyReset,
	resetPassword,
	getSignedUrl,
	getSignedUrlForDocument,
} from './controller';

const router = new Router();

router.post('/send-otp', xApi(), async (req, res) =>
	done(res, await sendOtp(req.body))
);

router.post('/verify-otp', xApi(), async (req, res) =>
	done(res, await verifyOtp(req.body))
);

router.get('/me', xApi(), token({ required: true }), async (req, res) =>
	done(res, {
		status: 200,
		entity: { success: true, user: req.user.view(true) },
	})
);

router.get(
	'/image/signedurl',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await getSignedUrl(req.user, req.query))
);

router.get('/image/self', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getSelfImage(req.user))
);

router.post('/info', xApi(), token({ required: true }), async (req, res) =>
	done(res, await getUserInfo(req.user, req.body))
);

router.post(
	'/verify/pin',
	xApi(),
	token({ required: true }),
	async (req, res) => done(res, await verifySecurePin(req.user, req.body))
);

router.post('/verify-reset', xApi(), async (req, res) =>
	done(res, await verifyReset(req.body))
);

router.post('/reset-password', xApi(), async (req, res) =>
	done(res, await resetPassword(req.body))
);

router.get(
	'/documents/signedurl',
	xApi(),
	token({ required: true }),
	async (req, res) =>
		done(res, await getSignedUrlForDocument(req.user, req.query))
);

router.post('/', xApi(), async (req, res) => done(res, await create(req.body)));

router.put('/', xApi(), token({ required: true }), async (req, res) =>
	done(res, await update(req.user, req.body))
);

export default router;
