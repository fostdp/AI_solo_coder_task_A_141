import { useEffect, useRef, useState, useCallback } from "react";
import type { HeatmapCell } from "@/types";

interface HeatmapCanvasProps {
  grid: HeatmapCell[][];
  showContours?: boolean;
  onHover?: (cell: HeatmapCell | null) => void;
  title?: string;
  width?: number;
  height?: number;
}

function valueToColor(v: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, v));
  if (clamped < 0.33) {
    const t = clamped / 0.33;
    const r = Math.floor(10 + (135 - 10) * t);
    const g = Math.floor(14 + (72 - 14) * t);
    const b = Math.floor(39 + (31 - 39) * t);
    return [r, g, b];
  } else if (clamped < 0.66) {
    const t = (clamped - 0.33) / 0.33;
    const r = Math.floor(135 + (212 - 135) * t);
    const g = Math.floor(72 + (175 - 72) * t);
    const b = Math.floor(31 + (55 - 31) * t);
    return [r, g, b];
  } else {
    const t = (clamped - 0.66) / 0.34;
    const r = Math.floor(212 + (194 - 212) * t);
    const g = Math.floor(175 + (59 - 175) * t);
    const b = Math.floor(55 + (34 - 55) * t);
    return [r, g, b];
  }
}

export default function HeatmapCanvas({
  grid,
  showContours = true,
  onHover,
  title,
  width: propWidth,
  height: propHeight,
}: HeatmapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 400 });
  const [hoverCell, setHoverCell] = useState<HeatmapCell | null>(null);

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = propHeight ?? Math.floor(w * 0.6);
        if (w > 0) setDims({ w, h });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [propHeight]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || rows === 0 || cols === 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const padding = { top: 30, right: 30, bottom: 30, left: 40 };
      const plotW = dims.w - padding.left - padding.right;
      const plotH = dims.h - padding.top - padding.bottom;
      const cellW = plotW / cols;
      const cellH = plotH / rows;
      const mx = e.clientX - rect.left - padding.left;
      const my = e.clientY - rect.top - padding.top;
      if (mx < 0 || my < 0 || mx >= plotW || my >= plotH) {
        if (hoverCell !== null) {
          setHoverCell(null);
          onHover?.(null);
        }
        return;
      }
      const col = Math.floor(mx / cellW);
      const row = Math.floor(my / cellH);
      if (grid[row] && grid[row][col]) {
        const cell = grid[row][col];
        setHoverCell(cell);
        onHover?.(cell);
      }
    },
    [dims, rows, cols, grid, hoverCell, onHover]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverCell(null);
    onHover?.(null);
  }, [onHover]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows === 0 || cols === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    ctx.scale(dpr, dpr);

    const { w, h } = dims;
    const padding = { top: 30, right: 30, bottom: 30, left: 40 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;
    const cellW = plotW / cols;
    const cellH = plotH / rows;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const [R, G, B] = valueToColor(cell.value);
        const x = padding.left + c * cellW;
        const y = padding.top + r * cellH;
        ctx.fillStyle = `rgb(${R},${G},${B})`;
        ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
      }
    }
    ctx.restore();

    if (showContours) {
      ctx.save();
      const levels = [0.25, 0.5, 0.75];
      for (const lv of levels) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,244,194,${0.25 + lv * 0.4})`;
        ctx.lineWidth = lv === 0.5 ? 1.2 : 0.8;
        ctx.setLineDash(lv === 0.5 ? [] : [3, 3]);
        for (let r = 0; r < rows - 1; r++) {
          for (let c = 0; c < cols - 1; c++) {
            const tl = grid[r][c]?.value ?? 0;
            const tr = grid[r][c + 1]?.value ?? 0;
            const bl = grid[r + 1][c]?.value ?? 0;
            const br = grid[r + 1][c + 1]?.value ?? 0;
            const vals = [tl, tr, br, bl];
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            if (min > lv || max < lv) continue;
            const pts: Array<[number, number]> = [];
            const edges: Array<[number, number, number, number, number, number]> = [
              [0, 0, 1, 0, tl, tr],
              [1, 0, 1, 1, tr, br],
              [1, 1, 0, 1, br, bl],
              [0, 1, 0, 0, bl, tl],
            ];
            for (const [x1, y1, x2, y2, v1, v2] of edges) {
              if ((v1 - lv) * (v2 - lv) < 0) {
                const t = (lv - v1) / (v2 - v1);
                pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
              }
            }
            if (pts.length >= 2) {
              const x0 = padding.left + (c + pts[0][0]) * cellW;
              const y0 = padding.top + (r + pts[0][1]) * cellH;
              const x1 = padding.left + (c + pts[1][0]) * cellW;
              const y1 = padding.top + (r + pts[1][1]) * cellH;
              ctx.moveTo(x0, y0);
              ctx.lineTo(x1, y1);
            }
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = "rgba(212, 175, 55, 0.35)";
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= rows; r++) {
      const y = padding.top + r * cellH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      const x = padding.left + c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + plotH);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(212, 175, 55, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, plotW, plotH);
    ctx.restore();

    ctx.save();
    ctx.font = "10px 'Noto Sans SC', sans-serif";
    ctx.fillStyle = "rgba(212, 175, 55, 0.8)";
    ctx.textAlign = "center";
    const labelStep = Math.max(1, Math.floor(cols / 8));
    for (let c = 0; c < cols; c += labelStep) {
      const x = padding.left + (c + 0.5) * cellW;
      const label = grid[0][c]?.label ?? `${c}`;
      ctx.fillText(label, x, h - padding.bottom + 16);
    }
    ctx.textAlign = "right";
    const rowStep = Math.max(1, Math.floor(rows / 6));
    for (let r = 0; r < rows; r += rowStep) {
      const y = padding.top + (r + 0.5) * cellH + 3;
      ctx.fillText(`${rows - 1 - r}`, padding.left - 6, y);
    }
    ctx.restore();

    const barX = w - 16;
    const barY = padding.top;
    const barW = 8;
    const barH = plotH;
    ctx.save();
    const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
    const stops = [
      [0, 10, 14, 39],
      [0.33, 135, 72, 31],
      [0.66, 212, 175, 55],
      [1, 194, 59, 34],
    ];
    for (const [t, r, g, b] of stops) {
      grad.addColorStop(t, `rgb(${r},${g},${b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = "rgba(212, 175, 55, 0.5)";
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = "rgba(212, 175, 55, 0.85)";
    ctx.font = "9px 'Noto Sans SC', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("1.0", barX + barW + 4, barY + 4);
    ctx.fillText("0.5", barX + barW + 4, barY + barH / 2 + 3);
    ctx.fillText("0.0", barX + barW + 4, barY + barH);
    ctx.restore();
  }, [grid, rows, cols, dims, showContours]);

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
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ width: dims.w, height: dims.h }}
        />
        {hoverCell && (
          <div
            className="pointer-events-none absolute z-10 px-2 py-1 rounded text-[10px] bg-ink-950/90 border border-gold-500/50 text-gold-200 shadow-gold"
            style={{
              left: `${(hoverCell.col + 1) * ((dims.w - 70) / cols) + 40 + 6}px`,
              top: `${(hoverCell.row + 0.5) * ((dims.h - 60) / rows) + 24}px`,
              transform: "translateY(-50%)",
            }}
          >
            <div>行: {hoverCell.row} / 列: {hoverCell.col}</div>
            <div>概率: {(hoverCell.value * 100).toFixed(1)}%</div>
          </div>
        )}
      </div>
    </div>
  );
}
