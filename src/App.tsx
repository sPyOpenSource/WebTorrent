import React, { useState, useEffect } from "react";
import { VideoTorrent, TorrentStats, Comment } from "./types";
import { INITIAL_VIDEOS, CATEGORIES } from "./data";
import Sidebar from "./components/Sidebar";
import VideoGrid from "./components/VideoGrid";
import Player from "./components/Player";
import UploadForm from "./components/UploadForm";
import StatsHub from "./components/StatsHub";
import LiveStudio from "./components/LiveStudio";
import { CloudExporter } from "./components/CloudHub";
import { swarmSocket, SwarmStats } from "./services/socket";
import { 
  Play, 
  Search, 
  Upload, 
  User, 
  Menu, 
  Activity, 
  X, 
  Share2, 
  ThumbsUp, 
  Send, 
  Sparkles, 
  MessageSquare,
  Flame,
  Globe,
  Coins,
  Cpu,
  Tv,
  Github
} from "lucide-react";

export default function App() {
  const [videos, setVideos] = useState<VideoTorrent[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoTorrent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeTab, setActiveTab] = useState("feed");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Custom states
  const [commentInput, setCommentInput] = useState("");
  const [userLikes, setUserLikes] = useState<Record<string, boolean>>({});
  const [videoLikes, setVideoLikes] = useState<Record<string, number>>({});
  const [currentTorrentStats, setCurrentTorrentStats] = useState<TorrentStats | null>(null);

  // Real-time Swarm tracking states
  const [peerName, setPeerName] = useState("Anonymous Node");
  const [liveSwarmStats, setLiveSwarmStats] = useState<SwarmStats | null>(null);

  // Initialize videos with localStorage support to remember custom seeded torrents!
  // Primary initializer combining localStorage defaults and WebSocket swarm handshakes
  useEffect(() => {
    // 1. Resolve peer name
    let storedName = localStorage.getItem("webtorrent_peer_name");
    if (!storedName) {
      storedName = `Peer_${Math.floor(Math.random() * 9000 + 1000)}`;
      localStorage.setItem("webtorrent_peer_name", storedName);
    }
    setPeerName(storedName);

    // 2. Connect to the real WebSocket Swarm coordinator backend
    swarmSocket.connect()
      .then(() => console.log("[AppCore] WebSocket channel successfully synchronized."))
      .catch((e) => console.error("[AppCore] Swarm Socket failed to initialize:", e));

    // 3. Sync initial video set from REST backend API
    fetch("/api/videos")
      .then((res) => {
        if (!res.ok) throw new Error("API Offline");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setVideos(data);
        } else {
          throw new Error("Empty list");
        }
      })
      .catch((err) => {
        console.warn("[AppCore] Falling back to browser cache due to server sync offset:", err);
        // Local Cache fallback
        const cached = localStorage.getItem("webtorrent_youtube_videos");
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            const sanitized = parsed.map((item: any) => {
              if (item.isCustom) {
                return { ...item, localFile: undefined };
              }
              return item;
            });
            const existingIds = sanitized.map((v: any) => v.id);
            const missingDefaults = INITIAL_VIDEOS.filter((v) => !existingIds.includes(v.id));
            setVideos([...missingDefaults, ...sanitized]);
          } catch (e) {
            setVideos(INITIAL_VIDEOS);
          }
        } else {
          setVideos(INITIAL_VIDEOS);
        }
      });

    // 4. Subscribe to global workspace announcements
    const unsubscribePub = swarmSocket.subscribe("video_published", (data) => {
      if (data && Array.isArray(data.videos)) {
        setVideos(data.videos);
      }
    });

    const unsubscribeUpdated = swarmSocket.subscribe("videos_updated", (data) => {
      if (data && Array.isArray(data.videos)) {
        setVideos(data.videos);
        // Clear active player if current playing video is live and has been removed
        if (selectedVideo && selectedVideo.isLive && !data.videos.some((v: any) => v.id === selectedVideo.id)) {
          setSelectedVideo(null);
        }
      }
    });

    const unsubscribeReset = swarmSocket.subscribe("videos_reset", (data) => {
      if (data && Array.isArray(data.videos)) {
        setVideos(data.videos);
        if (selectedVideo && !data.videos.some((v: any) => v.id === selectedVideo.id)) {
          setSelectedVideo(null);
        }
      }
    });

    return () => {
      unsubscribePub();
      unsubscribeUpdated();
      unsubscribeReset();
    };
  }, []);

  // Room Isolation and Stats binding React effects
  useEffect(() => {
    if (!selectedVideo) {
      swarmSocket.leaveRoom();
      setLiveSwarmStats(null);
      return;
    }

    // Join room with current selected identity coordinates
    swarmSocket.joinRoom(selectedVideo.id, peerName);

    // Wire up events specific to this streaming theater room (Idempotent state logic)
    const unsubscribeAck = swarmSocket.subscribe("join_ack", (data) => {
      if (data && data.comments) {
        setVideos(prev => prev.map(v => v.id === selectedVideo.id ? { ...v, comments: data.comments } : v));
        setSelectedVideo(curr => curr?.id === selectedVideo.id ? { ...curr, comments: data.comments } : curr);
      }
    });

    const unsubscribeComment = swarmSocket.subscribe("comment_received", (data) => {
      if (data && data.videoId === selectedVideo.id) {
        // Idempotent update: Overwrite comments with server authoritative array
        setVideos(prev => prev.map(v => v.id === selectedVideo.id ? { ...v, comments: data.allComments } : v));
        setSelectedVideo(curr => curr?.id === selectedVideo.id ? { ...curr, comments: data.allComments } : curr);
      }
    });

    const unsubscribeStats = swarmSocket.subscribe("room_stats_broadcast", (data) => {
      if (data && data.videoId === selectedVideo.id) {
        setLiveSwarmStats(data);
      }
    });

    return () => {
      unsubscribeAck();
      unsubscribeComment();
      unsubscribeStats();
    };
  }, [selectedVideo, peerName]);

  // Transmit telemetry updates to Swarm server
  useEffect(() => {
    if (selectedVideo && currentTorrentStats) {
      swarmSocket.updatePeerStats(selectedVideo.id, {
        downloadSpeed: currentTorrentStats.downloadSpeed || 0,
        uploadSpeed: currentTorrentStats.uploadSpeed || 0,
        downloaded: currentTorrentStats.downloaded || 0,
        uploaded: currentTorrentStats.uploaded || 0,
        progress: currentTorrentStats.progress || 0,
      });
    }
  }, [currentTorrentStats, selectedVideo]);

  const saveVideos = (updatedList: VideoTorrent[]) => {
    setVideos(updatedList);
    // Only cache customized added items or full list to remember comment trees
    const customItemsOnly = updatedList.map(v => {
      // Avoid circular reference of native File
      const { localFile, ...rest } = v;
      return rest;
    });
    localStorage.setItem("webtorrent_youtube_videos", JSON.stringify(customItemsOnly));
  };

  // Search Submit Handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    // Detect direct Magnet paste!
    if (query.startsWith("magnet:?xt=urn:btih:") || query.length === 40) {
      handleStreamCustomMagnet(query);
    } else {
      // Normal text filtration
      setActiveTab("feed");
      setSelectedVideo(null);
    }
  };

  // Convert pure Magnet/Infohash into dynamic live theater video item
  const handleStreamCustomMagnet = (magnetUrl: string) => {
    let finalMagnet = magnetUrl;
    if (magnetUrl.length === 40) {
      finalMagnet = `magnet:?xt=urn:btih:${magnetUrl}&dn=Imported+Swarm+Link&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`;
    }

    // Extract dn (Display Name) query query parameter to make it look professional!
    let displayTitle = "Discovered Torrents Stream";
    try {
      const urlParams = new URLSearchParams(finalMagnet.replace("magnet:?", ""));
      const dn = urlParams.get("dn");
      if (dn) displayTitle = decodeURIComponent(dn).replace(/\+/g, " ");
    } catch(e) {}

    const customVideo: VideoTorrent = {
      id: `imported-${Date.now()}`,
      title: displayTitle,
      description: `Decentralized magnetic video resource imported on ${new Date().toLocaleDateString()}. Magnet address: ${finalMagnet}`,
      magnetUrl: finalMagnet,
      category: "Self-Seeded",
      uploader: "External Peer Swarm",
      uploaderAvatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80",
      views: 1,
      duration: "Magnet",
      uploadedAt: "Recently imported",
      thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
      comments: [],
      isCustom: false
    };

    // Add it to the list!
    const updated = [customVideo, ...videos];
    saveVideos(updated);
    setSelectedVideo(customVideo);
    setSearchQuery("");
  };

  // Local Seeding publisher Callback
  const handleVideoCreated = (newVideo: VideoTorrent) => {
    const updated = [newVideo, ...videos];
    saveVideos(updated);
    setSelectedVideo(newVideo);
    setActiveTab("feed");
    
    // Broadcast torrent publication over global WebSockets
    swarmSocket.publishVideo(newVideo);
  };

  // Comments submit logic
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideo || !commentInput.trim()) return;

    const newComment = {
      id: `comment-${Date.now()}`,
      author: peerName || "Anonymous Node",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
      content: commentInput.trim(),
      timestamp: "Just now",
    };

    // Propagate comments through the real-time server channel rather than locally in memory
    swarmSocket.addComment(selectedVideo.id, newComment);
    setCommentInput("");
  };

  // Like video state
  const handleToggleLikeVideo = (vip: string) => {
    const isLiked = !!userLikes[vip];
    const updatedLikes = { ...userLikes, [vip]: !isLiked };
    setUserLikes(updatedLikes);

    const scoreOffset = isLiked ? -1 : 1;
    setVideoLikes({ ...videoLikes, [vip]: (videoLikes[vip] || 0) + scoreOffset });
  };

  const getFilteredVideos = () => {
    let list = videos;
    if (activeTab === "trending") {
      // Sort primarily by mock views descending
      list = [...videos].sort((a,b) => b.views - a.views);
    }
    
    // Apply text search search index
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(v => v.title.toLowerCase().includes(q) || v.description.toLowerCase().includes(q));
    }

    return list;
  };

  const activeVideos = getFilteredVideos();

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white antialiased">
      {/* HEADER SECTION */}
      <header className="h-16 bg-[#161618]/95 backdrop-blur border-b border-slate-800/80 sticky top-0 z-50 px-4 md:px-6 flex items-center justify-between gap-4">
        {/* Title Logo Group */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (window.innerWidth < 768) {
                setMobileMenuOpen(!mobileMenuOpen);
              } else {
                setSidebarCollapsed(!sidebarCollapsed);
              }
            }}
            className="p-1.5 text-slate-400 hover:text-white cursor-pointer hover:bg-[#202024] rounded-xl transition flex items-center justify-center"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div 
            onClick={() => {
              setSelectedVideo(null);
              setActiveTab("feed");
              setActiveCategory("All");
              setSearchQuery("");
            }} 
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-850 flex items-center justify-center shadow-lg group-hover:shadow-indigo-950/20 shadow-neutral-950 transition">
              <Tv className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-extrabold tracking-tight text-white leading-none">
                Web<span className="text-indigo-400">Torrent</span>
              </h1>
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">SWARM MEDIA SWAPPERS</span>
            </div>
          </div>
        </div>

        {/* Global Dual Search & Magnet Link Streamer Input Bar */}
        <form 
          onSubmit={handleSearchSubmit} 
          className="flex-1 max-w-lg md:max-w-xl bg-[#0A0A0B] rounded-2xl border border-slate-800 overflow-hidden flex items-center p-0.5 shadow-inner transition focus-within:border-indigo-500/55"
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keywords or paste direct magnet:?xt=urn:btih:hash..."
            className="bg-transparent flex-1 px-4 py-2 text-xs md:text-sm text-slate-100 outline-none placeholder-slate-600 font-sans"
          />
          <button 
            type="submit"
            className="p-2 bg-[#161618] border border-slate-800 hover:bg-[#202024] rounded-xl text-slate-400 hover:text-white cursor-pointer transition flex items-center gap-1 shrink-0"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>

        {/* Action Button Utilities bar */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Peer Node Nickname setup */}
          <div className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 bg-[#161618] border border-slate-800 rounded-xl" title="Your P2P Swarm Node Nickname">
            <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <input 
              type="text" 
              value={peerName} 
              onChange={(e) => {
                const val = e.target.value.substring(0, 18);
                setPeerName(val || "Anonymous Node");
                localStorage.setItem("webtorrent_peer_name", val);
              }}
              className="bg-transparent text-[11px] font-mono text-slate-300 outline-none w-24 sm:w-28 focus:text-white transition/all"
              placeholder="Peer Nickname"
            />
          </div>

          <button
            onClick={() => {
              setSelectedVideo(null);
              setActiveTab("studio");
            }}
            className="hidden sm:flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer shadow-md shadow-indigo-950/20 border border-indigo-500/20 transition duration-200 bento-transition"
          >
            <Upload className="w-4 h-4" />
            Publish Torrent
          </button>

          {/* Peer swarm server icon & upstream sync link */}
          <div className="flex items-center gap-3">
            <a 
              href="https://github.com/sPyOpenSource/WebTorrent"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/20 hover:bg-indigo-900/45 border border-indigo-900/60 hover:text-indigo-200 text-indigo-400 rounded-full font-mono text-[10px] bento-transition transition cursor-pointer"
              title="Upstream Repository Sync"
            >
              <Github className="w-3.5 h-3.5 shrink-0 animate-pulse" />
              <span className="hidden lg:inline">sPyOpenSource</span>
            </a>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0A0B]/50 rounded-full border border-slate-800">
              <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-mono text-[10px] text-slate-400 hidden lg:inline">Swarm Core Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE NAVIGATION DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#0A0A0B]/98 backdrop-blur-md flex flex-col p-6 animate-fade-in border-b border-slate-800">
          <div className="flex justify-between items-center mb-6">
            <span className="font-bold text-sm text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-indigo-400" /> WebTorrent Navigation
            </span>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-[#161618] rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setActiveTab("feed");
                setSelectedVideo(null);
                setMobileMenuOpen(false);
              }}
              className="py-3 px-4 rounded-xl hover:bg-[#161618] font-semibold text-xs text-left"
            >
              Home Feed
            </button>
            <button
              onClick={() => {
                setActiveTab("trending");
                setSelectedVideo(null);
                setMobileMenuOpen(false);
              }}
              className="py-3 px-4 rounded-xl hover:bg-[#161618] font-semibold text-xs text-left"
            >
              Trending Videos
            </button>
            <button
              onClick={() => {
                setActiveTab("studio");
                setSelectedVideo(null);
                setMobileMenuOpen(false);
              }}
              className="py-3 px-4 rounded-xl hover:bg-[#161618] font-semibold text-xs text-indigo-450 text-left"
            >
              Publish Seed Studio
            </button>
            <button
              onClick={() => {
                setActiveTab("streams");
                setSelectedVideo(null);
                setMobileMenuOpen(false);
              }}
              className="py-3 px-4 rounded-xl hover:bg-[#161618] font-semibold text-xs text-left"
            >
              P2P Control panel
            </button>
          </div>
        </div>
      )}

      {/* CORE FRAMEWORK WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setSelectedVideo(null);
          }}
          onEnterMagnetTab={() => {
            setActiveTab("streams");
            setSelectedVideo(null);
          }}
        />

        {/* Content Viewer Main viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:p-6 bg-[#0A0A0B]" id="main-content-flow">
          
          {selectedVideo ? (
            /* THEATER / STREAM PLAYER VIEW LAYOUT */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto" id="theater-player-grid">
              {/* Left Column: Player & Meta details */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <Player 
                  video={selectedVideo}
                  onStatsUpdate={(stats) => setCurrentTorrentStats(stats)}
                  liveSwarmStats={liveSwarmStats}
                />

                {/* Video Info Details Card */}
                <div className="bg-[#0A0A0B] p-1 flex flex-col gap-4 border-b border-slate-800 pb-5">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg md:text-xl font-extrabold tracking-tight text-white leading-snug">
                      {selectedVideo.title}
                    </h2>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400">
                      <div className="flex items-center gap-2">
                        <span>{selectedVideo.views > 0 ? `${selectedVideo.views.toLocaleString()} views` : "0 views"}</span>
                        <span>•</span>
                        <span>{selectedVideo.uploadedAt}</span>
                      </div>
                      
                      {/* Interactive tools panel */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleLikeVideo(selectedVideo.id)}
                          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition duration-200 ${
                            userLikes[selectedVideo.id]
                              ? "bg-indigo-950/30 text-indigo-400 border-indigo-500/30 font-bold"
                              : "bg-[#161618] hover:bg-[#1f1f23] hover:text-white border-slate-800 text-slate-400"
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>{(selectedVideo.views > 0 ? 12 : 0) + (videoLikes[selectedVideo.id] || 0)} Likes</span>
                        </button>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedVideo.magnetUrl);
                            alert("Decentralized magnet link copied to browser clipboard!");
                          }}
                          className="cursor-pointer flex items-center gap-1.5 px-3.5 py-1.5 bg-[#161618] hover:bg-[#1f1f23] border border-slate-800 rounded-full text-slate-400 hover:text-white transition duration-200"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share Torrent</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Uploader Profile Description Box */}
                  <div className="bg-[#161618] rounded-3xl p-5 border border-slate-800/60 flex flex-col gap-3 shadow-md">
                    <div className="flex items-center gap-3">
                      <img
                        src={selectedVideo.uploaderAvatar || "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80"}
                        alt={selectedVideo.uploader}
                        className="w-10 h-10 rounded-full object-cover border border-slate-800"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white tracking-tight">{selectedVideo.uploader}</span>
                        <span className="text-[10px] text-indigo-400 font-mono font-medium">Verified Swarm Seed Node</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed font-sans pl-1 whitespace-pre-line">
                      {selectedVideo.description}
                    </div>
                  </div>
                </div>

                {/* PEER-POWERED COMMENTS MODULE */}
                <div className="flex flex-col gap-4 mt-2" id="comments-section">
                  <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 font-mono">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    PEER SWARM COMMENTS ({selectedVideo.comments.length})
                  </h3>

                  {/* Write input form */}
                  <form onSubmit={handleAddComment} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-[#161618]">
                      <img
                        src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                        alt="My node"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <textarea
                        rows={2}
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Add a public peer-shared comment..."
                        className="w-full bg-[#161618] border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 rounded-2xl px-4 py-2.5 text-xs outline-none transition resize-none"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={!commentInput.trim()}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-[#161618] disabled:text-slate-650 text-white font-bold text-xs rounded-xl cursor-pointer transition flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" /> Comment
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* List comments */}
                  <div className="flex flex-col gap-3 mt-1">
                    {selectedVideo.comments.length > 0 ? (
                      selectedVideo.comments.map((comm) => (
                        <div key={comm.id} className="flex gap-3 p-3 bg-[#161618] border border-slate-800 rounded-2xl shadow-sm">
                          <img
                            src={comm.avatar}
                            alt={comm.author}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{comm.author}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{comm.timestamp}</span>
                            </div>
                            <span className="text-xs text-slate-300 leading-relaxed font-sans">
                              {comm.content}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs font-mono text-slate-500 py-4 text-center">
                        No peer telemetry entries yet. Be the first uploader to announce a message!
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Recommended Up Next List & Cloud Exporter */}
              <div className="flex flex-col gap-4">
                <CloudExporter 
                  videoId={selectedVideo.id}
                  videoTitle={selectedVideo.title}
                  magnetUrl={selectedVideo.magnetUrl}
                  infoHash={currentTorrentStats?.infoHash}
                  activePeers={currentTorrentStats?.peersCount}
                />
                
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest px-1">Up Next Stream</h3>
                <div className="flex flex-col gap-3">
                  {videos
                    .filter((v) => v.id !== selectedVideo.id)
                    .slice(0, 5)
                    .map((video) => (
                      <div
                        key={video.id}
                        onClick={() => {
                          setSelectedVideo(video);
                          setCurrentTorrentStats(null);
                        }}
                        className="flex gap-3 cursor-pointer group hover:bg-neutral-900/30 p-2 rounded-xl border border-transparent hover:border-neutral-900 transition"
                      >
                        {/* Thumbnail */}
                        <div className="relative w-36 aspect-video rounded-lg overflow-hidden bg-neutral-900 shrink-0 border border-neutral-800">
                          <img
                            src={video.thumbnailUrl}
                            alt={video.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover rounded-lg group-hover:scale-102 transition"
                          />
                        </div>

                        {/* Text */}
                        <div className="flex flex-col min-w-0">
                          <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 transition line-clamp-2 leading-snug">
                            {video.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 mt-1 truncate">{video.uploader}</span>
                          <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                            {video.views > 0 ? `${video.views.toLocaleString()} views` : "0 views"}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : activeTab === "feed" || activeTab === "trending" ? (
            /* HOMEPAGE GRID & FEED */
            <div className="flex flex-col gap-6 max-w-7xl mx-auto">
              {/* Category selector & Video listing */}
              <VideoGrid
                videos={activeVideos}
                onSelectVideo={(v) => {
                  setSelectedVideo(v);
                  setCurrentTorrentStats(null);
                }}
                activeCategory={activeCategory}
                onSelectCategory={setActiveCategory}
                categories={CATEGORIES}
              />
            </div>
          ) : activeTab === "studio" ? (
            /* SEED PUBLISHER STUDIO */
            <div className="py-2">
              <UploadForm onVideoCreated={handleVideoCreated} />
            </div>
          ) : activeTab === "live" ? (
            /* WEBRTC LIVE BROADCASTING STUDIO */
            <div className="py-2">
              <LiveStudio 
                peerName={peerName}
                onLiveStarted={(video) => {
                  setVideos(prev => [video, ...prev]);
                }}
              />
            </div>
          ) : (
            /* ACTIVE STREAMS DIAGNOSTICS CONTROL */
            <div className="py-2">
              <StatsHub 
                onStreamMagnet={handleStreamCustomMagnet}
                seededVideos={videos.filter(v => v.isCustom)}
                onPlayVideo={(v) => {
                  setSelectedVideo(v);
                  setCurrentTorrentStats(null);
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
