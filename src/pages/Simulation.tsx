import { useState } from "react";
import { Settings2, Zap, RotateCcw, Layers, Gauge } from "lucide-react";
import SeismicWaveform from "@/components/Visuals/SeismicWaveform";
import PillarTrailCanvas from "@/components/Visuals/PillarTrailCanvas";
import { SITE_SOIL_OPTIONS, type SiteSoilType } from "@/types";
import { cn } from "@/lib/utils";

export default function Simulation() {
  const [params, setParams] = useState({
    magnitude: 5.2,
    duration: 30,
    epicenterX: 2.5,
    epicenterY: -1.8,
    frequency: 2.4,
    noiseLevel: 0.15,
    siteSoil: "II" as SiteSoilType,
    limitAngle: 8.0,
    penaltyK: 5000,
    frictionCoeff: 0.15,
  });

  const [trail, setTrail] = useState<Array<{ x: number; y: number }>>([]);
  const [waves, setWaves] = useState<number[]>(new Array(300).fill(0));
  const [running, setRunning] = useState(false);

  const siteAmplification = SITE_SOIL_OPTIONS.find(s => s.value === params.siteSoil)?.amplification ?? 1.0

  const runSimulation = () => {
    setRunning(true);
    setTrail([]);
    setWaves(new Array(300).fill(0));
    let t = 0;
    const interval = setInterval(() => {
      t += 1;
      const wave =
        Math.sin(t * params.frequency * 0.1) * (params.magnitude / 10) * siteAmplification *
          Math.exp(-t / (params.duration * 10)) +
        (Math.random() - 0.5) * params.noiseLevel;
      const dx =
        params.epicenterX +
        Math.sin(t * 0.05) * (params.magnitude / 2) * siteAmplification +
        (Math.random() - 0.5) * params.noiseLevel * 4;
      const dy =
        params.epicenterY +
        Math.cos(t * 0.06) * (params.magnitude / 2.2) * siteAmplification +
        (Math.random() - 0.5) * params.noiseLevel * 4;

      const limit = params.limitAngle / 10
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > limit) {
        const scale = limit / dist
        const penalty = Math.min(1, params.penaltyK / 10000)
        const finalScale = scale + (1 - scale) * (1 - penalty * 0.8)
        const fx = dx * finalScale
        const fy = dy * finalScale
        const frict = 1 - params.frictionCoeff * 0.5
        setWaves((w) => [...w.slice(1), wave * (1 - params.frictionCoeff * 0.3)]);
        setTrail((tr) => [...tr.slice(-200), { x: fx * frict, y: fy * frict }]);
      } else {
        setWaves((w) => [...w.slice(1), wave]);
        setTrail((tr) => [...tr.slice(-200), { x: dx, y: dy }]);
      }

      if (t > params.duration * 60) {
        clearInterval(interval);
        setRunning(false);
      }
    }, 16);
  };

  return (
    <div className="space-y-5">
      <div className="bronze-panel p-5">
        <div className="card-heading">
          <Settings2 className="w-4 h-4 text-gold-500" />
          <span>地震模拟参数</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "震级 (M)", key: "magnitude", min: 1, max: 9, step: 0.1 },
            { label: "持续时间 (秒)", key: "duration", min: 5, max: 120, step: 1 },
            { label: "主频率 (Hz)", key: "frequency", min: 0.5, max: 10, step: 0.1 },
            { label: "震中 X 偏移", key: "epicenterX", min: -10, max: 10, step: 0.1 },
            { label: "震中 Y 偏移", key: "epicenterY", min: -10, max: 10, step: 0.1 },
            { label: "噪声水平", key: "noiseLevel", min: 0, max: 1, step: 0.01 },
          ].map(({ label, key, min, max, step }) => (
            <div key={key}>
              <label className="form-label">{label}</label>
              <input
                type="number"
                className="form-input"
                min={min}
                max={max}
                step={step}
                value={(params as unknown as Record<string, number>)[key]}
                onChange={(e) =>
                  setParams({ ...params, [key]: parseFloat(e.target.value) })
                }
                disabled={running}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bronze-panel p-5">
          <div className="card-heading">
            <Layers className="w-4 h-4 text-gold-500" />
            <span>场地土类型</span>
          </div>
          <div className="space-y-2 mt-3">
            {SITE_SOIL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setParams({ ...params, siteSoil: opt.value })}
                disabled={running}
                className={cn(
                  "w-full text-left rounded-lg border px-4 py-3 transition-all duration-200",
                  params.siteSoil === opt.value
                    ? "border-gold-500/60 bg-gold-500/10 shadow-inner"
                    : "border-bronze-700/30 bg-ink-900/30 hover:border-bronze-600/50 hover:bg-bronze-900/20"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-serif text-sm text-bronze-100">{opt.label}</span>
                  <span className="text-xs font-mono text-gold-400">×{opt.amplification.toFixed(2)}</span>
                </div>
                <div className="text-[11px] text-bronze-400/70 mt-1">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bronze-panel p-5">
          <div className="card-heading">
            <Gauge className="w-4 h-4 text-gold-500" />
            <span>罚函数接触参数</span>
          </div>
          <div className="space-y-4 mt-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-bronze-300">限位摆角 (°)</span>
                <span className="font-mono text-gold-400">{params.limitAngle.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={3}
                max={15}
                step={0.5}
                value={params.limitAngle}
                onChange={(e) => setParams({ ...params, limitAngle: parseFloat(e.target.value) })}
                disabled={running}
                className="w-full accent-gold-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-bronze-300">罚刚度 (×10³ N/rad)</span>
                <span className="font-mono text-gold-400">{(params.penaltyK / 1000).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={500}
                max={20000}
                step={500}
                value={params.penaltyK}
                onChange={(e) => setParams({ ...params, penaltyK: parseFloat(e.target.value) })}
                disabled={running}
                className="w-full accent-gold-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-bronze-300">摩擦系数 μ</span>
                <span className="font-mono text-gold-400">{params.frictionCoeff.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={params.frictionCoeff}
                onChange={(e) => setParams({ ...params, frictionCoeff: parseFloat(e.target.value) })}
                disabled={running}
                className="w-full accent-gold-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={runSimulation}
          disabled={running}
          className="bronze-btn-primary shadow-gold disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          <span className="font-serif">{running ? "模拟运行中..." : "运行模拟"}</span>
        </button>
        <button
          onClick={() => {
            setTrail([]);
            setWaves(new Array(300).fill(0));
          }}
          className="bronze-btn"
          disabled={running}
        >
          <RotateCcw className="w-4 h-4" />
          <span className="font-serif">重置</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bronze-panel p-4">
          <SeismicWaveform data={waves} title="模拟地震波形" height={240} />
        </div>
        <div className="bronze-panel p-4">
          <PillarTrailCanvas
            trail={trail}
            currentX={trail[trail.length - 1]?.x ?? 0}
            currentY={trail[trail.length - 1]?.y ?? 0}
            threshold={8}
            title="都柱轨迹模拟"
            size={320}
          />
        </div>
      </div>
    </div>
  );
}
