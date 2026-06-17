#pragma once

#include <atomic>
#include <thread>
#include <memory>
#include <chrono>
#include <vector>
#include <deque>
#include <mutex>
#include <string>
#include "common/messages.h"
#include "mqtt_client.h"

class AlarmMqttModule {
public:
    explicit AlarmMqttModule(
        SimulationResultQueue& simResultQueue,
        AlertQueue& alertQueue,
        AlertQueue& clickhouseQueue);
    ~AlarmMqttModule();

    void start();
    void stop();
    bool isRunning() const { return running_; }

    void setMqttClient(std::shared_ptr<MqttClient> mqtt);

    uint64_t alertCount() const { return alert_count_; }
    uint64_t mqttDeliveredCount() const { return mqtt_delivered_count_; }

private:
    void run();
    void processSimulationResult(SimulationResultMessage&& msg);
    AlertMessage buildMisfireAlert(const SimulationResultMessage& simMsg,
                                    double accelMagnitude);
    AlertMessage buildSensitivityDropAlert(double currentRate);
    std::string generateAlertId();

    SimulationResultQueue& sim_result_queue_;
    AlertQueue& alert_queue_;
    AlertQueue& clickhouse_queue_;
    std::atomic<bool> running_{false};
    std::thread thread_;
    std::atomic<uint64_t> alert_count_{0};
    std::atomic<uint64_t> mqtt_delivered_count_{0};
    std::atomic<uint64_t> sequence_{0};
    std::atomic<int> alert_counter_{0};
    std::shared_ptr<MqttClient> mqtt_;
    std::chrono::milliseconds poll_interval_{1};

    std::deque<int> detection_window_;
    std::mutex window_mutex_;
    static constexpr size_t kWindowSize = 50;
    static constexpr size_t kMinWindowSamples = 10;
};
