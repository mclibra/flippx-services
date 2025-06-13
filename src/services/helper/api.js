import request from 'request';

export const invokeApi = async ({ url, method, params, authorization }) => {
	const headers = {
		'User-Agent': 'Super Agent/0.0.1',
		'Content-Type': 'application/json',
	};
	if (authorization) {
		headers.Authorization = authorization;
	}
	const options = {
		url: url,
		method: method,
		headers: headers,
		qs: params,
	};
	const response = await request(options);
	console.log(response);
	return response;
};
