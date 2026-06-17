#include <iostream>
#include <memory>
#include <string>
#include <chrono>
#include <sstream>
#include <thread>
#include <signal.h>

#include <httplib.h>
#include <nlohmann/json.hpp>

#include "simulation_engine.h"
#include "sensitivity_analyzer.h"
#include "alert_engine.h"
#include "clickhouse_client.h"
#include "mqtt_client.h"

#include "common/messages.h"
#include "common/app_config.h"

#include "modules/udp_receiver.h"
#include "modules/seismic_simulator.h"
#include "modules/sensitivity_analyzer_module.h"
#include "modules/alarm_mqtt.h"

using json = nlohmann::json;

static std::atomic<bool> g_running{true};
static std::shared_ptr<ClickHouseClient> g_clickhouse;
static std::shared_ptr<MqttClient> g_mqtt;
static std::shared_ptr<SeismicSimulator> g_seismic_simulator;
static std::shared_ptr<SensitivityAnalyzerModule> g_sensitivity_module;
static std::shared_ptr<AlarmMqttModule> g_alarm_module;
static std::shared_ptr<UdpReceiver> g_udp_receiver;
static std::shared_ptr<AlertEngine> g_alert_engine;

static std::unique_ptr<SensorQueue> g_sensor_queue;
static std::unique_ptr<SimulationResultQueue> g_sim_result_queue;
static std::unique_ptr<SimulationResultQueue> g_sim_clickhouse_queue;
static std::unique_ptr<AlertQueue> g_alert_queue;
static std::unique_ptr<AlertQueue> g_alert_clickhouse_queue;
static std::unique_ptr<SensitivityRequestQueue> g_sensitivity_request_queue;
static std::unique_ptr<SensitivityResultQueue> g_sensitivity_result_queue;

void signalHandler(int) {
    g_running = false;
    std::cout << "\nShutting down..." << std::endl;
}

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
            {"time", ps.time},
            {"contact_force_x", ps.contact_force_x},
            {"contact_force_y", ps.contact_force_y}
        });
    }
    j["trajectory"] = trajectory;
    return j;
}

static json sensitivityResultToJson(const SensitivityResultMessage& result) {
    json j;
    json heatmap = json::array();
    for (const auto& cell : result.heatmap) {
        heatmap.push_back({
            {"magnitude", cell.magnitude},
            {"distance", cell.distance},
            {"detection_probability", cell.detection_probability},
            {"false_alarm_rate", cell.false_alarm_rate},
            {"avg_trigger_time", cell.avg_trigger_time}
        });
    }
    j["heatmap"] = heatmap;
    json roc = json::array();
    for (const auto& pt : result.roc_curve) {
        roc.push_back({
            {"fpr", pt[0]},
            {"tpr", pt[1]},
            {"threshold", pt[2]}
        });
    }
    j["roc_curve"] = roc;
    j["optimal_threshold"] = result.optimal_threshold;
    j["youden_j"] = result.youden_j;
    j["detection_area_km2"] = result.detection_area_km2;
    j["avg_false_alarm_rate"] = result.avg_false_alarm_rate;
    return j;
}

static json alertToJson(const AlertMessage& alert) {
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
        {"type", alert.alert_type},
        {"level", alert.level},
        {"message", alert.message},
        {"device_id", alert.device_id},
        {"mqtt_delivered", alert.mqtt_delivered}
    };
}

static SiteSoilType soilTypeFromString(const std::string& s) {
    if (s == "I0") return SiteSoilType::I0;
    if (s == "I1") return SiteSoilType::I1;
    if (s == "II") return SiteSoilType::II;
    if (s == "III") return SiteSoilType::III;
    if (s == "IV") return SiteSoilType::IV;
    return SiteSoilType::II;
}

static SimulationParameters parseSimulationParams(const json& j) {
    SimulationParameters params = AppConfig::instance().buildSimulationParams(
        j.value("magnitude", 5.0),
        j.value("distance", 100.0),
        j.value("site_soil", std::string(""))
    );
    params.pillar_mass = j.value("pillar_mass", params.pillar_mass);
    params.pillar_height = j.value("pillar_height", params.pillar_height);
    params.damping_ratio = j.value("damping_ratio", params.damping_ratio);
    params.frequency = j.value("frequency", params.frequency);
    params.decay_alpha = j.value("decay_alpha", params.decay_alpha);
    params.duration = j.value("duration", params.duration);
    params.dt = j.value("dt", params.dt);
    params.trigger_angle_threshold = j.value("trigger_angle_threshold", params.trigger_angle_threshold);
    params.limit_angle = j.value("limit_angle", params.limit_angle);
    params.penalty_stiffness = j.value("penalty_stiffness", params.penalty_stiffness);
    params.penalty_damping = j.value("penalty_damping", params.penalty_damping);
    params.friction_coeff = j.value("friction_coeff", params.friction_coeff);
    params.site_soil = soilTypeFromString(j.value("site_soil", std::string("II")));
    return params;
}

