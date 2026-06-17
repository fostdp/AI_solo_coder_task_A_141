#include "common/app_config.h"
#include <fstream>
#include <stdexcept>
#include <cmath>

AppConfig& AppConfig::instance() {
    static AppConfig inst;
    return inst;
}

bool AppConfig::load(const std::string& dynamicsPath, const std::string& seismicPath) {
    std::lock_guard<std::mutex> lock(mutex_);
    dynamics_path_ = dynamicsPath;
    seismic_path_ = seismicPath;
    reload();
    return loaded_;
}

void AppConfig::reload() {
    std::ifstream dyn_file(dynamics_path_);
    if (!dyn_file.is_open()) {
        throw std::runtime_error("Cannot open dynamics config: " + dynamics_path_);
    }
    nlohmann::json dyn_j;
    dyn_file >> dyn_j;
    parseDynamics(dyn_j);

    std::ifstream seis_file(seismic_path_);
    if (!seis_file.is_open()) {
        throw std::runtime_error("Cannot open seismic config: " + seismic_path_);
    }
    nlohmann::json seis_j;
    seis_file >> seis_j;
    parseSeismic(seis_j);

    loaded_ = true;
}

void AppConfig::parseDynamics(const nlohmann::json& j) {
    const auto& pillar = j["pillar"];
    dynamics_.pillar_mass = pillar["mass_kg"].get<double>();
    dynamics_.pillar_height = pillar["height_m"].get<double>();
    dynamics_.damping_ratio = pillar["damping_ratio"].get<double>();
    dynamics_.limit_angle_deg = pillar["limit_angle_deg"].get<double>();
    dynamics_.trigger_angle_deg = pillar["trigger_angle_deg"].get<double>();

    const auto& contact = j["contact"];
    dynamics_.penalty_stiffness = contact["penalty_stiffness"].get<double>();
    dynamics_.penalty_damping = contact["penalty_damping"].get<double>();
    dynamics_.friction_coeff = contact["friction_coeff"].get<double>();

    const auto& num = j["numerical"];
    dynamics_.dt_sec = num["dt_sec"].get<double>();
    dynamics_.duration_sec = num["duration_sec"].get<double>();
    dynamics_.sample_interval = num["sample_interval"].get<int>();

    const auto& soil = j["site_soil"];
    dynamics_.default_site_soil = soil["default_type"].get<std::string>();
    for (auto it = soil["amplification"].begin(); it != soil["amplification"].end(); ++it) {
        dynamics_.soil_amplification[it.key()] = it.value().get<double>();
    }
    for (auto it = soil["frequency_tuning"].begin(); it != soil["frequency_tuning"].end(); ++it) {
        dynamics_.soil_frequency_tuning[it.key()] = it.value().get<double>();
    }
}

void AppConfig::parseSeismic(const nlohmann::json& j) {
    const auto& wf = j["waveform"];
    seismic_.base_frequency_hz = wf["base_frequency_hz"].get<double>();
    seismic_.decay_alpha = wf["decay_alpha"].get<double>();
    seismic_.min_magnitude = wf["min_magnitude"].get<double>();
    seismic_.max_magnitude = wf["max_magnitude"].get<double>();

    const auto& prop = j["propagation"];
    seismic_.min_distance_km = prop["min_distance_km"].get<double>();
    seismic_.max_distance_km = prop["max_distance_km"].get<double>();

    const auto& sens = j["sensitivity"];
    seismic_.magnitude_steps = sens["magnitude_steps"].get<int>();
    seismic_.distance_steps = sens["distance_steps"].get<int>();
    seismic_.monte_carlo_trials = sens["monte_carlo_trials"].get<int>();
    seismic_.noise_stddev = sens["noise_stddev"].get<double>();

    const auto& alert = j["alert"];
    seismic_.misfire_accel_threshold = alert["misfire_accel_threshold"].get<double>();
    seismic_.sensitivity_drop_threshold = alert["sensitivity_drop_threshold"].get<double>();
    seismic_.detection_window_size = alert["detection_window_size"].get<int>();
    seismic_.min_window_samples = alert["min_window_samples"].get<int>();
    seismic_.mqtt_topic = alert["mqtt_topic"].get<std::string>();
    seismic_.mqtt_qos = alert["mqtt_qos"].get<int>();

    const auto& udp = j["udp_receiver"];
    seismic_.udp_listen_host = udp["listen_host"].get<std::string>();
    seismic_.udp_listen_port = udp["listen_port"].get<int>();
    seismic_.udp_max_packet_size = udp["max_packet_size"].get<size_t>();

    const auto& val = udp["validation"];
    seismic_.validation_max_acceleration = val["max_acceleration"].get<double>();
    seismic_.validation_max_magnitude = val["max_magnitude"].get<double>();
    seismic_.validation_device_prefix = val["valid_device_prefix"].get<std::string>();
    seismic_.validation_max_distance = val["max_distance_km"].get<double>();

    const auto& q = j["queues"];
    seismic_.sensor_to_simulator_capacity = q["sensor_to_simulator_capacity"].get<size_t>();
    seismic_.simulator_to_alarm_capacity = q["simulator_to_alarm_capacity"].get<size_t>();
    seismic_.simulator_to_clickhouse_capacity = q["simulator_to_clickhouse_capacity"].get<size_t>();
    seismic_.alarm_to_clickhouse_capacity = q["alarm_to_clickhouse_capacity"].get<size_t>();
}

