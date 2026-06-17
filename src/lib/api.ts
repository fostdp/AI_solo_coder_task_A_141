import type {
  SensorRecord,
  SimulationParams,
  SimulationResult,
  SensitivityResult,
  AlertItem,
  TrajectoryPoint,
  HeatmapCell,
  ROCPoint,
  DragonStatus,
} from "@/types";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

const DRAGON_DIRECTIONS = [
  { id: 0, direction: "北", angle: 0 },
  { id: 1, direction: "东北", angle: 45 },
  { id: 2, direction: "东", angle: 90 },
  { id: 3, direction: "东南", angle: 135 },
  { id: 4, direction: "南", angle: 180 },
  { id: 5, direction: "西南", angle: 225 },
  { id: 6, direction: "西", angle: 270 },
  { id: 7, direction: "西北", angle: 315 },
];

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function mockDragons(triggers: number[] = []): DragonStatus[] {
  return DRAGON_DIRECTIONS.map((d) => ({
    ...d,
    triggered: triggers.includes(d.id),
    ball_dropped: triggers.includes(d.id),
    trigger_time_ms: triggers.includes(d.id) ? Date.now() : undefined,
  }));
}

function mockSensorRecord(deviceId = "DDY-001"): SensorRecord {
  const acc = (Math.random() - 0.5) * 0.2;
  const angle = (Math.random() - 0.5) * 0.3;
  const triggers: number[] = [];
  if (Math.abs(acc) > 0.15) {
    const nearest = Math.round((Math.atan2(acc, Math.abs(acc)) * 180 / Math.PI + 360) % 360 / 45);
    triggers.push(((nearest % 8) + 8) % 8);
  }
  return {
    device_id: deviceId,
    timestamp: new Date().toISOString(),
    pillar: {
      displacement_x: (Math.random() - 0.5) * 0.005,
      displacement_y: (Math.random() - 0.5) * 0.005,
      angle: angle,
      angular_velocity: (Math.random() - 0.5) * 0.5,
    },
    wave: {
      acceleration: acc,
      frequency: 2 + Math.random() * 3,
      amplitude: 0.001 + Math.random() * 0.003,
      history: Array(128).fill(0).map(() => (Math.random() - 0.5) * 0.1),
    },
    dragons: mockDragons(triggers),
    magnitude: Math.random() > 0.8 ? 3 + Math.random() * 3 : undefined,
    epicenter_distance: Math.random() > 0.8 ? 50 + Math.random() * 500 : undefined,
  };
}

function mockSimulationResult(params: SimulationParams): SimulationResult {
  const sampleRate = params.sample_rate ?? 100;
  const totalSamples = Math.floor(params.duration * sampleRate);
  const direction = (params.earthquake_direction ?? 0) * Math.PI / 180;
  const triggerAccel = Math.max(0.1, (params.magnitude - 3) * 0.15);
  const falloff = Math.exp(-params.epicenter_distance / 300);
  const amp = triggerAccel * falloff;

  const trajectory: TrajectoryPoint[] = [];
  let triggeredIds: number[] = [];
  let triggerTime = -1;
  let maxAngle = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const waveAcc = amp * Math.sin(2 * Math.PI * 2 * t) * Math.exp(-t * params.damping_ratio * 2);
    const angDeg = waveAcc * params.pillar_height * 50;
    maxAngle = Math.max(maxAngle, Math.abs(angDeg));
    trajectory.push({
      t,
      x: waveAcc * Math.sin(direction) * 0.01,
      y: waveAcc * Math.cos(direction) * 0.01,
      angle: angDeg,
      angular_vel: waveAcc * 10,
      wave_acc: waveAcc,
    });
    if (triggerTime < 0 && Math.abs(angDeg) > 2.5) {
      triggerTime = t;
      const nearestIdx = Math.round((params.earthquake_direction ?? 0) / 45);
      const dragonId = ((nearestIdx % 8) + 8) % 8;
      triggeredIds = [dragonId];
    }
  }

  return {
    simulation_id: genId("SIM"),
    created_at: new Date().toISOString(),
    params,
    pillar_trajectory: trajectory,
    triggered_dragons: triggeredIds,
    trigger_time: triggerTime,
    max_angle: maxAngle,
  };
}

