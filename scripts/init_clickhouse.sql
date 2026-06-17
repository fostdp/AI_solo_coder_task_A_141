CREATE DATABASE IF NOT EXISTS didongyi;

USE didongyi;

CREATE TABLE IF NOT EXISTS devices
(
    device_id String,
    name String,
    location String,
    status String DEFAULT 'online',
    last_report DateTime,
    created_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree
ORDER BY device_id;

CREATE TABLE IF NOT EXISTS sensor_data
(
    device_id String,
    timestamp DateTime,
    pillar_disp_x Float32,
    pillar_disp_y Float32,
    pillar_angle Float32,
    wave_acceleration Float32,
    dragon_status Array(UInt8),
    created_at DateTime DEFAULT now()
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, timestamp);

CREATE TABLE IF NOT EXISTS simulation_results
(
    sim_id String,
    created_at DateTime DEFAULT now(),
    magnitude Float32,
    epicenter_distance Float32,
    pillar_mass Float32,
    pillar_height Float32,
    damping_ratio Float32,
    duration Float32,
    result_json String,
    triggered_dragons Array(UInt8),
    trigger_time Float32 DEFAULT -1,
    max_angle Float32 DEFAULT 0
)
ENGINE = MergeTree
ORDER BY (sim_id, created_at);

CREATE TABLE IF NOT EXISTS sensitivity_analyses
(
    analysis_id String,
    created_at DateTime DEFAULT now(),
    params_json String,
    heatmap_json String,
    roc_json String,
    optimal_threshold Float32
)
ENGINE = MergeTree
ORDER BY (analysis_id, created_at);

CREATE TABLE IF NOT EXISTS alerts
(
    alert_id String,
    timestamp DateTime,
    type String,
    level String,
    message String,
    mqtt_delivered UInt8 DEFAULT 0,
    device_id String DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, alert_id);

INSERT INTO devices (device_id, name, location) VALUES ('DDY-001', '张衡地动仪复原模型A', '洛阳观测站');
