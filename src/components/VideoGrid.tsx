import { VideoTorrent } from "../types";
import { Play, Users, Eye, Sparkles, AlertCircle } from "lucide-react";

interface VideoGridProps {
  videos: VideoTorrent[];
  onSelectVideo: (video: VideoTorrent) => void;
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  categories: string[];
}

export default function VideoGrid({ 
  videos, 
  onSelectVideo, 
  activeCategory, 
  onSelectCategory, 
  categories 
}: VideoGridProps) {
  
  // Apply visual classification filter
  const filteredVideos = videos.filter((v) => {
    if (activeCategory === "All") return true;
    if (activeCategory === "Self-Seeded") return v.isCustom === true;
    return v.category === activeCategory;
  });

  const getCategoryColor = (cat: string) => {
    if (cat === activeCategory) {
      return "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-950/20";
    }
    return "bg-[#161618] border-slate-800 text-slate-400 hover:text-white hover:bg-[#1f1f23] hover:border-slate-700";
  };

  return (
    <div className="flex flex-col gap-5 w-full font-sans" id="root-video-grid">
      {/* Category Pills Navigation Carousel strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 pr-4 scrollbar-none scroll-smooth">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onSelectCategory(cat)}
            className={`cursor-pointer shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold tracking-tight border transition-all duration-200 bento-transition ${getCategoryColor(
              cat
            )}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid of contents */}
      {filteredVideos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-7 w-full">
          {filteredVideos.map((video) => (
            <div
              key={video.id}
              onClick={() => onSelectVideo(video)}
              className="group flex flex-col gap-3.5 cursor-pointer bg-transparent rounded-3xl overflow-hidden transition-all duration-300"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-video rounded-3xl bg-[#0A0A0B] border border-slate-800 shadow shadow-neutral-950 overflow-hidden">
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-103 transition-all duration-500 brightness-[0.85] group-hover:brightness-100"
                />
                
                {/* Peer status badge or custom indicator floating relative on thumbnail */}
                {video.isLive ? (
                  <span className="absolute top-3.5 left-3.5 bg-red-600 text-white text-[9px] uppercase font-extrabold px-2.5 py-1 rounded-full backdrop-blur-md border border-red-500/30 shadow flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                    Live Broadcast
                  </span>
                ) : video.isCustom ? (
                  <span className="absolute top-3.5 left-3.5 bg-indigo-600/90 text-white text-[9px] uppercase font-bold px-2.5 py-1 rounded-full backdrop-blur-md border border-indigo-500/30 shadow flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                    Seeding Live
                  </span>
                ) : (
                  <span className="absolute top-3.5 left-3.5 bg-black/60 text-slate-300 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md border border-slate-800/80">
                    {video.category}
                  </span>
                )}

                {/* Duration Badge */}
                <span className={`absolute bottom-3.5 right-3.5 backdrop-blur-sm text-white text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                  video.isLive ? "bg-red-700/90 uppercase tracking-widest text-[9px] font-bold" : "bg-black/80"
                }`}>
                  {video.duration}
                </span>

                {/* Nice clean Play icon overlay which fades-in during cursor hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-300">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    <Play className="w-5.5 h-5.5 fill-current ml-0.5 text-white" />
                  </div>
                </div>
              </div>

              {/* Video Info Block */}
              <div className="flex gap-3 px-2">
                {/* Uploader Avatar */}
                <div className="w-9 h-9 rounded-xl shrink-0 overflow-hidden bg-[#161618] border border-slate-800">
                  {video.uploaderAvatar ? (
                    <img
                      src={video.uploaderAvatar}
                      alt={video.uploader}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#0A0A0B] font-bold text-[11px] text-slate-500">
                      PS
                    </div>
                  )}
                </div>

                {/* Meta details */}
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-all leading-tight tracking-tight line-clamp-2">
                    {video.title}
                  </h4>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-400 hover:text-white transition font-semibold truncate">
                      {video.uploader}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                      <span>{video.views > 0 ? `${video.views.toLocaleString()} views` : "0 views"}</span>
                      <span>•</span>
                      <span>{video.uploadedAt}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-12 bg-[#161618] border border-slate-800 rounded-3xl w-full">
          <AlertCircle className="w-12 h-12 text-slate-500 mb-3" />
          <h4 className="text-md font-bold text-white">No Torrent Feeds Found</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            There are no streamed clips in the selected Category. Try building and seeding your own film under the Seed Studio tab!
          </p>
        </div>
      )}
    </div>
  );
}
