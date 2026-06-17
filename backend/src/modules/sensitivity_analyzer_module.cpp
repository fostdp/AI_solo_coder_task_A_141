#include "modules/sensitivity_analyzer_module.h"
#include "common/app_config.h"

SensitivityAnalyzerModule::SensitivityAnalyzerModule(
    SensitivityRequestQueue& requestQueue,
    SensitivityResultQueue& resultQueue)
    : request_queue_(requestQueue), result_queue_(resultQueue) {}

SensitivityAnalyzerModule::~SensitivityAnalyzerModule() {
    stop();
}

void SensitivityAnalyzerModule::start() {
    if (running_.exchange(true)) return;
    if (!analyzer_) {
        analyzer_ = std::make_shared<SensitivityAnalyzer>();
    }
    thread_ = std::thread(&SensitivityAnalyzerModule::run, this);
}

void SensitivityAnalyzerModule::stop() {
    if (!running_.exchange(false)) return;
    if (thread_.joinable()) thread_.join();
}

void SensitivityAnalyzerModule::setAnalyzer(std::shared_ptr<SensitivityAnalyzer> analyzer) {
    analyzer_ = std::move(analyzer);
}

void SensitivityAnalyzerModule::submitRequest(SensitivityRequestMessage&& req) {
    request_queue_.push(std::move(req));
}

SensitivityResult SensitivityAnalyzerModule::runAnalysis(const SensitivityParameters& params) {
    analysis_count_++;
    return analyzer_->analyze(params);
}

SensitivityResultMessage SensitivityAnalyzerModule::buildResultMessage(
    const std::string& requestId, const SensitivityResult& result) {
    SensitivityResultMessage msg;
    msg.type = MessageType::SENSITIVITY_RESULT;
    msg.sequence = sequence_++;
    msg.request_id = requestId;
    msg.optimal_threshold = result.optimal_threshold;
    msg.youden_j = result.youden_j;

    double area = 0;
    double avg_far = 0;
    int count = 0;

    for (const auto& cell : result.heatmap) {
        HeatmapCellMessage m;
        m.magnitude = cell.magnitude;
        m.distance = cell.distance;
        m.detection_probability = cell.detection_probability;
        m.false_alarm_rate = cell.false_alarm_rate;
        m.avg_trigger_time = cell.avg_trigger_time;
        msg.heatmap.push_back(m);

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

    return msg;
}

void SensitivityAnalyzerModule::run() {
    std::cout << "Sensitivity analyzer thread started" << std::endl;
    while (running_) {
        SensitivityRequestMessage req;
        while (request_queue_.pop(req)) {
            try {
                SensitivityParameters params = AppConfig::instance().buildSensitivityParams(req.site_soil);
                params.magnitude_min = req.magnitude_min;
                params.magnitude_max = req.magnitude_max;
                params.magnitude_steps = req.magnitude_steps;
                params.distance_min = req.distance_min;
                params.distance_max = req.distance_max;
                params.distance_steps = req.distance_steps;

                SensitivityResult result = runAnalysis(params);
                SensitivityResultMessage msg = buildResultMessage(req.request_id, result);
                result_queue_.push(std::move(msg));
            } catch (const std::exception& e) {
                std::cerr << "SensitivityAnalyzerModule error: " << e.what() << std::endl;
            }
        }
        std::this_thread::sleep_for(poll_interval_);
    }
    std::cout << "Sensitivity analyzer thread stopped. Processed "
              << analysis_count_.load() << " analyses" << std::endl;
}
