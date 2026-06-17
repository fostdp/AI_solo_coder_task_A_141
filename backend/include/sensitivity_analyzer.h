#pragma once

#include <vector>
#include <string>
#include "simulation_engine.h"

struct SensitivityParameters {
    double magnitude_min = 1.0;
    double magnitude_max = 9.0;
    int magnitude_steps = 20;
    double distance_min = 1.0;
    double distance_max = 1000.0;
    int distance_steps = 20;
    double pillar_mass = 500.0;
    double pillar_height = 2.0;
    double damping_ratio = 0.05;
    int monte_carlo_trials = 30;
    double frequency = 1.0;
    double decay_alpha = 0.5;
    double duration = 30.0;
    double dt = 0.001;
    SiteSoilType site_soil = SiteSoilType::II;
};

struct HeatmapCell {
    double magnitude;
    double distance;
    double detection_probability;
    double false_alarm_rate;
};

struct ROCPoint {
    double false_positive_rate;
    double true_positive_rate;
    double threshold;
};

struct SensitivityResult {
    std::vector<HeatmapCell> heatmap;
    std::vector<ROCPoint> roc_curve;
    double optimal_threshold;
    double youden_j;
};

class SensitivityAnalyzer {
public:
    SensitivityAnalyzer() = default;

    SensitivityResult analyze(const SensitivityParameters& params);

private:
    double computeDetectionProbability(double magnitude, double distance,
                                       const SensitivityParameters& params);
    double computeFalseAlarmRate(double magnitude, double distance,
                                 const SensitivityParameters& params);
    std::vector<ROCPoint> computeROCCurve(const std::vector<HeatmapCell>& heatmap);
    double findOptimalThreshold(const std::vector<ROCPoint>& roc_curve, double& youden_j);
};
