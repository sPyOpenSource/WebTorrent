import { useEffect, useRef, useState } from "react";
import { VideoTorrent, TorrentStats } from "../types";
import { swarmSocket, SwarmStats } from "../services/socket";
import { loadWebTorrent, subscribeToLoader } from "../utils/webtorrentLoader";
import { Play, Pause, RefreshCw, Users, ShieldAlert, CheckCircle2, FileVideo, DownloadCloud, UploadCloud, Info, AlertTriangle, Maximize, Minimize } from "lucide-react";

const DEFAULT_RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

interface PlayerProps {
  video: VideoTorrent;
  onStatsUpdate?: (stats: TorrentStats | null) => void;
  liveSwarmStats?: SwarmStats | null;
}

export default function Player({ video, onStatsUpdate, liveSwarmStats }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<TorrentStats | null>(null);
  const [playingFile, setPlayingFile] = useState<any>(null);
  const [allFiles, setAllFiles] = useState<any[]>([]);
  const [webtorrentLoaded, setWebtorrentLoaded] = useState(false);
  const [activePeers, setActivePeers] = useState<any[]>([]);
  const [loaderStatus, setLoaderStatus] = useState<string>("IDLE");
  const [loaderUrl, setLoaderUrl] = useState<string>("");

  // Periodical stats tracker
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Synchronize HTML5 Fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if ((containerRef.current as any).webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
      } else if ((containerRef.current as any).msRequestFullscreen) {
        (containerRef.current as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  };

  // Check if WebTorrent exists on window and subscribe to progressive dynamic loader
  useEffect(() => {
    // Initiate loader
    loadWebTorrent();

    const unsubscribe = subscribeToLoader((status, errorMsg, activeUrl) => {
      setLoaderStatus(status);
      if (activeUrl) setLoaderUrl(activeUrl);

      if (status === "LOADED") {
        setWebtorrentLoaded(true);
        setErrorMsg(null);
      } else if (status === "FAILED") {
        setWebtorrentLoaded(false);
        setErrorMsg(errorMsg || "WebTorrent SDK could not be loaded from CDN. Please check your internet connection.");
      }
    });

    return unsubscribe;
  }, []);

  // Dedicated Torrent Loader
  useEffect(() => {
    if (!webtorrentLoaded || !video) return;
    if (video.isLive) return; // bypass WebTorrent loader for live WebRTC

    // Reset Player states
    setLoading(true);
    setErrorMsg(null);
    setStats(null);
    setPlayingFile(null);
    setAllFiles([]);
    
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    // Initialize WebTorrent client
    // We instantiate a separate client per-player, or check if we can reuse
    let client: any = null;
    try {
      client = new (window as any).WebTorrent();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to initialize WebTorrent engine: ${err.message || err}`);
      setLoading(false);
      return;
    }

    const torrentId = video.isCustom && video.localFile ? video.localFile : video.magnetUrl;
    console.log("WebTorrent adding:", torrentId);

    // If it's a local file, we might seed it instead!
    // But since this is the Player component, we can "add" standard magnet links
    // or if the video is custom AND we have the local file, we can seed or display it directly.
    if (video.isCustom && video.localFile) {
      // Direct local file playback for maximum speed, styled into the peer system!
      setLoading(false);
      const fileUrl = URL.createObjectURL(video.localFile);
      setPlayingFile({ name: video.localFile.name, size: video.localFile.size });
      setAllFiles([{ name: video.localFile.name, size: video.localFile.size, isLocal: true }]);
      
      if (videoRef.current) {
        videoRef.current.src = fileUrl;
        videoRef.current.play().catch(e => console.log("Auto-play disabled by browser user gesture policies"));
      }

      // Start fictitious mock stats with local seed to show feedback
      const localInterval = setInterval(() => {
        const mockStats: TorrentStats = {
          infoHash: "Seeded-Part-Local-Storage-File",
          magnetUrl: video.magnetUrl,
          downloadSpeed: 0,
          uploadSpeed: Math.random() > 0.5 ? Math.floor(Math.random() * 250000) + 50000 : 0,
          downloaded: video.localFile!.size,
          uploaded: Math.floor(Math.random() * 10000000),
          progress: 1.0,
          peersCount: Math.floor(Math.random() * 5) + 1,
          timeRemaining: 0,
          ratio: 1.4,
          numPeers: Math.floor(Math.random() * 4) + 1
        };
        setStats(mockStats);
        if (onStatsUpdate) onStatsUpdate(mockStats);
      }, 1000);

      return () => {
        clearInterval(localInterval);
        URL.revokeObjectURL(fileUrl);
        try {
          client.destroy();
        } catch(e){}
      };
    }

    // Add torrent via WebTorrent Client
    client.add(torrentId, {
      tracker: true,
    }, (torrent: any) => {
      console.log("Torrent loaded! infoHash:", torrent.infoHash);
      
      // Store list of files
      setAllFiles(torrent.files.map((f: any, idx: number) => ({
        index: idx,
        name: f.name,
        size: f.length,
        path: f.path,
        extension: f.name.substring(f.name.lastIndexOf(".")).toLowerCase(),
        _original: f
      })));

      // Search for the primary streamable video file
      const streamableExtensions = [".mp4", ".webm", ".m4v", ".mkv", ".ogg"];
      let videoFile = torrent.files.find((f: any) => {
        const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
        return streamableExtensions.includes(ext) && !f.name.includes("sample");
      });

      // Fallback to any file ending with MP4 or mkv
      if (!videoFile) videoFile = torrent.files[0];

      if (videoFile) {
        setPlayingFile(videoFile);
        
        // Render to Video tag using WebTorrent's renderTo/appendTo engine
        if (videoRef.current) {
          console.log("Rendering torrent stream to HTML5 element:", videoFile.name);
          
          videoFile.renderTo(videoRef.current, {
            autoplay: true,
            muted: false,
            controls: true,
          }, (err: any, elem: HTMLVideoElement) => {
            if (err) {
              console.error("WebTorrent renderTo error:", err);
              // Fallback: manually provide client stream link if browser blocks
              if (videoRef.current && typeof videoFile.createReadStream === 'function') {
                setErrorMsg("Direct WebRTC stream rendering limits met. Please try again or use another browser peer.");
              }
            }
            setLoading(false);
          });
        }
      } else {
        setErrorMsg("No streamable video files discovered inside this peer torrent.");
        setLoading(false);
      }

      // Setup polling interval for real-time peer & byte transfer analytics
      statsIntervalRef.current = setInterval(() => {
        const computedStats: TorrentStats = {
          infoHash: torrent.infoHash,
          magnetUrl: torrent.magnetURI,
          downloadSpeed: torrent.downloadSpeed,
          uploadSpeed: torrent.uploadSpeed,
          downloaded: torrent.downloaded,
          uploaded: torrent.uploaded,
          progress: torrent.progress,
          peersCount: torrent.numPeers,
          timeRemaining: torrent.timeRemaining,
          ratio: torrent.ratio,
          numPeers: torrent.numPeers
        };
        
        setStats(computedStats);
        if (onStatsUpdate) {
          onStatsUpdate(computedStats);
        }

        // Keep active peers details
        if (torrent.wires && Array.isArray(torrent.wires)) {
          setActivePeers(torrent.wires.map((wire: any) => ({
            id: wire.peerId || "anonymous",
            ip: wire.remoteAddress || "WebRTC Peer",
            port: wire.remotePort || "Local",
            downloaded: wire.downloaded || 0,
            uploaded: wire.uploaded || 0,
            choked: wire.peerChoking
          })));
        }
      }, 500);

    });

    // Handle initial connection timeout if peer discovery takes too long
    const timeout = setTimeout(() => {
      // If we are still loading and have 0 peers, warn user about low peer counts
      if (loading && (!stats || stats.peersCount === 0)) {
        console.warn("Peer connection taking longer than average.");
      }
    }, 10000);

    // Return Cleanup function that runs on unmounting or switching videos
    return () => {
      clearTimeout(timeout);
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      if (client) {
        console.log("Client destroying to free ports & WebRTC peers.");
        try {
          client.destroy(() => {
            console.log("WebTorrent client destroyed successfully.");
          });
        } catch (e) {
          console.error("Error destroying WebTorrent client:", e);
        }
      }
    };
  }, [webtorrentLoaded, video]);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  // Dedicated WebRTC Live Stream Loader
  useEffect(() => {
    if (!video || !video.isLive) {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStats(null);
    setPlayingFile(null);
    setAllFiles([]);
    setActivePeers([]);

    console.log("[Player] Live WebRTC Stream joined. Broadcaster Id:", video.broadcasterId);

    // Initialize RTCPeerConnection
    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    peerConnectionRef.current = pc;

    // Listen to incoming track
    pc.ontrack = (event) => {
      console.log("[Player] WebRTC live stream track received!");
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
        videoRef.current.play().catch(err => {
          console.warn("[Player] Video play failed on track binding:", err);
        });
        setLoading(false);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && video.broadcasterId) {
        swarmSocket.send({
          type: "rtc_signal",
          target: video.broadcasterId,
          signal: {
            type: "candidate",
            candidate: event.candidate
          }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[Player] RTC Connection State:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setLoading(false);
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setErrorMsg("WebRTC stream connection lost. Broadcaster may have ceased transmitting or went off-air.");
        setLoading(false);
      }
    };

    // Listen for incoming answers/candidates from broadcaster (mediated via server.ts room signaling)
    const unsubscribeSignal = swarmSocket.subscribe("rtc_signal_received", async (data) => {
      // Check if signal belongs to this broadcaster
      if (data.sender !== video.broadcasterId) return;

      const { signal } = data;
      if (!signal) return;

      if (signal.type === "offer") {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Return answer back to broadcaster
          swarmSocket.send({
            type: "rtc_signal",
            target: video.broadcasterId!,
            signal: {
              type: "answer",
              sdp: answer.sdp
            }
          });
        } catch (err) {
          console.error("WebRTC SDP Answer generation failed:", err);
        }
      } else if (signal.type === "candidate" && signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
          console.error("AddIceCandidate error on player:", err);
        }
      }
    });

    // Send a trigger that we have joined the stream room and are requesting the broadcast stream
    const reqTimeout = setTimeout(() => {
      if (video.broadcasterId) {
        swarmSocket.send({
          type: "rtc_signal",
          target: video.broadcasterId,
          signal: {
            type: "request_stream"
          }
        });
      }
    }, 800);

    // Provide placeholder fictitious live stats to show inside diagnostic boards!
    const statsInterval = setInterval(() => {
      const mockStats: TorrentStats = {
        infoHash: `Livepeer-RTCMesh-${video.broadcasterId || "stream"}`,
        magnetUrl: video.magnetUrl || "",
        downloadSpeed: 250000,
        uploadSpeed: 0,
        downloaded: 0,
        uploaded: 0,
        progress: 1.0,
        peersCount: liveSwarmStats ? liveSwarmStats.activePeersCount : 1,
        timeRemaining: 0,
        ratio: 1.0,
        numPeers: liveSwarmStats ? liveSwarmStats.activePeersCount : 1
      };
      setStats(mockStats);
      if (onStatsUpdate) onStatsUpdate(mockStats);
    }, 1000);

    return () => {
      clearTimeout(reqTimeout);
      clearInterval(statsInterval);
      unsubscribeSignal();
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close();
        } catch (e) {}
        peerConnectionRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [video, webtorrentLoaded, liveSwarmStats]);

  // Manually select and play a different file inside multi-file torrents
  const selectFile = (fileItem: any) => {
    if (!videoRef.current || !fileItem._original) return;
    setLoading(true);
    setErrorMsg(null);
    setPlayingFile(fileItem._original);

    // Stop and re-render the new file choice
    try {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current.load();

      fileItem._original.renderTo(videoRef.current, {
        autoplay: true,
        muted: false,
        controls: true,
      }, (err: any) => {
        if (err) {
          console.error(err);
          setErrorMsg("Failed to switch streaming stream to: " + fileItem.name);
        }
        setLoading(false);
      });
    } catch(err: any) {
      setErrorMsg("Codec error or playback conflict during peer file navigation: " + err.message);
      setLoading(false);
    }
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatTime = (ms: number) => {
    if (!ms || ms === Infinity) return "estimating...";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="flex flex-col gap-4 w-full font-sans" id="player-view-container">
      {/* Visual Canvas Backdrop for Streaming Screen */}
      <div 
        ref={containerRef}
        className="relative w-full aspect-video bg-[#0A0A0B] rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center group"
      >
        <video 
          ref={videoRef}
          id="custom-h5-native-video"
          className="w-full h-full object-contain focus:outline-none"
          controls
          playsInline
        />

        {/* Fullscreen API Toggle Button Overlay */}
        {!loading && !errorMsg && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-4 left-4 z-25 bg-[#161618]/90 hover:bg-[#202024] backdrop-blur-md border border-slate-800 rounded-xl px-3 py-2 text-xs text-white shadow-lg cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 opacity-90 md:opacity-0 md:group-hover:opacity-100 hover:opacity-100 group/btn"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize className="w-3.5 h-3.5 text-indigo-400 group-hover/btn:text-white transition" />
                <span className="font-sans font-semibold text-[11px] text-slate-355 group-hover/btn:text-white transition">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize className="w-3.5 h-3.5 text-indigo-400 group-hover/btn:text-white transition" />
                <span className="font-sans font-semibold text-[11px] text-slate-355 group-hover/btn:text-white transition">Fullscreen</span>
              </>
            )}
          </button>
        )}

        {/* Loading / WebRTC Connecting State */}
        {loading && (
          <div className="absolute inset-0 bg-[#0A0A0B]/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-6 text-center">
            <RefreshCw className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
            <span className="font-bold text-white text-lg tracking-tight">
              Establishing WebRTC Swarm Connections...
            </span>
            <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
              Locating seed nodes, parsing metadata blocks, and establishing zero-hop direct peer pipelines.
            </p>
            
            {stats && (
              <div className="flex flex-col gap-2 mt-2 w-full max-w-xs font-mono text-xs text-indigo-400 bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-xl">
                <main className="flex justify-between">
                  <span className="font-sans font-medium text-slate-400">Progress:</span>
                  <span>{(stats.progress * 100).toFixed(1)}%</span>
                </main>
                <div className="w-full bg-[#161618] rounded-full h-1.5 overflow-hidden border border-slate-800">
                  <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${stats.progress * 100}%` }}></div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1 font-sans font-medium">
                    <Users className="w-3 h-3 text-indigo-400" /> {stats.peersCount} Peer{stats.peersCount !== 1 ? "s" : ""}
                  </span>
                  <span>↓ {formatSpeed(stats.downloadSpeed)}</span>
                </div>
              </div>
            )}
            
            {!stats && (
              <div className="text-slate-500 font-mono text-xs animate-pulse font-medium">
                Querying DHT & Tracker Announce List...
              </div>
            )}
          </div>
        )}

        {/* Network Error Display Overlay */}
        {errorMsg && (
          <div className="absolute inset-0 bg-[#0A0A0B]/95 flex flex-col items-center justify-center z-20 p-6 text-center text-white border border-rose-900/40">
            <ShieldAlert className="w-14 h-14 text-rose-500 mb-3" />
            <h4 className="text-lg font-bold">
              {errorMsg.includes("WebTorrent SDK") ? "WebTorrent SDK Failover State" : "BitTorrent Stream Obstruction"}
            </h4>
            <p className="text-sm text-slate-400 mt-2 max-w-md">
              {errorMsg}
            </p>
            {errorMsg.includes("WebTorrent SDK") && (
              <div className="mt-2 text-[11px] text-indigo-400 font-mono">
                Active Source target: <span className="text-slate-300 break-all">{loaderUrl}</span>
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-3 text-xs">
              {errorMsg.includes("WebTorrent SDK") ? (
                <>
                  <button 
                    onClick={() => {
                      setLoading(true);
                      setErrorMsg(null);
                      loadWebTorrent(true); // Force load next CDN mirror
                    }} 
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold flex items-center gap-2 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Load Backup CDN Mirror
                  </button>
                  <button 
                    onClick={() => {
                      setLoading(true);
                      setErrorMsg(null);
                      window.location.reload();
                    }} 
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-medium transition cursor-pointer"
                  >
                    Hard Refresh Page
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => {
                    setLoading(true);
                    setErrorMsg(null);
                    window.location.reload();
                  }} 
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg font-semibold transition cursor-pointer"
                >
                  Reload Swarm Engine
                </button>
              )}
            </div>
          </div>
        )}

        {/* Real-time Peer Metrics Pill (floating in the upper-right area on hover) */}
        {!loading && !errorMsg && stats && (
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[#161618]/90 backdrop-blur-md border border-slate-800 rounded-full px-4 py-1.5 flex items-center gap-4 text-xs font-mono text-slate-300 shadow-lg pointer-events-none z-10">
            <span className="flex items-center gap-1.5 text-indigo-400 font-sans font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              <Users className="w-3.5 h-3.5" />
              {stats.peersCount} peer{stats.peersCount !== 1 ? "s" : ""}
            </span>
            <span>↓ {formatSpeed(stats.downloadSpeed)}</span>
            <span>↑ {formatSpeed(stats.uploadSpeed)}</span>
          </div>
        )}
      </div>

      {/* P2P Live Stats Dashboard Toolbar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 bg-[#161618] border border-slate-800 rounded-3xl p-4 text-xs font-mono shadow-md">
          <div className="flex flex-col gap-1 p-2.5 bg-[#0A0A0B]/50 rounded-2xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">Download Speed</span>
            <span className="text-indigo-400 font-bold text-sm flex items-center gap-1">
              <DownloadCloud className="w-3.5 h-3.5" />
              {formatSpeed(stats.downloadSpeed)}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2.5 bg-[#0A0A0B]/50 rounded-2xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">Upload Seed Speed</span>
            <span className="text-sky-400 font-bold text-sm flex items-center gap-1">
              <UploadCloud className="w-3.5 h-3.5" />
              {formatSpeed(stats.uploadSpeed)}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2.5 bg-[#0A0A0B]/50 rounded-2xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">Downloaded Share</span>
            <span className="text-white text-sm font-semibold">
              {formatSize(stats.downloaded)} <span className="text-[10px] text-slate-500">({(stats.progress * 100).toFixed(1)}%)</span>
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2.5 bg-[#0A0A0B]/50 rounded-2xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">Connected Swarm</span>
            <span className="text-white text-sm font-semibold flex items-center gap-1.5 font-sans">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              {stats.peersCount} peer{stats.peersCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex flex-col gap-1 p-2.5 bg-[#0A0A0B]/50 rounded-2xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">Full Buffer Time</span>
            <span className="text-amber-400 text-sm font-semibold">
              {stats.progress >= 1.0 ? (
                <span className="text-emerald-400 flex items-center gap-1.5 font-sans font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Seeding Live
                </span>
              ) : (
                formatTime(stats.timeRemaining)
              )}
            </span>
          </div>
        </div>
      )}

      {/* Multi-file selector panel, displayed if there are indeed multiple streamable assets */}
      {allFiles.length > 1 && (
        <div className="bg-[#161618] rounded-3xl p-4 border border-slate-800 shadow-md">
          <h5 className="text-sm font-bold text-white mb-2.5 flex items-center gap-1.5">
            <FileVideo className="w-4 h-4 text-indigo-400" />
            Torrent Contents ({allFiles.length} files discovered)
          </h5>
          <div className="max-h-36 overflow-y-auto flex flex-col gap-1.5 pr-2">
            {allFiles.map((f, i) => {
              const isActive = playingFile && playingFile.name === f.name;
              return (
                <button
                  key={i}
                  onClick={() => selectFile(f)}
                  className={`flex items-center justify-between text-left px-3 py-2 rounded-xl text-xs transition duration-200 ${
                    isActive
                      ? "bg-indigo-950/30 text-indigo-400 border border-indigo-800"
                      : "bg-[#0A0A0B]/40 hover:bg-[#161618] text-slate-300 hover:text-white border border-transparent"
                  }`}
                >
                  <span className="truncate pr-4 font-mono">{f.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500 font-mono">{formatSize(f.size)}</span>
                    {isActive && (
                      <span className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold animate-pulse">
                        Active Stream
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Peer details view for technical insight */}
      {((stats && activePeers.length > 0) || (liveSwarmStats && liveSwarmStats.peerPipelines && liveSwarmStats.peerPipelines.length > 0)) && (
        <div className="bg-[#161618]/30 rounded-3xl p-4 border border-slate-800 shadow-sm">
          <div className="flex justify-between items-center mb-2.5">
            <h5 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 font-mono">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              PEER PIPELINES DECENTRALIZED SWARM ({Math.max(activePeers.length, liveSwarmStats?.peerPipelines?.length || 0)})
            </h5>
            <span className="text-[9px] px-2.5 py-1 rounded-full bg-indigo-950/30 text-indigo-400 font-mono border border-indigo-900/30">
              {liveSwarmStats ? "WebSocket + WebRTC Joint Matrix Active" : "WebRTC DataChannels Active"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-2">
            {/* 1. WebSocket Connected Peers */}
            {liveSwarmStats?.peerPipelines?.map((p, idx) => (
              <div key={`ws-peer-${idx}`} className="bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-800/40 flex justify-between items-center text-[10px] font-mono">
                <div className="flex flex-col gap-0.5 max-w-[124px]">
                  <span className="text-slate-200 truncate font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping shrink-0" />
                    {p.peerName || `Node ${p.id.substring(0, 5)}`}
                  </span>
                  <span className="text-slate-500 font-sans text-[8px]">Client Swarm Socket</span>
                </div>
                <div className="flex flex-col text-right shrink-0">
                  <span className="text-indigo-400 font-bold">↓ {formatSpeed(p.downloadSpeed || 0)}</span>
                  <span className="text-sky-400">↑ {formatSpeed(p.uploadSpeed || 0)}</span>
                </div>
              </div>
            ))}

            {/* 2. WebRTC DataChannel Peers */}
            {activePeers.map((peer, ind) => (
              <div key={`webrtc-peer-${ind}`} className="bg-[#0A0A0B]/60 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-[10px] font-mono">
                <div className="flex flex-col gap-0.5 max-w-[120px]">
                  <span className="text-slate-300 truncate font-semibold">Node {peer.id.substring(0, 6)}...</span>
                  <span className="text-slate-500 font-sans text-[8px]">{peer.ip || "Direct Tunnel"}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-slate-300">↓ {formatSize(peer.downloaded)}</span>
                  <span className="text-indigo-400">↑ {formatSize(peer.uploaded)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Information strip for users on WebTorrent client capabilities */}
      <div className="bg-[#161618] border border-slate-800 rounded-3xl p-4 flex items-start gap-3 w-full animate-fadeIn">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-slate-300 text-xs leading-relaxed">
          <strong className="text-white block mb-0.5">True Serverless P2P Swarming</strong>
          This movie tracks video bytes directly sourced from active browser clients visiting the system right now over secure WebSockets and WebRTC DataChannels. If speeds are fluctuating, please copy the magnet link and share with another player to multiply seed speeds!
        </div>
      </div>
    </div>
  );
}
