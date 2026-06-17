#include "sensitivity_analyzer.h"
#include "simulation_engine.h"
#include <cmath>
#include <random>
#include <algorithm>

double SensitivityAnalyzer::computeDetectionProbability(double magnitude, double distance,
                                                         const SensitivityParameters& params) {
    std::mt19937 rng(static_cast<unsigned>(magnitude * 1000 + distance));
    std::normal_distribution<double> noise_dist(0.0, 0.1);

    int correct_detections = 0;

    for (int trial = 0; trial < params.monte_carlo_trials; ++trial) {
        SimulationParameters sim_params;
        sim_params.pillar_mass = params.pillar_mass;
        sim_params.pillar_height = params.pillar_height;
        sim_params.damping_ratio = params.damping_ratio;
        sim_params.magnitude = magnitude + noise_dist(rng) * 0.1;
        sim_params.distance = std::max(0.1, distance + noise_dist(rng) * distance * 0.05);
        sim_params.frequency = params.frequency + noise_dist(rng) * 0.1;
        sim_params.decay_alpha = params.decay_alpha;
        sim_params.duration = params.duration;
        sim_params.dt = params.dt;
        sim_params.trigger_angle_threshold = 5.0;
        sim_params.site_soil = params.site_soil;

        SimulationEngine engine;
        SimulationResult result = engine.runSimulation(sim_params);

        if (result.triggered) {
            correct_detections++;
        }
    }

    return static_cast<double>(correct_detections) / static_cast<double>(params.monte_carlo_trials);
}

double SensitivityAnalyzer::computeFalseAlarmRate(double magnitude, double distance,
                                                   const SensitivityParameters& params) {
    std::mt19937 rng(static_cast<unsigned>(magnitude * 2000 + distance + 999));
    std::normal_distribution<double> noise_dist(0.0, 0.2);

    int false_alarms = 0;

    for (int trial = 0; trial < params.monte_carlo_trials; ++trial) {
        SimulationParameters sim_params;
        sim_params.pillar_mass = params.pillar_mass;
        sim_params.pillar_height = params.pillar_height;
        sim_params.damping_ratio = params.damping_ratio;
        sim_params.magnitude = 0.0;
        sim_params.distance = distance;
        sim_params.frequency = params.frequency;
        sim_params.decay_alpha = params.decay_alpha;
        sim_params.duration = params.duration;
        sim_params.dt = params.dt;
        sim_params.trigger_angle_threshold = 5.0;
        sim_params.site_soil = params.site_soil;

        double noise_ax = noise_dist(rng) * 0.01;
        double noise_ay = noise_dist(rng) * 0.01;

        SimulationEngine engine;
        SimulationResult result = engine.runSimulation(sim_params);

        double max_angle_from_noise = std::sqrt(noise_ax * noise_ax + noise_ay * noise_ay) * 180.0 / M_PI;
        if (result.max_angle > 5.0 || max_angle_from_noise > 5.0) {
            false_alarms++;
        }
    }

    return static_cast<double>(false_alarms) / static_cast<double>(params.monte_carlo_trials);
}

std::vector<ROCPoint> SensitivityAnalyzer::computeROCCurve(const std::vector<HeatmapCell>& heatmap) {
    std::vector<ROCPoint> roc;
    int num_thresholds = 50;

    for (int i = 0; i <= num_thresholds; ++i) {
        double threshold = static_cast<double>(i) / static_cast<double>(num_thresholds) * 15.0;

        double tp = 0.0;
        double fp = 0.0;
        double total_positive = 0.0;
        double total_negative = 0.0;

        for (const auto& cell : heatmap) {
            if (cell.detection_probability >= 0.5) {
                total_positive += 1.0;
                double angle_needed = 5.0 * (1.0 - cell.detection_probability * 0.5);
                if (threshold >= angle_needed) {
                    tp += 1.0;
                }
            } else {
                total_negative += 1.0;
                if (threshold <= 5.0 && cell.false_alarm_rate > 0.0) {
                    fp += cell.false_alarm_rate;
                }
            }
        }

        ROCPoint point;
        point.threshold = threshold;
        point.true_positive_rate = (total_positive > 0) ? tp / total_positive : 0.0;
        point.false_positive_rate = (total_negative > 0) ? fp / total_negative : 0.0;
        roc.push_back(point);
    }

    return roc;
}

double SensitivityAnalyzer::findOptimalThreshold(const std::vector<ROCPoint>& roc_curve, double& youden_j) {
    double best_j = -1.0;
    double best_threshold = 5.0;

    for (const auto& point : roc_curve) {
        double j = point.true_positive_rate - point.false_positive_rate;
        if (j > best_j) {
            best_j = j;
            best_threshold = point.threshold;
        }
    }

    youden_j = best_j;
    return best_threshold;
}

SensitivityResult SensitivityAnalyzer::analyze(const SensitivityParameters& params) {
    SensitivityResult result;

    double mag_step = (params.magnitude_max - params.magnitude_min) / std::max(params.magnitude_steps - 1, 1);
    double dist_step = (params.distance_max - params.distance_min) / std::max(params.distance_steps - 1, 1);

    for (int mi = 0; mi < params.magnitude_steps; ++mi) {
        for (int di = 0; di < params.distance_steps; ++di) {
            double magnitude = params.magnitude_min + mi * mag_step;
            double distance = params.distance_min + di * dist_step;

            HeatmapCell cell;
            cell.magnitude = magnitude;
            cell.distance = distance;
            cell.detection_probability = computeDetectionProbability(magnitude, distance, params);
            cell.false_alarm_rate = computeFalseAlarmRate(magnitude, distance, params);

            result.heatmap.push_back(cell);
        }
    }

    result.roc_curve = computeROCCurve(result.heatmap);
    result.optimal_threshold = findOptimalThreshold(result.roc_curve, result.youden_j);

    return result;
}
