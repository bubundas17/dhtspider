'use strict'

// This is the CommonJS entry point
const Spider = require('./lib/index').default;

// Export Spider as both default export and the class itself
module.exports = Spider;
module.exports.Spider = Spider;
module.exports.default = Spider;