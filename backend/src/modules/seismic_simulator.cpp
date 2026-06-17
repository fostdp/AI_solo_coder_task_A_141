#include "modules/seismic_simulator.h"
#include "common/app_config.h"

SeismicSimulator::SeismicSimulator(SensorQueue& sensorQueue,
                                   SimulationResultQueue& resultQueue,
                                   SimulationResultQueue& clickhouseQueue)
    : sensor_queue_(sensorQueue), result_queue_(resultQueue), clickhouse_queue_(clickhouseQueue) {}

SeismicSimulator::~SeismicSimulator() {
    stop();
}

void SeismicSimulator::start() {
    if (running_.exchange(true)) return;
    if (!engine_) {
        engine_ = std::make_shared<SimulationEngine>();
    }
    thread_ = std::thread(&SeismicSimulator::run, this);
}

void SeismicSimulator::stop() {
    if (!running_.exchange(false)) return;
    if (thread_.joinable()) thread_.join();
}

void SeismicSimulator::setSimulationEngine(std::shared_ptr<SimulationEngine> engine) {
    engine_ = std::move(engine);
}

SimulationResult SeismicSimulator::runSimulation(const SimulationParameters& params) {
    simulation_count_++;
    return engine_->runSimulation(params);
}

void SeismicSimulator::processSensorMessage(SensorMessage&& msg) {
    processed_sensor_count_++;

    const auto& cfg = AppConfig::instance().dynamics();
    SimulationParameters params = AppConfig::instance().buildSimulationParams(
        msg.magnitude, msg.distance, msg.site_soil);

    SimulationResult sim_result = engine_->runSimulation(params);

    SimulationResultMessage outMsg;
    outMsg.type = MessageType::SIMULATION_RESULT;
    outMsg.sequence = sequence_++;
    outMsg.device_id = msg.device_id;
    outMsg.timestamp = msg.timestamp;
    outMsg.triggered = sim_result.triggered;
    outMsg.dragon_index = sim_result.trigger.dragon_index;
    outMsg.direction = sim_result.trigger.direction;
    outMsg.trigger_time = sim_result.trigger.trigger_time;
    outMsg.max_angle = sim_result.max_angle;
    outMsg.peak_acceleration = sim_result.peak_acceleration;
    outMsg.magnitude = msg.magnitude;
    outMsg.distance = msg.distance;

    if (!sim_result.trajectory.empty()) {
        const auto& last = sim_result.trajectory.back();
        outMsg.displacement_x = last.theta_x;
        outMsg.displacement_y = last.theta_y;
        outMsg.contact_force_x = last.contact_force_x;
        outMsg.contact_force_y = last.contact_force_y;
    }

    for (int i = 0; i < 8; i++) {
        outMsg.dragon_heads[i] = sim_result.dragon_heads[i];
    }

    for (const auto& ps : sim_result.trajectory) {
        outMsg.trajectory_x.push_back(ps.theta_x);
        outMsg.trajectory_y.push_back(ps.theta_y);
    }

    result_queue_.push(std::move(outMsg));
    clickhouse_queue_.push(SimulationResultMessage(outMsg));
}

void SeismicSimulator::run() {
    std::cout << "Seismic simulator thread started" << std::endl;
    while (running_) {
        SensorMessage msg;
        while (sensor_queue_.pop(msg)) {
            try {
                processSensorMessage(std::move(msg));
            } catch (const std::exception& e) {
                std::cerr << "SeismicSimulator error: " << e.what() << std::endl;
            }
        }
        std::this_thread::sleep_for(poll_interval_);
    }
    std::cout << "Seismic simulator thread stopped. Processed "
              << processed_sensor_count_.load() << " sensors, "
              << simulation_count_.load() << " simulations" << std::endl;
}
