import React, { useRef, useState, useEffect } from "react";
import { VideoTorrent } from "../types";
import { Upload, FilePlay, Check, Copy, Share2, Sparkles, FolderHeart, Info, Film, ArrowRight, Cloud } from "lucide-react";
import { CloudPickerModal } from "./CloudHub";

interface UploadFormProps {
  onVideoCreated: (newVideo: VideoTorrent) => void;
}

export default function UploadForm({ onVideoCreated }: UploadFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Sci-Fi");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [dragActive, setDragActive] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seededTorrent, setSeededTorrent] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [seedSpeed, setSeedSpeed] = useState<number>(0);
  const [numPeers, setNumPeers] = useState<number>(0);

  // Cloud Integration states
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const webtorrentClientRef = useRef<any>(null);
  const speedIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Setup WebTorrent cleanup on unmount
  useEffect(() => {
    return () => {
      if (speedIntervalRef.current) clearInterval(speedIntervalRef.current);
    };
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("video/")) {
        setSelectedFile(file);
        if (!title) {
          const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
          setTitle(nameWithoutExt.replace(/[_-]/g, " "));
        }
      } else {
        alert("Please upload a video file (.mp4, .webm, etc.).");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) {
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
        setTitle(nameWithoutExt.replace(/[_-]/g, " "));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !title) return;

    setIsSeeding(true);

    try {
      if (typeof window === "undefined" || !(window as any).WebTorrent) {
        throw new Error("WebTorrent SDK is currently loading or unreachable. Please refresh and try again.");
      }

      const client = new (window as any).WebTorrent();
      webtorrentClientRef.current = client;

      console.log("Seeding file:", selectedFile.name, selectedFile.size);

      client.seed(selectedFile, {
        name: selectedFile.name,
        comment: "Seeded live on WebTorrent",
        announce: [
          "wss://tracker.btorrent.xyz",
          "wss://tracker.openwebtorrent.com",
          "wss://tracker.fastcast.nz",
          "udp://tracker.leechers-paradise.org:6969",
          "udp://tracker.coppersurfer.tk:6969"
        ]
      }, (torrent: any) => {
        console.log("Seeding successful! Magnet URI:", torrent.magnetURI);
        setSeededTorrent(torrent);

        speedIntervalRef.current = setInterval(() => {
          setSeedSpeed(torrent.uploadSpeed);
          setNumPeers(torrent.numPeers);
        }, 1000);

        const dynamicThumb = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80`;

        const newVideo: VideoTorrent = {
          id: `custom-${Date.now()}`,
          title: title,
          description: description || `P2P stream of ${selectedFile.name} seeded in real-time from the uploader's browser.`,
          magnetUrl: torrent.magnetURI,
          category: "Self-Seeded",
          uploader: "Local Seed Peer",
          uploaderAvatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80",
          views: 0,
          duration: "Stream",
          uploadedAt: "Just now",
          thumbnailUrl: dynamicThumb,
          comments: [],
          isCustom: true,
          localFile: selectedFile
        };

        onVideoCreated(newVideo);
        setIsSeeding(false);
      });

    } catch (err: any) {
      alert("Error initiating P2P upload: " + err.message);
      setIsSeeding(false);
    }
  };

  const copyMagnet = () => {
    if (!seededTorrent) return;
    navigator.clipboard.writeText(seededTorrent.magnetURI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="bg-[#161618] border border-slate-800 rounded-3xl p-6 shadow-xl max-w-2xl mx-auto font-sans" id="publish-seed-container">
      {!seededTorrent ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Film className="w-5.5 h-5.5 text-indigo-400" />
              Swarm Seed Studio
            </h3>
            <p className="text-xs text-slate-400">
              Transform local video files into web torrent magnet swarms instantly. Seed securely straight from your browser.
            </p>
          </div>

          {/* Drag & Drop Box */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-all duration-200 bento-transition ${
              dragActive 
                ? "border-indigo-500 bg-indigo-950/25" 
                : selectedFile 
                  ? "border-indigo-800 bg-[#0A0A0B]/40" 
                  : "border-slate-800 hover:border-slate-700 hover:bg-[#0A0A0B]/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="flex flex-col items-center justify-center text-center gap-2">
                <FolderHeart className="w-10 h-10 text-indigo-400" />
                <span className="text-sm font-semibold text-white truncate max-w-sm">
                  {selectedFile.name}
                </span>
                <span className="text-[11px] font-mono text-slate-500 bg-[#0A0A0B] px-2.5 py-1 rounded-full border border-slate-800">
                  {formatSize(selectedFile.size)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="mt-2 text-rose-500 hover:text-rose-400 text-xs font-semibold hover:underline"
                >
                  Change File
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center gap-2">
                <Upload className="w-10 h-10 text-slate-500" />
                <span className="text-sm font-semibold text-slate-300">
                  Select a video to publish
                </span>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  Drag and drop files here, or click to browse. Supports .mp4, .webm, and other client-compatible stream containers.
                </p>
              </div>
            )}
          </div>

          {/* Cloud Storage Shortcut Bar */}
          {!selectedFile && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="h-px bg-slate-800/60 flex-1" />
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest shrink-0">Or Stream From Cloud Drive</span>
                <div className="h-px bg-slate-800/60 flex-1" />
              </div>
              
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCloudPickerOpen(true)}
                  className="cursor-pointer bg-[#0A0A0B]/50 hover:bg-[#161618] border border-slate-800 hover:border-indigo-500/30 rounded-2xl py-2.5 px-3 text-[11px] font-bold text-slate-350 transition flex items-center justify-center gap-1.5"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Google Drive</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCloudPickerOpen(true)}
                  className="cursor-pointer bg-[#0A0A0B]/50 hover:bg-[#161618] border border-slate-800 hover:border-indigo-500/30 rounded-2xl py-2.5 px-3 text-[11px] font-bold text-slate-350 transition flex items-center justify-center gap-1.5"
                >
                  <Cloud className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">OneDrive</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCloudPickerOpen(true)}
                  className="cursor-pointer bg-[#0A0A0B]/50 hover:bg-[#161618] border border-slate-800 hover:border-indigo-500/30 rounded-2xl py-2.5 px-3 text-[11px] font-bold text-slate-350 transition flex items-center justify-center gap-1.5"
                >
                  <Cloud className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">iCloud Drive</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Video Title</label>
              <input
                type="text"
                required
                disabled={isSeeding}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your seeded video an engaging name..."
                className="bg-[#0A0A0B] border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-200"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
              <textarea
                rows={3}
                disabled={isSeeding}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell peers what this stream is about (release details, encoders...)"
                className="bg-[#0A0A0B] border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-200 resize-none"
              />
            </div>

            {/* Category selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Primary Category</label>
                <select
                  value={category}
                  disabled={isSeeding}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-[#0A0A0B] border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white rounded-xl px-3 py-2.5 text-sm outline-none cursor-pointer"
                >
                  <option value="Sci-Fi">Sci-Fi</option>
                  <option value="Animation">Animation</option>
                  <option value="Comedy">Comedy</option>
                  <option value="Experimental">Experimental</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Uploader Node</label>
                <input
                  type="text"
                  disabled
                  value="My Browser Node (Anonymous)"
                  className="bg-[#0A0A0B]/50 border border-slate-800/40 text-slate-500 rounded-xl px-3 py-2.5 text-sm outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedFile || !title || isSeeding}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-800 disabled:text-slate-500 font-bold tracking-tight text-sm py-3 px-4 rounded-xl shadow-lg shadow-indigo-950/10 cursor-pointer transition flex items-center justify-center gap-2 mt-2"
          >
            {isSeeding ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating Web Swarm Metainfo...
              </>
            ) : (
              <>
                <Sparkles className="w-4.5 h-4.5 text-white" />
                Initialize Peer Seeding
              </>
            )}
          </button>
        </form>
      ) : (
        /* Seeding Success Wizard Panel */
        <div className="flex flex-col gap-6" id="seeding-wizard-success">
          <div className="flex flex-col gap-1 text-center items-center">
            <div className="w-12 h-12 bg-indigo-500/15 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Your Swarm is Seeding Live!</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Keep this tab or browser window open so that visiting peers can draw bytes directly from your disk cache.
            </p>
          </div>

          {/* Quick Stats Panel */}
          <div className="bg-[#0A0A0B]/60 rounded-2xl p-4 border border-slate-800/60 font-mono text-xs flex flex-col gap-2.5">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans font-medium">Seeded Torrent Title:</span>
              <span className="text-white font-sans font-semibold text-right max-w-xs truncate">{title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans font-medium">Swarm InfoHash:</span>
              <span className="text-slate-300 select-all font-mono">{seededTorrent.infoHash.substring(0, 15)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans font-medium">Seeding Speed:</span>
              <span className="text-emerald-400 font-bold">{formatSpeed(seedSpeed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans font-medium">Connected Seeds/Leechers:</span>
              <span className="text-white flex items-center gap-1 font-sans">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                {numPeers} connected peers
              </span>
            </div>
          </div>

          {/* Magnet URI share block */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Magnet URI Link</label>
            <div className="flex bg-[#0A0A0B] rounded-2xl border border-slate-800 overflow-hidden p-1">
              <input
                type="text"
                readOnly
                value={seededTorrent.magnetURI}
                className="bg-transparent flex-1 px-3 py-2 text-xs font-mono text-slate-300 outline-none select-all"
              />
              <button
                type="button"
                onClick={copyMagnet}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-xs cursor-pointer transition flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Copy this magnet link and send it to your friends. They can paste it on the top search bar and instantly watch this video!
            </p>
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => {
                setSeededTorrent(null);
                setSelectedFile(null);
                setTitle("");
                setDescription("");
              }}
              className="flex-1 bg-[#0A0A0B] border border-slate-800 hover:border-slate-700 hover:bg-[#161618] text-slate-300 font-semibold text-xs py-3 px-4 rounded-xl cursor-pointer transition text-center"
            >
              Seed Another File
            </button>
          </div>
        </div>
      )}

      {/* Info Strip */}
      <div className="mt-5 bg-[#0A0A0B]/40 rounded-2xl p-4 border border-slate-800 flex items-start gap-4">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-slate-400">
          <strong className="text-white block mb-0.5">Zero-Server Media Hosting</strong>
          WebTorrent seeds your local files straight from Chrome/Safari via secure direct peers. 
          There are no middleman storage servers hosting your file. Other users will streams files byte-by-byte directly from your browser's physical storage sandbox.
        </div>
      </div>

      {/* Cloud Picker Modal overlay */}
      <CloudPickerModal
        isOpen={cloudPickerOpen}
        onClose={() => setCloudPickerOpen(false)}
        onFileSelected={(file, displayTitle, fileDesc, fileCat) => {
          setSelectedFile(file);
          setTitle(displayTitle);
          setDescription(fileDesc);
          if (fileCat) setCategory(fileCat);
        }}
      />
    </div>
  );
}
