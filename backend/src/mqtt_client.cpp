#include "mqtt_client.h"
#include <mosquitto.h>
#include <cstring>

class MqttClient::Impl {
public:
    struct mosquitto* mosq = nullptr;
};

MqttClient::MqttClient() = default;

MqttClient::~MqttClient() {
    disconnect();
}

bool MqttClient::connect(const std::string& broker, int port) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (connected_) return true;

    broker_ = broker;
    port_ = port;

    mosquitto_lib_init();

    impl_ = std::make_unique<Impl>();
    impl_->mosq = mosquitto_new("didongyi_backend", true, this);
    if (!impl_->mosq) return false;

    mosquitto_connect_callback_set(impl_->mosq, onConnect);
    mosquitto_disconnect_callback_set(impl_->mosq, onDisconnect);
    mosquitto_message_callback_set(impl_->mosq, onMessage);

    int rc = mosquitto_connect(impl_->mosq, broker_.c_str(), port_, 60);
    if (rc != MOSQ_ERR_SUCCESS) {
        mosquitto_destroy(impl_->mosq);
        impl_->mosq = nullptr;
        mosquitto_lib_cleanup();
        return false;
    }

    mosquitto_loop_start(impl_->mosq);
    connected_ = true;
    return true;
}

void MqttClient::disconnect() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!connected_) return;

    if (impl_ && impl_->mosq) {
        mosquitto_loop_stop(impl_->mosq, true);
        mosquitto_disconnect(impl_->mosq);
        mosquitto_destroy(impl_->mosq);
        impl_->mosq = nullptr;
    }

    mosquitto_lib_cleanup();
    connected_ = false;
}

bool MqttClient::isConnected() const {
    return connected_;
}

bool MqttClient::publish(const std::string& topic, const std::string& message) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!connected_ || !impl_ || !impl_->mosq) return false;

    int rc = mosquitto_publish(impl_->mosq, nullptr, topic.c_str(),
                               static_cast<int>(message.size()), message.c_str(),
                               0, false);
    return rc == MOSQ_ERR_SUCCESS;
}

void MqttClient::setMessageCallback(std::function<void(const std::string&, const std::string&)> callback) {
    message_callback_ = callback;
}

void MqttClient::onConnect(void* obj, int rc) {
    auto* self = static_cast<MqttClient*>(obj);
    self->connected_ = (rc == 0);
}

void MqttClient::onDisconnect(void* obj, int rc) {
    auto* self = static_cast<MqttClient*>(obj);
    self->connected_ = false;
}

void MqttClient::onMessage(void* obj, int mid, const void* topic, int topic_len,
                            const void* payload, int payload_len) {
    auto* self = static_cast<MqttClient*>(obj);
    if (self->message_callback_) {
        std::string topic_str(static_cast<const char*>(topic), topic_len);
        std::string payload_str(static_cast<const char*>(payload), payload_len);
        self->message_callback_(topic_str, payload_str);
    }
}
