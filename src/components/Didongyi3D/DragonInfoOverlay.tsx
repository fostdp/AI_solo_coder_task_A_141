import type { DragonData } from './DidongyiModel'

interface DragonInfoOverlayProps {
  dragons: DragonData[]
  layout?: 'octagon' | 'list'
  className?: string
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '--'
  const date = new Date(timestamp)
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

interface DragonBadgeProps {
  dragon: DragonData
}

function DragonBadge({ dragon }: DragonBadgeProps) {
  const isTriggered = dragon.triggered
  const statusColor = isTriggered ? '#ef4444' : '#22c55e'
  const statusGlow = isTriggered ? '0 0 12px rgba(239, 68, 68, 0.8)' : '0 0 8px rgba(34, 197, 94, 0.5)'
  const borderColor = isTriggered ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 215, 0, 0.3)'
  const bgColor = isTriggered
    ? 'rgba(239, 68, 68, 0.12)'
    : 'rgba(20, 20, 40, 0.7)'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '12px 14px',
        background: bgColor,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: '12px',
        border: `1.5px solid ${borderColor}`,
        minWidth: '88px',
        transition: 'all 0.3s ease',
        boxShadow: isTriggered ? '0 0 20px rgba(239, 68, 68, 0.25)' : '0 4px 12px rgba(0, 0, 0, 0.3)'
      }}
    >
      <div
        style={{
          fontSize: '20px',
          fontWeight: 900,
          color: isTriggered ? '#fca5a5' : '#FFD700',
          fontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
          letterSpacing: '1px',
          textShadow: isTriggered ? '0 0 10px rgba(239, 68, 68, 0.8)' : '0 0 8px rgba(255, 215, 0, 0.5)'
        }}
      >
        {dragon.direction}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: statusColor,
            boxShadow: statusGlow,
            animation: isTriggered ? 'pulse 1.2s ease-in-out infinite' : 'none'
          }}
        />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: isTriggered ? '#fca5a5' : '#86efac',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          {isTriggered ? '触发' : '待命'}
        </span>
      </div>

      <div
        style={{
          fontSize: '10px',
          color: isTriggered ? '#fbbf24' : '#94a3b8',
          fontFamily: 'monospace',
          opacity: isTriggered ? 1 : 0.6,
          marginTop: '2px'
        }}
      >
        {formatTime((dragon as DragonData & { triggerTime?: number }).triggerTime)}
      </div>

      {dragon.ball_dropped && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#fbbf24',
            padding: '2px 8px',
            background: 'rgba(251, 191, 36, 0.15)',
            borderRadius: '10px',
            border: '1px solid rgba(251, 191, 36, 0.4)'
          }}
        >
          铜球已落
        </div>
      )}
    </div>
  )
}

function OctagonLayout({ dragons }: { dragons: DragonData[] }) {
  const positions = [
    { top: '0%', left: '50%', transform: 'translate(-50%, -20%)' },
    { top: '8%', right: '2%', transform: 'translateY(-10%)' },
    { top: '50%', right: '0%', transform: 'translateY(-50%)' },
    { bottom: '8%', right: '2%', transform: 'translateY(10%)' },
    { bottom: '0%', left: '50%', transform: 'translate(-50%, 20%)' },
    { bottom: '8%', left: '2%', transform: 'translateY(10%)' },
    { top: '50%', left: '0%', transform: 'translateY(-50%)' },
    { top: '8%', left: '2%', transform: 'translateY(-10%)' }
  ]

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      {dragons.map((dragon, i) => (
        <div
          key={dragon.id}
          style={{
            position: 'absolute',
            ...positions[i],
            pointerEvents: 'auto'
          }}
        >
          <DragonBadge dragon={dragon} />
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}

function ListLayout({ dragons }: { dragons: DragonData[] }) {
  const triggeredCount = dragons.filter(d => d.triggered).length

  return (
    <div
      style={{
        position: 'absolute',
        right: '16px',
        top: '16px',
        width: '260px',
        maxHeight: 'calc(100% - 32px)',
        overflowY: 'auto',
        padding: '16px',
        background: 'rgba(10, 10, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '16px',
        border: '1.5px solid rgba(255, 215, 0, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        zIndex: 10
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(255, 215, 0, 0.15)'
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 800,
            color: '#FFD700',
            fontFamily: '"Microsoft YaHei", sans-serif',
            textShadow: '0 0 10px rgba(255, 215, 0, 0.4)',
            letterSpacing: '1px'
          }}
        >
          八方龙首状态
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            background: triggeredCount > 0
              ? 'rgba(239, 68, 68, 0.2)'
              : 'rgba(34, 197, 94, 0.15)',
            borderRadius: '20px',
            border: `1px solid ${triggeredCount > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.4)'}`
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 800,
              color: triggeredCount > 0 ? '#fca5a5' : '#86efac',
              fontFamily: 'monospace'
            }}
          >
            {triggeredCount}/8
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {dragons.map((dragon) => (
          <div
            key={dragon.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              background: dragon.triggered
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(30, 30, 50, 0.6)',
              borderRadius: '10px',
              border: `1px solid ${dragon.triggered
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(255, 215, 0, 0.1)'}`,
              transition: 'all 0.3s ease'
            }}
          >
            <div
              style={{
                fontSize: '16px',
                fontWeight: 900,
                color: dragon.triggered ? '#fca5a5' : '#FFD700',
                fontFamily: '"Microsoft YaHei", sans-serif',
                width: '32px',
                textAlign: 'center'
              }}
            >
              {dragon.direction}
            </div>

            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: dragon.triggered ? '#ef4444' : '#22c55e',
                  boxShadow: dragon.triggered
                    ? '0 0 10px rgba(239, 68, 68, 0.8)'
                    : '0 0 6px rgba(34, 197, 94, 0.5)',
                  animation: dragon.triggered ? 'listPulse 1.2s ease-in-out infinite' : 'none'
                }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: dragon.triggered ? '#fca5a5' : '#86efac'
                }}
              >
                {dragon.triggered ? '已触发' : '待机中'}
              </span>
              {dragon.ball_dropped && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#fbbf24',
                    padding: '2px 6px',
                    background: 'rgba(251, 191, 36, 0.15)',
                    borderRadius: '8px'
                  }}
                >
                  落球
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: '11px',
                color: dragon.triggered ? '#fbbf24' : '#64748b',
                fontFamily: 'monospace'
              }}
            >
              {formatTime((dragon as DragonData & { triggerTime?: number }).triggerTime)}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes listPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}

export default function DragonInfoOverlay({
  dragons,
  layout = 'list',
  className = ''
}: DragonInfoOverlayProps) {
  return (
    <div className={className}>
      {layout === 'octagon' ? (
        <OctagonLayout dragons={dragons} />
      ) : (
        <ListLayout dragons={dragons} />
      )}
    </div>
  )
}

export type { DragonInfoOverlayProps }
