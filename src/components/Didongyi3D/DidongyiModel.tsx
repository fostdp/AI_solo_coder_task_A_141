import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Stars, Cylinder, Sphere, Torus, RoundedBox } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

interface PillarState {
  displacement_x: number
  displacement_y: number
  angle: number
  angular_velocity: number
}

interface DragonData {
  id: number
  direction: string
  triggered: boolean
  ball_dropped: boolean
}

interface DidongyiModelProps {
  pillarState: PillarState
  dragons: DragonData[]
  isSimulating?: boolean
  seismicIntensity?: number
}

const DIRECTION_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]
const DIRECTION_NAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
const BRONZE_COLOR = '#8B4513'
const DARK_BRONZE = '#5C2E0A'
const GOLD_COLOR = '#D4AF37'
const BODY_HEIGHT = 3.5
const BODY_TOP_RADIUS = 1.8
const BODY_BOTTOM_RADIUS = 2.1
const BASE_HEIGHT = 0.6
const BASE_RADIUS = 2.6
const PILLAR_HEIGHT = 3.2
const PILLAR_RADIUS = 0.18
const DRAGON_RADIUS = 1.95

function Dragon({ angle, triggered, ballDropped, onBallReset }: {
  angle: number
  triggered: boolean
  ballDropped: boolean
  onBallReset: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const ballRef = useRef<THREE.Mesh>(null)
  const [ballAnimStart, setBallAnimStart] = useState<number | null>(null)

  const rad = (angle * Math.PI) / 180
  const posX = Math.sin(rad) * DRAGON_RADIUS
  const posZ = Math.cos(rad) * DRAGON_RADIUS

  const mouthY = BODY_HEIGHT - 0.1
  const frogY = BASE_HEIGHT + 0.25
  const dropDistance = mouthY - frogY

  useEffect(() => {
    if (ballDropped && ballAnimStart === null) {
      setBallAnimStart(performance.now())
    } else if (!ballDropped) {
      setBallAnimStart(null)
      if (ballRef.current) {
        ballRef.current.position.set(0, 0, 0.28)
        ballRef.current.visible = true
      }
    }
  }, [ballDropped, ballAnimStart])

  useFrame(() => {
    if (ballDropped && ballAnimStart !== null && ballRef.current) {
      const elapsed = (performance.now() - ballAnimStart) / 1000
      const fallDuration = 0.8
      const bounceDuration = 0.3

      if (elapsed < fallDuration) {
        const t = elapsed / fallDuration
        const eased = 1 - Math.pow(1 - t, 2)
        const yOffset = -eased * dropDistance
        ballRef.current.position.y = yOffset
      } else if (elapsed < fallDuration + bounceDuration) {
        const t = (elapsed - fallDuration) / bounceDuration
        const bounce = Math.sin(t * Math.PI) * 0.15
        ballRef.current.position.y = -dropDistance + bounce
      } else if (elapsed < fallDuration + bounceDuration + 2.0) {
        ballRef.current.position.y = -dropDistance
      } else {
        ballRef.current.visible = false
        onBallReset()
      }
    }
  })

  return (
    <group
      ref={groupRef}
      position={[posX, mouthY - 0.3, posZ]}
      rotation={[0, -rad, 0]}
    >
      <group position={[0, 0.1, 0]}>
        <mesh castShadow receiveShadow>
          <coneGeometry args={[0.22, 0.5, 8, 1, true]} />
          <meshStandardMaterial
            color={DARK_BRONZE}
            metalness={0.9}
            roughness={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>

        <mesh position={[0, 0.15, 0.2]} castShadow receiveShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial
            color={DARK_BRONZE}
            metalness={0.9}
            roughness={0.35}
            emissive={triggered ? GOLD_COLOR : '#000000'}
            emissiveIntensity={triggered ? 0.6 : 0}
          />
        </mesh>

        <mesh position={[0.12, 0.22, 0.18]} castShadow>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[-0.12, 0.22, 0.18]} castShadow>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.5} />
        </mesh>

        <mesh position={[0, 0.08, 0.35]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.1, 0.04, 8, 16, Math.PI]} />
          <meshStandardMaterial
            color={DARK_BRONZE}
            metalness={0.9}
            roughness={0.35}
            emissive={triggered ? GOLD_COLOR : '#000000'}
            emissiveIntensity={triggered ? 0.8 : 0}
          />
        </mesh>

        <mesh position={[0.18, 0.1, -0.05]} rotation={[0, 0, 0.4]} castShadow>
          <boxGeometry args={[0.25, 0.05, 0.15]} />
          <meshStandardMaterial color={DARK_BRONZE} metalness={0.9} roughness={0.35} />
        </mesh>
        <mesh position={[-0.18, 0.1, -0.05]} rotation={[0, 0, -0.4]} castShadow>
          <boxGeometry args={[0.25, 0.05, 0.15]} />
          <meshStandardMaterial color={DARK_BRONZE} metalness={0.9} roughness={0.35} />
        </mesh>

        <mesh position={[0, -0.1, -0.15]} rotation={[0.3, 0, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.15, 0.4, 8]} />
          <meshStandardMaterial color={DARK_BRONZE} metalness={0.9} roughness={0.35} />
        </mesh>
      </group>

      <group position={[0, 0, 0.28]}>
        <mesh ref={ballRef} castShadow>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color={GOLD_COLOR}
            metalness={1}
            roughness={0.2}
            emissive={triggered ? '#FFF8DC' : '#000000'}
            emissiveIntensity={triggered ? 0.3 : 0}
          />
        </mesh>
      </group>
    </group>
  )
}

