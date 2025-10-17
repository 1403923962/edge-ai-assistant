class SSEManager {
  constructor(logger) {
    this.clients = [];
    this.logger = logger;
  }

  addClient(res) {
    this.clients.push(res);
    this.logger.log(`[SSE] Extension connected (total: ${this.clients.length})`);
  }

  removeClient(res) {
    const index = this.clients.indexOf(res);
    if (index !== -1) {
      this.clients.splice(index, 1);
      this.logger.log(`[SSE] Extension disconnected (total: ${this.clients.length})`);
    }
  }

  broadcast(command) {
    const message = `data: ${JSON.stringify(command)}\n\n`;
    this.logger.log(`[SSE] Broadcasting command to ${this.clients.length} clients: ${JSON.stringify(command).substring(0, 100)}`);

    this.clients.forEach((client, index) => {
      try {
        client.write(message);
      } catch (e) {
        this.logger.log(`[SSE] Failed to send to client ${index}: ${e.message}`);
        this.clients.splice(index, 1);
      }
    });
  }

  getClientCount() {
    return this.clients.length;
  }
}

module.exports = SSEManager;
