import { create } from "zustand";
import type { SensorRecord, AlertItem, AppToast, PillarState, WaveData, DragonStatus, SensorSample } from "@/types";

const DRAGON_DIRECTIONS: { id: number; direction: string; angle: number }[] = [
  { id: 0, direction: "北",   angle: 0 },
  { id: 1, direction: "东北", angle: 45 },
  { id: 2, direction: "东",   angle: 90 },
  { id: 3, direction: "东南", angle: 135 },
  { id: 4, direction: "南",   angle: 180 },
  { id: 5, direction: "西南", angle: 225 },
  { id: 6, direction: "西",   angle: 270 },
  { id: 7, direction: "西北", angle: 315 },
];

interface RealtimeState {
  deviceId: string;
  lastRecord: SensorRecord;
  pillar: PillarState;
  wave: WaveData;
  dragons: DragonStatus[];
  alerts: AlertItem[];
  toasts: AppToast[];
  wsConnected: boolean;
  connectedAt?: string;
  waveHistory: number[];
  angleHistory: { x: number; y: number; t: number }[];
  pillarTrail: Array<{ x: number; y: number }>;
  samples: SensorSample[];
  isLive: boolean;
  isDemoMode: boolean;
  setIsLive: (v: boolean) => void;
  setIsDemoMode: (v: boolean) => void;
  setDisplacementX: (v: number) => void;
  setDisplacementY: (v: number) => void;
  setTiltAngle: (v: number) => void;
  setAcceleration: (v: number) => void;
  setDragons: (d: DragonStatus[]) => void;
  addPillarTrailPoint: (x: number, y: number) => void;
  addSample: (s: SensorSample) => void;
  displacementX: number;
  displacementY: number;
  tiltAngle: number;
  acceleration: number;
  updateFromRecord: (rec: Partial<SensorRecord>) => void;
  addWaveSample: (v: number) => void;
  triggerDragon: (id: number) => void;
  resetDragons: () => void;
  pushAlert: (a: AlertItem) => void;
  pushToast: (t: Omit<AppToast, "id">) => void;
  dismissToast: (id: string) => void;
  setWsConnected: (c: boolean) => void;
}

const initialDragons: DragonStatus[] = DRAGON_DIRECTIONS.map((d) => ({
  ...d, triggered: false, ball_dropped: false,
}));

const initialPillar: PillarState = {
  displacement_x: 0, displacement_y: 0, angle: 0, angular_velocity: 0,
};

const initialWave: WaveData = { acceleration: 0, frequency: 0, amplitude: 0, history: [] };

const fakeRecord: SensorRecord = {
  device_id: "DDY-001",
  timestamp: new Date().toISOString(),
  pillar: initialPillar,
  wave: initialWave,
  dragons: initialDragons,
};

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  deviceId: "DDY-001",
  lastRecord: fakeRecord,
  pillar: initialPillar,
  wave: initialWave,
  dragons: initialDragons,
  alerts: [],
  toasts: [],
  wsConnected: false,
  waveHistory: Array(512).fill(0),
  angleHistory: [],
  pillarTrail: [],
  samples: [],
  isLive: false,
  isDemoMode: false,
  displacementX: 0,
  displacementY: 0,
  tiltAngle: 0,
  acceleration: 0,

  setIsLive: (v) => set({ isLive: v }),
  setIsDemoMode: (v) => set({ isDemoMode: v }),

  setDisplacementX: (v) => set((s) => ({
    displacementX: v,
    pillar: { ...s.pillar, displacement_x: v },
  })),
  setDisplacementY: (v) => set((s) => ({
    displacementY: v,
    pillar: { ...s.pillar, displacement_y: v },
  })),
  setTiltAngle: (v) => set((s) => ({
    tiltAngle: v,
    pillar: { ...s.pillar, angle: v },
  })),
  setAcceleration: (v) => set((s) => ({
    acceleration: v,
    wave: { ...s.wave, acceleration: v },
  })),
  setDragons: (d) => set({ dragons: d }),

  addPillarTrailPoint: (x, y) => set((s) => {
    const trail = [...s.pillarTrail, { x, y }];
    if (trail.length > 240) trail.splice(0, trail.length - 240);
    return { pillarTrail: trail };
  }),
  addSample: (s2) => set((s) => {
    const samples = [s2, ...s.samples];
    if (samples.length > 200) samples.length = 200;
    return { samples };
  }),

  updateFromRecord: (rec) => set((s) => {
    const next = { ...s.lastRecord, ...rec } as SensorRecord;
    if (rec.pillar) {
      const t = Date.now() / 1000;
      const trail = [...s.angleHistory, { x: rec.pillar.displacement_x, y: rec.pillar.displacement_y, t }];
      if (trail.length > 120) trail.shift();
      return {
        lastRecord: next,
        pillar: rec.pillar,
        displacementX: rec.pillar.displacement_x,
        displacementY: rec.pillar.displacement_y,
        tiltAngle: rec.pillar.angle,
        dragons: rec.dragons ?? s.dragons,
        wave: rec.wave ?? s.wave,
        acceleration: rec.wave?.acceleration ?? s.acceleration,
        angleHistory: trail,
      };
    }
    return {
      lastRecord: next,
      dragons: rec.dragons ?? s.dragons,
      wave: rec.wave ?? s.wave,
      acceleration: rec.wave?.acceleration ?? s.acceleration,
    };
  }),

  addWaveSample: (v) => set((s) => {
    const buf = [...s.waveHistory.slice(1), v];
    return {
      waveHistory: buf,
      wave: { ...s.wave, acceleration: v, history: buf },
      acceleration: v,
    };
  }),

  triggerDragon: (id) => set((s) => ({
    dragons: s.dragons.map((d) =>
      d.id === id ? { ...d, triggered: true, ball_dropped: true, trigger_time_ms: Date.now() } : d
    ),
  })),

  resetDragons: () => set({
    dragons: initialDragons.map((d) => ({ ...d })),
  }),

  pushAlert: (a) => set((s) => {
    const alerts = [a, ...s.alerts].slice(0, 100);
    return { alerts };
  }),

  pushToast: (t) => {
    const id = Math.random().toString(36).slice(2, 9);
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  setWsConnected: (c) => set({ wsConnected: c, connectedAt: c ? new Date().toISOString() : undefined }),
}));

export { DRAGON_DIRECTIONS };
