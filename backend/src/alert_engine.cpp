#include "alert_engine.h"
#include "mqtt_client.h"
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <cmath>

static MqttClient* g_mqtt_client = nullptr;

void setGlobalMqttClient(MqttClient* client) {
    g_mqtt_client = client;
}

AlertEngine::AlertEngine() = default;

std::string AlertEngine::generateAlertId() {
    alert_counter_++;
    auto now = std::chrono::system_clock::now();
    auto secs = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
    std::ostringstream oss;
    oss << "ALT-" << secs << "-" << alert_counter_;
    return oss.str();
}

Alert AlertEngine::createMisfireAlert(const SensorData& sensorData) {
    Alert alert;
    alert.id = generateAlertId();
    alert.timestamp = std::chrono::system_clock::now();
    alert.type = "misfire";
    alert.level = "warning";
    std::ostringstream msg;
    msg << "Misfire detected: dragon " << sensorData.triggered_dragon
        << " triggered but wave acceleration ("
        << std::sqrt(sensorData.acceleration_x * sensorData.acceleration_x
                     + sensorData.acceleration_y * sensorData.acceleration_y
                     + sensorData.acceleration_z * sensorData.acceleration_z)
        << " m/s^2) is below threshold";
    alert.message = msg.str();
    alert.mqtt_delivered = false;
    return alert;
}

Alert AlertEngine::createSensitivityDropAlert(double current_rate) {
    Alert alert;
    alert.id = generateAlertId();
    alert.timestamp = std::chrono::system_clock::now();
    alert.type = "sensitivity_drop";
    alert.level = "critical";
    std::ostringstream msg;
    msg << "Sensitivity drop detected: recent detection rate ("
        << std::fixed << std::setprecision(2) << current_rate
        << ") is below threshold ("
        << sensitivity_drop_threshold_ << ")";
    alert.message = msg.str();
    alert.mqtt_delivered = false;
    return alert;
}

std::vector<Alert> AlertEngine::checkAlerts(const SensorData& sensorData) {
    std::vector<Alert> new_alerts;

    double accel_magnitude = std::sqrt(
        sensorData.acceleration_x * sensorData.acceleration_x
        + sensorData.acceleration_y * sensorData.acceleration_y
        + sensorData.acceleration_z * sensorData.acceleration_z
    );

    if (sensorData.triggered_dragon >= 0 && accel_magnitude < misfire_threshold_) {
        Alert alert = createMisfireAlert(sensorData);
        if (g_mqtt_client && g_mqtt_client->isConnected()) {
            std::ostringstream oss;
            oss << "{\"id\":\"" << alert.id
                << "\",\"type\":\"" << alert.type
                << "\",\"level\":\"" << alert.level
                << "\",\"message\":\"" << alert.message << "\"}";
            g_mqtt_client->publish("didongyi/alerts", oss.str());
            alert.mqtt_delivered = true;
        }
        new_alerts.push_back(alert);
    }

    int detection_value = (sensorData.triggered_dragon >= 0 && accel_magnitude >= misfire_threshold_) ? 1 : 0;
    recent_detections_.push_back(detection_value);
    if (recent_detections_.size() > kRecentWindow) {
        recent_detections_.erase(recent_detections_.begin());
    }

    if (recent_detections_.size() >= 10) {
        double sum = 0.0;
        for (int v : recent_detections_) sum += v;
        double detection_rate = sum / static_cast<double>(recent_detections_.size());

        if (detection_rate < sensitivity_drop_threshold_) {
            Alert alert = createSensitivityDropAlert(detection_rate);
            if (g_mqtt_client && g_mqtt_client->isConnected()) {
                std::ostringstream oss;
                oss << "{\"id\":\"" << alert.id
                    << "\",\"type\":\"" << alert.type
                    << "\",\"level\":\"" << alert.level
                    << "\",\"message\":\"" << alert.message << "\"}";
                g_mqtt_client->publish("didongyi/alerts", oss.str());
                alert.mqtt_delivered = true;
            }
            new_alerts.push_back(alert);
        }
    }

    {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& alert : new_alerts) {
            alert_history_.push_back(alert);
        }
    }

    return new_alerts;
}

void AlertEngine::setThresholds(double misfireThreshold, double sensitivityDropThreshold) {
    misfire_threshold_ = misfireThreshold;
    sensitivity_drop_threshold_ = sensitivityDropThreshold;
}

std::vector<Alert> AlertEngine::getAlerts(int limit) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<Alert> result;
    int count = std::min(limit, static_cast<int>(alert_history_.size()));
    int start = static_cast<int>(alert_history_.size()) - count;
    for (int i = start; i < static_cast<int>(alert_history_.size()); ++i) {
        result.push_back(alert_history_[i]);
    }
    return result;
}
