import { NavLink } from "react-router-dom";
import { Monitor, Activity, LineChart, BellRing, Wifi, WifiOff, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeStore } from "@/store/realtimeStore";

const navItems = [
  { path: "/", label: "实时监控", icon: Monitor },
  { path: "/simulation", label: "仿真控制台", icon: Activity },
  { path: "/sensitivity", label: "灵敏度分析", icon: LineChart },
  { path: "/alerts", label: "告警中心", icon: BellRing },
];

export default function Sidebar() {
  const wsConnected = useRealtimeStore((s) => s.wsConnected);
  const deviceId = useRealtimeStore((s) => s.deviceId);
  const alertCount = useRealtimeStore((s) => s.alerts.filter((a) => a.level === "critical").length);

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-bronze-700/40 bg-gradient-to-b from-ink-900 via-ink-950 to-ink-950 backdrop-blur-sm">
      <div className="flex flex-col items-center px-6 pt-8 pb-6">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-bronze-600 via-bronze-500 to-bronze-800 shadow-bronze">
          <div className="absolute inset-1 rounded-full border-2 border-gold-400/40" />
          <svg viewBox="0 0 48 48" className="h-11 w-11 text-gold-400 drop-shadow-gold">
            <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M24 8 L26 20 L38 22 L28 29 L30 42 L24 35 L18 42 L20 29 L10 22 L22 20 Z"
              fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="24" cy="24" r="4" fill="currentColor" />
          </svg>
        </div>
        <h1 className="mt-5 bg-gradient-to-r from-gold-400 via-bronze-300 to-gold-500 bg-clip-text text-center font-serif text-xl font-bold tracking-wider text-transparent">
          张衡地动仪
        </h1>
        <p className="mt-1 font-serif text-xs tracking-[0.3em] text-bronze-300/70">研 究 平 台</p>

        <div className="mt-6 flex w-full items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-bronze-600/50 to-transparent" />
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-bronze-400/60">
            <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z"
              fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-bronze-600/50 to-transparent" />
        </div>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-4">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-bronze-600/30 via-bronze-500/20 to-transparent text-gold-400 shadow-inner"
                  : "text-bronze-200/70 hover:bg-bronze-800/20 hover:text-bronze-100"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-gradient-to-b from-gold-400 to-bronze-500" />
                )}
                <Icon className={cn(
                  "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                  isActive ? "text-gold-400 drop-shadow-gold" : "text-bronze-400"
                )} />
                <span className="font-serif tracking-wide">{label}</span>
                {path === "/alerts" && alertCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cinnabar-500 px-1.5 text-[10px] font-bold text-white shadow-lg">
                    {alertCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-bronze-700/30 px-5 py-5">
        <div className="mb-4 flex items-center justify-between rounded-lg border border-bronze-700/40 bg-ink-900/60 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Server className="h-4 w-4 text-bronze-400" />
            <span className="font-serif text-xs text-bronze-300">{deviceId}</span>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
            wsConnected
              ? "bg-ink-600/40 text-ink-200"
              : "bg-cinnabar-500/20 text-cinnabar-400"
          )}>
            {wsConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span>在线</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>离线</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-bronze-400/70">
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              wsConnected ? "bg-ink-400 animate-pulse" : "bg-bronze-600"
            )} />
            <span>WebSocket {wsConnected ? "已连接" : "未连接"}</span>
          </div>
        </div>

        <div className="mt-3 text-center font-serif text-[10px] tracking-widest text-bronze-600/50">
          建 安 十 三 年 · 阳 嘉 元 年
        </div>
      </div>
    </aside>
  );
}
