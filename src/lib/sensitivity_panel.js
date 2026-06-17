const SITE_SOIL_OPTIONS = [
  { value: "I0", label: "I₀ 类岩石", amplification: 0.85, description: "坚硬岩石，放大系数 0.85" },
  { value: "I1", label: "I₁ 类坚硬土", amplification: 1.0, description: "坚硬土/岩石，放大系数 1.00" },
  { value: "II", label: "II 类中硬土", amplification: 1.25, description: "中硬场地土，放大系数 1.25" },
  { value: "III", label: "III 类中软土", amplification: 1.65, description: "中软场地土，放大系数 1.65" },
  { value: "IV", label: "IV 类软弱土", amplification: 2.1, description: "软弱场地土，放大系数 2.10" },
];

const HEATMAP_COLOR_STOPS = [
  { value: 0, r: 10, g: 14, b: 39 },
  { value: 0.3, r: 108, g: 70, b: 38 },
  { value: 0.6, r: 184, g: 115, b: 51 },
  { value: 0.85, r: 212, g: 175, b: 55 },
  { value: 1.0, r: 194, g: 59, b: 34 },
];

function computeDetectionProbability(magnitude, distance, threshold, damping, pillarMass, soilAmp) {
  const magFactor = Math.max(0, Math.min(1, (magnitude - 2.5) / 4));
  const distFactor = Math.exp(-Math.pow(distance / threshold, 2) * 0.0015);
  const massFactor = Math.pow(200 / pillarMass, 0.3);
  let base = magFactor * distFactor * massFactor * soilAmp;
  base = Math.min(1, Math.pow(base, 1 / damping));
  return base;
}

function generateHeatmap(rows, cols, minMag, maxMag, minDist, maxDist, params) {
  const { threshold, damping, pillarMass, soilAmp, noiseSeed = 0 } = params;
  const grid = [];

  for (let r = 0; r < rows; r++) {
    const row = [];
    const distance = minDist + (maxDist - minDist) * (1 - r / (rows - 1));
    for (let c = 0; c < cols; c++) {
      const magnitude = minMag + (maxMag - minMag) * (c / (cols - 1));
      const base = computeDetectionProbability(magnitude, distance, threshold, damping, pillarMass, soilAmp);
      const noise = (Math.sin(r * 1.7 + c * 2.3 + noiseSeed) * 0.5 + 0.5) * 0.06;
      const value = Math.max(0, Math.min(1, base * 0.95 + noise - 0.02));
      const far = Math.sin(r * 0.9 + c * 0.6 + noiseSeed * 0.3) * 0.04;
      const falseAlarmRate = Math.max(0, 0.18 - value * 0.16 + far);

      row.push({
        row: r,
        col: c,
        value,
        label: `${Math.round(value * 100)}%`,
        magnitude: Math.round(magnitude * 10) / 10,
        distance: Math.round(distance * 10) / 10,
        detection_prob: value,
        false_alarm_rate: Math.round(falseAlarmRate * 100) / 100,
        avg_trigger_time: value > 0.2 ? Math.round((0.8 + (1 - value) * 3.5) * 10) / 10 : -1,
      });
    }
    grid.push(row);
  }
  return grid;
}

function generateROCCurve(thresholds = 21) {
  const roc = [];
  for (let t = 0; t < thresholds; t++) {
    const threshold = t * 0.1;
    const tpr = Math.min(1, Math.max(0, 1 - Math.exp(-threshold * 1.2)));
    const fpr = Math.min(0.3, threshold * 0.08);
    roc.push({
      threshold: Math.round(threshold * 10) / 10,
      tpr: Math.round(tpr * 100) / 100,
      fpr: Math.round(fpr * 100) / 100,
    });
  }
  return roc;
}

function findYoudenOptimal(rocCurve) {
  let maxJ = -Infinity;
  let optimal = null;
  for (const pt of rocCurve) {
    const J = pt.tpr - pt.fpr;
    if (J > maxJ) {
      maxJ = J;
      optimal = { ...pt, youden_j: Math.round(J * 100) / 100 };
    }
  }
  return optimal;
}

