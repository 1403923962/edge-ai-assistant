const fs = require('fs');
const path = require('path');

class Logger {
  constructor(logFile) {
    this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    this.logStream.write(line);
    console.error(msg);
  }
}

module.exports = Logger;
