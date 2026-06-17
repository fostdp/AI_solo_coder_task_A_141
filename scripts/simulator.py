#!/usr/bin/env python3
import argparse
import json
import math
import random
import socket
import sys
import time
from dataclasses import dataclass
from typing import List, Optional, Tuple

import requests

SITE_SOIL_AMPLIFICATION = {
    "I0": {"amp": 0.90, "f0": 6.0},
    "I1": {"amp": 1.00, "f0": 4.5},
    "II": {"amp": 1.25, "f0": 3.0},
    "III": {"amp": 1.60, "f0": 1.8},
    "IV": {"amp": 2.00, "f0": 1.0},
}

DIRECTION_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


@dataclass
class EarthquakeEvent:
    magnitude: float
    distance_km: float
    direction_rad: float
    start_time: float
    duration_s: float = 60.0


def compute_peak_acceleration(magnitude: float, distance_km: float,
                               site_soil: str = "II") -> float:
    amp = SITE_SOIL_AMPLIFICATION.get(site_soil, SITE_SOIL_AMPLIFICATION["II"])["amp"]
    log10_amax = -2.2 + 0.7 * magnitude - 1.2 * math.log10(max(distance_km, 1.0) + 10)
    return amp * (10 ** log10_amax)


def generate_waveform(t: float, a_max: float, f0: float = 3.0,
                        duration: float = 60.0) -> Tuple[float, float, float]:
    alpha = math.log(100) / max(duration, 1)
    envelope = math.exp(-alpha * abs(t - duration / 3))
    a_x = a_max * envelope * (
        0.6 * math.sin(2 * math.pi * f0 * t)
        + 0.3 * math.sin(2 * math.pi * 1.5 * f0 * t + 0.7)
        + 0.1 * math.sin(2 * math.pi * 0.5 * f0 * t + 1.3)
    )
    a_y = a_max * envelope * (
        0.5 * math.sin(2 * math.pi * f0 * t + 0.4)
        + 0.35 * math.sin(2 * math.pi * 2.0 * f0 * t + 1.1)
        + 0.15 * math.sin(2 * math.pi * 0.7 * f0 * t + 0.2)
    )
    a_z = 0.2 * a_max * envelope * math.sin(2 * math.pi * (f0 * 1.5) * t + 0.8)
    return a_x, a_y, a_z


