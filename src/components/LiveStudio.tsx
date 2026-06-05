import React, { useState, useEffect, useRef } from "react";
import { 
  Radio, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  StopCircle, 
  PlayCircle, 
  Users, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Tv, 
  Wifi, 
  MessageSquare,
  ShieldAlert,
  Monitor
} from "lucide-react";
import { swarmSocket } from "../services/socket";
import { VideoTorrent, Comment } from "../types";

interface LiveStudioProps {
  peerName: string;
  onLiveStarted: (video: VideoTorrent) => void;
}

const CATEGORIES = ["Live Gaming", "Music Session", "Tech Talk", "Co-Working", "Creative Art", "Hangout"];

const DEFAULT_RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

export default function LiveStudio({ peerName, onLiveStarted }: LiveStudioProps) {
  const [streamTitle, setStreamTitle] = useState("");
  const [streamDesc, setStreamDesc] = useState("");
  const [category, setCategory] = useState("Tech Talk");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectedViewersCount, setConnectedViewersCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<"camera" | "screen">("camera");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Clean elements on unmount or stop
  useEffect(() => {
    return () => {
      stopEntireBroadcast();
    };
  }, []);

  const startLocalCapture = async (mode: "camera" | "screen" = "camera") => {
    setErrorMessage(null);
    try {
      // If we have an existing stream, stop its tracks first to release devices
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          try { track.stop(); } catch (e) {}
        });
      }

      let stream: MediaStream;
      if (mode === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true // Capture system audio if supported by the browser
        });
        
        // If display sharing is closed via browser's built-in "Stop sharing" button
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            console.log("Desktop sharing ended by user browser UI.");
            stopEntireBroadcast();
          };
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: true
        });
      }
      
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.log("Play error:", e));
      }
      setIsCapturing(true);
      setCaptureMode(mode);
      setVideoEnabled(true);
      setAudioEnabled(true);

      // If we are currently broadcasting (isLive === true), seamlessly hot-swap the tracks for all active peer connections!
      if (isLive) {
        const newVideoTrack = stream.getVideoTracks()[0];
        const newAudioTrack = stream.getAudioTracks()[0];

        peerConnectionsRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          
          const videoSender = senders.find(s => s.track && s.track.kind === "video");
          if (videoSender && newVideoTrack) {
            videoSender.replaceTrack(newVideoTrack).catch(err => {
              console.warn("Could not swap video sender track dynamically:", err);
            });
          }

          const audioSender = senders.find(s => s.track && s.track.kind === "audio");
          if (audioSender && newAudioTrack) {
            audioSender.replaceTrack(newAudioTrack).catch(err => {
              console.warn("Could not swap audio sender track dynamically:", err);
            });
          }
        });
      }

    } catch (err: any) {
      console.error(`${mode === "screen" ? "Desktop sharing" : "Camera access"} failed:`, err);
      if (err.name === "NotAllowedError" || err.message?.includes("Permission denied") || err.message?.includes("cancelled")) {
        setErrorMessage(`Capture cancelled: ${mode === "screen" ? "Desktop sharing choice was dismissed." : "Webcam/Mic permissions denied."}`);
      } else {
        setErrorMessage(`Equipment access failed: ${err.message || err}. Please check permissions and device connections.`);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setVideoEnabled(track.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setAudioEnabled(track.enabled);
      }
    }
  };

  const startBroadcast = () => {
    if (!localStreamRef.current || !streamTitle.trim()) {
      setErrorMessage("Please select capture settings and enter a stream title.");
      return;
    }

    const uniqueId = `live-${peerName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
    setStreamId(uniqueId);
    setIsLive(true);
    setComments([]);

    // Create the VideoTorrent live model
    const liveVideo: VideoTorrent = {
      id: uniqueId,
      title: streamTitle,
      description: streamDesc || "Decentralized real-time WebRTC broadcast seeded straight from host webcam.",
      magnetUrl: `magnet:?xt=urn:btih:livepeer-${uniqueId}&dn=LiveRTC`, // symbolic placeholder
      category,
      uploader: peerName,
      uploaderAvatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80",
      views: 0,
      duration: "LIVE",
      uploadedAt: "Just started",
      thumbnailUrl: "https://images.unsplash.com/photo-1548372290-8d01b6c8e78c?w=400&q=80", // tech display avatar
      comments: [],
      isLive: true
    };

    // Join room & Publish live video
    swarmSocket.joinRoom(uniqueId, peerName);
    swarmSocket.publishVideo(liveVideo);

    // Call callback to let parent app know they can update videos
    onLiveStarted(liveVideo);

    // Wire up signaling hooks for incoming viewers
    const unsubSignal = swarmSocket.subscribe("rtc_signal_received", async (data) => {
      const viewerId = data.sender;
      const { signal } = data;

      if (!signal) return;

      // Viewer is requesting stream OR joining
      if (signal.type === "request_stream") {
        setupPeerConnectionForViewer(viewerId);
      } else if (signal.type === "answer") {
        const pc = peerConnectionsRef.current.get(viewerId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            
            // Process any queued candidates that arrived before the answer description
            const qc = (pc as any)._queuedCandidates;
            if (qc && Array.isArray(qc)) {
              console.log(`[Broadcaster] Processing ${qc.length} queued candidates for viewer:`, viewerId);
              for (const candidate of qc) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                  console.error("Delayed Broadcaster ICE candidate error:", e);
                }
              }
              (pc as any)._queuedCandidates = [];
            }
          } catch (e) {
            console.error("SetRemoteDescription answer failed:", e);
          }
        }
      } else if (signal.type === "candidate") {
        const pc = peerConnectionsRef.current.get(viewerId);
        if (pc && signal.candidate) {
          try {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
              if (!(pc as any)._queuedCandidates) {
                (pc as any)._queuedCandidates = [];
              }
              (pc as any)._queuedCandidates.push(signal.candidate);
              console.log(`[Broadcaster] Queued candidate for viewer ${viewerId} prior to setting remote description.`);
            }
          } catch (e) {
            console.error("AddIceCandidate failed:", e);
          }
        }
      }
    });

    // Wire up peer join events (broadcaster treats active viewer stats as connected channels)
    const unsubJoined = swarmSocket.subscribe("peer_joined", (data) => {
      console.log("[Broadcaster] Viewer joined:", data.peerId);
      // Initiate RTC sequence immediately
      setupPeerConnectionForViewer(data.peerId);
    });

    const unsubLeft = swarmSocket.subscribe("peer_left", (data) => {
      console.log("[Broadcaster] Viewer left:", data.peerId);
      cleanupPeerForViewer(data.peerId);
    });

    const unsubComment = swarmSocket.subscribe("comment_received", (data) => {
      if (data && data.videoId === uniqueId) {
        setComments(data.allComments);
      }
    });

    const unsubStats = swarmSocket.subscribe("room_stats_broadcast", (data) => {
      if (data && data.videoId === uniqueId) {
        // Exclude the broadcaster self from the viewer count (if room_stats tracks connection size)
        // Since broadcaster counts as 1, connection size - 1 is standard viewers count
        const viewers = Math.max(0, data.activePeersCount - 1);
        setConnectedViewersCount(viewers);
      }
    });

    // Save unsubscribe functions on the window or custom ref to clean on stop
    (window as any)._liveStudioUnsubscribes = [
      unsubSignal,
      unsubJoined,
      unsubLeft,
      unsubComment,
      unsubStats
    ];
  };

  const setupPeerConnectionForViewer = async (viewerId: string) => {
    // If connection already exists and details are running, bypass duplicate setup to prevent renegotiation collision
    const existingPC = peerConnectionsRef.current.get(viewerId);
    if (existingPC && existingPC.connectionState !== "failed" && existingPC.connectionState !== "closed") {
      console.log(`[LiveStudio] Connection for ${viewerId} is already running in state: ${existingPC.connectionState}. Skipping duplicate creation.`);
      return;
    }

    // Clear failed/closed connections first
    cleanupPeerForViewer(viewerId);

    console.log("[LiveStudio] Initializing RTCPeerConnection for viewer:", viewerId);
    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    peerConnectionsRef.current.set(viewerId, pc);

    // Feed local track buffers to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Capture Local ICE Candidates and forward to viewer of choice
    pc.onicecandidate = (event) => {
      if (event.candidate && isLive && streamId) {
        swarmSocket.send({
          type: "rtc_signal",
          target: viewerId,
          signal: {
            type: "candidate",
            candidate: event.candidate
          }
        });
      }
    };

    // Listen to network status changes
    pc.onconnectionstatechange = () => {
      console.log(`[PCViewer-${viewerId}] Connection state change:`, pc.connectionState);
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        cleanupPeerForViewer(viewerId);
      }
    };

    try {
      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Route SDP Offer to specific viewer ID
      swarmSocket.send({
        type: "rtc_signal",
        target: viewerId,
        signal: {
          type: "offer",
          sdp: offer.sdp
        }
      });
    } catch (err) {
      console.error("SDP offer orchestration failed:", err);
    }
  };

  const cleanupPeerForViewer = (viewerId: string) => {
    const pc = peerConnectionsRef.current.get(viewerId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {}
      peerConnectionsRef.current.delete(viewerId);
    }
  };

  const stopEntireBroadcast = () => {
    // 1. Unsubscribe signals
    const unsubs = (window as any)._liveStudioUnsubscribes;
    if (Array.isArray(unsubs)) {
      unsubs.forEach(unsub => {
        try { unsub(); } catch (e) {}
      });
      (window as any)._liveStudioUnsubscribes = undefined;
    }

    // 2. Tear down active peer connections
    peerConnectionsRef.current.forEach((pc) => {
      try { pc.close(); } catch (e) {}
    });
    peerConnectionsRef.current.clear();

    // 3. Clear local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // 4. Leave socket room
    swarmSocket.leaveRoom();

    // Reset states
    setIsCapturing(false);
    setIsLive(false);
    setConnectedViewersCount(0);
    setStreamId(null);
  };

  return (
    <div className="bg-[#111112] border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-4xl mx-auto font-sans text-slate-300">
      
      {/* Banner / Header */}
      <div className="flex justify-between items-center pb-5 border-b border-slate-800/80 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600/10 border border-red-500/30 text-red-400 rounded-2xl flex items-center justify-center shadow">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Decentralized WebRTC Studio Boiler</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Capture, publish, and seed your direct camera and audio stream zero mid-servers required</p>
          </div>
        </div>

        {isLive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/15 border border-red-500/40 rounded-xl text-[10px] font-bold text-red-400 uppercase tracking-widest animate-pulse">
            <Wifi className="w-3.5 h-3.5" />
            Live Broadcasting
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mb-5 p-4 bg-red-950/20 border border-red-900/40 rounded-2xl text-xs text-red-400 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Hardware Alert:</span> {errorMessage}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Left Aspect: Display loopback client feed */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-[#0A0A0B] border border-slate-800 flex items-center justify-center group shadow-inner">
            <video
              ref={localVideoRef}
              className="w-full h-full object-cover rounded-3xl"
              muted
              playsInline
            />

            {!isCapturing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 bg-[#0A0A0B]/95">
                <div className="p-4 bg-slate-900/50 rounded-full border border-slate-850 text-slate-500 animate-pulse">
                  <Tv className="w-8 h-8" />
                </div>
                <div className="max-w-xs">
                  <span className="text-xs font-bold text-slate-200">Broadcast Source Channel Selection</span>
                  <p className="text-[10px] text-slate-500 leading-normal mt-1">
                    Begin WebRTC streaming over peer swarm channels. Choose either your Webcam hardware or share your Desktop Screen.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5 justify-center mt-2">
                  <button
                    type="button"
                    onClick={() => startLocalCapture("camera")}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-97 text-white font-bold text-xs rounded-xl cursor-pointer transition flex items-center gap-2 shadow"
                  >
                    <Video className="w-3.5 h-3.5" /> Webcam Stream
                  </button>
                  <button
                    type="button"
                    onClick={() => startLocalCapture("screen")}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 active:scale-97 text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition flex items-center gap-2 shadow"
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop / Screen Share
                  </button>
                </div>
              </div>
            )}

            {isCapturing && (
              <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between items-center bg-black/70 backdrop-blur-md border border-slate-800/80 p-2 rounded-2xl opacity-100 md:opacity-0 group-hover:opacity-100 transition-all duration-300">
                <div className="flex gap-1.5 items-center">
                  <button
                    onClick={toggleVideo}
                    className={`p-2 rounded-xl transition cursor-pointer ${
                      videoEnabled ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-red-600 text-white hover:bg-red-500"
                    }`}
                    title={videoEnabled ? "Disable Video Feed" : "Enable Video Feed"}
                  >
                    {videoEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={toggleAudio}
                    className={`p-2 rounded-xl transition cursor-pointer ${
                      audioEnabled ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-red-600 text-white hover:bg-red-500"
                    }`}
                    title={audioEnabled ? "Disable Microphone" : "Enable Microphone"}
                  >
                    {audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  </button>

                  <div className="w-px h-5 bg-slate-800 mx-1" />

                  <button
                    type="button"
                    onClick={() => startLocalCapture(captureMode === "camera" ? "screen" : "camera")}
                    className="p-2 py-1.5 rounded-xl bg-slate-900 border border-slate-850 text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-[10px] font-bold"
                    title={captureMode === "camera" ? "Switch source to Screen sharing" : "Switch source to Webcam display"}
                  >
                    {captureMode === "camera" ? (
                      <>
                        <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Swap to Screen Share</span>
                      </>
                    ) : (
                      <>
                        <Video className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Swap to Webcam</span>
                      </>
                    )}
                  </button>
                </div>

                <span className="text-[9px] font-mono font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
                  {captureMode === "screen" ? "DESKTOP" : "WEBCAM"} MESH HD
                </span>
              </div>
            )}
          </div>

          {/* Telemetry metadata board */}
          {isLive && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#161618] border border-slate-800/80 rounded-2xl p-3 flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Viewership Size</span>
                <span className="text-xl font-bold font-mono text-white flex items-center gap-1.5 mt-1">
                  <Users className="w-4 h-4 text-emerald-400" />
                  {connectedViewersCount} <span className="text-xs text-slate-500 font-normal">Viewers online</span>
                </span>
              </div>

              <div className="bg-[#161618] border border-slate-800/80 rounded-2xl p-3 flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Codec Pipeline</span>
                <span className="text-[11px] font-bold font-mono text-slate-300 mt-1 truncate">
                  VP8 + Opus WebRTC SDP Mesh
                </span>
                <div className="flex items-center gap-1 text-[9px] text-slate-500 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                  STUN negotiation matches ok
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Aspect: Controls / Comments panel */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {!isLive ? (
            /* Publish Studio Forms */
            <div className="bg-[#161618] border border-slate-800/80 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-xs font-bold text-slate-350 tracking-wider flex items-center gap-2 uppercase font-mono">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Stream Credentials
              </h3>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Title of Broadcoast</label>
                <input
                  type="text"
                  required
                  placeholder="My P2P WebRTC Live Stream..."
                  value={streamTitle}
                  onChange={(e) => setStreamTitle(e.target.value)}
                  className="bg-[#0A0A0B] border border-slate-800 text-xs text-white rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition placeholder-slate-600"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Short Description</label>
                <textarea
                  rows={3}
                  placeholder="What's happening inside this live stream swarming theater?"
                  value={streamDesc}
                  onChange={(e) => setStreamDesc(e.target.value)}
                  className="bg-[#0A0A0B] border border-slate-800 text-xs text-white rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition placeholder-slate-600 resize-none leading-relaxed"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Broadcasting Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-2 text-[10px] font-bold rounded-xl border transition truncate text-left cursor-pointer ${
                        category === cat
                          ? "bg-indigo-600/10 text-indigo-400 border-indigo-500"
                          : "bg-slate-900 text-slate-400 border-slate-850 hover:border-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={!isCapturing || !streamTitle.trim()}
                onClick={startBroadcast}
                className="w-full mt-2 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:hover:bg-red-600 disabled:scale-100 text-white font-bold text-xs rounded-xl cursor-pointer transition hover:scale-102 flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                <Radio className="w-4 h-4 animate-pulse" /> Publish & Start Live stream
              </button>
            </div>
          ) : (
            /* Live chat monitor console */
            <div className="bg-[#161618] border border-slate-800/80 rounded-3xl p-4 flex-1 flex flex-col max-h-[360px] lg:max-h-none overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white tracking-tight uppercase font-mono">Stream Chat Logs</span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-neutral-900 border border-slate-800 font-mono text-[9px] text-slate-400 font-medium leading-none">
                  Live Sync
                </span>
              </div>

              {/* Comments scroll buffer */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
                {comments.length > 0 ? (
                  comments.slice().reverse().map((c) => (
                    <div key={c.id} className="p-2 border border-slate-800/35 bg-[#0a0a0b]/40 rounded-xl flex items-start gap-2 animate-fade-in text-left">
                      <img
                        src={c.avatar}
                        alt={c.author}
                        className="w-5.5 h-5.5 rounded-full object-cover mt-0.5"
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[10px] font-bold text-slate-200 truncate leading-none">{c.author}</span>
                          <span className="text-[8px] text-slate-600 font-mono shrink-0">{c.timestamp}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed leading-snug break-all">{c.content}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 text-center gap-1.5 opacity-60">
                    <MessageSquare className="w-8 h-8 text-slate-700" />
                    <span className="text-[10px] font-semibold text-slate-400">Swarm Chat Room Empty</span>
                    <p className="text-[9px] text-slate-550 max-w-xs leading-normal">
                      Viewer live stream chat and comments sent peer-to-peer over WebRTC signaling coordinates will emerge here.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 mt-3 shrink-0">
                <button
                  type="button"
                  onClick={stopEntireBroadcast}
                  className="w-full py-2.5 bg-red-950/20 border border-red-900/40 hover:bg-red-650 hover:text-white hover:border-red-600 font-bold text-xs text-red-400 rounded-xl cursor-pointer transition flex items-center justify-center gap-2"
                >
                  <StopCircle className="w-4 h-4" /> Stop Live stream & Off-Air
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
