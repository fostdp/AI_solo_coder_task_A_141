#include <iostream>
#include <memory>
#include <string>
#include <chrono>
#include <sstream>

#include <httplib.h>
#include <nlohmann/json.hpp>

#include "simulation_engine.h"
#include "sensitivity_analyzer.h"
#include "alert_engine.h"
#include "clickhouse_client.h"
#include "mqtt_client.h"

using json = nlohmann::json;

static std::shared_ptr<SimulationEngine> g_sim_engine;
static std::shared_ptr<SensitivityAnalyzer> g_sensitivity_analyzer;
static std::shared_ptr<AlertEngine> g_alert_engine;
static std::shared_ptr<ClickHouseClient> g_clickhouse;
static std::shared_ptr<MqttClient> g_mqtt;

void setGlobalMqttClient(MqttClient* client);

static json simulationResultToJson(const SimulationResult& result) {
    json j;
    j["triggered"] = result.triggered;
    j["max_angle"] = result.max_angle;
    j["peak_acceleration"] = result.peak_acceleration;

    j["trigger"] = {
        {"dragon_index", result.trigger.dragon_index},
        {"direction", result.trigger.direction},
        {"trigger_time", result.trigger.trigger_time},
        {"angle_at_trigger", result.trigger.angle_at_trigger}
    };

    json heads = json::array();
    for (int i = 0; i < 8; ++i) {
        heads.push_back(result.dragon_heads[i]);
    }
    j["dragon_heads"] = heads;

    json trajectory = json::array();
    for (const auto& ps : result.trajectory) {
        trajectory.push_back({
            {"theta_x", ps.theta_x},
            {"theta_y", ps.theta_y},
            {"omega_x", ps.omega_x},
            {"omega_y", ps.omega_y},
            {"time", ps.time}
        });
    }
    j["trajectory"] = trajectory;

    return j;
}

static json sensitivityResultToJson(const SensitivityResult& result) {
    json j;

    json heatmap = json::array();
    for (const auto& cell : result.heatmap) {
        heatmap.push_back({
            {"magnitude", cell.magnitude},
            {"distance", cell.distance},
            {"detection_probability", cell.detection_probability},
            {"false_alarm_rate", cell.false_alarm_rate}
        });
    }
    j["heatmap"] = heatmap;

    json roc = json::array();
    for (const auto& point : result.roc_curve) {
        roc.push_back({
            {"fpr", point.false_positive_rate},
            {"tpr", point.true_positive_rate},
            {"threshold", point.threshold}
        });
    }
    j["roc_curve"] = roc;
    j["optimal_threshold"] = result.optimal_threshold;
    j["youden_j"] = result.youden_j;

    return j;
}

static json alertToJson(const Alert& alert) {
    auto time_t_val = std::chrono::system_clock::to_time_t(alert.timestamp);
    std::tm tm_val{};
#ifdef _WIN32
    gmtime_s(&tm_val, &time_t_val);
#else
    gmtime_r(&time_t_val, &tm_val);
#endif
    std::ostringstream time_oss;
    time_oss << std::put_time(&tm_val, "%Y-%m-%dT%H:%M:%SZ");

    return {
        {"id", alert.id},
        {"timestamp", time_oss.str()},
        {"type", alert.type},
        {"level", alert.level},
        {"message", alert.message},
        {"mqtt_delivered", alert.mqtt_delivered}
    };
}

static SensorData parseSensorData(const json& j) {
    SensorData data;
    data.device_id = j.value("device_id", "unknown");
    data.acceleration_x = j.value("acceleration_x", 0.0);
    data.acceleration_y = j.value("acceleration_y", 0.0);
    data.acceleration_z = j.value("acceleration_z", 0.0);
    data.magnitude = j.value("magnitude", 0.0);
    data.distance = j.value("distance", 0.0);
    data.triggered_dragon = j.value("triggered_dragon", -1);
    data.timestamp = std::chrono::system_clock::now();
    return data;
}