function computeHeatmapStats(grid) {
  let detectedCells = 0;
  let totalArea = 0;
  let sumFAR = 0;
  let count = 0;

  for (const row of grid) {
    for (const cell of row) {
      count++;
      sumFAR += cell.false_alarm_rate;
      if (cell.detection_prob >= 0.5) {
        detectedCells++;
        const dM = 0.5;
        const dD = 50;
        totalArea += dM * dD * 111 * 111 * Math.cos(cell.magnitude * Math.PI / 180);
      }
    }
  }

  return {
    totalCells: grid.length * grid[0]?.length || 0,
    detectedCells,
    detectionAreaKm2: Math.round(totalArea),
    avgFalseAlarmRate: count > 0 ? Math.round((sumFAR / count) * 100) / 100 : 0,
    detectionCoverage: count > 0 ? Math.round((detectedCells / count) * 100) / 100 : 0,
  };
}

function interpolateHeatmapColor(value) {
  value = Math.max(0, Math.min(1, value));

  if (value <= HEATMAP_COLOR_STOPS[0].value) {
    const c = HEATMAP_COLOR_STOPS[0];
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }
  if (value >= HEATMAP_COLOR_STOPS[HEATMAP_COLOR_STOPS.length - 1].value) {
    const c = HEATMAP_COLOR_STOPS[HEATMAP_COLOR_STOPS.length - 1];
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }

  for (let i = 0; i < HEATMAP_COLOR_STOPS.length - 1; i++) {
    const s0 = HEATMAP_COLOR_STOPS[i];
    const s1 = HEATMAP_COLOR_STOPS[i + 1];
    if (value >= s0.value && value <= s1.value) {
      const t = (value - s0.value) / (s1.value - s0.value);
      const r = Math.round(s0.r + (s1.r - s0.r) * t);
      const g = Math.round(s0.g + (s1.g - s0.g) * t);
      const b = Math.round(s0.b + (s1.b - s0.b) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(184, 115, 51)';
}

function marchingSquaresContour(grid, threshold) {
  const contours = [];
  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v0 = grid[r][c].value >= threshold;
      const v1 = grid[r][c + 1].value >= threshold;
      const v2 = grid[r + 1][c + 1].value >= threshold;
      const v3 = grid[r + 1][c].value >= threshold;
      const code = (v0 ? 1 : 0) | (v1 ? 2 : 0) | (v2 ? 4 : 0) | (v3 ? 8 : 0);

      if (code !== 0 && code !== 15) {
        contours.push({ row: r, col: c, code, threshold });
      }
    }
  }
  return contours;
}

function calcAUC(rocCurve) {
  if (!rocCurve || rocCurve.length < 2) return 0;
  let auc = 0;
  for (let i = 1; i < rocCurve.length; i++) {
    const dFPR = rocCurve[i].fpr - rocCurve[i - 1].fpr;
    const avgTPR = (rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2;
    auc += dFPR * avgTPR;
  }
  return Math.round(auc * 100) / 100;
}

function sensitivityAnalysis(magRange, distRange, params) {
  const { magnitude_steps, distance_steps, ...rest } = params;
  const grid = generateHeatmap(
    distance_steps, magnitude_steps,
    magRange[0], magRange[1],
    distRange[0], distRange[1],
    rest
  );
  const roc = generateROCCurve();
  const optimal = findYoudenOptimal(roc);
  const stats = computeHeatmapStats(grid);
  const auc = calcAUC(roc);

  return {
    grid,
    roc_curve: roc,
    optimal_threshold: optimal?.threshold ?? 5,
    youden_j: optimal?.youden_j ?? 0,
    auc,
    detection_area_km2: stats.detectionAreaKm2,
    avg_false_alarm_rate: stats.avgFalseAlarmRate,
    detected_cells: stats.detectedCells,
    detection_coverage: stats.detectionCoverage,
  };
}

export {
  SITE_SOIL_OPTIONS,
  HEATMAP_COLOR_STOPS,
  computeDetectionProbability,
  generateHeatmap,
  generateROCCurve,
  findYoudenOptimal,
  computeHeatmapStats,
  interpolateHeatmapColor,
  marchingSquaresContour,
  calcAUC,
  sensitivityAnalysis,
};
