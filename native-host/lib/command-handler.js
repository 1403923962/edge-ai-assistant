class CommandHandler {
  constructor(sseManager, logger) {
    this.sseManager = sseManager;
    this.logger = logger;
    this.responseQueue = {};
    this.messageId = 0;
  }

  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timeout = setTimeout(() => {
        delete this.responseQueue[id];
        reject(new Error('Command timeout'));
      }, 30000);

      this.responseQueue[id] = (response) => {
        clearTimeout(timeout);
        resolve(response);
      };

      this.sseManager.broadcast({ id, ...command });
    });
  }

  handleResponse(response) {
    this.logger.log(`[Response] Received from extension: ${JSON.stringify(response).substring(0, 150)}`);

    if (response.id && this.responseQueue[response.id]) {
      this.responseQueue[response.id](response);
      delete this.responseQueue[response.id];
    }
  }
}

module.exports = CommandHandler;
