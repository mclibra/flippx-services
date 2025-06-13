import express from 'express';
import forceSSL from 'express-force-ssl';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { renderFile } from 'ejs';
import { errorHandler as queryErrorHandler } from 'querymen';
import { errorHandler as bodyErrorHandler } from 'bodymen';
import { env } from '../../../config';

export default (apiRoot, routes) => {
	const app = express();

	app.use(bodyParser.json({ limit: '10mb', extended: true }));
	app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
	if (env === 'production') {
		app.set('forceSSLOptions', {
			enable301Redirects: false,
			trustXFPHeader: true,
		});
		app.use(forceSSL);
	}
	app.use(cors({ origin: '*' }));
	app.use(compression());

	/* istanbul ignore next */
	if (env === 'production' || env === 'development' || env === 'localhost') {
		app.use(morgan('dev'));
	}
	app.engine('html', renderFile);
	app.set('view engine', 'html');

	app.use(bodyParser.urlencoded({ extended: false }));
	app.use(bodyParser.json());
	app.use(apiRoot, routes);
	app.use(queryErrorHandler());
	app.use(bodyErrorHandler());

	// app.route('/*')
	// .get(function(req, res) {
	// 	res.render(path.resolve(__dirname + '/../../template/main.ejs'), {
	// 		path: req.path === '/' ? '/login' : req.path
	// 	})
	// })

	return app;
};
