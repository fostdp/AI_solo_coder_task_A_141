import argparse
import math
import random
import time

import requests


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device-id", default="DDY-001")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--backend-url", default="http://localhost:8080")
    parser.add_argument("--noise-level", type=float, default=0.001)
    args = parser.parse_args()

    url = f"{args.backend_url}/api/sensor"
    active_earthquakes = []
    noise_x = 0.0
    noise_y = 0.0
    step = 0

    while True:
        step += 1
        current_time = time.time()

        poisson_prob = 1 - math.exp(-args.interval / 600.0)
        if random.random() < poisson_prob:
            mag = random.uniform(1, 9)
            dist = random.uniform(1, 1000)
            direction = random.uniform(0, 2 * math.pi)
            active_earthquakes.append(
                {
                    "magnitude": mag,
                    "distance": dist,
                    "direction": direction,
                    "start_time": current_time,
                }
            )
            print(
                f"[EVENT] Earthquake detected: M{mag:.1f}, distance={dist:.0f}km, direction={math.degrees(direction):.1f}\u00b0"
            )

        disp_x = 0.0
        disp_y = 0.0
        wave_acc_total = 0.0

        remaining = []
        for eq in active_earthquakes:
            elapsed = current_time - eq["start_time"]
            mag = eq["magnitude"]
            dist = eq["distance"]
            direction = eq["direction"]

            A = 10 ** (mag / 2 - 1) / math.sqrt(dist)
            f = 0.5 + mag * 0.2
            alpha = 0.05 + 0.01 / mag

            wave_acc = A * math.sin(2 * math.pi * f * elapsed) * math.exp(
                -alpha * elapsed
            )

            pendulum_freq = 1.0
            pendulum_response = 1.0 / (pendulum_freq**2)
            displacement = wave_acc * pendulum_response

            disp_x += displacement * math.cos(direction)
            disp_y += displacement * math.sin(direction)
            wave_acc_total += abs(wave_acc)

            if math.exp(-alpha * elapsed) > 0.01:
                remaining.append(eq)

        active_earthquakes = remaining

        noise_x += random.gauss(0, args.noise_level)
        noise_y += random.gauss(0, args.noise_level)
        noise_x *= 0.95
        noise_y *= 0.95

        total_disp_x = disp_x + noise_x
        total_disp_y = disp_y + noise_y

        pendulum_length = 1.0
        total_disp = math.sqrt(total_disp_x**2 + total_disp_y**2)
        angle_rad = math.atan(total_disp / pendulum_length)
        angle_deg = math.degrees(angle_rad)

        dragon_status = [False] * 8
        for i in range(8):
            dir_angle = i * math.pi / 4
            projection = total_disp_x * math.cos(dir_angle) + total_disp_y * math.sin(
                dir_angle
            )
            proj_angle = math.degrees(math.atan(abs(projection) / pendulum_length))
            if proj_angle > 5.0:
                dragon_status[i] = True

        payload = {
            "device_id": args.device_id,
            "pillar_displacement_x": round(total_disp_x, 6),
            "pillar_displacement_y": round(total_disp_y, 6),
            "pillar_angle": round(angle_deg, 4),
            "wave_acceleration": round(wave_acc_total, 6),
            "dragon_status": dragon_status,
            "timestamp": current_time,
        }

        success = False
        for attempt in range(3):
            try:
                resp = requests.post(url, json=payload, timeout=5)
                print(
                    f"[{step}] POST {resp.status_code} | angle={angle_deg:.2f}\u00b0 | dragons={dragon_status} | quakes={len(active_earthquakes)}"
                )
                success = True
                break
            except requests.RequestException as e:
                print(f"[{step}] Attempt {attempt + 1}/3 failed: {e}")
                if attempt < 2:
                    time.sleep(1)

        if not success:
            print(f"[{step}] All attempts failed, skipping this report")

        time.sleep(args.interval)


if __name__ == "__main__":
    main()
