import { useState, useMemo } from "react";
import { Eye, Sliders, Target, TrendingDown, CircleGauge, Layers } from "lucide-react";
import HeatmapCanvas from "@/components/Visuals/HeatmapCanvas";
import type { HeatmapCell, ROCPoint, SiteSoilType } from "@/types";
import { SITE_SOIL_OPTIONS } from "@/types";
import { cn } from "@/lib/utils";

export default function Sensitivity() {
  const [threshold, setThreshold] = useState(5);
  const [damping, setDamping] = useState(0.85);
  const [pillarMass, setPillarMass] = useState(200);
  const [siteSoil, setSiteSoil] = useState<SiteSoilType>("II");
  const [hoverCell, setHoverCell] = useState<HeatmapCell | null>(null);
  const [running, setRunning] = useState(false);

  const rows = 12;
  const cols = 16;
  const minMag = 2;
  const maxMag = 8;
  const minDist = 10;
  const maxDist = 1000;

  const soilAmp = SITE_SOIL_OPTIONS.find(s => s.value === siteSoil)?.amplification ?? 1.0

  const grid = useMemo<HeatmapCell[][]>(() => {
    const result: HeatmapCell[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: HeatmapCell[] = [];
      const dist = minDist + (maxDist - minDist) * (1 - r / (rows - 1));
      for (let c = 0; c < cols; c++) {
        const mag = minMag + (maxMag - minMag) * (c / (cols - 1));
        const magFactor = Math.max(0, Math.min(1, (mag - 2.5) / 4));
        const distFactor = Math.exp(-Math.pow(dist / threshold, 2) * 0.0015);
        const massFactor = Math.pow(200 / pillarMass, 0.3);
        let base = magFactor * distFactor * massFactor * soilAmp;
        base = Math.min(1, Math.pow(base, 1 / damping));
        const noise = (Math.sin(r * 1.7 + c * 2.3) * 0.5 + 0.5) * 0.06;
        const value = Math.max(0, Math.min(1, base * 0.95 + noise - 0.02));
        const far = Math.sin(r * 0.9 + c * 0.6) * 0.04;
        const false_alarm_rate = Math.max(0, 0.18 - value * 0.16 + far);
        row.push({
          row: r,
          col: c,
          label: mag.toFixed(1),
          value,
          magnitude: mag,
          distance: dist,
          detection_prob: value,
          false_alarm_rate,
          avg_trigger_time: value > 0.2 ? 0.8 + (1 - value) * 3.5 : -1,
        });
      }
      result.push(row);
    }
    return result;
  }, [threshold, damping, pillarMass, soilAmp]);

  const rocCurve = useMemo<ROCPoint[]>(() => {
    const pts: ROCPoint[] = [];
    for (let t = 0; t <= 1.01; t += 0.02) {
      let tp = 0, fp = 0, tn = 0, fn = 0;
      for (const row of grid) {
        for (const cell of row) {
          const realPositive = cell.detection_prob > 0.5;
          const predicted = cell.value >= t;
          if (realPositive && predicted) tp++;
          else if (!realPositive && predicted) fp++;
          else if (!realPositive && !predicted) tn++;
          else fn++;
        }
      }
      const tpr = tp + fn === 0 ? 1 : tp / (tp + fn);
      const fpr = fp + tn === 0 ? 0 : fp / (fp + tn);
      pts.push({ threshold: t, tpr, fpr });
    }
    return pts;
  }, [grid]);

  const stats = useMemo(() => {
    let detCount = 0;
    let farSum = 0;
    let area = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell.detection_prob >= 0.5) {
          detCount++;
          farSum += cell.false_alarm_rate;
          const prevDist = cell.distance + (maxDist - minDist) / (rows - 1);
          const ring = Math.PI * (prevDist * prevDist - cell.distance * cell.distance);
          area += ring / cols;
        }
      }
    }
    let youdenMax = -Infinity;
    let optThresh = 0.5;
    for (const pt of rocCurve) {
      const j = pt.tpr - pt.fpr;
      if (j > youdenMax) {
        youdenMax = j;
        optThresh = pt.threshold;
      }
    }
    return {
      detectionCells: detCount,
      avgFar: farSum / Math.max(1, detCount),
      areaKm2: Math.round(area),
      optimalThreshold: optThresh,
    };
  }, [grid, rocCurve]);

  const distLabels = useMemo(() => {
    const m = grid.map((g) => g[0]);
    return [0, 3, 6, 9, 11].map((i) => m[i]).filter(Boolean);
  }, [grid]);

  return (
    <div className="space-y-5">
      <div className="bronze-panel p-5">
        <div className="card-heading">
          <Sliders className="w-4 h-4 text-gold-500" />
          <span>灵敏度分析参数</span>
          <span className="text-bronze-500 text-sm ml-auto">检测范围 / 误报率评估</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { label: "触发阈值 (°)", val: threshold, min: 1, max: 15, step: 0.5, onChange: setThreshold },
            { label: "阻尼比", val: damping, min: 0.3, max: 1.2, step: 0.05, onChange: setDamping },
            { label: "都柱质量 (kg)", val: pillarMass, min: 50, max: 500, step: 10, onChange: setPillarMass },
          ].map(({ label, val, min, max, step, onChange }) => (
            <div key={label}>
              <div className="flex justify-between items-baseline mb-1.5">
                <label className="form-label mb-0">{label}</label>
                <span className="text-xs text-gold-400 font-mono tabular-nums">{typeof val === "number" ? val.toFixed(step < 1 ? 2 : 0) : val}</span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={val}
                onChange={(e) => onChange(parseFloat(e.target.value) as never)}
                className="w-full accent-gold-500"
                disabled={running}
              />
            </div>
          ))}
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <label className="form-label mb-0 flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                场地土类型
              </label>
              <span className="text-xs text-gold-400 font-mono tabular-nums">×{soilAmp.toFixed(2)}</span>
            </div>
            <select
              value={siteSoil}
              onChange={(e) => setSiteSoil(e.target.value as SiteSoilType)}
              disabled={running}
              className="w-full h-9 rounded-md border border-bronze-700/40 bg-ink-950/60 px-3 text-sm text-bronze-100 focus:border-gold-500/60 focus:outline-none"
            >
              {SITE_SOIL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setRunning(true); setTimeout(() => setRunning(false), 800); }}
              className="bronze-btn-primary shadow-gold w-full disabled:opacity-60"
              disabled={running}
            >
              <CircleGauge className={cn("w-4 h-4", running && "animate-spin")} />
              <span className="font-serif">{running ? "分析计算中..." : "运行分析"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="value-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="value-label">有效检测范围</div>
              <div className="flex items-baseline gap-1">
                <span className="value-number">{stats.areaKm2.toLocaleString()}</span>
                <span className="text-xs text-bronze-400/80">km²</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gold-500/15 text-gold-400 border border-gold-500/30">
              <Target className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="value-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="value-label">平均误报率</div>
              <div className="flex items-baseline gap-1">
                <span className="value-number">{(stats.avgFar * 100).toFixed(1)}</span>
                <span className="text-xs text-bronze-400/80">%</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-cinnabar-500/10 text-cinnabar-400 border border-cinnabar-500/25">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="value-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="value-label">可检测格点数</div>
              <div className="flex items-baseline gap-1">
                <span className="value-number">{stats.detectionCells}</span>
                <span className="text-xs text-bronze-400/80">/{rows * cols}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              <Eye className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="value-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="value-label">最优触发阈值</div>
              <div className="flex items-baseline gap-1">
                <span className="value-number">{stats.optimalThreshold.toFixed(2)}</span>
                <span className="text-xs text-bronze-400/80">°</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-bronze-500/15 text-bronze-300 border border-bronze-500/30">
              <CircleGauge className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bronze-panel p-5">
          <HeatmapCanvas
            grid={grid}
            showContours
            onHover={setHoverCell}
            title={`检测概率热力图 · 震级 ${minMag}-${maxMag} × 震中距 ${minDist}-${maxDist}km`}
          />
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-bronze-300/80">
              <span>横轴：震级 (M)</span>
              <span className="ml-auto text-gold-400 font-mono">{grid[0]?.[0]?.magnitude.toFixed(1)} — {grid[0]?.[grid[0].length - 1]?.magnitude.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2 text-bronze-300/80">
              <span>纵轴：震中距 (km)</span>
              <span className="ml-auto text-gold-400 font-mono">{distLabels[0]?.distance.toFixed(0)} — {distLabels[distLabels.length - 1]?.distance.toFixed(0)}</span>
            </div>
          </div>
          {hoverCell && (
            <div className="mt-3 p-3 bg-ink-950/60 border border-gold-500/30 rounded-md grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-bronze-400/70 mb-1">震级</div>
                <div className="text-gold-400 font-serif text-sm font-semibold">{hoverCell.magnitude.toFixed(1)} M</div>
              </div>
              <div>
                <div className="text-bronze-400/70 mb-1">震中距</div>
                <div className="text-gold-400 font-serif text-sm font-semibold">{hoverCell.distance.toFixed(0)} km</div>
              </div>
              <div>
                <div className="text-bronze-400/70 mb-1">检测概率</div>
                <div className="text-emerald-400 font-serif text-sm font-semibold">{(hoverCell.detection_prob * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-bronze-400/70 mb-1">误报率</div>
                <div className="text-cinnabar-400 font-serif text-sm font-semibold">{(hoverCell.false_alarm_rate * 100).toFixed(1)}%</div>
              </div>
            </div>
          )}
        </div>

        <div className="bronze-panel p-5">
          <div className="card-heading">
            <Target className="w-4 h-4 text-gold-500" />
            <span>ROC 曲线</span>
          </div>
          <RocCanvas roc={rocCurve} optimal={stats.optimalThreshold} />
          <div className="mt-4 space-y-2 text-xs">
            {[
              { k: "AUC (近似)", v: `${(rocCurve.length > 1 ? rocCurve.slice(0, -1).reduce((s, p, i) => {
                const n = rocCurve[i + 1];
                return s + (p.fpr - n.fpr) * (p.tpr + n.tpr) / 2;
              }, 0) : 0).toFixed(3)}` },
              { k: "TPR @ 最优", v: `${(rocCurve.find(p => Math.abs(p.threshold - stats.optimalThreshold) < 0.03)?.tpr ?? 0).toFixed(3)}` },
              { k: "FPR @ 最优", v: `${(rocCurve.find(p => Math.abs(p.threshold - stats.optimalThreshold) < 0.03)?.fpr ?? 0).toFixed(3)}` },
            ].map((x) => (
              <div key={x.k} className="flex items-center justify-between border-b border-bronze-700/20 py-1.5">
                <span className="text-bronze-300/70">{x.k}</span>
                <span className="text-gold-400 font-mono">{x.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RocCanvas({ roc, optimal }: { roc: ROCPoint[]; optimal: number }) {
  const canvasRef = useRocDraw(roc, optimal);
  return <canvas ref={canvasRef} className="w-full h-[280px] bg-ink-950/60 rounded border border-bronze-700/30" />;
}

function useRocDraw(roc: ROCPoint[], optimal: number) {
  const ref = (el: HTMLCanvasElement | null) => {
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = w * dpr;
    el.height = h * dpr;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 36, r: 12, t: 16, b: 28 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    ctx.save();
    ctx.strokeStyle = "rgba(212,175,55,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = pad.l + (i / 10) * pw;
      const y = pad.t + (1 - i / 10) * ph;
      ctx.beginPath();
      ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y);
      ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(212,175,55,0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    const grad = ctx.createLinearGradient(pad.l, 0, pad.l + pw, 0);
    grad.addColorStop(0, "rgba(184,115,51,0.9)");
    grad.addColorStop(1, "rgba(212,175,55,0.9)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    roc.forEach((p, i) => {
      const x = pad.l + p.fpr * pw;
      const y = pad.t + (1 - p.tpr) * ph;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const opt = roc.find((p) => Math.abs(p.threshold - optimal) < 0.03) ?? roc[0];
    const ox = pad.l + opt.fpr * pw;
    const oy = pad.t + (1 - opt.tpr) * ph;
    ctx.beginPath();
    ctx.fillStyle = "#C23B22";
    ctx.shadowColor = "rgba(194,59,34,0.6)";
    ctx.shadowBlur = 10;
    ctx.arc(ox, oy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(212,175,55,0.75)";
    ctx.font = "10px 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      ctx.fillText((i / 5).toFixed(1), pad.l + (i / 5) * pw, h - pad.b / 2 + 4);
    }
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      ctx.fillText((i / 5).toFixed(1), pad.l - 6, pad.t + (1 - i / 5) * ph + 3);
    }
    ctx.fillStyle = "rgba(212,175,55,0.9)";
    ctx.textAlign = "center";
    ctx.font = "11px 'Noto Sans SC', sans-serif";
    ctx.fillText("假阳性率 (FPR)", w / 2, h - 4);
    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("真阳性率 (TPR)", 0, 0);
    ctx.restore();
    ctx.restore();
  };
  return ref;
}
