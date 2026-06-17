import { useState } from "react";
import { Settings2, Zap, RotateCcw } from "lucide-react";
import SeismicWaveform from "@/components/Visuals/SeismicWaveform";
import PillarTrailCanvas from "@/components/Visuals/PillarTrailCanvas";

export default function Simulation() {
  const [params, setParams] = useState({
    magnitude: 5.2,
    duration: 30,
    epicenterX: 2.5,
    epicenterY: -1.8,
    frequency: 2.4,
    noiseLevel: 0.15,
  });

  const [trail, setTrail] = useState<Array<{ x: number; y: number }>>([]);
  const [waves, setWaves] = useState<number[]>(new Array(300).fill(0));
  const [running, setRunning] = useState(false);

  const runSimulation = () => {
    setRunning(true);
    setTrail([]);
    setWaves(new Array(300).fill(0));
    let t = 0;
    const interval = setInterval(() => {
      t += 1;
      const wave =
        Math.sin(t * params.frequency * 0.1) * (params.magnitude / 10) *
          Math.exp(-t / (params.duration * 10)) +
        (Math.random() - 0.5) * params.noiseLevel;
      const dx =
        params.epicenterX +
        Math.sin(t * 0.05) * (params.magnitude / 2) +
        (Math.random() - 0.5) * params.noiseLevel * 4;
      const dy =
        params.epicenterY +
        Math.cos(t * 0.06) * (params.magnitude / 2.2) +
        (Math.random() - 0.5) * params.noiseLevel * 4;

      setWaves((w) => [...w.slice(1), wave]);
      setTrail((tr) => [...tr.slice(-200), { x: dx, y: dy }]);

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
                value={(params as Record<string, number>)[key]}
                onChange={(e) =>
                  setParams({ ...params, [key]: parseFloat(e.target.value) })
                }
                disabled={running}
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
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
