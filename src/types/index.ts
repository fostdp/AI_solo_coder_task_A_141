export interface DragonStatus {
  id: number;
  direction: string;
  angle: number;
  triggered: boolean;
  ball_dropped: boolean;
  trigger_time_ms?: number;
}

export interface PillarState {
  displacement_x: number;
  displacement_y: number;
  angle: number;
  angular_velocity: number;
  velocity_x?: number;
  velocity_y?: number;
}

export interface WaveData {
  acceleration: number;
  frequency: number;
  amplitude: number;
  history?: number[];
}

export interface SensorSample {
  id: number;
  timestamp: number;
  displacement_x: number;
  displacement_y: number;
  tilt_angle: number;
  acceleration: number;
  waveform_sample: number;
}

export interface SensorRecord {
  device_id: string;
  timestamp: string;
  pillar: PillarState;
  wave: WaveData;
  dragons: DragonStatus[];
  magnitude?: number;
  epicenter_distance?: number;
  sample?: SensorSample;
}

export interface SimulationParams {
  magnitude: number;
  epicenter_distance: number;
  pillar_mass: number;
  pillar_height: number;
  damping_ratio: number;
  duration: number;
  earthquake_direction?: number;
  sample_rate?: number;
}

export interface TrajectoryPoint {
  t: number;
  x: number;
  y: number;
  angle: number;
  angular_vel: number;
  wave_acc: number;
}

export interface SimulationResult {
  simulation_id: string;
  created_at?: string;
  params: SimulationParams;
  pillar_trajectory: TrajectoryPoint[];
  triggered_dragons: number[];
  trigger_time: number;
  max_angle: number;
}

export interface HeatmapCell {
  row: number;
  col: number;
  label?: string;
  value: number;
  magnitude: number;
  distance: number;
  detection_prob: number;
  false_alarm_rate: number;
  avg_trigger_time: number;
}

export interface ROCPoint {
  threshold: number;
  tpr: number;
  fpr: number;
}

export interface SensitivityResult {
  analysis_id: string;
  grid: HeatmapCell[][];
  roc_curve: ROCPoint[];
  optimal_threshold: number;
  detection_area_km2: number;
}

export interface AlertItem {
  id: string;
  timestamp: string;
  type: "misfire" | "sensitivity_drop" | "system";
  level: "info" | "warning" | "critical";
  message: string;
  mqtt_delivered: boolean;
  device_id?: string;
}

export interface AlertConfig {
  misfire_wave_threshold: number;
  sensitivity_min_rate: number;
  sensitivity_window_min: number;
}

export interface AppToast {
  id: string;
  type: "success" | "warning" | "error" | "info";
  message: string;
}
