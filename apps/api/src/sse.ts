// Simple in-memory SSE client manager for Workers
// Each Worker instance has its own set of connected clients

type SendFn = (data: string) => void;

class SSEClients {
  private clients = new Map<string, SendFn>();

  add(id: string, send: SendFn) {
    this.clients.set(id, send);
  }

  remove(id: string) {
    this.clients.delete(id);
  }

  broadcast(data: string) {
    for (const [id, send] of this.clients) {
      try {
        send(data);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  get size() {
    return this.clients.size;
  }
}

export const sseClients = new SSEClients();
