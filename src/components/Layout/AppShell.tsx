import { NavLink, Outlet } from "react-router-dom";
import { Activity, Gauge, AlertTriangle, Settings } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "实时监测", icon: Activity },
  { to: "/simulation", label: "模拟仿真", icon: Gauge },
  { to: "/sensitivity", label: "灵敏度分析", icon: Settings },
  { to: "/alerts", label: "告警记录", icon: AlertTriangle },
];

export default function AppShell() {
  return (
    <div className="min-h-screen flex bg-starfield bg-ink-950">
      <aside className="w-64 shrink-0 border-r border-bronze-700/20 bg-ink-900/60 backdrop-blur-sm flex flex-col">
        <div className="p-5 border-b border-bronze-700/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold-500 to-bronze-600 flex items-center justify-center shadow-gold">
              <span className="text-ink-950 font-serif font-bold text-lg">地</span>
            </div>
            <div>
              <div className="font-serif font-bold text-gold-400 text-lg tracking-wider">
                候风地动仪
              </div>
              <div className="text-[10px] text-bronze-400/70 tracking-widest uppercase">
                Seismograph System
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="font-serif tracking-wide">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-bronze-700/20">
          <div className="text-[10px] text-bronze-500/60 text-center">
            <div>v1.0.0 · 后端监控系统</div>
            <div className="mt-1 opacity-70">© 东汉 · 阳嘉元年</div>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <header className="h-14 border-b border-bronze-700/20 bg-ink-900/40 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="text-bronze-500 text-xs">❖</span>
            <h1 className="font-serif text-gold-500 text-base tracking-wider">
              地动仪监测控制台
            </h1>
            <span className="text-bronze-500 text-xs">❖</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="status-dot bg-emerald-500 animate-pulse" />
              <span className="text-bronze-300">系统运行中</span>
            </div>
            <div className="text-xs text-bronze-400/80 tabular-nums font-mono">
              {new Date().toLocaleString("zh-CN", { hour12: false })}
            </div>
          </div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
