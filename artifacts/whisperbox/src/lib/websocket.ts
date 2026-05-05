export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = 1000;
  
  public onMessage: ((event: any) => void) | null = null;
  public onUserOnline: ((userId: string) => void) | null = null;
  public onUserOffline: ((userId: string) => void) | null = null;
  public onError: ((error: any) => void) | null = null;
  public onAuthError: (() => void) | null = null;

  constructor(token: string) {
    this.url = `wss://whisperbox.koyeb.app/ws?token=${token}`;
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      this.backoff = 1000;
    };
    
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "message.receive" && this.onMessage) {
          this.onMessage(data.payload);
        } else if (data.type === "user.online" && this.onUserOnline) {
          this.onUserOnline(data.payload.userId);
        } else if (data.type === "user.offline" && this.onUserOffline) {
          this.onUserOffline(data.payload.userId);
        } else if (data.type === "error" && this.onError) {
          this.onError(data.payload);
        }
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };
    
    this.ws.onclose = (e) => {
      if (e.code === 4003) {
        if (this.onAuthError) this.onAuthError();
      } else {
        this.reconnect();
      }
    };
  }

  private reconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.backoff = Math.min(this.backoff * 2, 30000);
      this.connect();
    }, this.backoff);
  }

  public send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "message.send", payload }));
    } else {
      console.warn("WebSocket not open, message not sent");
    }
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
