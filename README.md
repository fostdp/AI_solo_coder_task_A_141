# 古代地动仪都柱地震响应仿真与灵敏度分析系统

张衡地动仪复原研究的全栈工程化仿真平台。基于多体动力学建模都柱倾倒响应，结合场地土放大系数，完成检测范围热力图与 ROC 曲线的灵敏度评估。

---

## 一、系统架构

### 1.1 总览

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                 浏览器 / 监控                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  前端 React SPA  │  │  Prometheus UI  │  │   Grafana       │             │
│  │  (Nginx :80)    │  │   (:9091)       │  │   (:3000)       │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                        │
└───────────┼────────────────────┼────────────────────┼────────────────────────┘
            │                    │                    │
            │ /api/*             │ /metrics           │
            ▼                    ▼                    │
┌─────────────────────────────────────────────────────┘
│              didongyi-backend (C++17, :8080 / :9090 / :5005/UDP)             │
│                                                                              │
│  ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐             │
│  │ udp_receiver│──▶│seismic_simulator │──▶│  alarm_mqtt      │───MQTT──────┐│
│  │ (UDP :5005) │   │  (RK4 动力学)    │   │  (告警判定+推送)  │            ││
│  └─────────────┘   └────────┬─────────┘   └────────┬─────────┘            ││
│                             │                      │                      ││
│                  SensitivityRequest     AlertMessage/ClickHouse           ││
│                             ▼                      ▼                      ││
│                ┌─────────────────────┐  ┌────────────────────┐            ││
│                │ sensitivity_analyzer│  │ clickhouse_writer  │            ││
│                │ (MC + ROC + 热力图) │  │  (批量写入线程)     │            ││
│                └─────────────────────┘  └─────────┬──────────┘            ││
│                                                    │                       ││
│  LockfreeQueues: Sensor / SimResult / Alert / Sensitivity                   │
│  Metrics: Prometheus pull endpoint on :9090                                  │
└────────────────────────────────────────────────┬───────────────────────────┘
                                                 │
              ┌──────────────────────────────────┼──────────────────────────┐
              │                                  │                          │
              ▼                                  ▼                          ▼
┌──────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────────┐
│   ClickHouse :8123/9000  │    │     Mosquitto MQTT       │    │     Simulator        │
│  MergeTree + MV + TTL    │    │      :1883 / :9001       │    │  (Python, UDP/HTTP)  │
│  5 类主表 + 3 类聚合表    │    │   didongyi/alerts 主题    │    │  CLI 可控震级/距离   │
└──────────────────────────┘    └──────────────────────────┘    └──────────────────────┘
```

### 1.2 模块职责

| 模块 | 语言 | 线程 | 端口 | 职责 |
|------|------|------|------|------|
| `udp_receiver` | C++ | 1 | UDP 5005 | 监听 UDP 传感器数据，7 项校验（设备前缀、加速度范围、震级范围等），投递 Sensor 队列 |
| `seismic_simulator` | C++ | 1 | - | 消费 Sensor 队列，调用 SimulationEngine(RK4+罚函数)，双队列分发到告警和 ClickHouse |
| `sensitivity_analyzer` | C++ | 1 | - | 消费灵敏度请求，Monte Carlo 30 次试验，生成热力图 + ROC 曲线 |
| `alarm_mqtt` | C++ | 1 | MQTT 1883 | 50 样本滑窗，误触发 + 灵敏度下降告警，PUB 到 `didongyi/alerts` |
| `clickhouse_writer` | C++ | 1 | TCP 9000 | 消费结果队列，批写入 ClickHouse |
| `status_monitor` | C++ | 1 | HTTP 8080 | 心跳 + Prometheus 指标采集 + `/api/status` |
| `httplib_server` | C++ | 1 | HTTP 8080 | REST API + WebSocket 告警推送 |
| `frontend` | TS/React | - | HTTP 80 | 地动仪 3D 渲染、波形、灵敏度热力图、告警表 |
| `simulator` | Python | 1 | UDP/HTTP | 可配置震级/震中距/场地土的地震数据生成器 |

### 1.3 数据流

```
模拟器 ──UDP──▶ udp_receiver ──[SensorQueue]──▶ seismic_simulator
                                                   │
                                                   ├──[SimResultQueue(alert)]──▶ alarm_mqtt ──MQTT──▶ 订阅者
                                                   │                                   │
                                                   │                                   └──[AlertQueue]──▶ clickhouse_writer
                                                   │
                                                   └──[SimResultQueue(ch)]──▶ clickhouse_writer
                                                                                   │
                                                                                   ▼
                                                                              ClickHouse
                                                                                   ▲
  前端 ◀──REST / WS──▶ httplib ──[SensitivityRequestQueue]──▶ sensitivity_analyzer ─┘
```

### 1.4 Prometheus 指标

| 指标 | 类型 | 说明 |
|------|------|------|
| `udp_packets_received` | Counter | UDP 总包数 |
| `udp_packets_validated` | Counter | 通过校验包数 |
| `udp_packets_dropped` | Counter | 丢弃包数 |
| `simulations_run` | Counter | 完成仿真次数 |
| `alerts_generated` | Counter | 告警数 |
| `alerts_mqtt_delivered` | Counter | MQTT 推送成功数 |
| `sensitivity_analyses` | Counter | 灵敏度分析次数 |
| `clickhouse_writes` | Counter | ClickHouse 写入数 |
| `mqtt_errors` | Counter | MQTT 错误数 |
| `uptime_seconds` | Gauge | 服务存活秒数 |
| `sensor_queue_size` | Gauge | Sensor 队列估算长度 |
| `clickhouse_connected` | Gauge | ClickHouse 连接状态 (0/1) |
| `mqtt_connected` | Gauge | MQTT 连接状态 (0/1) |
| `simulation_latency_ms` | Histogram | 单次仿真耗时 (ms) |
| `sensitivity_analysis_latency_s` | Histogram | 灵敏度分析耗时 (s) |
| `udp_processing_latency_us` | Histogram | UDP 包处理耗时 (us) |
| `clickhouse_write_latency_ms` | Histogram | ClickHouse 写入耗时 (ms) |

---

## 二、部署步骤

### 2.1 环境要求

- Docker Engine ≥ 24.0
- Docker Compose ≥ 2.20
- 内存 ≥ 4GB（ClickHouse + C++ 仿真）
- 磁盘 ≥ 10GB

### 2.2 一键启动（最小化）

```bash
# 启动核心 4 个服务：ClickHouse / MQTT / Backend / Frontend
docker compose up -d

# 查看状态
docker compose ps

# 查看后端日志
docker compose logs -f backend
```

访问地址：
- 前端：http://localhost
- 后端 API：http://localhost:8080/api/status
- Prometheus 指标：http://localhost:9090/metrics
- ClickHouse HTTP：http://localhost:8123

### 2.3 启动模拟器

```bash
# 方式 1：使用 compose profile 启动
docker compose --profile simulator up -d simulator

# 方式 2：Python 直接运行
pip install requests
python scripts/simulator.py --mode udp --udp-host 127.0.0.1 --interval 1

# 方式 3：指定参数模拟一次 7.8 级地震
python scripts/simulator.py --once --magnitude 7.8 --distance 150 --direction 90 --site-soil III
```

### 2.4 启动监控栈（可选）

```bash
docker compose --profile monitoring up -d prometheus grafana
```

- Prometheus UI：http://localhost:9091
- Grafana：http://localhost:3000 （admin / admin）

### 2.5 单独编译 C++ 后端

```bash
cd backend
mkdir build && cd build
cmake .. \
  -DHTTPP_LIB_INCLUDE=/path/to/cpp-httplib \
  -DNLOHMANN_JSON_INCLUDE=/path/to/nlohmann \
  -DCLICKHOUSE_CPP_INCLUDE=/path/to/clickhouse-cpp/include \
  -DCLICKHOUSE_CPP_LIB=/path/to/libclickhouse-cpp.a
make -j$(nproc)

# 运行
./didongyi_backend
```

### 2.6 单独构建前端

```bash
npm install
npm run build      # 产出 dist/ 含 .gz / .br 压缩
npm run preview    # 本地预览
```

### 2.7 ClickHouse 初始化

首次启动时 `docker-entrypoint-initdb.d/init.sql` 会自动执行。手动初始化：

```bash
clickhouse-client --host localhost --port 9000 --multiquery < scripts/init_clickhouse.sql
```

---

## 三、模拟器用法

### 3.1 命令行参数总览

```
python scripts/simulator.py [OPTIONS]

核心参数:
  --device-id STR          设备 ID (默认 DDY-001)
  --mode {http,udp}        上报模式 (默认 udp)
  --backend-url URL        HTTP 后端地址 (HTTP 模式, 默认 http://localhost:8080)
  --udp-host HOST          UDP 后端主机 (默认 127.0.0.1)
  --udp-port PORT          UDP 后端端口 (默认 5005)
  --site-soil {I0,I1,II,III,IV}  场地土类型 (默认 II)
  --interval SEC           上报间隔秒 (默认 1.0)
  --noise-level VAL        噪声标准差 m/s^2 (默认 0.001)

震级控制:
  --magnitude M            固定震级 (不设则随机)
  --magnitude-min M        随机震级下限 (默认 1.0)
  --magnitude-max M        随机震级上限 (默认 9.0)

震中距控制:
  --distance KM            固定震中距 (不设则随机)
  --distance-min KM        随机下限 (默认 1.0)
  --distance-max KM        随机上限 (默认 1000.0)

方向控制:
  --direction DEG          固定方向度 (0=北, 90=东, 不设则随机)

运行控制:
  --event-probability P    每步生成地震概率 (默认 0.1)
  --duration SEC           运行总时长, 0=无限 (默认 0)
  --once                   只生成一次事件后退出
  --quiet                  安静模式
```

### 3.2 典型场景

**场景 1：M7.5 级、200km、东方、III 类土**
```bash
python scripts/simulator.py --magnitude 7.5 --distance 200 --direction 90 --site-soil III --once
```

**场景 2：持续 5 分钟随机地震，每秒上报**
```bash
python scripts/simulator.py --duration 300 --interval 1 --event-probability 0.15
```

**场景 3：极端大地震测试**
```bash
python scripts/simulator.py --magnitude 9.0 --distance 50 --site-soil IV --interval 0.5 --duration 60
```

**场景 4：批量多设备，用不同场地土模拟**
```bash
python scripts/simulator.py --device-id DDY-ROCK --site-soil I1 --magnitude-min 3 --magnitude-max 6 &
python scripts/simulator.py --device-id DDY-SOFT --site-soil IV --magnitude-min 3 --magnitude-max 6 &
```

### 3.3 输出示例

```
[START] SeismicSimulator device=DDY-001 mode=UDP 127.0.0.1:5005 site=III interval=1.0s
[CONFIG] Fixed magnitude M7.8
[CONFIG] Fixed distance 150km
[CONFIG] Fixed direction 90°
[EVENT #1] M7.8, 150km, E (90°), site=III, A_max=0.5123m/s²
[000001] angle=6.82° a=0.5123m/s² M=7.8 D=150km dragons=[....E...] events=1 ok=OK
[000002] angle=5.41° a=0.3821m/s² M=7.8 D=150km dragons=[....E...] events=1 ok=OK

[FINISH] runtime=2.0s steps=2 sent=2 failed=0 triggered=2 events=1
```

---

## 四、REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sensor` | 上报传感器数据（HTTP 模式） |
| GET | `/api/realtime` | 查询最近 N 条实时数据 |
| POST | `/api/simulation/run` | 手动触发一次仿真 |
| POST | `/api/sensitivity/analyze` | 运行灵敏度分析 |
| GET | `/api/alerts` | 查询告警列表 |
| GET | `/api/status` | 各模块运行状态与统计 |
| WS | `/ws/alerts` | WebSocket 实时告警推送 |
| GET | `/metrics` | Prometheus 指标（端口 9090） |

---

## 五、项目结构

```
.
├── backend/
│   ├── CMakeLists.txt
│   ├── config/
│   │   ├── dynamics.json          # 动力学参数（柱体/接触/场地土）
│   │   └── seismic.json           # 地震/告警/队列参数
│   ├── include/
│   │   ├── common/
│   │   │   ├── messages.h         # 消息结构 + LockfreeQueue
│   │   │   ├── app_config.h       # JSON 配置加载器
│   │   │   └── logger_metrics.h   # spdlog + Prometheus
│   │   └── modules/
│   │       ├── udp_receiver.h
│   │       ├── seismic_simulator.h
│   │       ├── sensitivity_analyzer_module.h
│   │       └── alarm_mqtt.h
│   └── src/                       # 对应实现
├── src/                           # React 前端
│   ├── components/Didongyi3D/
│   ├── pages/
│   └── lib/
│       ├── seismoscope_3d.js      # 3D 动画纯逻辑
│       └── sensitivity_panel.js   # 热力图/ROC 纯计算
├── scripts/
│   ├── simulator.py               # Python 模拟器
│   ├── requirements-simulator.txt
│   └── init_clickhouse.sql        # ClickHouse 建表 + 降采样 + TTL
├── deploy/
│   ├── nginx.conf                 # 前端 + 反向代理
│   ├── nginx-gzip.conf            # Gzip/Brotli 压缩
│   ├── mosquitto.conf             # MQTT Broker
│   └── prometheus.yml             # Prometheus 抓取
├── Dockerfile.backend
├── Dockerfile.frontend
├── Dockerfile.simulator
├── docker-compose.yml
├── vite.config.ts                 # Gzip/Brotli + manualChunks
└── package.json
```

---

## 六、ClickHouse 数据保留策略

| 表 | 粒度 | 保留期 | 用途 |
|----|------|--------|------|
| `sensor_data` | 原始 | 30 天 | 高频传感器数据 |
| `simulation_results` | 原始 | 30 天 | 仿真结果 |
| `alerts` | 原始 | 365 天 | 告警事件 |
| `sensitivity_analysis` | 原始 | 365 天 | 灵敏度分析报告 |
| `sensor_data_1m` | 1 分钟聚合 | 1 年 | SummingMergeTree + 物化视图 |
| `sensor_data_1h` | 1 小时聚合 | 5 年 | 长期趋势分析 |
| `alerts_1d` | 1 天聚合 | 5 年 | 年度告警统计 |

---

## 七、常见问题

**Q: 后端启动报 ClickHouse 连接失败？**
A: 检查 ClickHouse 是否健康，`docker compose ps` 查看状态，首次启动需等待 20s 初始化。

**Q: MQTT 告警未收到？**
A: 用 mosquitto_sub 调试：`mosquitto_sub -h localhost -t 'didongyi/#' -v`

**Q: 模拟器 UDP 发送成功但后端没反应？**
A: 检查端口映射，docker 下 UDP 需明确 `-p 5005:5005/udp`；compose 已配置。

**Q: Prometheus 无指标？**
A: 访问 http://localhost:9090/metrics 确认后端输出，检查 prometheus.yml target 是否为 `backend:9090`。
