#pragma once

#include <atomic>
#include <thread>
#include <string>
#include <chrono>
#include <nlohmann/json.hpp>
#include "common/messages.h"
#include "common/app_config.h"

class UdpReceiver {
public:
    explicit UdpReceiver(SensorQueue& sensorQueue, SensitivityRequestQueue& sensitivityQueue);
    ~UdpReceiver();

    void start();
    void stop();
    bool isRunning() const { return running_; }

    uint64_t totalReceived() const { return total_received_; }
    uint64_t totalValidated() const { return total_validated_; }
    uint64_t totalDropped() const { return total_dropped_; }

    void pushHttpSensor(const nlohmann::json& body);

private:
    void run();
    bool validate(const nlohmann::json& j, const AppConfig::SeismicConfig& cfg);
    SensorMessage parseSensorMessage(const nlohmann::json& j);

    SensorQueue& sensor_queue_;
    SensitivityRequestQueue& sensitivity_queue_;
    std::atomic<bool> running_{false};
    std::thread thread_;
    std::atomic<uint64_t> total_received_{0};
    std::atomic<uint64_t> total_validated_{0};
    std::atomic<uint64_t> total_dropped_{0};
    std::atomic<uint64_t> sequence_{0};
};
