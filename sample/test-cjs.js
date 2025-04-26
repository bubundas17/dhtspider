'use strict';
// Test file for CommonJS require
const Spider = require('../index.js');

console.log('Testing CommonJS require');
console.log('Spider class imported:', Spider !== undefined);

// Create a simple instance for testing
const spider = new Spider({ debugMode: true });
console.log('Spider instance created successfully');

// Clean up immediately since this is just a test
setTimeout(() => {
  console.log('Test complete');
  process.exit(0);
}, 100); 