function mockSensitivityAnalysis(): SensitivityResult {
  const magSteps = 8;
  const distSteps = 10;
  const grid: HeatmapCell[][] = [];
  for (let i = 0; i < magSteps; i++) {
    const row: HeatmapCell[] = [];
    const mag = 2 + i * 0.6;
    for (let j = 0; j < distSteps; j++) {
      const dist = 20 + j * 80;
      const baseProb = Math.min(1, Math.max(0, (mag - 3) / 3));
      const distFactor = Math.exp(-dist / 400);
      const prob = Math.round(baseProb * distFactor * 100) / 100;
      row.push({
        row: i,
        col: j,
        value: prob,
        label: `${prob * 100}%`,
        magnitude: Math.round(mag * 10) / 10,
        distance: dist,
        detection_prob: prob,
        false_alarm_rate: Math.round((1 - prob) * 0.08 * 100) / 100,
        avg_trigger_time: prob > 0.3 ? Math.round((1.2 + Math.random() * 1.5) * 10) / 10 : -1,
      });
    }
    grid.push(row);
  }

  const roc_curve: ROCPoint[] = [];
  for (let t = 0; t <= 20; t++) {
    const threshold = t * 0.1;
    const tpr = Math.min(1, Math.max(0, 1 - Math.exp(-threshold * 1.2)));
    const fpr = Math.min(0.3, threshold * 0.08);
    roc_curve.push({
      threshold: Math.round(threshold * 10) / 10,
      tpr: Math.round(tpr * 100) / 100,
      fpr: Math.round(fpr * 100) / 100,
    });
  }

  return {
    analysis_id: genId("SA"),
    grid,
    roc_curve,
    optimal_threshold: 1.2,
    detection_area_km2: 125600,
  };
}

function mockAlerts(limit: number, level?: AlertItem["level"]): AlertItem[] {
  const templates: Array<Omit<AlertItem, "id" | "timestamp">> = [
    { type: "misfire", level: "warning", message: "东北方位触发但波形加速度低于阈值 0.15 m/s²，疑似误触发", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "system", level: "info", message: "设备 DDY-001 连接已恢复", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "sensitivity_drop", level: "critical", message: "过去 30 分钟检测率降至 62%，低于阈值 75%", mqtt_delivered: false },
    { type: "misfire", level: "critical", message: "西、西北连续两次误触发，建议校准支柱机械结构", mqtt_delivered: true, device_id: "DDY-001" },
    { type: "system", level: "warning", message: "MQTT 消息队列积压超过 200 条", mqtt_delivered: false },
    { type: "sensitivity_drop", level: "warning", message: "远距离 (>400km) 事件检测率下降至 51%", mqtt_delivered: true },
    { type: "system", level: "info", message: "ClickHouse 归档完成，已写入 10,482 条记录", mqtt_delivered: true },
  ];
  const pool = level ? templates.filter((a) => a.level === level) : templates;
  const n = Math.min(limit, pool.length * 3);
  const out: AlertItem[] = [];
  for (let i = 0; i < n; i++) {
    const tpl = pool[i % pool.length];
    out.push({
      id: genId("AL"),
      timestamp: new Date(Date.now() - i * 1000 * 60 * (3 + Math.random() * 10)).toISOString(),
      ...tpl,
    });
  }
  return out;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function postSensor(data: Partial<SensorRecord>): Promise<SensorRecord> {
  try {
    return await request<SensorRecord>("/api/sensor", {
      method: "POST",
      body: JSON.stringify(data),
    });
  } catch {
    const rec = mockSensorRecord(data.device_id ?? "DDY-001");
    return { ...rec, ...data };
  }
}

export async function getRealtime(deviceId = "DDY-001"): Promise<SensorRecord> {
  try {
    return await request<SensorRecord>(`/api/realtime/${deviceId}`);
  } catch {
    return mockSensorRecord(deviceId);
  }
}

export async function runSimulation(params: SimulationParams): Promise<SimulationResult> {
  try {
    return await request<SimulationResult>("/api/simulation/run", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch {
    return mockSimulationResult(params);
  }
}

export async function runSensitivityAnalysis(params: Partial<SimulationParams> = {}): Promise<SensitivityResult> {
  try {
    return await request<SensitivityResult>("/api/sensitivity/run", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch {
    return mockSensitivityAnalysis();
  }
}

export async function getAlerts(limit = 50, level?: AlertItem["level"]): Promise<AlertItem[]> {
  try {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (level) qs.set("level", level);
    return await request<AlertItem[]>(`/api/alerts?${qs.toString()}`);
  } catch {
    return mockAlerts(limit, level);
  }
}

export { BASE_URL };
