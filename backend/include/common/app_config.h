#pragma once

#include <string>
#include <mutex>
#include <nlohmann/json.hpp>
#include "simulation_engine.h"

class AppConfig {
public:
    static AppConfig& instance();

    bool load(const std::string& dynamicsPath, const std::string& seismicPath);
    void reload();

    struct DynamicsConfig {
        double pillar_mass;
        double pillar_height;
        double damping_ratio;
        double limit_angle_deg;
        double trigger_angle_deg;
        double penalty_stiffness;
        double penalty_damping;
        double friction_coeff;
        double dt_sec;
        double duration_sec;
        int sample_interval;
        std::string default_site_soil;
        std::unordered_map<std::string, double> soil_amplification;
        std::unordered_map<std::string, double> soil_frequency_tuning;
    };

    struct SeismicConfig {
        double base_frequency_hz;
        double decay_alpha;
        double min_magnitude;
        double max_magnitude;
        double min_distance_km;
        double max_distance_km;
        int magnitude_steps;
        int distance_steps;
        int monte_carlo_trials;
        double noise_stddev;
        double misfire_accel_threshold;
        double sensitivity_drop_threshold;
        int detection_window_size;
        int min_window_samples;
        std::string mqtt_topic;
        int mqtt_qos;
        std::string udp_listen_host;
        int udp_listen_port;
        size_t udp_max_packet_size;
        double validation_max_acceleration;
        double validation_max_magnitude;
        std::string validation_device_prefix;
        double validation_max_distance;
        size_t sensor_to_simulator_capacity;
        size_t simulator_to_alarm_capacity;
        size_t simulator_to_clickhouse_capacity;
        size_t alarm_to_clickhouse_capacity;
    };

    const DynamicsConfig& dynamics() const;
    const SeismicConfig& seismic() const;

    SimulationParameters buildSimulationParams(double magnitude, double distance,
        const std::string& site_soil = "") const;

    SensitivityParameters buildSensitivityParams(
        const std::string& site_soil = "") const;

private:
    AppConfig() = default;
    ~AppConfig() = default;
    AppConfig(const AppConfig&) = delete;
    AppConfig& operator=(const AppConfig&) = delete;

    mutable std::mutex mutex_;
    std::string dynamics_path_;
    std::string seismic_path_;
    DynamicsConfig dynamics_;
    SeismicConfig seismic_;
    bool loaded_ = false;

    void parseDynamics(const nlohmann::json& j);
    void parseSeismic(const nlohmann::json& j);
    SiteSoilType soilTypeFromString(const std::string& s) const;
};
