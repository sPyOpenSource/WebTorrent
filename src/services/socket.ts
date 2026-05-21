import { Comment, VideoTorrent } from "../types";

export interface SwarmStats {
  activePeersCount: number;
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
  maxProgress: number;
  peerPipelines: Array<{
    id: string;
    peerName: string;
    downloaded: number;
    uploaded: number;
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
  }>;
}

type SocketCallback = (data: any) => void;

class SwarmSocketService {
  private socket: WebSocket | null = null;
  private listeners: Map<string, Set<SocketCallback>> = new Map();
  private reconnectionQueue: string[] = [];
  private currentRoomId: string | null = null;
  private currentPeerName: string = "Anonymous Peer";
  private isConnecting: boolean = false;

  constructor() {
    // Lazy initial connection hook during first runtime bind
  }

  public connect(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.socket);
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            clearInterval(check);
            resolve(this.socket);
          }
        }, 100);
      });
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log("[SwarmSocket] Establishing P2P websocket link:", wsUrl);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("[SwarmSocket] Connection successfully established.");
          this.socket = ws;
          this.isConnecting = false;

          // Re-emit joining previous state if reconnection occurred
          if (this.currentRoomId) {
            this.send({
              type: "join_room",
              videoId: this.currentRoomId,
              peerName: this.currentPeerName
            });
          }

          // Process queued messages
          while (this.reconnectionQueue.length > 0) {
            const msg = this.reconnectionQueue.shift();
            if (msg) ws.send(msg);
          }

          resolve(ws);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.trigger(data.type, data);
            this.trigger("*", data); // Wildcard handler
          } catch (e) {
            console.warn("[SwarmSocket] Direct payload parse failed:", e);
          }
        };

        ws.onclose = () => {
          console.warn("[SwarmSocket] WebSocket link closed. Retry scheduled...");
          this.socket = null;
          this.isConnecting = false;
          // Exponential backoff reconnect
          setTimeout(() => {
            this.connect();
          }, 3000);
        };

        ws.onerror = (err) => {
          console.error("[SwarmSocket] Socket encounter:", err);
          this.isConnecting = false;
          reject(err);
        };
      } catch (err) {
        this.isConnecting = false;
        reject(err);
      }
    });
  }

  // Event emission helpers
  public send(payload: any) {
    const raw = JSON.stringify(payload);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
    } else {
      console.log("[SwarmSocket] Queueing message until channel reconnect:", payload.type);
      this.reconnectionQueue.push(raw);
      this.connect().catch(() => {});
    }
  }

  public joinRoom(videoId: string, peerName: string) {
    this.currentRoomId = videoId;
    this.currentPeerName = peerName;
    this.send({
      type: "join_room",
      videoId,
      peerName
    });
  }

  public leaveRoom() {
    if (this.currentRoomId) {
      this.send({
        type: "leave_room"
      });
      this.currentRoomId = null;
    }
  }

  public publishVideo(video: VideoTorrent) {
    this.send({
      type: "publish_video",
      video
    });
  }

  public addComment(videoId: string, comment: Partial<Comment>) {
    this.send({
      type: "add_comment",
      videoId,
      comment
    });
  }

  public updatePeerStats(videoId: string, stats: {
    downloadSpeed: number;
    uploadSpeed: number;
    downloaded: number;
    uploaded: number;
    progress: number;
  }) {
    if (videoId === this.currentRoomId) {
      this.send({
        type: "peer_stats_update",
        videoId,
        stats
      });
    }
  }

  // Subscription framework
  public subscribe(eventType: string, callback: SocketCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return cleanup handle
    return () => {
      const group = this.listeners.get(eventType);
      if (group) {
        group.delete(callback);
        if (group.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  private trigger(eventType: string, data: any) {
    const group = this.listeners.get(eventType);
    if (group) {
      group.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[SwarmSocket] Handler error for event ${eventType}:`, e);
        }
      });
    }
  }
}

export const swarmSocket = new SwarmSocketService();
