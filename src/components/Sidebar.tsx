import { Home, Flame, Sparkles, Activity, FileText, Magnet, Github } from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onEnterMagnetTab: () => void;
}

export default function Sidebar({ activeTab, onSelectTab, onEnterMagnetTab }: SidebarProps) {
  const navItems = [
    { id: "feed", name: "Home Feed", icon: Home },
    { id: "trending", name: "Trending", icon: Flame },
    { id: "studio", name: "Seed Studio", icon: Sparkles },
    { id: "streams", name: "P2P Diagnostics", icon: Activity },
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#0A0A0B]/90 backdrop-blur px-2 py-4 h-[calc(100vh-64px)] overflow-y-auto border-r border-slate-800 sticky top-16" id="navigation-sidebar">
      <div className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`cursor-pointer w-full flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-semibold tracking-tight transition-all duration-200 bento-transition ${
                isActive
                  ? "bg-indigo-600/10 text-indigo-400 border-l-4 border-indigo-500 font-bold"
                  : "text-slate-400 hover:text-white hover:bg-[#161618]"
              }`}
            >
              <Icon className={`w-4.5 h-4.5 ${isActive ? "text-indigo-400" : "text-slate-400 group-hover:text-white"}`} />
              {item.name}
            </button>
          );
        })}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-800 px-4">
        <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Custom Import</h5>
        <button
          onClick={onEnterMagnetTab}
          className="cursor-pointer w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-[11px] font-mono font-medium text-indigo-400 bg-indigo-950/20 border border-indigo-900/40 hover:border-indigo-700/50 hover:bg-indigo-950/30 transition text-left bento-transition"
        >
          <Magnet className="w-3.5 h-3.5 shrink-0" />
          Stream Magnet URI
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800 px-4">
        <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Upstream Sync</h5>
        <a
          href="https://github.com/sPyOpenSource/WebTorrent"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-[11px] font-mono font-medium text-slate-300 bg-[#161618]/30 border border-slate-800 hover:border-indigo-500/40 hover:text-indigo-400 hover:bg-[#161618]/60 transition text-left bento-transition"
        >
          <Github className="w-3.5 h-3.5 shrink-0 animate-pulse" />
          sPyOpenSource/WebTorrent
        </a>
      </div>

      <div className="mt-auto px-4 py-4 text-[10px] text-slate-500 leading-relaxed font-sans">
        <div className="flex items-center gap-1.5 font-semibold text-slate-400 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
          Node Running Live
        </div>
        WebRTC engine is warm and running in memory sandbox. Direct peer speeds depends on current swarm seeds.
      </div>
    </aside>
  );
}
