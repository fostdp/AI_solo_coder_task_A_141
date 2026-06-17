import { Canvas } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import DidongyiModel, { DIRECTION_NAMES, DIRECTION_ANGLES } from './DidongyiModel'
import type { PillarState, DragonData, DidongyiModelProps } from './DidongyiModel'

interface SceneCanvasProps extends DidongyiModelProps {}

const LABEL_RADIUS = 4.2

function DirectionLabels() {
  return (
    <>
      {DIRECTION_NAMES.map((name, i) => {
        const angle = (DIRECTION_ANGLES[i] * Math.PI) / 180
        const x = Math.sin(angle) * LABEL_RADIUS
        const z = Math.cos(angle) * LABEL_RADIUS
        return (
          <Html
            key={`label-${i}`}
            position={[x, 1.2, z]}
            center
            distanceFactor={8}
            style={{ pointerEvents: 'none' }}
          >
            <div
              style={{
                color: '#FFD700',
                fontSize: '18px',
                fontWeight: 'bold',
                textShadow: '0 0 8px rgba(255, 215, 0, 0.6), 0 0 2px rgba(0,0,0,0.9)',
                fontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              {name}
            </div>
          </Html>
        )
      })}
    </>
  )
}

export default function SceneCanvas({
  pillarState,
  dragons,
  isSimulating = false,
  seismicIntensity = 0
}: SceneCanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        dpr={[1, 2]}
        shadows
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: 3,
          toneMappingExposure: 1.2
        }}
        camera={{
          position: [8, 6, 8],
          fov: 50,
          near: 0.1,
          far: 200
        }}
      >
        <fog attach="fog" args={['#0a0a1a', 15, 50]} />

        <DidongyiModel
          pillarState={pillarState}
          dragons={dragons}
          isSimulating={isSimulating}
          seismicIntensity={seismicIntensity}
        />

        <DirectionLabels />
      </Canvas>
    </div>
  )
}

export type { SceneCanvasProps, PillarState, DragonData }
