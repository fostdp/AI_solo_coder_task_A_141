#pragma once

#include <string>
#include <functional>
#include <mutex>
#include <memory>

class MqttClient {
public:
    MqttClient();
    ~MqttClient();

    bool connect(const std::string& broker = "localhost", int port = 1883);
    void disconnect();
    bool isConnected() const;

    bool publish(const std::string& topic, const std::string& message);

    void setMessageCallback(std::function<void(const std::string&, const std::string&)> callback);

private:
    class Impl;
    std::unique_ptr<Impl> impl_;

    std::string broker_;
    int port_ = 1883;
    bool connected_ = false;
    std::mutex mutex_;
    std::function<void(const std::string&, const std::string&)> message_callback_;

    static void onConnect(void* obj, int rc);
    static void onDisconnect(void* obj, int rc);
    static void onMessage(void* obj, int mid, const void* topic, int topic_len, const void* payload, int payload_len);
};