static SensitivityParameters parseSensitivityParams(const json& j) {
    SensitivityParameters params = AppConfig::instance().buildSensitivityParams(
        j.value("site_soil", std::string(""))
    );
    params.magnitude_min = j.value("magnitude_min", params.magnitude_min);
    params.magnitude_max = j.value("magnitude_max", params.magnitude_max);
    params.magnitude_steps = j.value("magnitude_steps", params.magnitude_steps);
    params.distance_min = j.value("distance_min", params.distance_min);
    params.distance_max = j.value("distance_max", params.distance_max);
    params.distance_steps = j.value("distance_steps", params.distance_steps);
    params.pillar_mass = j.value("pillar_mass", params.pillar_mass);
    params.pillar_height = j.value("pillar_height", params.pillar_height);
    params.damping_ratio = j.value("damping_ratio", params.damping_ratio);
    params.monte_carlo_trials = j.value("monte_carlo_trials", params.monte_carlo_trials);
    params.frequency = j.value("frequency", params.frequency);
    params.decay_alpha = j.value("decay_alpha", params.decay_alpha);
    params.duration = j.value("duration", params.duration);
    params.dt = j.value("dt", params.dt);
    params.site_soil = soilTypeFromString(j.value("site_soil", std::string("II")));
    return params;
}

