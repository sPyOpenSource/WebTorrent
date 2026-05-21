import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { INITIAL_VIDEOS } from "./src/data";
import { VideoTorrent, Comment } from "./src/types";

// In-memory data store for server-authoritative state
let serverVideos: VideoTorrent[] = JSON.parse(JSON.stringify(INITIAL_VIDEOS));

interface PeerStats {
  peerId: string;
  peerName: string;
  downloadSpeed: number;
  uploadSpeed: number;
  downloaded: number;
  uploaded: number;
  progress: number;
}

interface PeerConnection {
  socket: WebSocket;
  peerId: string;
  peerName: string;
  videoId: string | null;
  stats: PeerStats;
}

// Track connections
const activeConnections = new Set<PeerConnection>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Fetch current list of torrent streams (including dynamic custom published ones)
  app.get("/api/videos", (req, res) => {
    res.json(serverVideos);
  });

  // API Route: Reset server data helper path (if requested inside developer flow)
  app.post("/api/reset", (req, res) => {
    serverVideos = JSON.parse(JSON.stringify(INITIAL_VIDEOS));
    broadcastToAll({ type: "videos_reset", videos: serverVideos });
    res.json({ success: true, message: "Videos reset to default initial list." });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Broadcast helper to all sockets in a specific room/video
  function broadcastToRoom(videoId: string, payload: any) {
    const messageStr = JSON.stringify(payload);
    for (const conn of activeConnections) {
      if (conn.videoId === videoId && conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(messageStr);
      }
    }
  }

  // Broadcast helper to all connected sockets
  function broadcastToAll(payload: any) {
    const messageStr = JSON.stringify(payload);
    for (const conn of activeConnections) {
      if (conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(messageStr);
      }
    }
  }

  // Aggregate stats helper for peers streaming a specific video
  function broadcastSwarmStats(videoId: string) {
    const peersInRoom = Array.from(activeConnections).filter(c => c.videoId === videoId);
    
    // Aggregates
    let totalDownloadSpeed = 0;
    let totalUploadSpeed = 0;
    let maxProgress = 0;
    const peerPipelines = peersInRoom.map(p => {
      totalDownloadSpeed += p.stats.downloadSpeed;
      totalUploadSpeed += p.stats.uploadSpeed;
      if (p.stats.progress > maxProgress) {
        maxProgress = p.stats.progress;
      }
      return {
        id: p.peerId,
        peerName: p.peerName,
        downloaded: p.stats.downloaded,
        uploaded: p.stats.uploaded,
        progress: p.stats.progress,
        downloadSpeed: p.stats.downloadSpeed,
        uploadSpeed: p.stats.uploadSpeed,
      };
    });

    broadcastToRoom(videoId, {
      type: "room_stats_broadcast",
      videoId,
      activePeersCount: peersInRoom.length,
      totalDownloadSpeed,
      totalUploadSpeed,
      maxProgress,
      peerPipelines
    });
  }

  wss.on("connection", (ws: WebSocket) => {
    const conn: PeerConnection = {
      socket: ws,
      peerId: "peer_" + Math.random().toString(36).substring(2, 9),
      peerName: "Anonymous Peer",
      videoId: null,
      stats: {
        peerId: "",
        peerName: "Anonymous Peer",
        downloadSpeed: 0,
        uploadSpeed: 0,
        downloaded: 0,
        uploaded: 0,
        progress: 0,
      }
    };

    activeConnections.add(conn);

    ws.on("message", (message: string) => {
      try {
        const data = JSON.parse(message);
        
        switch (data.type) {
          case "join_room": {
            const { videoId, peerName } = data;
            
            // Clean up from previous room if any
            const previousRoom = conn.videoId;
            conn.videoId = videoId;
            conn.peerName = peerName || conn.peerName;
            
            conn.stats = {
              peerId: conn.peerId,
              peerName: conn.peerName,
              downloadSpeed: 0,
              uploadSpeed: 0,
              downloaded: 0,
              uploaded: 0,
              progress: 0,
            };

            // Locate existing video serverside to sync comments
            const targetVideo = serverVideos.find(v => v.id === videoId);
            
            // Send initial ack payload specifically to the joining client
            ws.send(JSON.stringify({
              type: "join_ack",
              peerId: conn.peerId,
              comments: targetVideo ? targetVideo.comments : [],
              likesCount: targetVideo ? targetVideo.views % 12 : 0 // logical starting point or preserved likes counts
            }));

            // Notify rest of the room
            broadcastToRoom(videoId, {
              type: "peer_joined",
              peerId: conn.peerId,
              peerName: conn.peerName,
              message: `${conn.peerName} connected to peer swap swarm.`
            });

            // Recalculate and broadcast room aggregates
            broadcastSwarmStats(videoId);
            if (previousRoom) {
              broadcastSwarmStats(previousRoom);
            }
            break;
          }

          case "leave_room": {
            const oldRoomId = conn.videoId;
            conn.videoId = null;
            if (oldRoomId) {
              broadcastToRoom(oldRoomId, {
                type: "peer_left",
                peerId: conn.peerId,
                peerName: conn.peerName,
                message: `${conn.peerName} disconnected from swarm.`
              });
              broadcastSwarmStats(oldRoomId);
            }
            break;
          }

          case "publish_video": {
            const { video } = data;
            // Validate incoming video structure
            if (video && video.title && video.magnetUrl) {
              // Deduplicate video based on magnet block info hash
              const existsOffset = serverVideos.findIndex(v => v.magnetUrl === video.magnetUrl);
              const customVideo: VideoTorrent = {
                ...video,
                id: video.id || `video-${Date.now()}`,
                comments: video.comments || [],
                views: video.views || 1,
              };

              if (existsOffset !== -1) {
                // Keep existing, but maybe merge comments
                customVideo.comments = [...serverVideos[existsOffset].comments];
                serverVideos[existsOffset] = customVideo;
              } else {
                serverVideos.unshift(customVideo);
              }

              // Broadcast global updates that feed needs to refresh
              broadcastToAll({
                type: "video_published",
                video: customVideo,
                videos: serverVideos
              });
            }
            break;
          }

          case "add_comment": {
            const { videoId, comment } = data;
            const targetVideoIndex = serverVideos.findIndex(v => v.id === videoId);
            if (targetVideoIndex !== -1) {
              const fullComment: Comment = {
                id: comment.id || `comment-${Date.now()}`,
                author: comment.author || conn.peerName,
                avatar: comment.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
                content: comment.content,
                timestamp: comment.timestamp || "Just now",
                likes: 0
              };

              // Prevent duplicates (Idempotent checklist requirement)
              const alreadyExists = serverVideos[targetVideoIndex].comments.some(c => c.id === fullComment.id || (c.content === fullComment.content && c.author === fullComment.author));
              if (!alreadyExists) {
                serverVideos[targetVideoIndex].comments.unshift(fullComment);
                
                // Broadcast comment to the whole room streaming this video
                broadcastToRoom(videoId, {
                  type: "comment_received",
                  videoId,
                  comment: fullComment,
                  allComments: serverVideos[targetVideoIndex].comments
                });
              }
            }
            break;
          }

          case "peer_stats_update": {
            const { videoId, stats } = data;
            if (conn.videoId === videoId) {
              conn.stats = {
                peerId: conn.peerId,
                peerName: conn.peerName,
                downloadSpeed: stats.downloadSpeed || 0,
                uploadSpeed: stats.uploadSpeed || 0,
                downloaded: stats.downloaded || 0,
                uploaded: stats.uploaded || 0,
                progress: stats.progress || 0,
              };
              // Broadcast newly updated room statistics to all viewers
              broadcastSwarmStats(videoId);
            }
            break;
          }

          case "ping": {
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          }
        }
      } catch (err) {
        console.error("Payload parsing failure:", err);
      }
    });

    ws.on("close", () => {
      const oldRoomId = conn.videoId;
      activeConnections.delete(conn);
      
      if (oldRoomId) {
        broadcastToRoom(oldRoomId, {
          type: "peer_left",
          peerId: conn.peerId,
          peerName: conn.peerName,
          message: `${conn.peerName} pipeline connection closed.`
        });
        broadcastSwarmStats(oldRoomId);
      }
    });

    ws.on("error", () => {
      activeConnections.delete(conn);
    });
  });

  // Vite development vs production compiler modes
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to 0.0.0.0 and port 3000 to enable reverse proxy routing for sandbox previews
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Swarm Server is online and listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