function Frog({ angle }: { angle: number }) {
  const rad = (angle * Math.PI) / 180
  const posX = Math.sin(rad) * (BASE_RADIUS - 0.3)
  const posZ = Math.cos(rad) * (BASE_RADIUS - 0.3)

  return (
    <group position={[posX, BASE_HEIGHT + 0.05, posZ]} rotation={[0, -rad, 0]}>
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={DARK_BRONZE} metalness={0.85} roughness={0.45} />
      </mesh>

      <mesh position={[0, 0.35, 0.18]} castShadow>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color={DARK_BRONZE} metalness={0.85} roughness={0.45} />
      </mesh>

      <mesh position={[0.1, 0.38, 0.28]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[-0.1, 0.38, 0.28]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.5} />
      </mesh>

      <mesh position={[0, 0.3, 0.35]} rotation={[Math.PI / 2.5, 0, 0]} castShadow>
        <torusGeometry args={[0.09, 0.035, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#3D1F0A" metalness={0.7} roughness={0.5} />
      </mesh>

      <mesh position={[0.2, 0.05, 0.05]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.15, 0.08, 0.18]} />
        <meshStandardMaterial color={DARK_BRONZE} metalness={0.85} roughness={0.45} />
      </mesh>
      <mesh position={[-0.2, 0.05, 0.05]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[0.15, 0.08, 0.18]} />
        <meshStandardMaterial color={DARK_BRONZE} metalness={0.85} roughness={0.45} />
      </mesh>
      <mesh position={[0.16, 0.05, -0.12]} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.15]} />
        <meshStandardMaterial color={DARK_BRONZE} metalness={0.85} roughness={0.45} />
      </mesh>
      <mesh position={[-0.16, 0.05, -0.12]} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.15]} />
        <meshStandardMaterial color={DARK_BRONZE} metalness={0.85} roughness={0.45} />
      </mesh>
    </group>
  )
}

