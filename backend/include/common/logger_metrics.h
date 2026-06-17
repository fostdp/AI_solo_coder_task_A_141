#pragma once

#include <string>
#include <memory>
#include <atomic>
#include <mutex>
#include <unordered_map>
#include <chrono>
#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/basic_file_sink.h>
#include <prometheus/registry.h>
#include <prometheus/counter.h>
#include <prometheus/gauge.h>
#include <prometheus/histogram.h>
#include <prometheus/exposer.h>

namespace didongyi {

class Logger {
public:
    static Logger& instance();

    void init(const std::string& logFile = "", spdlog::level::level_enum level = spdlog::level::info);

    std::shared_ptr<spdlog::logger> logger() { return logger_; }

    template<typename... Args>
    void info(spdlog::format_string_t<Args...> fmt, Args&&... args) {
        if (logger_) logger_->info(fmt, std::forward<Args>(args)...);
    }

    template<typename... Args>
    void warn(spdlog::format_string_t<Args...> fmt, Args&&... args) {
        if (logger_) logger_->warn(fmt, std::forward<Args>(args)...);
    }

    template<typename... Args>
    void error(spdlog::format_string_t<Args...> fmt, Args&&... args) {
        if (logger_) logger_->error(fmt, std::forward<Args>(args)...);
    }

    template<typename... Args>
    void debug(spdlog::format_string_t<Args...> fmt, Args&&... args) {
        if (logger_) logger_->debug(fmt, std::forward<Args>(args)...);
    }

    template<typename... Args>
    void critical(spdlog::format_string_t<Args...> fmt, Args&&... args) {
        if (logger_) logger_->critical(fmt, std::forward<Args>(args)...);
    }

private:
    Logger() = default;
    std::shared_ptr<spdlog::logger> logger_;
    std::mutex mutex_;
};

inline Logger& Log() { return Logger::instance(); }

class Metrics {
public:
    static Metrics& instance();

    void init(const std::string& bindAddress = "0.0.0.0:9090");

    prometheus::Counter& counter(const std::string& name,
                                 const std::string& help,
                                 const prometheus::Labels& labels = {});

    prometheus::Gauge& gauge(const std::string& name,
                             const std::string& help,
                             const prometheus::Labels& labels = {});

    prometheus::Histogram& histogram(const std::string& name,
                                     const std::string& help,
                                     const prometheus::Histogram::BucketBoundaries& buckets,
                                     const prometheus::Labels& labels = {});

    void incrementCounter(const std::string& name, double value = 1.0);
    void setGauge(const std::string& name, double value);
    void observeHistogram(const std::string& name, double value);

    std::shared_ptr<prometheus::Registry> registry() { return registry_; }

private:
    Metrics() = default;
    std::shared_ptr<prometheus::Registry> registry_;
    std::unique_ptr<prometheus::Exposer> exposer_;
    std::unordered_map<std::string, prometheus::Counter*> counters_;
    std::unordered_map<std::string, prometheus::Gauge*> gauges_;
    std::unordered_map<std::string, prometheus::Histogram*> histograms_;
    std::mutex mutex_;
};

class ScopedTimer {
public:
    explicit ScopedTimer(prometheus::Histogram& h) : hist_(h), start_(std::chrono::high_resolution_clock::now()) {}
    ~ScopedTimer() {
        auto elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::high_resolution_clock::now() - start_).count();
        hist_.Observe(elapsed);
    }

private:
    prometheus::Histogram& hist_;
    std::chrono::high_resolution_clock::time_point start_;
};

}

#define LOG_INFO(...)   didongyi::Log().info(__VA_ARGS__)
#define LOG_WARN(...)   didongyi::Log().warn(__VA_ARGS__)
#define LOG_ERROR(...)  didongyi::Log().error(__VA_ARGS__)
#define LOG_DEBUG(...)  didongyi::Log().debug(__VA_ARGS__)
#define LOG_CRITICAL(...) didongyi::Log().critical(__VA_ARGS__)

#define METRIC_INC(name, ...) didongyi::Metrics::instance().incrementCounter(name, ##__VA_ARGS__)
#define METRIC_SET(name, v)   didongyi::Metrics::instance().setGauge(name, v)
#define METRIC_OBSERVE(name, v) didongyi::Metrics::instance().observeHistogram(name, v)