SiteSoilType AppConfig::soilTypeFromString(const std::string& s) const {
    if (s == "I0") return SiteSoilType::I0;
    if (s == "I1") return SiteSoilType::I1;
    if (s == "II") return SiteSoilType::II;
    if (s == "III") return SiteSoilType::III;
    if (s == "IV") return SiteSoilType::IV;
    return SiteSoilType::II;
}

const AppConfig::DynamicsConfig& AppConfig::dynamics() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return dynamics_;
}

const AppConfig::SeismicConfig& AppConfig::seismic() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return seismic_;
}

SimulationParameters AppConfig::buildSimulationParams(double magnitude, double distance,
    const std::string& site_soil) const {
    std::lock_guard<std::mutex> lock(mutex_);
    SimulationParameters p;
    p.pillar_mass = dynamics_.pillar_mass;
    p.pillar_height = dynamics_.pillar_height;
    p.damping_ratio = dynamics_.damping_ratio;
    p.limit_angle = dynamics_.limit_angle_deg;
    p.trigger_angle_threshold = dynamics_.trigger_angle_deg;
    p.penalty_stiffness = dynamics_.penalty_stiffness;
    p.penalty_damping = dynamics_.penalty_damping;
    p.friction_coeff = dynamics_.friction_coeff;
    p.dt = dynamics_.dt_sec;
    p.duration = dynamics_.duration_sec;
    p.frequency = seismic_.base_frequency_hz;
    p.decay_alpha = seismic_.decay_alpha;
    p.magnitude = magnitude;
    p.distance = distance;
    p.site_soil = soilTypeFromString(site_soil.empty() ? dynamics_.default_site_soil : site_soil);
    return p;
}

SensitivityParameters AppConfig::buildSensitivityParams(const std::string& site_soil) const {
    std::lock_guard<std::mutex> lock(mutex_);
    SensitivityParameters p;
    p.magnitude_min = seismic_.min_magnitude;
    p.magnitude_max = seismic_.max_magnitude;
    p.magnitude_steps = seismic_.magnitude_steps;
    p.distance_min = seismic_.min_distance_km;
    p.distance_max = seismic_.max_distance_km;
    p.distance_steps = seismic_.distance_steps;
    p.pillar_mass = dynamics_.pillar_mass;
    p.pillar_height = dynamics_.pillar_height;
    p.damping_ratio = dynamics_.damping_ratio;
    p.monte_carlo_trials = seismic_.monte_carlo_trials;
    p.frequency = seismic_.base_frequency_hz;
    p.decay_alpha = seismic_.decay_alpha;
    p.duration = dynamics_.duration_sec;
    p.dt = dynamics_.dt_sec;
    p.site_soil = soilTypeFromString(site_soil.empty() ? dynamics_.default_site_soil : site_soil);
    return p;
}
