require('@babel/register');

const DominoWorker = require('../workers/dominoWorker').default;

// Start the worker
const dominoWorker = new DominoWorker();
