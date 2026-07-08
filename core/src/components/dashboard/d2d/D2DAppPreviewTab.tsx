'use client'

// App Preview tab — the volunteer field-app screens. These are real design
// renders (phone device already in-frame, backdrop cut out to transparent PNG),
// staged from brands/pop/public/d2d-app. They walk the canvass flow:
// Home → Map/navigate → Visit form → Photo capture → Visit logged.

const SCREENS = [
  { src: '/d2d-app/01-home.png',        step: 1, caption: "Worker home — today's booth & progress" },
  { src: '/d2d-app/03-map.png',         step: 2, caption: 'Visit map — route & next-stop navigation' },
  { src: '/d2d-app/02-visit-form.png',  step: 3, caption: 'Household visit — members, grievance, lean, flag' },
  { src: '/d2d-app/04-capture.png',     step: 4, caption: 'Photo capture — geo-tagged house' },
  { src: '/d2d-app/05-success.png',     step: 5, caption: 'Visit logged — synced, next house queued' },
]

export default function D2DAppPreviewTab() {
  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Volunteer Field App</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2, maxWidth: 720, lineHeight: 1.5 }}>
          What a karyakarta uses at the doorstep. Every saved visit POSTs to{' '}
          <code style={{ fontSize: 11.5, color: 'var(--accent-primary)' }}>/api/agent/d2d/log</code> — the same
          intake that already feeds the Field Log and War Room.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
        {SCREENS.map((s) => (
          <figure key={s.src} style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.src}
              alt={s.caption}
              draggable={false}
              style={{
                height: 600,
                width: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 22px 48px rgba(0,0,0,0.45))',
                userSelect: 'none',
              }}
            />
            <figcaption style={{ fontSize: 12.5, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 300 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{s.step}</span> · {s.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
