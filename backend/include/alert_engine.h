#pragma once

#include <vector>
#include <string>
#include <chrono>
#include <mutex>

struct Alert {
    std::string id;
    std::chrono::system_clock::time_point timestamp;
    std::string type;
    std::string level;
    std::string message;
    bool mqtt_delivered = false;
};

struct SensorData {
    std::string device_id;
    std::chrono::system_clock::time_point timestamp;
    double acceleration_x;
    double acceleration_y;
    double acceleration_z;
    double magnitude;
    double distance;
    int triggered_dragon;
};

class AlertEngine {
public:
    AlertEngine();

    std::vector<Alert> checkAlerts(const SensorData& sensorData);
    void setThresholds(double misfireThreshold, double sensitivityDropThreshold);
    std::vector<Alert> getAlerts(int limit);

private:
    double misfire_threshold_ = 0.5;
    double sensitivity_drop_threshold_ = 0.6;
    std::vector<Alert> alert_history_;
    std::mutex mutex_;
    int alert_counter_ = 0;

    std::vector<int> recent_detections_;
    static constexpr size_t kRecentWindow = 50;

    Alert createMisfireAlert(const SensorData& sensorData);
    Alert createSensitivityDropAlert(double current_rate);
    std::string generateAlertId();
};
