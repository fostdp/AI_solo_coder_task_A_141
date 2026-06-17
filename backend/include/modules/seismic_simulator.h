#pragma once

#include <atomic>
#include <thread>
#include <memory>
#include <chrono>
#include "common/messages.h"
#include "simulation_engine.h"

class SeismicSimulator {
public:
    explicit SeismicSimulator(SensorQueue& sensorQueue,
                              SimulationResultQueue& resultQueue,
                              SimulationResultQueue& clickhouseQueue);
    ~SeismicSimulator();

    void start();
    void stop();
    bool isRunning() const { return running_; }

    SimulationResult runSimulation(const SimulationParameters& params);

    uint64_t processedSensorCount() const { return processed_sensor_count_; }
    uint64_t simulationCount() const { return simulation_count_; }

    void setSimulationEngine(std::shared_ptr<SimulationEngine> engine);

private:
    void run();
    void processSensorMessage(SensorMessage&& msg);

    SensorQueue& sensor_queue_;
    SimulationResultQueue& result_queue_;
    SimulationResultQueue& clickhouse_queue_;
    std::atomic<bool> running_{false};
    std::thread thread_;
    std::atomic<uint64_t> processed_sensor_count_{0};
    std::atomic<uint64_t> simulation_count_{0};
    std::atomic<uint64_t> sequence_{0};
    std::shared_ptr<SimulationEngine> engine_;
    std::chrono::milliseconds poll_interval_{1};
};
