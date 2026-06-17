cmake_minimum_required(VERSION 3.14)
project(didongyi_simulation LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Threads REQUIRED)
find_package(mosquitto REQUIRED)
find_package(Boost 1.70 REQUIRED COMPONENTS system thread)

set(HTTPP_LIB_INCLUDE "" CACHE PATH "Path to cpp-httplib header directory")
set(NLOHMANN_JSON_INCLUDE "" CACHE PATH "Path to nlohmann/json header directory")
set(CLICKHOUSE_CPP_INCLUDE "" CACHE PATH "Path to clickhouse-cpp include directory")
set(CLICKHOUSE_CPP_LIB "" CACHE FILEPATH "Path to clickhouse-cpp library file")
set(BOOST_INCLUDE "" CACHE PATH "Path to Boost include directory")

add_executable(didongyi_backend
    src/main.cpp
    src/common/app_config.cpp
    src/modules/udp_receiver.cpp
    src/modules/seismic_simulator.cpp
    src/modules/sensitivity_analyzer_module.cpp
    src/modules/alarm_mqtt.cpp
    src/simulation_engine.cpp
    src/sensitivity_analyzer.cpp
    src/alert_engine.cpp
    src/clickhouse_client.cpp
    src/mqtt_client.cpp
)

target_include_directories(didongyi_backend PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${HTTPP_LIB_INCLUDE}
    ${NLOHMANN_JSON_INCLUDE}
    ${CLICKHOUSE_CPP_INCLUDE}
    ${Boost_INCLUDE_DIRS}
    ${BOOST_INCLUDE}
)

target_link_libraries(didongyi_backend PRIVATE
    Threads::Threads
    mosquitto::mosquitto
    ${CLICKHOUSE_CPP_LIB}
    Boost::system
    Boost::thread
    ws2_32
)

if(WIN32)
    target_link_libraries(didongyi_backend PRIVATE crypt32)
endif()

configure_file(config/dynamics.json ${CMAKE_BINARY_DIR}/config/dynamics.json COPYONLY)
configure_file(config/seismic.json ${CMAKE_BINARY_DIR}/config/seismic.json COPYONLY)