static SimulationParameters parseSimulationParams(const json& j) {
    SimulationParameters params;
    params.pillar_mass = j.value("pillar_mass", 500.0);
    params.pillar_height = j.value("pillar_height", 2.0);
    params.damping_ratio = j.value("damping_ratio", 0.05);
    params.magnitude = j.value("magnitude", 5.0);
    params.distance = j.value("distance", 100.0);
    params.frequency = j.value("frequency", 1.0);
    params.decay_alpha = j.value("decay_alpha", 0.5);
    params.duration = j.value("duration", 30.0);
    params.dt = j.value("dt", 0.001);
    params.trigger_angle_threshold = j.value("trigger_angle_threshold", 5.0);
    return params;
}

static SensitivityParameters parseSensitivityParams(const json& j) {
    SensitivityParameters params;
    params.magnitude_min = j.value("magnitude_min", 1.0);
    params.magnitude_max = j.value("magnitude_max", 9.0);
    params.magnitude_steps = j.value("magnitude_steps", 20);
    params.distance_min = j.value("distance_min", 1.0);
    params.distance_max = j.value("distance_max", 1000.0);
    params.distance_steps = j.value("distance_steps", 20);
    params.pillar_mass = j.value("pillar_mass", 500.0);
    params.pillar_height = j.value("pillar_height", 2.0);
    params.damping_ratio = j.value("damping_ratio", 0.05);
    params.monte_carlo_trials = j.value("monte_carlo_trials", 30);
    params.frequency = j.value("frequency", 1.0);
    params.decay_alpha = j.value("decay_alpha", 0.5);
    params.duration = j.value("duration", 30.0);
    params.dt = j.value("dt", 0.001);
    return params;
}

static void handleSensorData(const SensorData& data) {
    if (g_clickhouse && g_clickhouse->isConnected()) {
        g_clickhouse->insertSensorData(data);
    }

    SimulationParameters sim_params;
    sim_params.magnitude = data.magnitude;
    sim_params.distance = data.distance;
    sim_params.pillar_mass = 500.0;
    sim_params.pillar_height = 2.0;
    sim_params.damping_ratio = 0.05;
    sim_params.frequency = 1.0;
    sim_params.decay_alpha = 0.5;
    sim_params.duration = 30.0;
    sim_params.dt = 0.001;

    SimulationResult sim_result = g_sim_engine->runSimulation(sim_params);

    if (g_clickhouse && g_clickhouse->isConnected()) {
        g_clickhouse->insertSimulationResult(sim_result, sim_params);
    }

    auto alerts = g_alert_engine->checkAlerts(data);
    if (g_clickhouse && g_clickhouse->isConnected()) {
        for (const auto& alert : alerts) {
            g_clickhouse->insertAlert(alert);
        }
    }
}