static void clickhouseWriterThread() {
    std::cout << "ClickHouse writer thread started" << std::endl;
    while (g_running) {
        SimulationResultMessage simMsg;
        while (g_sim_clickhouse_queue->pop(simMsg)) {
            if (g_clickhouse && g_clickhouse->isConnected()) {
                SimulationResultRow row;
                row.timestamp = simMsg.timestamp;
                row.triggered = simMsg.triggered;
                row.dragon_index = simMsg.dragon_index;
                row.direction = simMsg.direction;
                row.max_angle = simMsg.max_angle;
                row.peak_acceleration = simMsg.peak_acceleration;
                row.magnitude = simMsg.magnitude;
                row.distance = simMsg.distance;
                g_clickhouse->insertSimulationResultRow(row);
            }
        }

        AlertMessage alertMsg;
        while (g_alert_clickhouse_queue->pop(alertMsg)) {
            if (g_clickhouse && g_clickhouse->isConnected()) {
                Alert a;
                a.id = alertMsg.id;
                a.timestamp = alertMsg.timestamp;
                a.type = alertMsg.alert_type;
                a.level = alertMsg.level;
                a.message = alertMsg.message;
                a.mqtt_delivered = alertMsg.mqtt_delivered;
                g_clickhouse->insertAlert(a);
            }
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    std::cout << "ClickHouse writer thread stopped" << std::endl;
}

static void statusMonitorThread() {
    while (g_running) {
        std::this_thread::sleep_for(std::chrono::seconds(30));
        if (!g_running) break;
        std::cout << "[STATUS] UDP recv=" << g_udp_receiver->totalReceived()
                  << " valid=" << g_udp_receiver->totalValidated()
                  << " drop=" << g_udp_receiver->totalDropped()
                  << " | Sim processed=" << g_seismic_simulator->processedSensorCount()
                  << " sims=" << g_seismic_simulator->simulationCount()
                  << " | Alerts=" << g_alarm_module->alertCount()
                  << " mqtt=" << g_alarm_module->mqttDeliveredCount()
                  << std::endl;
    }
}

int main() {
    signal(SIGINT, signalHandler);
#ifdef _WIN32
    signal(SIGBREAK, signalHandler);
#endif

    std::cout << "============================================" << std::endl;
    std::cout << "  Didongyi Simulation Backend (Modular)" << std::endl;
    std::cout << "============================================" << std::endl;

    try {
        AppConfig::instance().load("config/dynamics.json", "config/seismic.json");
        std::cout << "✓ Configuration loaded" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Failed to load config: " << e.what() << std::endl;
        return 1;
    }

    const auto& cfg = AppConfig::instance().seismic();

    g_sensor_queue = std::make_unique<SensorQueue>(cfg.sensor_to_simulator_capacity);
    g_sim_result_queue = std::make_unique<SimulationResultQueue>(cfg.simulator_to_alarm_capacity);
    g_sim_clickhouse_queue = std::make_unique<SimulationResultQueue>(cfg.simulator_to_clickhouse_capacity);
    g_alert_queue = std::make_unique<AlertQueue>(cfg.alarm_to_clickhouse_capacity);
    g_alert_clickhouse_queue = std::make_unique<AlertQueue>(cfg.alarm_to_clickhouse_capacity);
    g_sensitivity_request_queue = std::make_unique<SensitivityRequestQueue>(64);
    g_sensitivity_result_queue = std::make_unique<SensitivityResultQueue>(64);
    std::cout << "✓ Lockfree queues initialized" << std::endl;

    g_clickhouse = std::make_shared<ClickHouseClient>("localhost", 9000);
    g_mqtt = std::make_shared<MqttClient>();

    g_udp_receiver = std::make_shared<UdpReceiver>(*g_sensor_queue, *g_sensitivity_request_queue);
    g_seismic_simulator = std::make_shared<SeismicSimulator>(
        *g_sensor_queue, *g_sim_result_queue, *g_sim_clickhouse_queue);
    g_sensitivity_module = std::make_shared<SensitivityAnalyzerModule>(
        *g_sensitivity_request_queue, *g_sensitivity_result_queue);
    g_alarm_module = std::make_shared<AlarmMqttModule>(
        *g_sim_result_queue, *g_alert_queue, *g_alert_clickhouse_queue);
    g_alert_engine = std::make_shared<AlertEngine>();

    g_alarm_module->setMqttClient(g_mqtt);
    std::cout << "✓ Modules instantiated" << std::endl;

    if (g_clickhouse->connect()) {
        std::cout << "✓ Connected to ClickHouse" << std::endl;
    } else {
        std::cerr << "✗ Failed to connect to ClickHouse (will operate in-memory only)" << std::endl;
    }

    if (g_mqtt->connect("localhost", 1883)) {
        std::cout << "✓ Connected to MQTT broker" << std::endl;
    } else {
        std::cerr << "✗ Failed to connect to MQTT broker" << std::endl;
    }

    setGlobalMqttClient(g_mqtt.get());

    g_udp_receiver->start();
    g_seismic_simulator->start();
    g_sensitivity_module->start();
    g_alarm_module->start();

    std::thread chWriter(clickhouseWriterThread);
    std::thread monitor(statusMonitorThread);

    std::cout << "✓ All module threads started" << std::endl;

    httplib::Server svr;

    svr.Post("/api/sensor", [](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Content-Type", "application/json");
        res.set_header("Access-Control-Allow-Origin", "*");
        try {
            json body = json::parse(req.body);
            g_udp_receiver->pushHttpSensor(body);

            SimulationParameters params = AppConfig::instance().buildSimulationParams(
                body.value("magnitude", 5.0),
                body.value("distance", 100.0),
                body.value("site_soil", std::string(""))
            );
            SimulationResult sim_result = g_seismic_simulator->runSimulation(params);

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
        res.set_header("Access-Control-Allow-Origin", "*");
        try {
            std::string device_id = req.has_param("device_id") ? req.get_param_value("device_id") : "DDY-001";
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
        res.set_header("Access-Control-Allow-Origin", "*");
        try {
            json body = json::parse(req.body);
            SimulationParameters params = parseSimulationParams(body);
            SimulationResult result = g_seismic_simulator->runSimulation(params);

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
        res.set_header("Access-Control-Allow-Origin", "*");
        try {
            json body = json::parse(req.body);
            SensitivityParameters params = parseSensitivityParams(body);
            SensitivityResult result = g_sensitivity_module->runAnalysis(params);

            SensitivityResultMessage msg;
            msg.optimal_threshold = result.optimal_threshold;
            msg.youden_j = result.youden_j;
            for (const auto& cell : result.heatmap) {
                HeatmapCellMessage m;
                m.magnitude = cell.magnitude;
                m.distance = cell.distance;
                m.detection_probability = cell.detection_probability;
                m.false_alarm_rate = cell.false_alarm_rate;
                m.avg_trigger_time = cell.avg_trigger_time;
                msg.heatmap.push_back(m);
            }
            double area = 0;
            double avg_far = 0;
            int count = 0;
            for (const auto& cell : result.heatmap) {
                if (cell.detection_probability >= 0.5) {
                    double dM = 0.5;
                    double dD = 50;
                    area += dM * dD * 111 * 111 * std::cos(cell.magnitude * M_PI / 180);
                }
                avg_far += cell.false_alarm_rate;
                count++;
            }
            msg.detection_area_km2 = area;
            msg.avg_false_alarm_rate = count > 0 ? avg_far / count : 0;
            for (const auto& pt : result.roc_curve) {
                msg.roc_curve.push_back({pt.false_positive_rate, pt.true_positive_rate, pt.threshold});
            }

            json response;
            response["status"] = "ok";
            response["result"] = sensitivityResultToJson(msg);
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
        res.set_header("Access-Control-Allow-Origin", "*");
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
                auto time_t_val = std::chrono::system_clock::to_time_t(alert.timestamp);
                std::tm tm_val{};
#ifdef _WIN32
                gmtime_s(&tm_val, &time_t_val);
#else
                gmtime_r(&time_t_val, &time_t_val);
#endif
                std::ostringstream time_oss;
                time_oss << std::put_time(&tm_val, "%Y-%m-%dT%H:%M:%SZ");
                alert_list.push_back({
                    {"id", alert.id},
                    {"timestamp", time_oss.str()},
                    {"type", alert.type},
                    {"level", alert.level},
                    {"message", alert.message},
                    {"mqtt_delivered", alert.mqtt_delivered}
                });
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

    svr.Get("/api/status", [](const httplib::Request&, httplib::Response& res) {
        res.set_header("Content-Type", "application/json");
        res.set_header("Access-Control-Allow-Origin", "*");
        json j;
        j["status"] = "ok";
        j["udp_receiver"] = {
            {"running", g_udp_receiver->isRunning()},
            {"total_received", g_udp_receiver->totalReceived()},
            {"total_validated", g_udp_receiver->totalValidated()},
            {"total_dropped", g_udp_receiver->totalDropped()}
        };
        j["seismic_simulator"] = {
            {"running", g_seismic_simulator->isRunning()},
            {"processed_sensors", g_seismic_simulator->processedSensorCount()},
            {"simulation_count", g_seismic_simulator->simulationCount()}
        };
        j["alarm_module"] = {
            {"running", g_alarm_module->isRunning()},
            {"alert_count", g_alarm_module->alertCount()},
            {"mqtt_delivered", g_alarm_module->mqttDeliveredCount()}
        };
        j["sensitivity_module"] = {
            {"running", g_sensitivity_module->isRunning()},
            {"analysis_count", g_sensitivity_module->analysisCount()}
        };
        j["clickhouse"] = {
            {"connected", g_clickhouse && g_clickhouse->isConnected()}
        };
        j["mqtt"] = {
            {"connected", g_mqtt && g_mqtt->isConnected()}
        };
        res.set_content(j.dump(), "application/json");
    });

    svr.setwebsocket_handler([](std::shared_ptr<httplib::WebSocket> ws) {
        std::cout << "WebSocket client connected" << std::endl;
        ws->send("connected to didongyi realtime feed");

        uint64_t lastSeq = 0;
        while (ws->is_open() && g_running) {
            AlertMessage alertMsg;
            while (g_alert_queue->pop(alertMsg)) {
                if (alertMsg.sequence > lastSeq) {
                    ws->send(alertMsg.toJson());
                    lastSeq = alertMsg.sequence;
                }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        std::cout << "WebSocket client disconnected" << std::endl;
    });

    std::cout << "✓ HTTP server starting on port 8080" << std::endl;
    std::cout << "  UDP listener: " << cfg.udp_listen_host << ":" << cfg.udp_listen_port << std::endl;
    std::cout << "  Press Ctrl+C to stop" << std::endl;
    std::cout << "============================================" << std::endl;

    svr.listen("0.0.0.0", 8080);

    g_running = false;

    g_udp_receiver->stop();
    g_seismic_simulator->stop();
    g_sensitivity_module->stop();
    g_alarm_module->stop();

    if (chWriter.joinable()) chWriter.join();
    if (monitor.joinable()) monitor.join();

    if (g_mqtt) g_mqtt->disconnect();
    if (g_clickhouse) g_clickhouse->disconnect();

    std::cout << "✓ All modules stopped cleanly" << std::endl;
    return 0;
}
