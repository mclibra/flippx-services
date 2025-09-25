require('@babel/register');

const LoyaltyWorker = require('../workers/loyaltyWorker').default;

// Start the worker
const loyaltyWorker = new LoyaltyWorker();
