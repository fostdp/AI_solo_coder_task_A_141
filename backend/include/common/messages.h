#pragma once

#include <string>
#include <chrono>
#include <vector>
#include <array>
#include <boost/lockfree/queue.hpp>
#include <nlohmann/json.hpp>
#include "simulation_engine.h"

enum class MessageType {
    SENSOR_DATA = 1,
    SIMULATION_RESULT = 2,
    ALERT = 3,
    SENSITIVITY_REQUEST = 4,
    SENSITIVITY_RESULT = 5
};

struct SensorMessage {
    MessageType type = MessageType::SENSOR_DATA;
    uint64_t sequence = 0;
    std::string device_id;
    std::chrono::system_clock::time_point timestamp;
    double acceleration_x = 0;
    double acceleration_y = 0;
    double acceleration_z = 0;
    double magnitude = 0;
    double distance = 0;
    int triggered_dragon = -1;
    double displacement_x = 0;
    double displacement_y = 0;
    bool valid = true;
    std::string site_soil = "II";

    std::string toJson() const {
        nlohmann::json j;
        j["type"] = "sensor";
        j["device_id"] = device_id;
        j["acceleration_x"] = acceleration_x;
        j["acceleration_y"] = acceleration_y;
        j["acceleration_z"] = acceleration_z;
        j["magnitude"] = magnitude;
        j["distance"] = distance;
        j["triggered_dragon"] = triggered_dragon;
        j["displacement_x"] = displacement_x;
        j["displacement_y"] = displacement_y;
        j["site_soil"] = site_soil;
        return j.dump();
    }
};

struct SimulationResultMessage {
    MessageType type = MessageType::SIMULATION_RESULT;
    uint64_t sequence = 0;
    std::string device_id;
    std::chrono::system_clock::time_point timestamp;
    bool triggered = false;
    int dragon_index = -1;
    std::string direction;
    double trigger_time = 0;
    double max_angle = 0;
    double peak_acceleration = 0;
    double magnitude = 0;
    double distance = 0;
    double displacement_x = 0;
    double displacement_y = 0;
    double contact_force_x = 0;
    double contact_force_y = 0;
    std::array<bool, 8> dragon_heads{};
    std::vector<double> trajectory_x;
    std::vector<double> trajectory_y;

    std::string toJson() const {
        nlohmann::json j;
        j["type"] = "simulation_result";
        j["device_id"] = device_id;
        j["triggered"] = triggered;
        j["dragon_index"] = dragon_index;
        j["direction"] = direction;
        j["trigger_time"] = trigger_time;
        j["max_angle"] = max_angle;
        j["peak_acceleration"] = peak_acceleration;
        j["magnitude"] = magnitude;
        j["distance"] = distance;
        return j.dump();
    }
};

struct AlertMessage {
    MessageType type = MessageType::ALERT;
    uint64_t sequence = 0;
    std::string id;
    std::chrono::system_clock::time_point timestamp;
    std::string alert_type;
    std::string level;
    std::string message;
    std::string device_id;
    bool mqtt_delivered = false;

    std::string toJson() const {
        auto time_t_val = std::chrono::system_clock::to_time_t(timestamp);
        std::tm tm_val{};
#ifdef _WIN32
        gmtime_s(&tm_val, &time_t_val);
#else
        gmtime_r(&time_t_val, &tm_val);
#endif
        std::ostringstream time_oss;
        time_oss << std::put_time(&tm_val, "%Y-%m-%dT%H:%M:%SZ");
        nlohmann::json j;
        j["id"] = id;
        j["timestamp"] = time_oss.str();
        j["type"] = alert_type;
        j["level"] = level;
        j["message"] = message;
        j["device_id"] = device_id;
        j["mqtt_delivered"] = mqtt_delivered;
        return j.dump();
    }
};

struct SensitivityRequestMessage {
    MessageType type = MessageType::SENSITIVITY_REQUEST;
    uint64_t sequence = 0;
    std::string request_id;
    double magnitude_min = 1;
    double magnitude_max = 9;
    int magnitude_steps = 20;
    double distance_min = 1;
    double distance_max = 1000;
    int distance_steps = 20;
    std::string site_soil = "II";
};

struct HeatmapCellMessage {
    double magnitude = 0;
    double distance = 0;
    double detection_probability = 0;
    double false_alarm_rate = 0;
    double avg_trigger_time = 0;
};

struct SensitivityResultMessage {
    MessageType type = MessageType::SENSITIVITY_RESULT;
    uint64_t sequence = 0;
    std::string request_id;
    double optimal_threshold = 0;
    double youden_j = 0;
    double detection_area_km2 = 0;
    double avg_false_alarm_rate = 0;
    std::vector<HeatmapCellMessage> heatmap;
    std::vector<std::array<double, 3>> roc_curve;
};

template <typename T>
class LockfreeQueue {
public:
    explicit LockfreeQueue(size_t capacity)
        : queue_(capacity) {}

    ~LockfreeQueue() {
        T* item;
        while (queue_.pop(item)) {
            delete item;
        }
    }

    bool push(T&& item) {
        T* ptr = new T(std::forward<T>(item));
        if (!queue_.push(ptr)) {
            delete ptr;
            return false;
        }
        return true;
    }

    bool push(T* item) {
        return queue_.push(item);
    }

    bool pop(T& out) {
        T* ptr = nullptr;
        if (!queue_.pop(ptr)) {
            return false;
        }
        out = std::move(*ptr);
        delete ptr;
        return true;
    }

    bool is_lock_free() const {
        return queue_.is_lock_free();
    }

private:
    boost::lockfree::queue<T*> queue_;
};

using SensorQueue = LockfreeQueue<SensorMessage>;
using SimulationResultQueue = LockfreeQueue<SimulationResultMessage>;
using AlertQueue = LockfreeQueue<AlertMessage>;
using SensitivityRequestQueue = LockfreeQueue<SensitivityRequestMessage>;
using SensitivityResultQueue = LockfreeQueue<SensitivityResultMessage>;
