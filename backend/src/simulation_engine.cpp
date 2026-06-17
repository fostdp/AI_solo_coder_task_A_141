#include "simulation_engine.h"
#include <cmath>
#include <algorithm>

static double siteSoilAmplification(SiteSoilType soil) {
    switch (soil) {
        case SiteSoilType::I0: return 0.85;
        case SiteSoilType::I1: return 1.00;
        case SiteSoilType::II: return 1.25;
        case SiteSoilType::III: return 1.65;
        case SiteSoilType::IV: return 2.10;
    }
    return 1.0;
}

static double siteSoilFrequencyTuning(SiteSoilType soil) {
    switch (soil) {
        case SiteSoilType::I0: return 1.4;
        case SiteSoilType::I1: return 1.2;
        case SiteSoilType::II: return 1.0;
        case SiteSoilType::III: return 0.7;
        case SiteSoilType::IV: return 0.45;
    }
    return 1.0;
}

double SimulationEngine::computePeakAcceleration(double magnitude, double distance, SiteSoilType soil) {
    double A = std::pow(10.0, magnitude / 2.0 - 1.0) / std::sqrt(std::max(distance, 0.1));
    return A * siteSoilAmplification(soil);
}

double SimulationEngine::seismicAcceleration(double t, double amplitude, double frequency, double alpha) {
    return amplitude * std::sin(2.0 * M_PI * frequency * t) * std::exp(-alpha * t);
}

void SimulationEngine::computeContactForces(double theta_x, double theta_y,
                                             double omega_x, double omega_y,
                                             double limit_rad, double k_penalty,
                                             double c_penalty, double mu,
                                             double& Fc_x, double& Fc_y) {
    Fc_x = 0.0;
    Fc_y = 0.0;

    double angle = std::sqrt(theta_x * theta_x + theta_y * theta_y);
    if (angle < 1e-14) return;

    double dir_x = theta_x / angle;
    double dir_y = theta_y / angle;

    double penetration = angle - limit_rad;
    if (penetration <= 0) return;

    double normal_vel = omega_x * dir_x + omega_y * dir_y;
    double F_normal = k_penalty * penetration + c_penalty * std::max(0.0, normal_vel);

    Fc_x = -F_normal * dir_x;
    Fc_y = -F_normal * dir_y;

    double tan_vel_x = omega_x - normal_vel * dir_x;
    double tan_vel_y = omega_y - normal_vel * dir_y;
    double tan_speed = std::sqrt(tan_vel_x * tan_vel_x + tan_vel_y * tan_vel_y);

    if (tan_speed > 1e-12) {
        double F_friction = mu * F_normal;
        Fc_x -= F_friction * (tan_vel_x / tan_speed);
        Fc_y -= F_friction * (tan_vel_y / tan_speed);
    }
}

void SimulationEngine::derivatives(const StateVector& state, double t,
                                    double m, double L, double c, double k,
                                    double A, double f, double alpha,
                                    double limit_rad, double k_penalty,
                                    double c_penalty, double mu,
                                    double& dtheta_x, double& dtheta_y,
                                    double& domega_x, double& domega_y) {
    dtheta_x = state.omega_x;
    dtheta_y = state.omega_y;

    double a_t = seismicAcceleration(t, A, f, alpha);
    double angle = std::sqrt(state.theta_x * state.theta_x + state.theta_y * state.theta_y);
    double dir_x = (angle > 1e-12) ? state.theta_x / angle : 1.0;
    double dir_y = (angle > 1e-12) ? state.theta_y / angle : 0.0;

    double Fc_x, Fc_y;
    computeContactForces(state.theta_x, state.theta_y,
                         state.omega_x, state.omega_y,
                         limit_rad, k_penalty, c_penalty, mu,
                         Fc_x, Fc_y);

    double I_eff = m * L * L;
    domega_x = (m * a_t * dir_x * L - c * state.omega_x * L - k * state.theta_x * L + Fc_x) / I_eff;
    domega_y = (m * a_t * dir_y * L - c * state.omega_y * L - k * state.theta_y * L + Fc_y) / I_eff;
}

SimulationEngine::StateVector SimulationEngine::rk4Step(const StateVector& state, double t, double dt,
                                                         double m, double L, double c, double k,
                                                         double A, double f, double alpha,
                                                         double limit_rad, double k_penalty,
                                                         double c_penalty, double mu) {
    auto deriv = [&](const StateVector& s, double time) -> StateVector {
        StateVector ds;
        derivatives(s, time, m, L, c, k, A, f, alpha,
                    limit_rad, k_penalty, c_penalty, mu,
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

    double A = computePeakAcceleration(params.magnitude, params.distance, params.site_soil);
    double f_eff = params.frequency * siteSoilFrequencyTuning(params.site_soil);

    double limit_rad = params.limit_angle * M_PI / 180.0;

    StateVector state{};
    state.theta_x = 0.0;
    state.theta_y = 0.0;
    state.omega_x = 0.0;
    state.omega_y = 0.0;

    double t = 0.0;
    int steps = static_cast<int>(params.duration / params.dt);
    int sample_interval = std::max(1, steps / 1000);

    for (int i = 0; i < steps; ++i) {
        state = rk4Step(state, t, params.dt, m, L, c, k, A, f_eff, params.decay_alpha,
                        limit_rad, params.penalty_stiffness, params.penalty_damping, params.friction_coeff);
        t += params.dt;

        double angle_deg = std::sqrt(state.theta_x * state.theta_x + state.theta_y * state.theta_y) * 180.0 / M_PI;

        if (angle_deg > result.max_angle) {
            result.max_angle = angle_deg;
        }

        double a_current = std::abs(seismicAcceleration(t, A, f_eff, params.decay_alpha));
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

            double Fcx, Fcy;
            computeContactForces(state.theta_x, state.theta_y,
                                 state.omega_x, state.omega_y,
                                 limit_rad, params.penalty_stiffness,
                                 params.penalty_damping, params.friction_coeff,
                                 Fcx, Fcy);
            ps.contact_force_x = Fcx;
            ps.contact_force_y = Fcy;

            result.trajectory.push_back(ps);
        }
    }

    return result;
}
