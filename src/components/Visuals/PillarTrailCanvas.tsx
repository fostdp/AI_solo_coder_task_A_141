import { useEffect, useRef, useState } from "react";

interface PillarTrailCanvasProps {
  trail: Array<{ x: number; y: number }>;
  currentX?: number;
  currentY?: number;
  threshold?: number;
  size?: number;
  title?: string;
}

const DIRECTION_LABELS = [
  { name: "北", angle: -90 },
  { name: "东北", angle: -45 },
  { name: "东", angle: 0 },
  { name: "东南", angle: 45 },
  { name: "南", angle: 90 },
  { name: "西南", angle: 135 },
  { name: "西", angle: 180 },
  { name: "西北", angle: 225 },
];

export default function PillarTrailCanvas({
  trail,
  currentX = 0,
  currentY = 0,
  threshold = 5,
  size = 280,
  title,
}: PillarTrailCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState(size);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setCanvasSize(Math.min(w, size));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    ctx.scale(dpr, dpr);

    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const maxR = canvasSize * 0.42;
    const displayScale = maxR / Math.max(threshold * 2, 1);

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    ctx.save();
    for (let ring = 1; ring <= 3; ring++) {
      const r = (maxR / 3) * ring;
      ctx.beginPath();
      const sides = 8;
      for (let i = 0; i <= sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = ring === 2 ? "rgba(184, 115, 51, 0.55)" : "rgba(184, 115, 51, 0.22)";
      ctx.lineWidth = ring === 2 ? 1.2 : 0.7;
      if (ring === 2) ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    ctx.save();
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2;
      const x1 = cx + Math.cos(angle) * (maxR * 0.15);
      const y1 = cy + Math.sin(angle) * (maxR * 0.15);
      const x2 = cx + Math.cos(angle) * maxR;
      const y2 = cy + Math.sin(angle) * maxR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "rgba(212, 175, 55, 0.18)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.font = "bold 11px 'Noto Serif SC', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelR = maxR + 18;
    for (const dir of DIRECTION_LABELS) {
      const rad = (dir.angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * labelR;
      const y = cy + Math.sin(rad) * labelR;
      ctx.fillStyle = "rgba(212, 175, 55, 0.9)";
      ctx.shadowColor = "rgba(212, 175, 55, 0.5)";
      ctx.shadowBlur = 4;
      ctx.fillText(dir.name, x, y);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(184, 115, 51, 0.8)";
    ctx.fill();
    ctx.restore();

    if (trail.length > 1) {
      ctx.save();
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.85;
        const p1 = trail[i - 1];
        const p2 = trail[i];
        const x1 = cx + p1.x * displayScale;
        const y1 = cy + p1.y * displayScale;
        const x2 = cx + p2.x * displayScale;
        const y2 = cy + p2.y * displayScale;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(184, 115, 51, ${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(212, 175, 55, ${alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
    }

    const dotX = cx + currentX * displayScale;
    const dotY = cy + currentY * displayScale;

    ctx.save();
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(212, 175, 55, 0.15)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
    const dotGrad = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 6);
    dotGrad.addColorStop(0, "#FFF4C2");
    dotGrad.addColorStop(0.5, "#D4AF37");
    dotGrad.addColorStop(1, "#87481f");
    ctx.fillStyle = dotGrad;
    ctx.shadowColor = "#D4AF37";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
  }, [trail, currentX, currentY, threshold, canvasSize]);

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      <div className="w-full">
        {title && (
          <div className="flex items-center gap-2 mb-2 border-b border-bronze-700/30 pb-1.5">
            <span className="text-bronze-500 text-sm">❖</span>
            <h3 className="font-serif text-gold-500 text-sm font-semibold tracking-wider">
              {title}
            </h3>
            <span className="text-bronze-500 text-sm">❖</span>
          </div>
        )}
        <div className="flex justify-center">
          <canvas ref={canvasRef} className="block" />
        </div>
      </div>
    </div>
  );
}
