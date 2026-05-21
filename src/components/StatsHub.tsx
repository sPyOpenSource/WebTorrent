import React, { useState } from "react";
import { Magnet, Info, Server, Layers, Zap, Radio, Globe, HeartHandshake, Film } from "lucide-react";
import { VideoTorrent } from "../types";

interface StatsHubProps {
  onStreamMagnet: (magnetUrl: string) => void;
  seededVideos: VideoTorrent[];
  onPlayVideo: (video: VideoTorrent) => void;
}

export default function StatsHub({ onStreamMagnet, seededVideos, onPlayVideo }: StatsHubProps) {
  const [magnetInput, setMagnetInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleStreamMagnet = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const trimmed = magnetInput.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("magnet:?xt=urn:btih:") || trimmed.length === 40) {
      let finalMagnet = trimmed;
      if (trimmed.length === 40) {
        finalMagnet = `magnet:?xt=urn:btih:${trimmed}&dn=Manually+Inputted+Hash&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`;
      }
      onStreamMagnet(finalMagnet);
      setMagnetInput("");
    } else {
      setErrorMsg("This does not look like a valid Bittorrent Magnet URI or 40-character SHA1 hexadecimal InfoHash.");
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto font-sans" id="diagnostics-and-magnet-importer">
      {/* Magnet Streamer Form */}
      <div className="bg-[#161618] border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col gap-1.5 mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Magnet className="w-5.5 h-5.5 text-indigo-400 animate-bounce" />
            Direct Swarm Streamer
          </h3>
          <p className="text-xs text-slate-400">
            Stream any public video torrent directly inside the browser. Feed-in a magnet link or infohash to begin streaming!
          </p>
        </div>

        <form onSubmit={handleStreamMagnet} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2 bg-[#0A0A0B] p-1.5 rounded-2xl border border-slate-800">
            <input
              type="text"
              value={magnetInput}
              onChange={(e) => setMagnetInput(e.target.value)}
              placeholder="Paste magnet:?xt=urn:btih:hash... or SHA-1 InfoHash..."
              className="bg-transparent flex-1 px-4 py-2.5 text-xs font-mono text-slate-200 outline-none placeholder-slate-600"
            />
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-xs cursor-pointer transition-all duration-200 bento-transition flex items-center gap-1.5 shrink-0 justify-center"
            >
              Stream Swarm
            </button>
          </div>
          {errorMsg && (
            <span className="text-xs text-rose-500 font-mono flex items-center gap-1">
              ⚠️ {errorMsg}
            </span>
          )}
        </form>
      </div>

      {/* Grid of active self seeded movies */}
      {seededVideos.length > 0 && (
        <div className="bg-[#161618] border border-slate-800 rounded-3xl p-6 shadow-xl">
          <h4 className="text-md font-bold text-white mb-3 flex items-center gap-1.5">
            <Layers className="w-4.5 h-4.5 text-indigo-400" />
            Your Seeding Streams ({seededVideos.length})
          </h4>
          <span className="text-xs text-slate-400 block -mt-2.5 mb-4">
            These files are actively cached in memory and announced on serverless signaling gateways. Keep this tab running to feed other peers.
          </span>

          <div className="flex flex-col gap-2.5">
            {seededVideos.map((video) => (
              <div key={video.id} className="bg-[#0A0A0B]/60 p-3 rounded-2xl border border-slate-800/85 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Film className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white tracking-tight">{video.title}</span>
                    <span className="text-[10px] text-slate-500 truncate max-w-xs font-mono">{video.magnetUrl.substring(0, 50)}...</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onPlayVideo(video)}
                    className="px-3 py-1.5 bg-[#161618] hover:bg-[#1f1f23] text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200"
                  >
                    View Stream
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(video.magnetUrl);
                      alert("Magnet link copied to clipboard!");
                    }}
                    className="px-3 py-1.5 bg-indigo-950/20 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200"
                  >
                    Copy Magnet Link
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Technical details explaining WebTorrent, WebRTC, DHT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* How it works card */}
        <div className="bg-[#161618] border border-slate-800 rounded-3xl p-5 text-xs text-slate-300 leading-relaxed flex flex-col gap-2.5">
          <h4 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-indigo-400" />
            Decentralized Swarm Architecture
          </h4>
          <p>
            Standard BitTorrent clients run over raw UDP/TCP protocols, which browsers are blocked from calling natively for security.
          </p>
          <p>
            <strong>WebTorrent</strong> bridges this gap by coordinating peers entirely over <strong>WebRTC DataChannels</strong>. This means any modern browser can act as a fully fledged BitTorrent client that exchanges video byte fragments directly with other browser nodes visiting the website.
          </p>
          <div className="flex items-center gap-1.5 bg-indigo-950/25 border border-indigo-900/30 p-2.5 rounded-xl text-[11px] text-indigo-400 mt-1">
            <Radio className="w-3.5 h-3.5" /> Direct Browser-to-Browser seed, skip server infrastructure costs!
          </div>
        </div>

        {/* Global trackers listed */}
        <div className="bg-[#161618] border border-slate-800 rounded-3xl p-5 text-xs text-slate-300 flex flex-col gap-2.5">
          <h4 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-indigo-400" />
            Swarm Signaling & Trackers
          </h4>
          <p>
            Because browsers don't have open listen sockets, trackers are initialized using <strong>WebSockets</strong> to swap session descriptors (SDP) and create WebRTC link tunnels.
          </p>
          <span className="text-[10px] text-slate-500 font-mono">Announced default signaling list:</span>
          <div className="flex flex-col gap-1 font-mono text-[10px] bg-[#0A0A0B]/50 p-2.5 rounded-xl border border-slate-800 text-slate-400">
            <span>• wss://tracker.btorrent.xyz</span>
            <span>• wss://tracker.openwebtorrent.com</span>
            <span>• wss://tracker.fastcast.nz</span>
            <span>• wss://tracker.files.fm:7073</span>
          </div>
        </div>
      </div>
    </div>
  );
}
