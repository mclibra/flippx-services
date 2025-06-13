import jwt from 'jsonwebtoken';
import { jwtSecret } from '../../../config';

export const jwtSign = (data, options) => jwt.sign(data, jwtSecret, options);

export const jwtSignAsync = async (data, options) => jwtSign(data, options);

export const jwtVerify = token => jwt.verify(token, jwtSecret);