class SeismicSimulator:
    def __init__(self, args):
        self.device_id = args.device_id
        self.backend_url = args.backend_url.rstrip("/")
        self.udp_host = args.udp_host
        self.udp_port = args.udp_port
        self.use_udp = args.mode == "udp"
        self.site_soil = args.site_soil
        self.interval = args.interval
        self.noise_level = args.noise_level
        self.fixed_magnitude = args.magnitude
        self.fixed_distance = args.distance
        self.fixed_direction = args.direction
        self.event_probability = args.event_probability
        self.run_duration = args.duration
        self.verbose = not args.quiet

        self.events: List[EarthquakeEvent] = []
        self.noise_x = 0.0
        self.noise_y = 0.0
        self.step = 0
        self.stats = {"sent": 0, "failed": 0, "triggered": 0, "events": 0}

        self.udp_sock = None
        if self.use_udp:
            self.udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def maybe_create_event(self, current_time: float):
        if random.random() < self.event_probability:
            if self.fixed_magnitude is not None:
                mag = self.fixed_magnitude
            else:
                mag = random.uniform(args.magnitude_min, args.magnitude_max)

            if self.fixed_distance is not None:
                dist = self.fixed_distance
            else:
                dist = random.uniform(args.distance_min, args.distance_max)

            if self.fixed_direction is not None:
                direction = math.radians(self.fixed_direction)
            else:
                direction = random.uniform(0, 2 * math.pi)

            duration = 30 + 10 * mag
            self.events.append(EarthquakeEvent(
                magnitude=mag,
                distance_km=dist,
                direction_rad=direction,
                start_time=current_time,
                duration_s=duration
            ))
            self.stats["events"] += 1
            if self.verbose:
                print(f"[EVENT #{self.stats['events']}] M{mag:.1f}, {dist:.0f}km, "
                      f"{DIRECTION_LABELS[round(math.degrees(direction) / 45) % 8]} "
                      f"({math.degrees(direction):.0f}\u00b0), site={self.site_soil}, "
                      f"A_max={compute_peak_acceleration(mag, dist, self.site_soil):.4f}m/s\u00b2")

    def compute_state(self, current_time: float) -> dict:
        disp_x = 0.0
        disp_y = 0.0
        a_x_total = 0.0
        a_y_total = 0.0
        a_z_total = 0.0
        mag_combined = 0.0
        dist_combined = 0.0
        weight_sum = 0.0

        alive = []
        for eq in self.events:
            elapsed = current_time - eq.start_time
            if elapsed > eq.duration_s + 10:
                continue
            alive.append(eq)

            amp = compute_peak_acceleration(eq.magnitude, eq.distance_km, self.site_soil)
            f0 = SITE_SOIL_AMPLIFICATION.get(self.site_soil, SITE_SOIL_AMPLIFICATION["II"])["f0"]
            a_x, a_y, a_z = generate_waveform(elapsed, amp, f0, eq.duration_s)

            cos_dir = math.cos(eq.direction_rad)
            sin_dir = math.sin(eq.direction_rad)
            a_x_total += a_x * cos_dir - a_y * sin_dir
            a_y_total += a_x * sin_dir + a_y * cos_dir
            a_z_total += a_z

            pendulum_length = 1.0
            omega = math.sqrt(9.8 / pendulum_length)
            disp_response = 1.0 / (omega ** 2)
            disp_x += disp_response * (a_x * cos_dir - a_y * sin_dir)
            disp_y += disp_response * (a_x * sin_dir + a_y * cos_dir)

            weight = amp
            mag_combined += eq.magnitude * weight
            dist_combined += eq.distance_km * weight
            weight_sum += weight

        self.events = alive

        self.noise_x += random.gauss(0, self.noise_level)
        self.noise_y += random.gauss(0, self.noise_level)
        self.noise_x *= 0.95
        self.noise_y *= 0.95

        total_disp_x = disp_x + self.noise_x
        total_disp_y = disp_y + self.noise_y

        total_disp = math.sqrt(total_disp_x ** 2 + total_disp_y ** 2)
        pendulum_length = 1.0
        angle_rad = math.atan(total_disp / pendulum_length)
        angle_deg = math.degrees(angle_rad)

        dragon_status = [False] * 8
        triggered_dragon = -1
        for i in range(8):
            dir_angle = i * math.pi / 4
            projection = (total_disp_x * math.cos(dir_angle)
                          + total_disp_y * math.sin(dir_angle))
            proj_angle = math.degrees(math.atan(abs(projection) / pendulum_length))
            if proj_angle > 5.0:
                dragon_status[i] = True
                if triggered_dragon == -1 or projection > 0:
                    triggered_dragon = i

        if triggered_dragon >= 0:
            self.stats["triggered"] += 1

        avg_mag = mag_combined / weight_sum if weight_sum > 0 else 0.0
        avg_dist = dist_combined / weight_sum if weight_sum > 0 else 0.0

        return {
            "device_id": self.device_id,
            "timestamp": int(current_time * 1000),
            "acceleration_x": round(a_x_total, 6),
            "acceleration_y": round(a_y_total, 6),
            "acceleration_z": round(a_z_total, 6),
            "magnitude": round(avg_mag, 2),
            "distance": round(avg_dist, 1),
            "triggered_dragon": triggered_dragon,
            "pillar_displacement_x": round(total_disp_x, 6),
            "pillar_displacement_y": round(total_disp_y, 6),
            "pillar_angle": round(angle_deg, 4),
            "wave_acceleration": round(math.sqrt(a_x_total**2 + a_y_total**2 + a_z_total**2), 6),
            "dragon_status": dragon_status,
            "site_soil": self.site_soil,
        }

    def send_http(self, payload: dict) -> bool:
        url = f"{self.backend_url}/api/sensor"
        for attempt in range(3):
            try:
                resp = requests.post(url, json=payload, timeout=5)
                return resp.status_code < 500
            except requests.RequestException as e:
                if attempt < 2:
                    time.sleep(0.5)
        return False

    def send_udp(self, payload: dict) -> bool:
        try:
            data = json.dumps(payload).encode("utf-8")
            self.udp_sock.sendto(data, (self.udp_host, self.udp_port))
            return True
        except OSError:
            return False

    def send(self, payload: dict) -> bool:
        if self.use_udp:
            return self.send_udp(payload)
        return self.send_http(payload)

    def run(self):
        start = time.time()
        if self.verbose:
            mode = f"UDP {self.udp_host}:{self.udp_port}" if self.use_udp else f"HTTP {self.backend_url}"
            print(f"[START] SeismicSimulator device={self.device_id} mode={mode} "
                  f"site={self.site_soil} interval={self.interval}s")
            if self.fixed_magnitude is not None:
                print(f"[CONFIG] Fixed magnitude M{self.fixed_magnitude}")
            if self.fixed_distance is not None:
                print(f"[CONFIG] Fixed distance {self.fixed_distance}km")
            if self.fixed_direction is not None:
                print(f"[CONFIG] Fixed direction {self.fixed_direction}\u00b0")

        try:
            while True:
                self.step += 1
                now = time.time()

                self.maybe_create_event(now)
                payload = self.compute_state(now)

                ok = self.send(payload)
                if ok:
                    self.stats["sent"] += 1
                else:
                    self.stats["failed"] += 1

                if self.verbose and (self.step % 10 == 0 or payload["triggered_dragon"] >= 0):
                    dragons = "".join(
                        DIRECTION_LABELS[i] if s else "."
                        for i, s in enumerate(payload["dragon_status"])
                    )
                    print(
                        f"[{self.step:06d}] "
                        f"angle={payload['pillar_angle']:.2f}\u00b0 "
                        f"a={payload['wave_acceleration']:.4f}m/s\u00b2 "
                        f"M={payload['magnitude']:.1f} D={payload['distance']:.0f}km "
                        f"dragons=[{dragons}] "
                        f"events={len(self.events)} "
                        f"ok={'OK' if ok else 'FAIL'}"
                    )

                if self.run_duration > 0 and (now - start) >= self.run_duration:
                    break

                time.sleep(self.interval)

        except KeyboardInterrupt:
            pass
        finally:
            if self.udp_sock:
                self.udp_sock.close()

        elapsed = time.time() - start
        print(f"\n[FINISH] runtime={elapsed:.1f}s steps={self.step} "
              f"sent={self.stats['sent']} failed={self.stats['failed']} "
              f"triggered={self.stats['triggered']} events={self.stats['events']}")


