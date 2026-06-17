#include "clickhouse_client.h"
#include <clickhouse/client.h>
#include <clickhouse/block.h>
#include <nlohmann/json.hpp>
#include <sstream>
#include <iomanip>
#include <chrono>

namespace {
    std::string formatTime(std::chrono::system_clock::time_point tp) {
        auto time_t_val = std::chrono::system_clock::to_time_t(tp);
        std::tm tm_val{};
#ifdef _WIN32
        gmtime_s(&tm_val, &time_t_val);
#else
        gmtime_r(&time_t_val, &tm_val);
#endif
        std::ostringstream oss;
        oss << std::put_time(&tm_val, "%Y-%m-%d %H:%M:%S");
        return oss.str();
    }
}

class ClickHouseClient::Impl {
public:
    clickhouse::Client* client = nullptr;

    Impl(const std::string& host, int port) {
        clickhouse::ClientOptions opts;
        opts.host = host;
        opts.port = port;
        client = new clickhouse::Client(opts);
    }

    ~Impl() {
        delete client;
    }
};

ClickHouseClient::ClickHouseClient(const std::string& host, int port)
    : host_(host), port_(port) {}

ClickHouseClient::~ClickHouseClient() {
    disconnect();
}

bool ClickHouseClient::connect() {
    try {
        if (!impl_) {
            impl_ = std::make_unique<Impl>(host_, port_);
        }
        impl_->client->ResetConnection();
        connected_ = true;
        ensureDatabase();
        return true;
    } catch (const std::exception&) {
        connected_ = false;
        return false;
    }
}

void ClickHouseClient::disconnect() {
    connected_ = false;
    impl_.reset();
}

bool ClickHouseClient::isConnected() const {
    return connected_;
}

bool ClickHouseClient::ensureDatabase() {
    try {
        impl_->client->Execute("CREATE DATABASE IF NOT EXISTS didongyi");
        impl_->client->Execute(
            "CREATE TABLE IF NOT EXISTS didongyi.sensor_data ("
            "device_id String, "
            "timestamp DateTime, "
            "acceleration_x Float64, "
            "acceleration_y Float64, "
            "acceleration_z Float64, "
            "magnitude Float64, "
            "distance Float64, "
            "triggered_dragon Int32"
            ") ENGINE = MergeTree() ORDER BY timestamp"
        );
        impl_->client->Execute(
            "CREATE TABLE IF NOT EXISTS didongyi.simulation_results ("
            "timestamp DateTime, "
            "triggered UInt8, "
            "dragon_index Int32, "
            "direction String, "
            "max_angle Float64, "
            "peak_acceleration Float64, "
            "magnitude Float64, "
            "distance Float64"
            ") ENGINE = MergeTree() ORDER BY timestamp"
        );
        impl_->client->Execute(
            "CREATE TABLE IF NOT EXISTS didongyi.alerts ("
            "id String, "
            "timestamp DateTime, "
            "type String, "
            "level String, "
            "message String, "
            "mqtt_delivered UInt8"
            ") ENGINE = MergeTree() ORDER BY timestamp"
        );
        impl_->client->Execute(
            "CREATE TABLE IF NOT EXISTS didongyi.sensitivity_analysis ("
            "timestamp DateTime, "
            "optimal_threshold Float64, "
            "youden_j Float64, "
            "heatmap_json String, "
            "roc_json String"
            ") ENGINE = MergeTree() ORDER BY timestamp"
        );
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

bool ClickHouseClient::insertSensorData(const SensorData& data) {
    try {
        clickhouse::Block block;
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{data.device_id}));
        block.AddColumn(std::make_shared<clickhouse::ColumnDateTime>(std::vector<time_t>{
            std::chrono::system_clock::to_time_t(data.timestamp)}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{data.acceleration_x}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{data.acceleration_y}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{data.acceleration_z}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{data.magnitude}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{data.distance}));
        block.AddColumn(std::make_shared<clickhouse::ColumnInt32>(std::vector<int32_t>{data.triggered_dragon}));
        impl_->client->Insert("didongyi.sensor_data", block);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

bool ClickHouseClient::insertSimulationResultRow(const SimulationResultRow& row) {
    try {
        clickhouse::Block block;
        block.AddColumn(std::make_shared<clickhouse::ColumnDateTime>(std::vector<time_t>{
            std::chrono::system_clock::to_time_t(row.timestamp)}));
        block.AddColumn(std::make_shared<clickhouse::ColumnUInt8>(std::vector<uint8_t>{row.triggered ? 1 : 0}));
        block.AddColumn(std::make_shared<clickhouse::ColumnInt32>(std::vector<int32_t>{row.dragon_index}));
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{row.direction}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{row.max_angle}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{row.peak_acceleration}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{row.magnitude}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{row.distance}));
        impl_->client->Insert("didongyi.simulation_results", block);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

std::vector<SensorDataRow> ClickHouseClient::queryRealtimeData(const std::string& deviceId, int limit) {
    std::vector<SensorDataRow> results;
    try {
        std::ostringstream query;
        query << "SELECT device_id, timestamp, acceleration_x, acceleration_y, acceleration_z, "
              << "magnitude, distance, triggered_dragon FROM didongyi.sensor_data "
              << "WHERE device_id = '" << deviceId << "' "
              << "ORDER BY timestamp DESC LIMIT " << limit;
        impl_->client->Select(query.str(), [&](const clickhouse::Block& block) {
            for (size_t i = 0; i < block.GetRowCount(); ++i) {
                SensorDataRow row;
                row.device_id = block[0]->As<clickhouse::ColumnString>()->At(i);
                auto ts = block[1]->As<clickhouse::ColumnDateTime>()->At(i);
                row.timestamp = std::chrono::system_clock::from_time_t(static_cast<time_t>(ts));
                row.acceleration_x = block[2]->As<clickhouse::ColumnFloat64>()->At(i);
                row.acceleration_y = block[3]->As<clickhouse::ColumnFloat64>()->At(i);
                row.acceleration_z = block[4]->As<clickhouse::ColumnFloat64>()->At(i);
                row.magnitude = block[5]->As<clickhouse::ColumnFloat64>()->At(i);
                row.distance = block[6]->As<clickhouse::ColumnFloat64>()->At(i);
                row.triggered_dragon = block[7]->As<clickhouse::ColumnInt32>()->At(i);
                results.push_back(row);
            }
        });
    } catch (const std::exception&) {
    }
    return results;
}

bool ClickHouseClient::insertSimulationResult(const SimulationResult& result, const SimulationParameters& params) {
    try {
        clickhouse::Block block;
        auto now = std::chrono::system_clock::now();
        block.AddColumn(std::make_shared<clickhouse::ColumnDateTime>(std::vector<time_t>{
            std::chrono::system_clock::to_time_t(now)}));
        block.AddColumn(std::make_shared<clickhouse::ColumnUInt8>(std::vector<uint8_t>{result.triggered ? 1 : 0}));
        block.AddColumn(std::make_shared<clickhouse::ColumnInt32>(std::vector<int32_t>{result.trigger.dragon_index}));
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{result.trigger.direction}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{result.max_angle}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{result.peak_acceleration}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{params.magnitude}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{params.distance}));
        impl_->client->Insert("didongyi.simulation_results", block);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

bool ClickHouseClient::insertAlert(const Alert& alert) {
    try {
        clickhouse::Block block;
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{alert.id}));
        block.AddColumn(std::make_shared<clickhouse::ColumnDateTime>(std::vector<time_t>{
            std::chrono::system_clock::to_time_t(alert.timestamp)}));
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{alert.type}));
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{alert.level}));
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{alert.message}));
        block.AddColumn(std::make_shared<clickhouse::ColumnUInt8>(std::vector<uint8_t>{alert.mqtt_delivered ? 1 : 0}));
        impl_->client->Insert("didongyi.alerts", block);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

