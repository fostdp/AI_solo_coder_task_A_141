import { useEffect, useRef, useState } from "react";

interface SeismicWaveformProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  secondaryColor?: string;
  showGrid?: boolean;
  title?: string;
  baseline?: number;
}

export default function SeismicWaveform({
  data,
  height = 180,
  color = "#D4AF37",
  secondaryColor = "#B87333",
  showGrid = true,
  title,
  baseline = 0.5,
}: SeismicWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setCanvasWidth(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const w = canvasWidth;
    const h = height;
    const padding = { top: 10, right: 50, bottom: 28, left: 10 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;
    const baseY = padding.top + plotH * baseline;

    ctx.clearRect(0, 0, w, h);

    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = `${secondaryColor}33`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 4]);
      const gridCols = 10;
      for (let i = 0; i <= gridCols; i++) {
        const x = padding.left + (plotW / gridCols) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + plotH);
        ctx.stroke();
      }
      const gridRows = 4;
      for (let i = 0; i <= gridRows; i++) {
        const y = padding.top + (plotH / gridRows) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + plotW, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(padding.left, baseY);
    ctx.lineTo(padding.left + plotW, baseY);
    ctx.stroke();
    ctx.restore();

    if (data.length > 1) {
      const max = Math.max(...data.map(Math.abs), 0.001);
      const stepX = plotW / (data.length - 1);
      const points: Array<{ x: number; y: number }> = [];

      for (let i = 0; i < data.length; i++) {
        const x = padding.left + stepX * i;
        const normalized = data[i] / max;
        const y = baseY - normalized * (plotH * 0.42);
        points.push({ x, y });
      }

      const fillGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
      fillGrad.addColorStop(0, `${color}40`);
      fillGrad.addColorStop(baseline, `${color}15`);
      fillGrad.addColorStop(1, `${color}02`);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, baseY);
      ctx.lineTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        const cpx = (prev.x + cur.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cpx, (prev.y + cur.y) / 2);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(points[points.length - 1].x, baseY);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        const cpx = (prev.x + cur.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cpx, (prev.y + cur.y) / 2);
      }
      if (points.length > 1) {
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.font = "10px 'Noto Sans SC', sans-serif";
    ctx.fillStyle = `${secondaryColor}cc`;
    ctx.textAlign = "left";
    const peakY = padding.top + 4;
    const zeroY = baseY - 2;
    const troughY = padding.top + plotH - 2;
    ctx.fillText("+峰值", padding.left + plotW + 6, peakY + 4);
    ctx.fillText("0", padding.left + plotW + 6, zeroY);
    ctx.fillText("-峰值", padding.left + plotW + 6, troughY);

    ctx.textAlign = "center";
    const totalSeconds = Math.floor(data.length / 10);
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const t = (totalSeconds / tickCount) * i;
      const x = padding.left + (plotW / tickCount) * i;
      ctx.fillText(`${t}s`, x, padding.top + plotH + 16);
    }
    ctx.restore();
  }, [data, canvasWidth, height, color, secondaryColor, showGrid, baseline]);

  return (
    <div ref={containerRef} className="w-full">
      {title && (
        <div className="flex items-center gap-2 mb-2 border-b border-bronze-700/30 pb-1.5">
          <span className="text-bronze-500 text-sm">❖</span>
          <h3 className="font-serif text-gold-500 text-sm font-semibold tracking-wider">
            {title}
          </h3>
          <span className="text-bronze-500 text-sm">❖</span>
        </div>
      )}
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
