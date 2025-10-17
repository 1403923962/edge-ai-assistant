/**
 * SSE Connection Manager for Extension
 */

const HTTP_SERVER_URL = 'http://localhost:9999';

class ConnectionManager {
  constructor(messageHandler) {
    this.eventSource = null;
    this.isConnected = false;
    this.messageHandler = messageHandler;
  }

  connect() {
    console.log('Connecting to HTTP server:', HTTP_SERVER_URL);

    try {
      this.eventSource = new EventSource(`${HTTP_SERVER_URL}/events`);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        console.log('Connected to HTTP server');
      };

      this.eventSource.onmessage = (event) => {
        console.log('Received message:', event.data);
        try {
          const message = JSON.parse(event.data);
          this.messageHandler(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        this.isConnected = false;

        if (this.eventSource) {
          this.eventSource.close();
        }

        setTimeout(() => this.connect(), 5000);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async sendResponse(id, data) {
    try {
      const response = await fetch(`${HTTP_SERVER_URL}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data })
      });

      if (!response.ok) {
        console.error('Failed to send response:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to send response:', error);
    }
  }

  getConnectionStatus() {
    return this.isConnected;
  }
}
