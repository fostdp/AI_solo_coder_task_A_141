#include "simulation_engine.h"
#include <cmath>
#include <algorithm>

double SimulationEngine::computePeakAcceleration(double magnitude, double distance) {
    double A = std::pow(10.0, magnitude / 2.0 - 1.0) / std::sqrt(std::max(distance, 0.1));
    return A;
}

double SimulationEngine::seismicAcceleration(double t, double amplitude, double frequency, double alpha) {
    return amplitude * std::sin(2.0 * M_PI * frequency * t) * std::exp(-alpha * t);
}

void SimulationEngine::derivatives(const StateVector& state, double t,
                                    double m, double L, double c, double k,
                                    double A, double f, double alpha,
                                    double& dtheta_x, double& dtheta_y,
                                    double& domega_x, double& domega_y) {
    dtheta_x = state.omega_x;
    dtheta_y = state.omega_y;

    double a_t = seismicAcceleration(t, A, f, alpha);
    double angle = std::sqrt(state.theta_x * state.theta_x + state.theta_y * state.theta_y);
    double dir_x = (angle > 1e-12) ? state.theta_x / angle : 1.0;
    double dir_y = (angle > 1e-12) ? state.theta_y / angle : 0.0;

    domega_x = (m * a_t * dir_x - c * state.omega_x - k * state.theta_x) / (m * L);
    domega_y = (m * a_t * dir_y - c * state.omega_y - k * state.theta_y) / (m * L);
}

SimulationEngine::StateVector SimulationEngine::rk4Step(const StateVector& state, double t, double dt,
                                                         double m, double L, double c, double k,
                                                         double A, double f, double alpha) {
    auto deriv = [&](const StateVector& s, double time) -> StateVector {
        StateVector ds;
        derivatives(s, time, m, L, c, k, A, f, alpha,
                    ds.theta_x, ds.theta_y, ds.omega_x, ds.omega_y);
        return ds;
    };

    StateVector k1 = deriv(state, t);

    StateVector s2;
    s2.theta_x = state.theta_x + 0.5 * dt * k1.theta_x;
    s2.theta_y = state.theta_y + 0.5 * dt * k1.theta_y;
    s2.omega_x = state.omega_x + 0.5 * dt * k1.omega_x;
    s2.omega_y = state.omega_y + 0.5 * dt * k1.omega_y;
    StateVector k2 = deriv(s2, t + 0.5 * dt);

    StateVector s3;
    s3.theta_x = state.theta_x + 0.5 * dt * k2.theta_x;
    s3.theta_y = state.theta_y + 0.5 * dt * k2.theta_y;
    s3.omega_x = state.omega_x + 0.5 * dt * k2.omega_x;
    s3.omega_y = state.omega_y + 0.5 * dt * k2.omega_y;
    StateVector k3 = deriv(s3, t + 0.5 * dt);

    StateVector s4;
    s4.theta_x = state.theta_x + dt * k3.theta_x;
    s4.theta_y = state.theta_y + dt * k3.theta_y;
    s4.omega_x = state.omega_x + dt * k3.omega_x;
    s4.omega_y = state.omega_y + dt * k3.omega_y;
    StateVector k4 = deriv(s4, t + dt);

    StateVector next;
    next.theta_x = state.theta_x + (dt / 6.0) * (k1.theta_x + 2.0 * k2.theta_x + 2.0 * k3.theta_x + k4.theta_x);
    next.theta_y = state.theta_y + (dt / 6.0) * (k1.theta_y + 2.0 * k2.theta_y + 2.0 * k3.theta_y + k4.theta_y);
    next.omega_x = state.omega_x + (dt / 6.0) * (k1.omega_x + 2.0 * k2.omega_x + 2.0 * k3.omega_x + k4.omega_x);
    next.omega_y = state.omega_y + (dt / 6.0) * (k1.omega_y + 2.0 * k2.omega_y + 2.0 * k3.omega_y + k4.omega_y);

    return next;
}

int SimulationEngine::determineDragonDirection(double theta_x, double theta_y) {
    double angle_rad = std::atan2(theta_y, theta_x);
    if (angle_rad < 0) angle_rad += 2.0 * M_PI;

    double angle_deg = angle_rad * 180.0 / M_PI;

    int index = static_cast<int>(std::round(angle_deg / 45.0)) % 8;
    return index;
}

std::string SimulationEngine::dragonDirectionName(int index) {
    static const std::array<std::string, 8> names = {"E", "NE", "N", "NW", "W", "SW", "S", "SE"};
    if (index >= 0 && index < 8) return names[index];
    return "UNKNOWN";
}

SimulationResult SimulationEngine::runSimulation(const SimulationParameters& params) {
    SimulationResult result;
    result.triggered = false;
    result.dragon_heads = {};

    double m = params.pillar_mass;
    double L = params.pillar_height;
    double c = 2.0 * params.damping_ratio * std::sqrt(m * 9.81 / L) * m * L;
    double k = m * 9.81 / L;

    double A = computePeakAcceleration(params.magnitude, params.distance);

    StateVector state{};
    state.theta_x = 0.0;
    state.theta_y = 0.0;
    state.omega_x = 0.0;
    state.omega_y = 0.0;

    double t = 0.0;
    int steps = static_cast<int>(params.duration / params.dt);
    int sample_interval = std::max(1, steps / 1000);

    for (int i = 0; i < steps; ++i) {
        state = rk4Step(state, t, params.dt, m, L, c, k, A, params.frequency, params.decay_alpha);
        t += params.dt;

        double angle_deg = std::sqrt(state.theta_x * state.theta_x + state.theta_y * state.theta_y) * 180.0 / M_PI;

        if (angle_deg > result.max_angle) {
            result.max_angle = angle_deg;
        }

        double a_current = std::abs(seismicAcceleration(t, A, params.frequency, params.decay_alpha));
        if (a_current > result.peak_acceleration) {
            result.peak_acceleration = a_current;
        }

        if (!result.triggered && angle_deg > params.trigger_angle_threshold) {
            result.triggered = true;
            result.trigger.dragon_index = determineDragonDirection(state.theta_x, state.theta_y);
            result.trigger.direction = dragonDirectionName(result.trigger.dragon_index);
            result.trigger.trigger_time = t;
            result.trigger.angle_at_trigger = angle_deg;
        }

        if (angle_deg > params.trigger_angle_threshold) {
            int dragon = determineDragonDirection(state.theta_x, state.theta_y);
            if (dragon >= 0 && dragon < 8) {
                result.dragon_heads[dragon] = true;
            }
        }

        if (i % sample_interval == 0) {
            PillarState ps;
            ps.theta_x = state.theta_x;
            ps.theta_y = state.theta_y;
            ps.omega_x = state.omega_x;
            ps.omega_y = state.omega_y;
            ps.time = t;
            result.trajectory.push_back(ps);
        }
    }

    return result;
}