def main():
    global args
    parser = argparse.ArgumentParser(
        description="地动仪地震模拟器：可配置震级、震中距、场地土、通信模式"
    )
    parser.add_argument("--device-id", default="DDY-001",
                        help="设备ID (default: DDY-001)")
    parser.add_argument("--mode", choices=["http", "udp"], default="udp",
                        help="数据上报模式 (default: udp)")
    parser.add_argument("--backend-url", default="http://localhost:8080",
                        help="HTTP 后端地址 (HTTP 模式)")
    parser.add_argument("--udp-host", default="127.0.0.1",
                        help="UDP 后端主机 (UDP 模式)")
    parser.add_argument("--udp-port", type=int, default=5005,
                        help="UDP 后端端口 (UDP 模式, default: 5005)")
    parser.add_argument("--site-soil", choices=list(SITE_SOIL_AMPLIFICATION.keys()),
                        default="II",
                        help="场地土类型 (default: II)")
    parser.add_argument("--interval", type=float, default=1.0,
                        help="上报间隔秒数 (default: 1.0)")
    parser.add_argument("--noise-level", type=float, default=0.001,
                        help="噪声标准差 m/s^2 (default: 0.001)")

    parser.add_argument("--magnitude", type=float, default=None,
                        help="固定震级 M (如 6.5)，不设则随机")
    parser.add_argument("--magnitude-min", type=float, default=1.0,
                        help="随机震级下限 (default: 1.0)")
    parser.add_argument("--magnitude-max", type=float, default=9.0,
                        help="随机震级上限 (default: 9.0)")

    parser.add_argument("--distance", type=float, default=None,
                        help="固定震中距 km (如 200)，不设则随机")
    parser.add_argument("--distance-min", type=float, default=1.0,
                        help="随机震中距下限 km (default: 1.0)")
    parser.add_argument("--distance-max", type=float, default=1000.0,
                        help="随机震中距上限 km (default: 1000.0)")

    parser.add_argument("--direction", type=float, default=None,
                        help="固定地震方向 度 (0=北, 90=东)，不设则随机")

    parser.add_argument("--event-probability", type=float, default=0.1,
                        help="每步生成地震事件概率 (default: 0.1)")
    parser.add_argument("--duration", type=float, default=0,
                        help="运行总时长秒，0=无限 (default: 0)")
    parser.add_argument("--once", action="store_true",
                        help="立即生成一个地震事件并发送一次然后退出")
    parser.add_argument("--quiet", action="store_true",
                        help="安静模式，不输出过程日志")

    args = parser.parse_args()

    if args.once:
        args.event_probability = 1.0
        args.duration = args.interval + 0.5

    sim = SeismicSimulator(args)
    sim.run()


if __name__ == "__main__":
    main()