export default function DidongyiModel({
  pillarState,
  dragons,
  isSimulating = false,
  seismicIntensity = 0
}: DidongyiModelProps) {
  const groupRef = useRef<THREE.Group>(null)
  const pillarGroupRef = useRef<THREE.Group>(null)
  const groundRef = useRef<THREE.Mesh>(null)
  const bodyRef = useRef<THREE.Mesh>(null)
  const wobbleRef = useRef({ x: 0, z: 0, vx: 0, vz: 0 })
  const autoRotateRef = useRef(0)
  const shakeSeed = useRef(0)
  const [resetDragonIds, setResetDragonIds] = useState<Set<number>>(new Set())

  const targetBuffer = useRef<Array<{ t: number; x: number; y: number }>>([])
  const lastTargetX = useRef(0)
  const lastTargetY = useRef(0)
  const lastPushTime = useRef(0)
  const startTime = useRef<number | null>(null)
  const renderClock = useRef(0)

  const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t
    const t3 = t2 * t
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )
  }

  const pushTargetSample = (x: number, y: number, now: number) => {
    if (startTime.current === null) {
      startTime.current = now
    }
    const t = (now - startTime.current) / 1000

    if (targetBuffer.current.length > 0 && t - lastPushTime.current < 0.016) {
      const last = targetBuffer.current[targetBuffer.current.length - 1]
      last.x = x
      last.y = y
      return
    }

    targetBuffer.current.push({ t, x, y })
    lastPushTime.current = t

    while (targetBuffer.current.length > 32) {
      targetBuffer.current.shift()
    }
  }

  const interpolateTarget = (queryT: number) => {
    const buf = targetBuffer.current
    if (buf.length < 2) {
      return { x: buf[0]?.x ?? 0, y: buf[0]?.y ?? 0 }
    }
    if (queryT <= buf[0].t) {
      return { x: buf[0].x, y: buf[0].y }
    }
    if (queryT >= buf[buf.length - 1].t) {
      return { x: buf[buf.length - 1].x, y: buf[buf.length - 1].y }
    }

    let idx = 0
    for (let i = 0; i < buf.length - 1; i++) {
      if (queryT >= buf[i].t && queryT <= buf[i + 1].t) {
        idx = i
        break
      }
    }

    const i0 = Math.max(0, idx - 1)
    const i1 = idx
    const i2 = Math.min(buf.length - 1, idx + 1)
    const i3 = Math.min(buf.length - 1, idx + 2)

    const t0 = buf[i1].t
    const t1 = buf[i2].t
    const span = t1 - t0 || 1
    const localT = (queryT - t0) / span

    return {
      x: catmullRom(buf[i0].x, buf[i1].x, buf[i2].x, buf[i3].x, localT),
      y: catmullRom(buf[i0].y, buf[i1].y, buf[i2].y, buf[i3].y, localT),
    }
  }

  const triggeredCount = dragons.filter(d => d.triggered).length

  useFrame((state, delta) => {
    shakeSeed.current += delta * 40

    const shakeAmount = seismicIntensity > 0.05 ? seismicIntensity * 0.08 : 0
    const shakeX = (Math.sin(shakeSeed.current * 1.3) + Math.sin(shakeSeed.current * 2.7)) * 0.5 * shakeAmount
    const shakeY = (Math.sin(shakeSeed.current * 1.7) + Math.sin(shakeSeed.current * 2.3)) * 0.5 * shakeAmount * 0.5
    const shakeZ = (Math.cos(shakeSeed.current * 1.5) + Math.sin(shakeSeed.current * 3.1)) * 0.5 * shakeAmount

    if (groupRef.current) {
      groupRef.current.position.x = shakeX
      groupRef.current.position.y = shakeY
      groupRef.current.position.z = shakeZ
    }

    const now = performance.now()
    const tx = pillarState.displacement_x
    const ty = pillarState.displacement_y
    if (tx !== lastTargetX.current || ty !== lastTargetY.current) {
      pushTargetSample(tx, ty, now)
      lastTargetX.current = tx
      lastTargetY.current = ty
    }

    renderClock.current += delta
    const smoothDelay = 0.08
    const queryT = (startTime.current !== null)
      ? (now - startTime.current) / 1000 - smoothDelay
      : 0

    const smoothTarget = interpolateTarget(Math.max(0, queryT))

    const springK = 18
    const damping = 3.2

    wobbleRef.current.vx += (smoothTarget.x - wobbleRef.current.x) * springK * delta
    wobbleRef.current.vz += (smoothTarget.y - wobbleRef.current.z) * springK * delta
    wobbleRef.current.vx *= Math.exp(-damping * delta)
    wobbleRef.current.vz *= Math.exp(-damping * delta)
    wobbleRef.current.x += wobbleRef.current.vx * delta
    wobbleRef.current.z += wobbleRef.current.vz * delta

    if (pillarGroupRef.current) {
      pillarGroupRef.current.position.x = wobbleRef.current.x * 100
      pillarGroupRef.current.position.z = wobbleRef.current.z * 100

      const tiltX = wobbleRef.current.z * 20
      const tiltZ = -wobbleRef.current.x * 20
      pillarGroupRef.current.rotation.x = tiltX
      pillarGroupRef.current.rotation.z = tiltZ
    }

    if (triggeredCount === 0 && seismicIntensity < 0.03 && !isSimulating) {
      autoRotateRef.current += delta * 0.1
    }
    if (groupRef.current) {
      groupRef.current.rotation.y = autoRotateRef.current
    }
  })

  const handleBallReset = (dragonId: number) => {
    setResetDragonIds(prev => new Set(prev).add(dragonId))
    setTimeout(() => {
      setResetDragonIds(prev => {
        const next = new Set(prev)
        next.delete(dragonId)
        return next
      })
    }, 100)
  }

  return (
    <>
      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={25}
        target={[0, 2, 0]}
      />

      <Environment preset="night" />

      <ambientLight color="#4A6FA5" intensity={0.4} />

      <directionalLight
        color="#FFD79A"
        intensity={1.5}
        position={[6, 8, 4]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0001}
      />

      <pointLight color="#FF8C00" intensity={0.5} position={[-3, 2, -3]} distance={12} />
      <pointLight color="#4169E1" intensity={0.3} position={[3, 1, 3]} distance={10} />
      <pointLight color="#FFD700" intensity={0.4} position={[0, 5, 0]} distance={15} />

      <Stars
        radius={100}
        depth={50}
        count={3000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />

      <mesh ref={groundRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[15, 64]} />
        <meshStandardMaterial
          color="#1a1a2e"
          metalness={0.3}
          roughness={0.9}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[BASE_RADIUS + 0.5, BASE_RADIUS + 0.8, 64]} />
        <meshStandardMaterial
          color={GOLD_COLOR}
          metalness={0.9}
          roughness={0.3}
          emissive={triggeredCount > 0 ? GOLD_COLOR : '#000000'}
          emissiveIntensity={triggeredCount > 0 ? 0.2 + seismicIntensity * 0.5 : 0}
        />
      </mesh>

      <group ref={groupRef}>
        <Cylinder
          args={[BASE_RADIUS + 0.1, BASE_RADIUS + 0.2, BASE_HEIGHT * 0.3, 48]}
          position={[0, BASE_HEIGHT * 0.15, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={DARK_BRONZE}
            metalness={0.9}
            roughness={0.4}
          />
        </Cylinder>

        <Cylinder
          args={[BASE_RADIUS, BASE_RADIUS + 0.05, BASE_HEIGHT, 48]}
          position={[0, BASE_HEIGHT * 0.5 + BASE_HEIGHT * 0.3, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={BRONZE_COLOR}
            metalness={0.85}
            roughness={0.45}
          />
        </Cylinder>

        <Torus
          args={[BASE_RADIUS - 0.1, 0.04, 12, 64]}
          position={[0, BASE_HEIGHT * 0.5 + BASE_HEIGHT * 0.3 + BASE_HEIGHT * 0.45, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={GOLD_COLOR}
            metalness={1}
            roughness={0.25}
          />
        </Torus>

        <mesh ref={bodyRef} position={[0, BASE_HEIGHT + BODY_HEIGHT / 2 + BASE_HEIGHT * 0.3, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[BODY_TOP_RADIUS, BODY_BOTTOM_RADIUS, BODY_HEIGHT, 64]} />
          <meshStandardMaterial
            color={BRONZE_COLOR}
            metalness={0.85}
            roughness={0.45}
          />
        </mesh>

        <group position={[0, BASE_HEIGHT + BODY_HEIGHT * 0.3 + BASE_HEIGHT * 0.3, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <Torus
              key={i}
              args={[BODY_BOTTOM_RADIUS - 0.05 - i * 0.08, 0.02, 8, 64]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <meshStandardMaterial
                color={DARK_BRONZE}
                metalness={0.9}
                roughness={0.35}
              />
            </Torus>
          ))}
        </group>

        <group position={[0, BASE_HEIGHT + BODY_HEIGHT / 2 + BASE_HEIGHT * 0.3, 0]}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i * 45 * Math.PI) / 180
            const r = BODY_TOP_RADIUS - 0.15
            return (
              <group key={i} position={[Math.sin(a) * r, 0, Math.cos(a) * r]}>
                <mesh castShadow>
                  <sphereGeometry args={[0.1, 12, 12]} />
                  <meshStandardMaterial
                    color={DARK_BRONZE}
                    metalness={0.9}
                    roughness={0.35}
                  />
                </mesh>
              </group>
            )
          })}
        </group>

        <Cylinder
          args={[BODY_TOP_RADIUS + 0.08, BODY_TOP_RADIUS - 0.05, 0.25, 64]}
          position={[0, BASE_HEIGHT + BODY_HEIGHT + BASE_HEIGHT * 0.3 + 0.125, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={DARK_BRONZE}
            metalness={0.9}
            roughness={0.4}
          />
        </Cylinder>

        <Torus
          args={[BODY_TOP_RADIUS + 0.04, 0.05, 12, 64]}
          position={[0, BASE_HEIGHT + BODY_HEIGHT + BASE_HEIGHT * 0.3 + 0.25, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={GOLD_COLOR}
            metalness={1}
            roughness={0.2}
          />
        </Torus>

        <group ref={pillarGroupRef} position={[0, BASE_HEIGHT + BASE_HEIGHT * 0.3, 0]}>
          <Cylinder
            args={[0.22, 0.28, 0.15, 16]}
            position={[0, 0.075, 0]}
            castShadow
          >
            <meshStandardMaterial
              color="#8B6914"
              metalness={0.95}
              roughness={0.3}
            />
          </Cylinder>

          <Cylinder
            args={[PILLAR_RADIUS, PILLAR_RADIUS, PILLAR_HEIGHT, 24]}
            position={[0, 0.15 + PILLAR_HEIGHT / 2, 0]}
            castShadow
          >
            <meshStandardMaterial
              color="#B8860B"
              metalness={0.95}
              roughness={0.3}
            />
          </Cylinder>

          <mesh position={[0, 0.15 + PILLAR_HEIGHT + 0.15, 0]} castShadow>
            <sphereGeometry args={[0.25, 24, 24]} />
            <meshStandardMaterial
              color={GOLD_COLOR}
              metalness={1}
              roughness={0.2}
              emissive={seismicIntensity > 0.05 ? GOLD_COLOR : '#000000'}
              emissiveIntensity={seismicIntensity * 0.8}
            />
          </mesh>

          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i * 45 * Math.PI) / 180
            return (
              <group key={i} position={[0, 0.15 + PILLAR_HEIGHT * 0.7, 0]} rotation={[0, -a, 0]}>
                <mesh position={[0, 0, 0.35]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
                  <meshStandardMaterial
                    color="#8B6914"
                    metalness={0.95}
                    roughness={0.3}
                  />
                </mesh>
                <mesh position={[0, 0, 0.6]} castShadow>
                  <sphereGeometry args={[0.08, 12, 12]} />
                  <meshStandardMaterial
                    color={DARK_BRONZE}
                    metalness={0.9}
                    roughness={0.35}
                  />
                </mesh>
              </group>
            )
          })}
        </group>

        {dragons.map((dragon, i) => (
          <Dragon
            key={`dragon-${dragon.id}`}
            angle={DIRECTION_ANGLES[i]}
            triggered={dragon.triggered || resetDragonIds.has(dragon.id)}
            ballDropped={dragon.ball_dropped && !resetDragonIds.has(dragon.id)}
            onBallReset={() => handleBallReset(dragon.id)}
          />
        ))}

        {DIRECTION_ANGLES.map((angle, i) => (
          <Frog key={`frog-${i}`} angle={angle} />
        ))}
      </group>

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.3}
          luminanceSmoothing={0.9}
          intensity={1.2}
          mipmapBlur
        />
      </EffectComposer>
    </>
  )
}

export { DIRECTION_NAMES, DIRECTION_ANGLES }
export type { PillarState, DragonData, DidongyiModelProps }
