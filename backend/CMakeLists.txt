cmake_minimum_required(VERSION 3.18)
project(didongyi_simulation LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -Wall -Wextra")

find_package(Threads REQUIRED)
find_package(mosquitto REQUIRED)
find_package(Boost 1.70 REQUIRED COMPONENTS system thread)

find_package(spdlog QUIET)
find_package(prometheus-cpp QUIET)

set(HTTPP_LIB_INCLUDE "" CACHE PATH "Path to cpp-httplib header directory")
set(NLOHMANN_JSON_INCLUDE "" CACHE PATH "Path to nlohmann/json header directory")
set(CLICKHOUSE_CPP_INCLUDE "" CACHE PATH "Path to clickhouse-cpp include directory")
set(CLICKHOUSE_CPP_LIB "" CACHE FILEPATH "Path to clickhouse-cpp library file")
set(BOOST_INCLUDE "" CACHE PATH "Path to Boost include directory")
set(SPDLOG_INCLUDE "" CACHE PATH "Path to spdlog include directory")
set(PROMETHEUS_INCLUDE "" CACHE PATH "Path to prometheus-cpp include directory")
set(PROMETHEUS_CORE_LIB "" CACHE FILEPATH "Path to prometheus-cpp core library")
set(PROMETHEUS_PULL_LIB "" CACHE FILEPATH "Path to prometheus-cpp pull library")

add_executable(didongyi_backend
    src/main.cpp
    src/common/app_config.cpp
    src/common/logger_metrics.cpp
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
    ${SPDLOG_INCLUDE}
    ${PROMETHEUS_INCLUDE}
)

target_compile_definitions(didongyi_backend PRIVATE
    SPDLOG_FMT_EXTERNAL
    SPDLOG_NO_EXCEPTIONS
    BOOST_BIND_GLOBAL_PLACEHOLDERS
)

target_link_libraries(didongyi_backend PRIVATE
    Threads::Threads
    mosquitto::mosquitto
    Boost::system
    Boost::thread
    ${CLICKHOUSE_CPP_LIB}
)

if(spdlog_FOUND)
    target_link_libraries(didongyi_backend PRIVATE spdlog::spdlog)
else()
    if(SPDLOG_INCLUDE)
        target_compile_definitions(didongyi_backend PRIVATE SPDLOG_HEADER_ONLY)
    endif()
endif()

if(prometheus-cpp_FOUND)
    target_link_libraries(didongyi_backend PRIVATE prometheus-cpp::core prometheus-cpp::pull)
else()
    if(PROMETHEUS_CORE_LIB)
        target_link_libraries(didongyi_backend PRIVATE ${PROMETHEUS_CORE_LIB})
    endif()
    if(PROMETHEUS_PULL_LIB)
        target_link_libraries(didongyi_backend PRIVATE ${PROMETHEUS_PULL_LIB})
    endif()
endif()

if(WIN32)
    target_link_libraries(didongyi_backend PRIVATE ws2_32 crypt32 winmm)
else()
    target_link_libraries(didongyi_backend PRIVATE dl rt)
endif()

configure_file(config/dynamics.json ${CMAKE_BINARY_DIR}/config/dynamics.json COPYONLY)
configure_file(config/seismic.json ${CMAKE_BINARY_DIR}/config/seismic.json COPYONLY)

file(COPY ${CMAKE_SOURCE_DIR}/config DESTINATION ${CMAKE_BINARY_DIR})

install(TARGETS didongyi_backend DESTINATION bin)
install(DIRECTORY config DESTINATION .)
