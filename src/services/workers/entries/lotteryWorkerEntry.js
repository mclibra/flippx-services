require('@babel/register');

const LotteryWorker = require('../workers/lotteryWorker').default;

// Start the worker
const lotteryWorker = new LotteryWorker();
