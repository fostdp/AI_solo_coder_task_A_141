import { useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, Info, Filter, BellRing, Check, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertItem } from "@/types";

const LEVEL_STYLES: Record<AlertItem["level"], { badge: string; dot: string; icon: typeof AlertTriangle; text: string; ring: string }> = {
  critical: {
    badge: "bg-cinnabar-500/15 text-cinnabar-400 border-cinnabar-500/40",
    dot: "bg-cinnabar-400",
    icon: AlertTriangle,
    text: "严重",
    ring: "shadow-[0_0_0_1px_rgba(194,59,34,0.3),0_0_24px_rgba(194,59,34,0.15)]",
  },
  warning: {
    badge: "bg-gold-500/15 text-gold-400 border-gold-500/40",
    dot: "bg-gold-400",
    icon: AlertCircle,
    text: "警告",
    ring: "shadow-[0_0_0_1px_rgba(212,175,55,0.3),0_0_24px_rgba(212,175,55,0.12)]",
  },
  info: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
    icon: Info,
    text: "提示",
    ring: "shadow-[0_0_0_1px_rgba(34,197,94,0.25)]",
  },
};

const TYPE_LABELS: Record<AlertItem["type"], string> = {
  misfire: "都柱误触发",
  sensitivity_drop: "灵敏度下降",
  system: "系统消息",
};

