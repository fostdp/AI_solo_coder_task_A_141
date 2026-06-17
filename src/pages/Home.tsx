import { useEffect, useRef } from "react";
import { Play, Square, MoveRight, MoveUp, RotateCcw, Activity } from "lucide-react";
import { useRealtimeStore } from "@/store/realtimeStore";
import SeismicWaveform from "@/components/Visuals/SeismicWaveform";
import PillarTrailCanvas from "@/components/Visuals/PillarTrailCanvas";
import SceneCanvas from "@/components/Didongyi3D/SceneCanvas";
import DragonInfoOverlay from "@/components/Didongyi3D/DragonInfoOverlay";
import type { SensorSample, DragonStatus } from "@/types";
import { cn } from "@/lib/utils";

function ValueCard({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="value-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="value-label">{label}</div>
          <div className="flex items-baseline gap-1.5">
            <span className="value-number">{value}</span>
            <span className="text-xs text-bronze-400/80">{unit}</span>
          </div>
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", accent)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function DragonBadge({ dragon }: { dragon: DragonStatus }) {
  return (
    <div
      className={cn(
        "bronze-panel px-2 py-1.5 text-center transition-all duration-300",
        dragon.triggered && "border-cinnabar-500/70 shadow-[0_0_16px_rgba(194,59,34,0.4)]"
      )}
    >
      <div
        className={cn(
          "text-lg font-serif font-bold",
          dragon.triggered ? "text-cinnabar-400" : "text-gold-400"
        )}
      >
        {dragon.direction}
      </div>
      <div
        className={cn(
          "text-[9px] uppercase tracking-widest mt-0.5",
          dragon.triggered ? "text-cinnabar-500/80" : "text-bronze-400/60"
        )}
      >
        {dragon.triggered ? "TRIGGERED" : "STANDBY"}
      </div>
    </div>
  );
}

function formatNumber(v: number, digits = 2) {
  return v.toFixed(digits);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

export default function Home() {
  const store = useRealtimeStore();
  const demoFrameRef = useRef<number | null>(null);
  const sampleCounterRef = useRef(0);

  const startDemo = () => {
    if (demoFrameRef.current) return;
    store.setIsLive(true);
    store.setIsDemoMode(true);
    let t = 0;
    const tick = () => {
      t += 1;
      sampleCounterRef.current += 1;
      const wave =
        Math.sin(t * 0.08) * 0.4 +
        Math.sin(t * 0.23 + 1.2) * 0.25 +
        Math.sin(t * 0.04 + 0.5) * 0.2 +
        (Math.random() - 0.5) * 0.15;
      const dx = Math.sin(t * 0.05) * 3.5 + (Math.random() - 0.5) * 1.2;
      const dy = Math.cos(t * 0.06 + 0.8) * 2.8 + (Math.random() - 0.5) * 1.0;
      const tilt = Math.sin(t * 0.03 + 2) * 2.2;
      const accel = Math.abs(wave) * 1.8 + Math.random() * 0.2;

      store.addWaveSample(wave);
      store.setDisplacementX(dx);
      store.setDisplacementY(dy);
      store.setTiltAngle(tilt);
      store.setAcceleration(accel);
      store.addPillarTrailPoint(dx, dy);

      const sample: SensorSample = {
        id: sampleCounterRef.current,
        timestamp: Date.now(),
        displacement_x: dx,
        displacement_y: dy,
        tilt_angle: tilt,
        acceleration: accel,
        waveform_sample: wave,
      };
      store.addSample(sample);

      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 4.5) {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const dirIdx = Math.round(((angle + 360) % 360) / 45);
        const newDragons = store.dragons.map((d, i) => ({
          ...d,
          triggered: i === dirIdx || (mag > 5.5 && Math.abs(i - dirIdx) <= 1),
          ball_dropped: i === dirIdx || (mag > 5.5 && Math.abs(i - dirIdx) <= 1)
            ? true
            : d.ball_dropped,
        }));
        store.setDragons(newDragons);
      } else if (t % 120 === 0) {
        store.setDragons(store.dragons.map((d) => ({ ...d, triggered: false, ball_dropped: false })));
      }

      demoFrameRef.current = requestAnimationFrame(tick);
    };
    demoFrameRef.current = requestAnimationFrame(tick);
  };

  const stopDemo = () => {
    if (demoFrameRef.current) {
      cancelAnimationFrame(demoFrameRef.current);
      demoFrameRef.current = null;
    }
    store.setIsLive(false);
    store.setIsDemoMode(false);
  };

  useEffect(() => {
    return () => {
      if (demoFrameRef.current) cancelAnimationFrame(demoFrameRef.current);
    };
  }, []);

  const displaySamples = store.samples.slice(0, 20);
  const seismicIntensity = Math.min(1, Math.abs(store.acceleration) * 0.4 + 0.02);

  return (
    <div className="space-y-5 relative pb-16">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ValueCard
          label="都柱位移 X"
          value={formatNumber(store.displacementX)}
          unit="mm"
          icon={MoveRight}
          accent="bg-gold-500/15 text-gold-400 border border-gold-500/30"
        />
        <ValueCard
          label="都柱位移 Y"
          value={formatNumber(store.displacementY)}
          unit="mm"
          icon={MoveUp}
          accent="bg-bronze-500/15 text-bronze-300 border border-bronze-500/30"
        />
        <ValueCard
          label="倾角"
          value={formatNumber(store.tiltAngle)}
          unit="°"
          icon={RotateCcw}
          accent="bg-cinnabar-500/10 text-cinnabar-400 border border-cinnabar-500/25"
        />
        <ValueCard
          label="地震波加速度"
          value={formatNumber(store.acceleration, 3)}
          unit="m/s²"
          icon={Activity}
          accent="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 relative">
          <div className="card-heading">
            <span className="text-bronze-500 text-sm">❖</span>
            <span>地动仪三维模型</span>
            <span className="text-bronze-500 text-sm">❖</span>
          </div>
          <div className="relative bronze-panel p-2 min-h-[520px]">
            <SceneCanvas
              pillarState={store.pillar}
              dragons={store.dragons}
              isSimulating={store.isLive}
              seismicIntensity={seismicIntensity}
            />
            <DragonInfoOverlay dragons={store.dragons} layout="octagon" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bronze-panel p-4">
            <SeismicWaveform
              data={store.waveHistory}
              height={200}
              title="实时地震波形"
              showGrid
            />
          </div>
          <div className="bronze-panel p-4">
            <PillarTrailCanvas
              trail={store.pillarTrail}
              currentX={store.displacementX}
              currentY={store.displacementY}
              threshold={5}
              title="都柱轨迹 · 俯视"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {store.dragons.map((d) => (
                <DragonBadge key={d.direction} dragon={d} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bronze-panel p-4">
        <div className="card-heading">
          <span className="text-bronze-500 text-sm">❖</span>
          <span>传感器采样记录 (最近 {displaySamples.length} 条)</span>
          <span className="text-bronze-500 text-sm">❖</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-bronze-700/30">
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">序号</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium">时间</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium text-right">位移 X (mm)</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium text-right">位移 Y (mm)</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium text-right">倾角 (°)</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium text-right">加速度 (m/s²)</th>
                <th className="py-2 px-3 text-xs uppercase tracking-widest text-bronze-400/80 font-medium text-right">波形</th>
              </tr>
            </thead>
            <tbody>
              {displaySamples.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-bronze-500/60">
                    暂无采样数据，点击右下角「开始演示」以生成模拟数据
                  </td>
                </tr>
              ) : (
                displaySamples.map((s, i) => (
                  <tr
                    key={s.id}
                    className={cn(
                      "border-b border-bronze-700/15 hover:bg-bronze-700/10 transition-colors",
                      i === 0 && "bg-gold-500/5"
                    )}
                  >
                    <td className="py-2 px-3 font-mono text-xs text-bronze-400 tabular-nums">#{s.id}</td>
                    <td className="py-2 px-3 font-mono text-xs text-gold-300/90 tabular-nums">{formatTime(s.timestamp)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-gold-200 tabular-nums">{formatNumber(s.displacement_x)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-gold-200 tabular-nums">{formatNumber(s.displacement_y)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-bronze-200 tabular-nums">{formatNumber(s.tilt_angle)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-cinnabar-300 tabular-nums">{formatNumber(s.acceleration, 3)}</td>
                    <td className="py-2 px-3 text-right">
                      <div
                        className={cn(
                          "inline-block w-10 h-2 rounded-sm",
                          Math.abs(s.waveform_sample) > 0.5
                            ? "bg-cinnabar-500"
                            : Math.abs(s.waveform_sample) > 0.25
                            ? "bg-gold-500"
                            : "bg-bronze-600"
                        )}
                        style={{
                          transform: `scaleX(${Math.max(0.1, Math.abs(s.waveform_sample) * 1.5)})`,
                          transformOrigin: "right",
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
        {store.isDemoMode && (
          <div className="bronze-panel px-3 py-2 flex items-center gap-2 text-xs">
            <span className="status-dot bg-cinnabar-400 animate-pulse" />
            <span className="text-gold-300 font-serif">模拟数据运行中</span>
          </div>
        )}
        {store.isLive ? (
          <button onClick={stopDemo} className="bronze-btn-primary shadow-gold">
            <Square className="w-4 h-4" />
            <span className="font-serif">停止演示</span>
          </button>
        ) : (
          <button onClick={startDemo} className="bronze-btn shadow-bronze">
            <Play className="w-4 h-4" />
            <span className="font-serif">开始演示</span>
          </button>
        )}
      </div>
    </div>
  );
}
