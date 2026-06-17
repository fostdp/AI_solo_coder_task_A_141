#include "common/logger_metrics.h"

namespace didongyi {

Logger& Logger::instance() {
    static Logger inst;
    return inst;
}

void Logger::init(const std::string& logFile, spdlog::level::level_enum level) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (logger_) return;

    try {
        std::vector<spdlog::sink_ptr> sinks;
        sinks.push_back(std::make_shared<spdlog::sinks::stdout_color_sink_mt>());

        if (!logFile.empty()) {
            sinks.push_back(std::make_shared<spdlog::sinks::basic_file_sink_mt>(logFile, true));
        }

        logger_ = std::make_shared<spdlog::logger>("didongyi", sinks.begin(), sinks.end());
        logger_->set_level(level);
        logger_->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] [%t] %v");
        logger_->flush_on(spdlog::level::warn);
        spdlog::set_default_logger(logger_);
    } catch (const std::exception& e) {
        std::cerr << "Failed to init logger: " << e.what() << std::endl;
    }
}

Metrics& Metrics::instance() {
    static Metrics inst;
    return inst;
}

void Metrics::init(const std::string& bindAddress) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (registry_) return;

    registry_ = std::make_shared<prometheus::Registry>();
    try {
        exposer_ = std::make_unique<prometheus::Exposer>(bindAddress);
        exposer_->RegisterCollectable(registry_);
    } catch (const std::exception& e) {
        std::cerr << "Failed to init Prometheus exposer on " << bindAddress
                  << ": " << e.what() << ". Metrics endpoint disabled." << std::endl;
    }

    counter("udp_packets_received", "Total UDP packets received");
    counter("udp_packets_validated", "Total validated UDP packets");
    counter("udp_packets_dropped", "Total dropped UDP packets");
    counter("simulations_run", "Total simulations run");
    counter("sensors_processed", "Total sensor messages processed");
    counter("alerts_generated", "Total alerts generated");
    counter("alerts_mqtt_delivered", "Total alerts delivered via MQTT");
    counter("sensitivity_analyses", "Total sensitivity analyses run");
    counter("clickhouse_writes", "Total ClickHouse writes");
    counter("clickhouse_write_errors", "Total ClickHouse write errors");
    counter("mqtt_publishes", "Total MQTT publishes");
    counter("mqtt_errors", "Total MQTT errors");
    counter("http_requests_total", "Total HTTP requests", {{"method", "GET"}});
    counter("http_requests_total", "Total HTTP requests", {{"method", "POST"}});

    gauge("uptime_seconds", "Service uptime in seconds");
    gauge("sensor_queue_size", "Current sensor queue size estimate");
    gauge("simulator_active_threads", "Active simulator threads");
    gauge("clickhouse_connected", "ClickHouse connection status (1=connected)");
    gauge("mqtt_connected", "MQTT broker connection status (1=connected)");

    histogram("simulation_latency_ms", "Simulation latency in milliseconds",
        {1.0, 5.0, 10.0, 50.0, 100.0, 500.0, 1000.0, 5000.0});
    histogram("sensitivity_analysis_latency_s", "Sensitivity analysis latency in seconds",
        {1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0});
    histogram("udp_processing_latency_us", "UDP packet processing latency in microseconds",
        {10.0, 50.0, 100.0, 500.0, 1000.0, 5000.0});
    histogram("clickhouse_write_latency_ms", "ClickHouse write latency in milliseconds",
        {1.0, 5.0, 10.0, 50.0, 100.0, 500.0});
}

prometheus::Counter& Metrics::counter(const std::string& name, const std::string& help,
                                        const prometheus::Labels& labels) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string key = name;
    for (const auto& [k, v] : labels) key += "|" + k + "=" + v;
    if (counters_.count(key)) return *counters_[key];
    auto& family = prometheus::BuildCounter()
        .Name(name).Help(help).Register(*registry_);
    auto& counter = labels.empty() ? family.Add({}) : family.Add(labels);
    counters_[key] = &counter;
    return counter;
}

prometheus::Gauge& Metrics::gauge(const std::string& name, const std::string& help,
                                    const prometheus::Labels& labels) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string key = name;
    for (const auto& [k, v] : labels) key += "|" + k + "=" + v;
    if (gauges_.count(key)) return *gauges_[key];
    auto& family = prometheus::BuildGauge()
        .Name(name).Help(help).Register(*registry_);
    auto& g = labels.empty() ? family.Add({}) : family.Add(labels);
    gauges_[key] = &g;
    return g;
}

prometheus::Histogram& Metrics::histogram(const std::string& name, const std::string& help,
                                           const prometheus::Histogram::BucketBoundaries& buckets,
                                           const prometheus::Labels& labels) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string key = name;
    for (const auto& [k, v] : labels) key += "|" + k + "=" + v;
    if (histograms_.count(key)) return *histograms_[key];
    auto& family = prometheus::BuildHistogram()
        .Name(name).Help(help).Register(*registry_);
    auto& h = labels.empty() ? family.Add({}, buckets) : family.Add(labels, buckets);
    histograms_[key] = &h;
    return h;
}

void Metrics::incrementCounter(const std::string& name, double value) {
    try {
        counter(name, "").Increment(value);
    } catch (...) {}
}

void Metrics::setGauge(const std::string& name, double value) {
    try {
        gauge(name, "").Set(value);
    } catch (...) {}
}

void Metrics::observeHistogram(const std::string& name, double value) {
    try {
        histogram(name, "").Observe(value);
    } catch (...) {}
}

}
