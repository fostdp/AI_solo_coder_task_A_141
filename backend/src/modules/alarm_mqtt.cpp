#include "modules/alarm_mqtt.h"
#include "common/app_config.h"
#include <sstream>
#include <iomanip>
#include <cmath>

AlarmMqttModule::AlarmMqttModule(
    SimulationResultQueue& simResultQueue,
    AlertQueue& alertQueue,
    AlertQueue& clickhouseQueue)
    : sim_result_queue_(simResultQueue),
      alert_queue_(alertQueue),
      clickhouse_queue_(clickhouseQueue) {}

AlarmMqttModule::~AlarmMqttModule() {
    stop();
}

void AlarmMqttModule::start() {
    if (running_.exchange(true)) return;
    thread_ = std::thread(&AlarmMqttModule::run, this);
}

void AlarmMqttModule::stop() {
    if (!running_.exchange(false)) return;
    if (thread_.joinable()) thread_.join();
}

void AlarmMqttModule::setMqttClient(std::shared_ptr<MqttClient> mqtt) {
    mqtt_ = std::move(mqtt);
}

std::string AlarmMqttModule::generateAlertId() {
    alert_counter_++;
    auto now = std::chrono::system_clock::now();
    auto secs = std::chrono::duration_cast<std::chrono::seconds>(
        now.time_since_epoch()).count();
    std::ostringstream oss;
    oss << "ALT-" << secs << "-" << alert_counter_.load();
    return oss.str();
}

AlertMessage AlarmMqttModule::buildMisfireAlert(
    const SimulationResultMessage& simMsg, double accelMagnitude) {
    const auto& cfg = AppConfig::instance().seismic();
    AlertMessage alert;
    alert.id = generateAlertId();
    alert.timestamp = std::chrono::system_clock::now();
    alert.alert_type = "misfire";
    alert.level = "warning";
    alert.device_id = simMsg.device_id;

    std::ostringstream msg;
    msg << "Misfire detected: dragon " << simMsg.dragon_index
        << " triggered but wave acceleration ("
        << std::fixed << std::setprecision(3) << accelMagnitude
        << " m/s^2) is below threshold " << cfg.misfire_accel_threshold;
    alert.message = msg.str();
    alert.mqtt_delivered = false;
    return alert;
}

AlertMessage AlarmMqttModule::buildSensitivityDropAlert(double currentRate) {
    const auto& cfg = AppConfig::instance().seismic();
    AlertMessage alert;
    alert.id = generateAlertId();
    alert.timestamp = std::chrono::system_clock::now();
    alert.alert_type = "sensitivity_drop";
    alert.level = "critical";
    alert.device_id = "DDY-001";

    std::ostringstream msg;
    msg << "Sensitivity drop detected: recent detection rate ("
        << std::fixed << std::setprecision(2) << currentRate
        << ") is below threshold (" << cfg.sensitivity_drop_threshold << ")";
    alert.message = msg.str();
    alert.mqtt_delivered = false;
    return alert;
}

void AlarmMqttModule::processSimulationResult(SimulationResultMessage&& simMsg) {
    const auto& cfg = AppConfig::instance().seismic();
    double accel_magnitude = simMsg.peak_acceleration;

    std::vector<AlertMessage> alerts;

    if (simMsg.triggered && accel_magnitude < cfg.misfire_accel_threshold) {
        alerts.push_back(buildMisfireAlert(simMsg, accel_magnitude));
    }

    int detection_value = (simMsg.triggered && accel_magnitude >= cfg.misfire_accel_threshold) ? 1 : 0;
    double detection_rate = 0;
    {
        std::lock_guard<std::mutex> lock(window_mutex_);
        detection_window_.push_back(detection_value);
        while (detection_window_.size() > cfg.detection_window_size) {
            detection_window_.pop_front();
        }
        if (detection_window_.size() >= cfg.min_window_samples) {
            double sum = 0;
            for (int v : detection_window_) sum += v;
            detection_rate = sum / static_cast<double>(detection_window_.size());
        }
    }

    if (detection_rate > 0 && detection_rate < cfg.sensitivity_drop_threshold) {
        alerts.push_back(buildSensitivityDropAlert(detection_rate));
    }

    for (auto& alert : alerts) {
        alert.sequence = sequence_++;
        alert_count_++;

        if (mqtt_ && mqtt_->isConnected()) {
            nlohmann::json payload;
            payload["id"] = alert.id;
            payload["timestamp"] = alert.toJson();
            payload["type"] = alert.alert_type;
            payload["level"] = alert.level;
            payload["message"] = alert.message;
            payload["device_id"] = alert.device_id;

            if (mqtt_->publish(cfg.mqtt_topic, payload.dump())) {
                alert.mqtt_delivered = true;
                mqtt_delivered_count_++;
            }
        }

        alert_queue_.push(AlertMessage(alert));
        clickhouse_queue_.push(AlertMessage(alert));
    }
}

void AlarmMqttModule::run() {
    std::cout << "Alarm/MQTT module thread started" << std::endl;
    while (running_) {
        SimulationResultMessage msg;
        while (sim_result_queue_.pop(msg)) {
            try {
                processSimulationResult(std::move(msg));
            } catch (const std::exception& e) {
                std::cerr << "AlarmMqttModule error: " << e.what() << std::endl;
            }
        }
        std::this_thread::sleep_for(poll_interval_);
    }
    std::cout << "Alarm/MQTT module thread stopped. Generated "
              << alert_count_.load() << " alerts, "
              << mqtt_delivered_count_.load() << " delivered via MQTT" << std::endl;
}
