import { Home, Flame, Sparkles, Activity, FileText, Magnet, Github, Radio } from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onEnterMagnetTab: () => void;
  collapsed?: boolean;
}

export default function Sidebar({ activeTab, onSelectTab, onEnterMagnetTab, collapsed = false }: SidebarProps) {
  const navItems = [
    { id: "feed", name: "Home", icon: Home },
    { id: "trending", name: "Trending", icon: Flame },
    { id: "live", name: "Go Live", icon: Radio },
    { id: "studio", name: "Seed Studio", icon: Sparkles },
    { id: "streams", name: "P2P Diagnostics", icon: Activity },
  ];

  return (
    <aside 
      className={`hidden md:flex flex-col shrink-0 bg-[#0A0A0B]/90 backdrop-blur h-[calc(100vh-64px)] overflow-y-auto sticky top-16 transition-all duration-300 ease-in-out ${
        collapsed 
          ? "w-0 px-0 py-0 opacity-0 border-r-0 pointer-events-none overflow-hidden select-none" 
          : "w-60 px-2 py-4 opacity-100 border-r border-slate-800"
      }`} 
      id="navigation-sidebar"
    >
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
