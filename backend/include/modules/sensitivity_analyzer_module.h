#pragma once

#include <atomic>
#include <thread>
#include <memory>
#include <chrono>
#include <vector>
#include <array>
#include "common/messages.h"
#include "sensitivity_analyzer.h"

class SensitivityAnalyzerModule {
public:
    explicit SensitivityAnalyzerModule(
        SensitivityRequestQueue& requestQueue,
        SensitivityResultQueue& resultQueue);
    ~SensitivityAnalyzerModule();

    void start();
    void stop();
    bool isRunning() const { return running_; }

    SensitivityResult runAnalysis(const SensitivityParameters& params);

    uint64_t analysisCount() const { return analysis_count_; }

    void setAnalyzer(std::shared_ptr<SensitivityAnalyzer> analyzer);

    void submitRequest(SensitivityRequestMessage&& req);

private:
    void run();
    SensitivityResultMessage buildResultMessage(
        const std::string& requestId, const SensitivityResult& result);

    SensitivityRequestQueue& request_queue_;
    SensitivityResultQueue& result_queue_;
    std::atomic<bool> running_{false};
    std::thread thread_;
    std::atomic<uint64_t> analysis_count_{0};
    std::atomic<uint64_t> sequence_{0};
    std::shared_ptr<SensitivityAnalyzer> analyzer_;
    std::chrono::milliseconds poll_interval_{10};
};
