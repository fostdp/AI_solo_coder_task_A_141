#include "modules/udp_receiver.h"

#ifdef _WIN32
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#endif

UdpReceiver::UdpReceiver(SensorQueue& sensorQueue, SensitivityRequestQueue& sensitivityQueue)
    : sensor_queue_(sensorQueue), sensitivity_queue_(sensitivityQueue) {}

UdpReceiver::~UdpReceiver() {
    stop();
}

void UdpReceiver::start() {
    if (running_.exchange(true)) return;
    thread_ = std::thread(&UdpReceiver::run, this);
}

void UdpReceiver::stop() {
    if (!running_.exchange(false)) return;
    if (thread_.joinable()) thread_.join();
}

bool UdpReceiver::validate(const nlohmann::json& j, const AppConfig::SeismicConfig& cfg) {
    if (!j.contains("device_id") || !j["device_id"].is_string()) return false;
    std::string device_id = j["device_id"];
    if (device_id.find(cfg.validation_device_prefix) != 0) return false;

    auto checkDouble = [&](const std::string& key, double maxVal) -> bool {
        if (!j.contains(key) || !j[key].is_number()) return false;
        double v = j[key].get<double>();
        if (std::abs(v) > maxVal) return false;
        return true;
    };

    if (!checkDouble("acceleration_x", cfg.validation_max_acceleration)) return false;
    if (!checkDouble("acceleration_y", cfg.validation_max_acceleration)) return false;
    if (!checkDouble("acceleration_z", cfg.validation_max_acceleration)) return false;
    if (!checkDouble("magnitude", cfg.validation_max_magnitude)) return false;
    if (!checkDouble("distance", cfg.validation_max_distance)) return false;

    if (j.contains("triggered_dragon") && !j["triggered_dragon"].is_number_integer()) return false;
    if (j.contains("triggered_dragon")) {
        int v = j["triggered_dragon"].get<int>();
        if (v < -1 || v > 7) return false;
    }

    return true;
}

SensorMessage UdpReceiver::parseSensorMessage(const nlohmann::json& j) {
    SensorMessage msg;
    msg.sequence = sequence_++;
    msg.device_id = j.value("device_id", "DDY-001");
    msg.timestamp = std::chrono::system_clock::now();
    msg.acceleration_x = j.value("acceleration_x", 0.0);
    msg.acceleration_y = j.value("acceleration_y", 0.0);
    msg.acceleration_z = j.value("acceleration_z", 0.0);
    msg.magnitude = j.value("magnitude", 0.0);
    msg.distance = j.value("distance", 0.0);
    msg.triggered_dragon = j.value("triggered_dragon", -1);
    msg.displacement_x = j.value("displacement_x", 0.0);
    msg.displacement_y = j.value("displacement_y", 0.0);
    msg.site_soil = j.value("site_soil", "II");
    msg.valid = true;
    return msg;
}

void UdpReceiver::pushHttpSensor(const nlohmann::json& body) {
    const auto& cfg = AppConfig::instance().seismic();
    total_received_++;

    if (!validate(body, cfg)) {
        total_dropped_++;
        return;
    }

    total_validated_++;
    SensorMessage msg = parseSensorMessage(body);
    sensor_queue_.push(std::move(msg));
}

void UdpReceiver::run() {
    const auto& cfg = AppConfig::instance().seismic();

#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "WSAStartup failed" << std::endl;
        return;
    }
#endif

    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) {
        std::cerr << "Failed to create UDP socket" << std::endl;
#ifdef _WIN32
        WSACleanup();
#endif
        return;
    }

    sockaddr_in serverAddr{};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(static_cast<uint16_t>(cfg.udp_listen_port));
    serverAddr.sin_addr.s_addr = inet_addr(cfg.udp_listen_host.c_str());

    if (bind(sock, reinterpret_cast<sockaddr*>(&serverAddr), sizeof(serverAddr)) < 0) {
        std::cerr << "Failed to bind UDP socket to port " << cfg.udp_listen_port << std::endl;
#ifdef _WIN32
        closesocket(sock);
        WSACleanup();
#else
        close(sock);
#endif
        return;
    }

    std::cout << "UDP receiver listening on " << cfg.udp_listen_host << ":" << cfg.udp_listen_port << std::endl;

    std::vector<char> buffer(cfg.udp_max_packet_size);
    sockaddr_in clientAddr{};
    socklen_t clientLen = sizeof(clientAddr);

#ifdef _WIN32
    u_long mode = 1;
    ioctlsocket(sock, FIONBIO, &mode);
#else
    int flags = fcntl(sock, F_GETFL, 0);
    fcntl(sock, F_SETFL, flags | O_NONBLOCK);
#endif

    while (running_) {
#ifdef _WIN32
        int n = recvfrom(sock, buffer.data(), static_cast<int>(buffer.size()), 0,
            reinterpret_cast<sockaddr*>(&clientAddr), &clientLen);
#else
        ssize_t n = recvfrom(sock, buffer.data(), buffer.size(), 0,
            reinterpret_cast<sockaddr*>(&clientAddr), &clientLen);
#endif
        if (n > 0) {
            total_received_++;
            try {
                nlohmann::json body = nlohmann::json::parse(buffer.data(), buffer.data() + n);
                if (validate(body, cfg)) {
                    total_validated_++;
                    SensorMessage msg = parseSensorMessage(body);
                    sensor_queue_.push(std::move(msg));
                } else {
                    total_dropped_++;
                }
            } catch (const std::exception&) {
                total_dropped_++;
            }
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }

#ifdef _WIN32
    closesocket(sock);
    WSACleanup();
#else
    close(sock);
#endif
    std::cout << "UDP receiver stopped" << std::endl;
}
