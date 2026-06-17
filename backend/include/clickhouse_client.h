#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <memory>
#include "alert_engine.h"
#include "simulation_engine.h"
#include "sensitivity_analyzer.h"

struct SensorDataRow {
    std::string device_id;
    std::chrono::system_clock::time_point timestamp;
    double acceleration_x;
    double acceleration_y;
    double acceleration_z;
    double magnitude;
    double distance;
    int triggered_dragon;
};

struct SimulationResultRow {
    std::chrono::system_clock::time_point timestamp;
    bool triggered;
    int dragon_index;
    std::string direction;
    double max_angle;
    double peak_acceleration;
    double magnitude;
    double distance;
};

struct SensitivityAnalysisRow {
    std::chrono::system_clock::time_point timestamp;
    double optimal_threshold;
    double youden_j;
    std::string heatmap_json;
    std::string roc_json;
};

class ClickHouseClient {
public:
    ClickHouseClient(const std::string& host = "localhost", int port = 9000);
    ~ClickHouseClient();

    bool connect();
    void disconnect();
    bool isConnected() const;

    bool insertSensorData(const SensorData& data);
    bool insertSimulationResultRow(const SimulationResultRow& row);
    std::vector<SensorDataRow> queryRealtimeData(const std::string& deviceId, int limit = 100);
    bool insertSimulationResult(const SimulationResult& result, const SimulationParameters& params);
    bool insertAlert(const Alert& alert);
    std::vector<Alert> queryAlerts(int limit = 50, const std::string& level = "");
    bool insertSensitivityAnalysis(const SensitivityResult& result);

private:
    std::string host_;
    int port_;
    bool connected_ = false;

    class Impl;
    std::unique_ptr<Impl> impl_;

    bool ensureDatabase();
    std::string timePointToString(std::chrono::system_clock::time_point tp);
};