int main() {
    std::cout << "Starting Didongyi Simulation Backend..." << std::endl;

    g_sim_engine = std::make_shared<SimulationEngine>();
    g_sensitivity_analyzer = std::make_shared<SensitivityAnalyzer>();
    g_alert_engine = std::make_shared<AlertEngine>();
    g_clickhouse = std::make_shared<ClickHouseClient>("localhost", 9000);
    g_mqtt = std::make_shared<MqttClient>();

    setGlobalMqttClient(g_mqtt.get());

    if (g_clickhouse->connect()) {
        std::cout << "Connected to ClickHouse" << std::endl;
    } else {
        std::cerr << "Failed to connect to ClickHouse" << std::endl;
    }

    if (g_mqtt->connect("localhost", 1883)) {
        std::cout << "Connected to MQTT broker" << std::endl;
    } else {
        std::cerr << "Failed to connect to MQTT broker" << std::endl;
    }

    httplib::Server svr;

    svr.Post("/api/sensor", [](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Content-Type", "application/json");
        try {
            json body = json::parse(req.body);
            SensorData data = parseSensorData(body);
            handleSensorData(data);

            SimulationParameters sim_params;
            sim_params.magnitude = data.magnitude;
            sim_params.distance = data.distance;
            SimulationResult sim_result = g_sim_engine->runSimulation(sim_params);

            json response;
            response["status"] = "ok";
            response["simulation"] = simulationResultToJson(sim_result);
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json err;
            err["error"] = e.what();
            res.status = 400;
            res.set_content(err.dump(), "application/json");
        }
    });

    svr.Get("/api/realtime", [](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Content-Type", "application/json");
        try {
            std::string device_id = req.has_param("device_id") ? req.get_param_value("device_id") : "unknown";
            int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 100;

            json response = json::object();
            if (g_clickhouse && g_clickhouse->isConnected()) {
                auto rows = g_clickhouse->queryRealtimeData(device_id, limit);
                json data = json::array();
                for (const auto& row : rows) {
                    auto time_t_val = std::chrono::system_clock::to_time_t(row.timestamp);
                    std::tm tm_val{};
#ifdef _WIN32
                    gmtime_s(&tm_val, &time_t_val);
#else
                    gmtime_r(&time_t_val, &tm_val);
#endif
                    std::ostringstream time_oss;
                    time_oss << std::put_time(&tm_val, "%Y-%m-%dT%H:%M:%SZ");

                    data.push_back({
                        {"device_id", row.device_id},
                        {"timestamp", time_oss.str()},
                        {"acceleration_x", row.acceleration_x},
                        {"acceleration_y", row.acceleration_y},
                        {"acceleration_z", row.acceleration_z},
                        {"magnitude", row.magnitude},
                        {"distance", row.distance},
                        {"triggered_dragon", row.triggered_dragon}
                    });
                }
                response["data"] = data;
            } else {
                response["data"] = json::array();
            }
            response["status"] = "ok";
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json err;
            err["error"] = e.what();
            res.status = 500;
            res.set_content(err.dump(), "application/json");
        }
    });

    svr.Post("/api/simulation/run", [](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Content-Type", "application/json");
        try {
            json body = json::parse(req.body);
            SimulationParameters params = parseSimulationParams(body);
            SimulationResult result = g_sim_engine->runSimulation(params);

            if (g_clickhouse && g_clickhouse->isConnected()) {
                g_clickhouse->insertSimulationResult(result, params);
            }

            json response;
            response["status"] = "ok";
            response["result"] = simulationResultToJson(result);
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json err;
            err["error"] = e.what();
            res.status = 400;
            res.set_content(err.dump(), "application/json");
        }
    });

    svr.Post("/api/sensitivity/analyze", [](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Content-Type", "application/json");
        try {
            json body = json::parse(req.body);
            SensitivityParameters params = parseSensitivityParams(body);
            SensitivityResult result = g_sensitivity_analyzer->analyze(params);

            if (g_clickhouse && g_clickhouse->isConnected()) {
                g_clickhouse->insertSensitivityAnalysis(result);
            }

            json response;
            response["status"] = "ok";
            response["result"] = sensitivityResultToJson(result);
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json err;
            err["error"] = e.what();
            res.status = 400;
            res.set_content(err.dump(), "application/json");
        }
    });

    svr.Get("/api/alerts", [](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Content-Type", "application/json");
        try {
            int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 50;
            std::string level = req.has_param("level") ? req.get_param_value("level") : "";

            std::vector<Alert> alerts;
            if (g_clickhouse && g_clickhouse->isConnected()) {
                alerts = g_clickhouse->queryAlerts(limit, level);
            } else {
                alerts = g_alert_engine->getAlerts(limit);
            }

            json alert_list = json::array();
            for (const auto& alert : alerts) {
                alert_list.push_back(alertToJson(alert));
            }

            json response;
            response["status"] = "ok";
            response["alerts"] = alert_list;
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json err;
            err["error"] = e.what();
            res.status = 500;
            res.set_content(err.dump(), "application/json");
        }
    });

    svr.setwebsocket_handler([](std::shared_ptr<httplib::WebSocket> ws) {
        std::cout << "WebSocket client connected" << std::endl;
        ws->send("connected to didongyi realtime feed");

        while (ws->is_open()) {
            auto msg = ws->recv();
            if (msg.empty()) break;

            try {
                json body = json::parse(msg);
                if (body.contains("type") && body["type"] == "subscribe") {
                    ws->send(json({{"type", "subscribed"}, {"channel", "realtime"}}).dump());
                }
            } catch (const std::exception&) {
            }
        }

        std::cout << "WebSocket client disconnected" << std::endl;
    });

    std::cout << "Didongyi Simulation Backend running on port 8080" << std::endl;
    svr.listen("0.0.0.0", 8080);

    g_mqtt->disconnect();
    g_clickhouse->disconnect();

    return 0;
}
