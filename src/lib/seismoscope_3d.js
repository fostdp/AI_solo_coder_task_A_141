const DIRECTION_NAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const DIRECTION_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const LABEL_RADIUS = 4.2;

const CATROM_BUFFER_SIZE = 32;
const CATROM_DELAY_SEC = 0.08;
const SPRING_STIFFNESS = 18;
const SPRING_DAMPING = 3.2;

class PillarAnimation {
  constructor() {
    this.targetBuffer = [];
    this.lastTargetX = 0;
    this.lastTargetY = 0;
    this.lastPushTime = 0;
    this.startTime = null;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.shakeSeed = 0;
    this.autoRotateAngle = 0;
  }

  catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  pushTarget(x, y, now) {
    if (this.startTime === null) {
      this.startTime = now;
    }
    const t = (now - this.startTime) / 1000;

    if (this.targetBuffer.length > 0 && t - this.lastPushTime < 0.016) {
      const last = this.targetBuffer[this.targetBuffer.length - 1];
      last.x = x;
      last.y = y;
      return;
    }

    this.targetBuffer.push({ t, x, y });
    this.lastPushTime = t;
    this.lastTargetX = x;
    this.lastTargetY = y;

    while (this.targetBuffer.length > CATROM_BUFFER_SIZE) {
      this.targetBuffer.shift();
    }
  }

  interpolateTarget(queryT) {
    const buf = this.targetBuffer;
    if (buf.length < 2) {
      return { x: buf[0]?.x ?? 0, y: buf[0]?.y ?? 0 };
    }
    if (queryT <= buf[0].t) {
      return { x: buf[0].x, y: buf[0].y };
    }
    if (queryT >= buf[buf.length - 1].t) {
      return { x: buf[buf.length - 1].x, y: buf[buf.length - 1].y };
    }

    let idx = 0;
    for (let i = 0; i < buf.length - 1; i++) {
      if (queryT >= buf[i].t && queryT <= buf[i + 1].t) {
        idx = i;
        break;
      }
    }

    const i0 = Math.max(0, idx - 1);
    const i1 = idx;
    const i2 = Math.min(buf.length - 1, idx + 1);
    const i3 = Math.min(buf.length - 1, idx + 2);

    const t0 = buf[i1].t;
    const t1 = buf[i2].t;
    const span = t1 - t0 || 1;
    const localT = (queryT - t0) / span;

    return {
      x: this.catmullRom(buf[i0].x, buf[i1].x, buf[i2].x, buf[i3].x, localT),
      y: this.catmullRom(buf[i0].y, buf[i1].y, buf[i2].y, buf[i3].y, localT),
    };
  }

  update(delta, targetX, targetY, seismicIntensity, now) {
    if (targetX !== this.lastTargetX || targetY !== this.lastTargetY) {
      this.pushTarget(targetX, targetY, now);
    }

    const queryT = (this.startTime !== null)
      ? (now - this.startTime) / 1000 - CATROM_DELAY_SEC
      : 0;
    const smoothTarget = this.interpolateTarget(Math.max(0, queryT));

    this.vx += (smoothTarget.x - this.x) * SPRING_STIFFNESS * delta;
    this.vy += (smoothTarget.y - this.y) * SPRING_STIFFNESS * delta;
    this.vx *= Math.exp(-SPRING_DAMPING * delta);
    this.vy *= Math.exp(-SPRING_DAMPING * delta);
    this.x += this.vx * delta;
    this.y += this.vy * delta;

    this.shakeSeed += delta * 40;
  }

  getSeismicShake(intensity) {
    const amount = intensity > 0.05 ? intensity * 0.08 : 0;
    const x = (Math.sin(this.shakeSeed * 1.3) + Math.sin(this.shakeSeed * 2.7)) * 0.5 * amount;
    const y = (Math.sin(this.shakeSeed * 1.7) + Math.sin(this.shakeSeed * 2.3)) * 0.5 * amount * 0.5;
    const z = (Math.cos(this.shakeSeed * 1.5) + Math.sin(this.shakeSeed * 3.1)) * 0.5 * amount;
    return { x, y, z };
  }

  updateAutoRotate(delta, triggeredCount, seismicIntensity, isSimulating) {
    if (triggeredCount === 0 && seismicIntensity < 0.03 && !isSimulating) {
      this.autoRotateAngle += delta * 0.1;
    }
    return this.autoRotateAngle;
  }

  getPillarTransform() {
    const px = this.x * 100;
    const pz = this.y * 100;
    const tiltX = this.y * 20;
    const tiltZ = -this.x * 20;
    return {
      position: { x: px, y: 0, z: pz },
      rotation: { x: tiltX, y: 0, z: tiltZ }
    };
  }

  determineDragonDirection(thetaX, thetaY) {
    const angle = Math.atan2(thetaX, thetaY) * 180 / Math.PI;
    const normalized = ((angle % 360) + 360) % 360;
    return Math.round(normalized / 45) % 8;
  }

  getDragonPosition(index) {
    const angle = (DIRECTION_ANGLES[index] * Math.PI) / 180;
    const radius = 2.4;
    return {
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius
    };
  }

  getLabelPosition(index) {
    const angle = (DIRECTION_ANGLES[index] * Math.PI) / 180;
    return {
      x: Math.sin(angle) * LABEL_RADIUS,
      z: Math.cos(angle) * LABEL_RADIUS
    };
  }
}

class BallAnimation {
  constructor(dragonIndex) {
    this.dragonIndex = dragonIndex;
    this.active = false;
    this.t = 0;
    this.startY = 0.6;
    this.velocity = 0;
    this.gravity = -9.8;
    this.bounceCount = 0;
    this.maxBounces = 2;
    this.landingZ = 0;
  }

  trigger() {
    if (!this.active) {
      this.active = true;
      this.t = 0;
      this.velocity = 0;
      this.bounceCount = 0;
    }
  }

  reset() {
    this.active = false;
    this.t = 0;
    this.velocity = 0;
    this.bounceCount = 0;
  }

  update(delta) {
    if (!this.active) return { x: 0, y: this.startY, z: 0 };

    this.t += delta;
    this.velocity += this.gravity * delta;
    let y = this.startY + this.velocity * this.t;

    const pos = this.getDragonPosition(this.dragonIndex);
    let x = pos.x;
    let z = pos.z + this.landingZ;

    if (y <= -1.0) {
      if (this.bounceCount < this.maxBounces) {
        this.velocity = -this.velocity * 0.4;
        this.startY = -1.0;
        this.t = 0;
        this.bounceCount++;
      } else {
        y = -1.0;
        this.velocity = 0;
      }
    }

    if (this.active && this.t > 0.3 && this.t < 0.8) {
      this.landingZ += delta * 0.5;
    }

    return { x, y, z };
  }
}

function seismicIntensityFromAcceleration(acceleration) {
  return Math.min(1, Math.abs(acceleration) * 0.4 + 0.02);
}

function siteSoilAmplification(soilType) {
  const map = { I0: 0.85, I1: 1.0, II: 1.25, III: 1.65, IV: 2.1 };
  return map[soilType] ?? 1.0;
}

function siteSoilFrequencyTuning(soilType) {
  const map = { I0: 1.4, I1: 1.2, II: 1.0, III: 0.7, IV: 0.45 };
  return map[soilType] ?? 1.0;
}

export {
  DIRECTION_NAMES,
  DIRECTION_ANGLES,
  LABEL_RADIUS,
  PillarAnimation,
  BallAnimation,
  seismicIntensityFromAcceleration,
  siteSoilAmplification,
  siteSoilFrequencyTuning,
};
