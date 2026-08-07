import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

/**
 * GET /api/reports/brief-card?d=<base64 json>
 *
 * The daily report as a PNG.
 *
 * Telegram gives a bot no tables and no alignment, so a text report is a list
 * of lines however it is arranged - which is exactly what kept looking wrong.
 * A picture has none of those limits: columns line up, sections have weight,
 * and it renders identically on every phone instead of depending on font size
 * and screen width.
 *
 * Deliberately dumb: every number arrives in the query string. No database, no
 * brand config, nothing that would tie this to a runtime or need auth. It
 * draws what it is handed, which also makes it trivial to preview in a
 * browser.
 */

interface Row { label: string; value: number | string; sub?: boolean }
interface Card {
  title: string
  window: string
  headline: string
  headlineLabel: string
  sections: Array<{ heading: string; rows: Row[] }>
}

const GOLD = '#C5A572'
const INK = '#141417'
const PANEL = '#1C1C21'
const LINE = '#2A2A31'
const TEXT = '#F4F1EA'
const MUTED = '#8B8B94'

export async function GET(req: NextRequest) {
  let card: Card
  try {
    const raw = req.nextUrl.searchParams.get('d') || ''
    card = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return new Response('bad payload', { status: 400 })
  }

  // Height from content, not a guess. A fixed 1250 cut OPERATIONS off the
  // bottom entirely - the rows below the fold simply did not exist in the
  // picture, which is worse than an ugly report.
  const ROW = 69
  const SUB_ROW = 57
  const HEADING = 45
  const SECTION_GAP = 30
  const height =
    112 + // page padding
    120 + // title + window
    136 + // headline panel
    card.sections.reduce(
      (h, s) =>
        h + HEADING + SECTION_GAP + s.rows.reduce((r, row) => r + (row.sub ? SUB_ROW : ROW), 0),
      0,
    ) +
    24 // breathing room at the foot

  return new ImageResponse(
    (
      <div
        style={{
          width: '1000px',
          height: `${height}px`,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: INK,
          padding: '56px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '36px' }}>
          <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, color: TEXT, letterSpacing: '-0.5px' }}>
            {card.title}
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: MUTED, marginTop: '6px' }}>{card.window}</div>
        </div>

        {/* Headline number - the one thing read at a glance */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            backgroundColor: PANEL,
            border: `2px solid ${GOLD}55`,
            borderRadius: '20px',
            padding: '28px 36px',
            marginBottom: '36px',
          }}
        >
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, color: GOLD, lineHeight: 1 }}>
            {card.headline}
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: MUTED, marginLeft: '20px' }}>
            {card.headlineLabel}
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          {card.sections.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: '30px' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 20,
                  fontWeight: 700,
                  color: GOLD,
                  letterSpacing: '2px',
                  marginBottom: '12px',
                }}
              >
                {s.heading}
              </div>
              {s.rows.map((r, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1px solid ${LINE}`,
                    padding: r.sub ? '9px 0 9px 34px' : '12px 0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: r.sub ? 25 : 29,
                      color: r.sub ? MUTED : TEXT,
                    }}
                  >
                    {r.label}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: r.sub ? 27 : 32,
                      fontWeight: 700,
                      color: r.sub ? TEXT : GOLD,
                    }}
                  >
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1000, height },
  )
}
