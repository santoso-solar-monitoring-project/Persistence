// Enable ES6 module (import/export) syntax in the source tree.
require = require('esm')(module);

// Set the timezone used by the moment library throughout the project.
require('moment-timezone').tz.setDefault('America/Chicago');

module.exports = require('./main.js');
