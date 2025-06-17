// src/api/index.js
import { Router } from 'express';
import user from './user';
import oauth from './oauth';
import wallet from './wallet';
import bankAccount from './bank_account';
import withdrawal from './withdrawal';
import transaction from './transaction';
import lottery from './lottery';
import text from './text';
import borletteTicket from './borlette_ticket';
import megamillionTicket from './megamillion_ticket';
import rouletteTicket from './roulette_ticket';
import roulette from './roulette';
import domino from './domino';
import notification from './notification';
import state from './state';
import dashboard from './dashboard';
import loyalty from './loyalty';

const router = new Router();

router.use('/user', user);
router.use('/oauth', oauth);
router.use('/lottery', lottery);
router.use('/ticket/borlette', borletteTicket);
router.use('/ticket/megamillion', megamillionTicket);
router.use('/wallet', wallet);
router.use('/roulette', roulette);
router.use('/transaction', transaction);
router.use('/notification', notification);
router.use('/bank-accounts', bankAccount);
router.use('/roulette-ticket', rouletteTicket);
router.use('/withdrawals', withdrawal);
router.use('/domino', domino);
router.use('/state', state);
router.use('/text', text);
router.use('/dashboard', dashboard);
router.use('/loyalty', loyalty);

export default router;