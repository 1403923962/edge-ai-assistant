class CommandHandler {
  constructor(sseManager, logger) {
    this.sseManager = sseManager;
    this.logger = logger;
    this.responseQueue = {};
    this.commandQueue = []; // Queue for pending commands (polling mode)
    this.messageId = 0;
  }

  /**
   * Send command to Extension (adds to queue for polling)
   */
  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timeout = setTimeout(() => {
        delete this.responseQueue[id];
        // Remove from command queue if not picked up
        this.commandQueue = this.commandQueue.filter(cmd => cmd.id !== id);
        reject(new Error('Command timeout'));
      }, 30000);

      this.responseQueue[id] = (response) => {
        clearTimeout(timeout);
        resolve(response);
      };

      // Add to command queue for Extension to poll
      const queuedCommand = { id, ...command };
      this.commandQueue.push(queuedCommand);
      this.logger.log(`[Queue] Command ${id} queued (${command.action}), queue size: ${this.commandQueue.length}`);
    });
  }

  /**
   * Poll for next pending command (called by Extension)
   * Returns the first command in queue or null
   */
  pollCommand() {
    if (this.commandQueue.length === 0) {
      return null;
    }

    const command = this.commandQueue.shift();
    this.logger.log(`[Poll] Command ${command.id} dequeued (${command.action}), remaining: ${this.commandQueue.length}`);
    return command;
  }

  /**
   * Handle response from Extension
   */
  handleResponse(response) {
    this.logger.log(`[Response] Received from extension: ${JSON.stringify(response).substring(0, 150)}`);

    if (response.id && this.responseQueue[response.id]) {
      this.responseQueue[response.id](response);
      delete this.responseQueue[response.id];
    }
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return {
      queueSize: this.commandQueue.length,
      pendingResponses: Object.keys(this.responseQueue).length
    };
  }
}

module.exports = CommandHandler;