function generateMockAlerts(): AlertItem[] {
  const now = Date.now();
  const templates: Array<Omit<AlertItem, "id" | "timestamp">> = [
    { type: "misfire", level: "critical", message: "西南龙头未检测到地震波却触发，疑似误触发，请核查机械机构", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "sensitivity_drop", level: "warning", message: "近30分钟检测率降至62%，低于阈值70%，都柱可能需要校准", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "misfire", level: "warning", message: "东向触发时加速度0.08 m/s²低于阈值，建议核实环境振动源", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "system", level: "info", message: "ClickHouse 数据库连接正常，数据写入延迟 < 200ms", mqtt_delivered: false },
    { type: "sensitivity_drop", level: "critical", message: "M5.0+ 地震连续 3 次未成功检测，系统告警等级提升", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "system", level: "info", message: "MQTT broker 连接恢复，告警推送链路通畅", mqtt_delivered: false },
    { type: "misfire", level: "warning", message: "都柱处于阈值边界触发，可能邻近机械噪声", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "sensitivity_drop", level: "warning", message: "北向灵敏度衰减 18%，建议检查导轨润滑", mqtt_delivered: false, device_id: "DDY-001" },
    { type: "system", level: "info", message: "每日自检完成：传感器 ×8 正常、MQTT 正常、存储正常", mqtt_delivered: false },
  ];
  return templates.map((t, i) => ({
    id: `ALT-${(1000 - i).toString().padStart(5, "0")}`,
    timestamp: new Date(now - i * (8 * 60 * 1000 + Math.random() * 14 * 60 * 1000)).toISOString(),
    ...t,
  }));
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function Alerts() {
  const [level, setLevel] = useState<"all" | AlertItem["level"]>("all");
  const [onlyUndelivered, setOnlyUndelivered] = useState(false);
  const mockAlerts = useMemo(() => generateMockAlerts(), []);

  const list = mockAlerts.filter((a) => {
    if (level !== "all" && a.level !== level) return false;
    if (onlyUndelivered && a.mqtt_delivered) return false;
    return true;
  });

  const counts = useMemo(() => ({
    critical: mockAlerts.filter((a) => a.level === "critical").length,
    warning: mockAlerts.filter((a) => a.level === "warning").length,
    info: mockAlerts.filter((a) => a.level === "info").length,
    pending: mockAlerts.filter((a) => !a.mqtt_delivered).length,
  }), [mockAlerts]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { level: "critical" as const, count: counts.critical, label: "严重告警" },
          { level: "warning" as const, count: counts.warning, label: "警告" },
          { level: "info" as const, count: counts.info, label: "提示信息" },
          { level: null, count: counts.pending, label: "MQTT 待推送", pending: true },
        ].map((it) => {
          const s = it.level ? LEVEL_STYLES[it.level] : { dot: "bg-bronze-400", text: "", icon: BellRing as typeof AlertTriangle, badge: "", ring: "" };
          const Icon = s.icon;
          return (
            <div key={it.label} className={cn("value-card transition-all", it.level && list[0]?.level === it.level && s.ring)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="value-label">{it.label}</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn("value-number", it.level === "critical" && "text-cinnabar-400", it.level === "warning" && "text-gold-400")}>{it.count}</span>
                    <span className="text-xs text-bronze-400/80">条</span>
                  </div>
                </div>
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center",
                  it.pending ? "bg-bronze-500/15 text-bronze-300 border border-bronze-500/30" : s.badge || "bg-ink-900 border border-bronze-700/40"
                )}>
                  {it.pending ? <BellOff className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bronze-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3 border-b border-bronze-700/30 pb-2">
          <div className="card-heading mb-0 border-0 pb-0 !text-gold-500">
            <BellRing className="w-4 h-4" />
            <span>告警中心</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-bronze-300/70">
              <Filter className="w-3.5 h-3.5" />
              <span>级别：</span>
            </div>
            <div className="flex gap-1">
              {([
                { k: "all", label: "全部" },
                { k: "critical", label: "严重" },
                { k: "warning", label: "警告" },
                { k: "info", label: "提示" },
              ] as const).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setLevel(t.k)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md border transition-all",
                    level === t.k
                      ? "bg-gold-500/15 text-gold-400 border-gold-500/50 shadow-gold"
                      : "text-bronze-300/70 border-bronze-700/40 hover:border-gold-500/30 hover:text-gold-400"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="ml-3 flex items-center gap-1.5 text-xs text-bronze-300/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUndelivered}
                onChange={(e) => setOnlyUndelivered(e.target.checked)}
                className="accent-gold-500"
              />
              仅显示未推送
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-bronze-700/30">
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">ID</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">时间</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">级别</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">类型</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">详情</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">设备</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">MQTT</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-bronze-500/60">
                    当前筛选条件下无告警记录
                  </td>
                </tr>
              ) : (
                list.map((a) => {
                  const s = LEVEL_STYLES[a.level];
                  const Icon = s.icon;
                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "border-b border-bronze-700/15 hover:bg-bronze-700/10 transition-colors",
                        a.level === "critical" && "bg-cinnabar-500/[0.03]"
                      )}
                    >
                      <td className="py-3 px-3 font-mono text-[11px] text-bronze-400 tabular-nums">{a.id}</td>
                      <td className="py-3 px-3 font-mono text-xs text-gold-300/90 tabular-nums whitespace-nowrap">{formatDateTime(a.timestamp)}</td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold",
                          s.badge
                        )}>
                          <span className={cn("status-dot animate-pulse", s.dot)} />
                          <Icon className="w-3 h-3" />
                          {s.text}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-bronze-200 whitespace-nowrap font-medium">{TYPE_LABELS[a.type]}</td>
                      <td className="py-3 px-3 text-xs text-bronze-100/90 leading-relaxed max-w-xl">{a.message}</td>
                      <td className="py-3 px-3">
                        <span className="inline-block text-[11px] px-1.5 py-0.5 rounded border border-bronze-700/50 text-bronze-300 font-mono">
                          {a.device_id || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {a.mqtt_delivered ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <Check className="w-3 h-3" /> 已推送
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-bronze-400">
                            <BellOff className="w-3 h-3" /> 等待推送
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bronze-panel p-4">
          <div className="card-heading">
            <Filter className="w-4 h-4 text-gold-500" />
            <span>告警规则配置</span>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { label: "误触发加速度阈值", val: "0.1", unit: "m/s²", hint: "低于此值触发龙头时判定为误触发" },
              { label: "灵敏度最低检测率", val: "70", unit: "%", hint: "检测窗口内触发率低于此值触发灵敏度告警" },
              { label: "灵敏度检测窗口", val: "30", unit: "分钟", hint: "滑动统计窗口时长" },
              { label: "MQTT 告警主题", val: "didongyi/alerts", unit: "topic", hint: "告警推送 MQTT topic" },
            ].map((r) => (
              <div key={r.label} className="flex items-baseline justify-between border-b border-bronze-700/15 pb-2 last:border-0">
                <div>
                  <div className="text-bronze-200 text-xs">{r.label}</div>
                  <div className="text-[10px] text-bronze-500/70 mt-0.5">{r.hint}</div>
                </div>
                <div className="font-mono text-gold-400 tabular-nums text-sm">
                  {r.val}<span className="ml-0.5 text-bronze-400/70 text-[10px]">{r.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bronze-panel p-4">
          <div className="card-heading">
            <BellRing className="w-4 h-4 text-gold-500" />
            <span>MQTT 推送链路</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded bg-ink-950/50 border border-bronze-700/30">
              <span className="text-bronze-300/80">Broker 地址</span>
              <code className="text-gold-400 font-mono">tcp://localhost:1883</code>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-ink-950/50 border border-bronze-700/30">
              <span className="text-bronze-300/80">Client ID</span>
              <code className="text-gold-400 font-mono">didongyi-backend</code>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-ink-950/50 border border-bronze-700/30">
              <span className="text-bronze-300/80">QoS</span>
              <code className="text-gold-400 font-mono">1 · At Least Once</code>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-emerald-500/[0.06] border border-emerald-500/30">
              <span className="text-emerald-300">链路状态</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span className="status-dot bg-emerald-400 animate-pulse" />
                已连接
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