std::vector<Alert> ClickHouseClient::queryAlerts(int limit, const std::string& level) {
    std::vector<Alert> results;
    try {
        std::ostringstream query;
        query << "SELECT id, timestamp, type, level, message, mqtt_delivered FROM didongyi.alerts ";
        if (!level.empty()) {
            query << "WHERE level = '" << level << "' ";
        }
        query << "ORDER BY timestamp DESC LIMIT " << limit;
        impl_->client->Select(query.str(), [&](const clickhouse::Block& block) {
            for (size_t i = 0; i < block.GetRowCount(); ++i) {
                Alert alert;
                alert.id = block[0]->As<clickhouse::ColumnString>()->At(i);
                auto ts = block[1]->As<clickhouse::ColumnDateTime>()->At(i);
                alert.timestamp = std::chrono::system_clock::from_time_t(static_cast<time_t>(ts));
                alert.type = block[2]->As<clickhouse::ColumnString>()->At(i);
                alert.level = block[3]->As<clickhouse::ColumnString>()->At(i);
                alert.message = block[4]->As<clickhouse::ColumnString>()->At(i);
                alert.mqtt_delivered = block[5]->As<clickhouse::ColumnUInt8>()->At(i) != 0;
                results.push_back(alert);
            }
        });
    } catch (const std::exception&) {
    }
    return results;
}

bool ClickHouseClient::insertSensitivityAnalysis(const SensitivityResult& result) {
    try {
        nlohmann::json heatmap_json = nlohmann::json::array();
        for (const auto& cell : result.heatmap) {
            heatmap_json.push_back({
                {"magnitude", cell.magnitude},
                {"distance", cell.distance},
                {"detection_probability", cell.detection_probability},
                {"false_alarm_rate", cell.false_alarm_rate}
            });
        }

        nlohmann::json roc_json = nlohmann::json::array();
        for (const auto& point : result.roc_curve) {
            roc_json.push_back({
                {"fpr", point.false_positive_rate},
                {"tpr", point.true_positive_rate},
                {"threshold", point.threshold}
            });
        }

        clickhouse::Block block;
        auto now = std::chrono::system_clock::now();
        block.AddColumn(std::make_shared<clickhouse::ColumnDateTime>(std::vector<time_t>{
            std::chrono::system_clock::to_time_t(now)}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{result.optimal_threshold}));
        block.AddColumn(std::make_shared<clickhouse::ColumnFloat64>(std::vector<double>{result.youden_j}));
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{heatmap_json.dump()}));
        block.AddColumn(std::make_shared<clickhouse::ColumnString>(std::vector<std::string>{roc_json.dump()}));
        impl_->client->Insert("didongyi.sensitivity_analysis", block);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

std::string ClickHouseClient::timePointToString(std::chrono::system_clock::time_point tp) {
    return formatTime(tp);
}
