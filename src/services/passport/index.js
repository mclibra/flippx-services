import passport from 'passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { jwtSecret, xApiKey } from '../../../config';
import * as facebookService from '../facebook';
import * as googleService from '../google';
import { User } from '../../api/user/model';

export const password = () => (req, res, next) => {
	passport.authenticate('password', { session: false }, (err, user) => {
		if (err && err.param) {
			return res.status(400).json(err);
		} else if (err || !user) {
			return res.status(401).end();
		}
		req.logIn(user, { session: false }, err => {
			if (err) return res.status(401).end();
			next();
		});
	})(req, res, next);
};

export const facebook = () =>
	passport.authenticate('facebook', { session: false });

export const google = () => passport.authenticate('google', { session: false });

export const xApi = () => passport.authenticate('xApi', { session: false });

export const token =
	({ required, roles = User.roles } = {}) =>
	(req, res, next) =>
		passport.authenticate('token', { session: false }, (err, user) => {
			if (
				err ||
				(required && !user) ||
				(required && !~roles.indexOf(user.role))
			) {
				return res.status(401).end();
			}
			req.logIn(user, { session: false }, err => {
				if (err) return res.status(401).end();
				next();
			});
		})(req, res, next);

export const isAdmin = () => (req, res, next) =>
	passport.authenticate('token', { session: false }, (err, user) => {
		if (err || !user || user.role !== 'ADMIN') {
			return res.status(403).json({
				success: false,
				error: 'Admin access required',
			});
		}

		req.logIn(user, { session: false }, err => {
			if (err) return res.status(401).end();
			next();
		});
	})(req, res, next);

passport.use(
	'password',
	new LocalStrategy(
		{
			usernameField: 'phone',
			passReqToCallback: true,
		},
		(req, phone, password, done) => {
			const countryCode = req.body.countryCode;
			User.findOne({ phone, countryCode })
				.select('-picture')
				.then(user => {
					if (!user) {
						done(true);
						return null;
					}
					if (user && !user.isActive) {
						done({
							param: 'suspended',
							message: 'The account has been suspended.',
						});
						return null;
					}
					return user
						.authenticate(password, user.password)
						.then(user => {
							done(null, user);
							return null;
						})
						.catch(done);
				});
		}
	)
);

passport.use(
	'facebook',
	new BearerStrategy((token, done) => {
		facebookService
			.getUser(token)
			.then(user => {
				return User.createFromService(user);
			})
			.then(user => {
				done(null, user);
				return null;
			})
			.catch(done);
	})
);

passport.use(
	'google',
	new BearerStrategy((token, done) => {
		googleService
			.getUser(token)
			.then(user => {
				return User.createFromService(user);
			})
			.then(user => {
				done(null, user);
				return null;
			})
			.catch(done);
	})
);

passport.use(
	'xApi',
	new HeaderAPIKeyStrategy(
		{
			header: 'x-api-key',
			prefix: '',
		},
		false,
		(apikey, done) => {
			if (apikey === xApiKey) {
				done(null, {});
			} else {
				done(null, false);
			}
		}
	)
);

passport.use(
	'token',
	new JwtStrategy(
		{
			secretOrKey: jwtSecret,
			jwtFromRequest: ExtractJwt.fromExtractors([
				ExtractJwt.fromUrlQueryParameter('access_token'),
				ExtractJwt.fromBodyField('access_token'),
				ExtractJwt.fromAuthHeaderWithScheme('Bearer'),
			]),
		},
		({ id }, done) => {
			User.findById(id)
				.select('-picture')
				.exec((err, user) => {
					if (err) {
						done(err);
					} else if (user && !user.isActive) {
						done({
							param: 'suspended',
							message: 'The account has been suspended.',
						});
					} else {
						done(null, user);
					}
					return null;
				});
		}
	)
);
