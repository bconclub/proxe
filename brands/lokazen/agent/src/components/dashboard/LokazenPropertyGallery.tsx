'use client'

import React, { useEffect, useState } from 'react'

/**
 * Property photo gallery for a Lokazen owner lead. Images live on lokazen.in,
 * not in PROXe — so we lazy-fetch them by property_id from our same-origin
 * media proxy (`/api/dashboard/leads/property-media`) only when the lead is
 * open. Thumbnails; click to open a full-screen lightbox.
 */

interface MediaResponse {
  images: string[]
  count: number
  property_url: string | null
  title: string | null
  details?: {
    locality?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    pincode?: string | null
    map_url?: string | null
  }
}

const ORANGE = '#FF5200'

export function LokazenPropertyGallery({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [data, setData] = useState<MediaResponse | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    fetch(`/api/dashboard/leads/property-media?property_id=${encodeURIComponent(propertyId)}`)
      .then((r) => r.json())
      .then((j: MediaResponse) => {
        if (cancelled) return
        setData(j)
        setState(j.images && j.images.length > 0 ? 'ready' : 'empty')
      })
      .catch(() => !cancelled && setState('error'))
    return () => { cancelled = true }
  }, [propertyId])

  const images = data?.images || []
  const locationRows = data?.details
    ? [
        ['Locality', data.details.locality],
        ['Address', data.details.address],
        ['City', data.details.city],
        ['State', data.details.state],
        ['Pincode', data.details.pincode],
      ].filter(([, value]) => value && String(value).trim())
    : []

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6B7280)' }}>
          Property photos{state === 'ready' ? ` (${images.length})` : ''}
        </span>
        {data?.property_url && (
          <a href={data.property_url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: ORANGE, textDecoration: 'none' }}>
            View listing ↗
          </a>
        )}
      </div>

      {state === 'loading' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6B7280)' }}>Loading photos…</div>
      )}
      {state === 'error' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6B7280)' }}>Could not load photos.</div>
      )}
      {state === 'empty' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6B7280)' }}>
          No photos uploaded yet{data?.property_url ? '.' : ' for this listing.'}
        </div>
      )}

      {state === 'ready' && (
        // Compact: one small cover thumbnail (with a +N badge when there are
        // more) that opens the full lightbox — keeps the lead card uncluttered.
        <button
          type="button"
          onClick={() => setLightbox(0)}
          style={{
            position: 'relative', width: 88, height: 66, borderRadius: 10, overflow: 'hidden',
            border: '1px solid var(--border-primary, rgba(255,255,255,0.1))', padding: 0, cursor: 'pointer', background: '#000',
          }}
          aria-label={`View ${images.length} property photo${images.length > 1 ? 's' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0]} alt="Property cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {images.length > 1 && (
            <span style={{
              position: 'absolute', right: 4, bottom: 4, background: 'rgba(0,0,0,0.7)', color: '#fff',
              fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '1px 6px',
            }}>+{images.length - 1}</span>
          )}
        </button>
      )}

      {locationRows.length > 0 && (
        <div style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '8px 12px',
          fontSize: 12,
        }}>
          {locationRows.map(([label, value]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted, #6B7280)' }}>{label}</div>
              <div style={{ color: 'var(--text-primary, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(value)}>{String(value)}</div>
            </div>
          ))}
          {data?.details?.map_url && (
            <a href={data.details.map_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, fontWeight: 700, color: ORANGE, textDecoration: 'none' }}>
              Open map
            </a>
          )}
        </div>
      )}

      {lightbox != null && images[lightbox] && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2147483647, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '92vw', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[lightbox]} alt="Property" style={{ maxWidth: '92vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <button type="button" onClick={() => setLightbox((l) => (l! - 1 + images.length) % images.length)}
                style={{ background: 'transparent', border: `1px solid ${ORANGE}`, color: ORANGE, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ‹ Prev
              </button>
              <span style={{ color: '#fff', fontSize: 12 }}>{lightbox + 1} / {images.length}</span>
              <button type="button" onClick={() => setLightbox((l) => (l! + 1) % images.length)}
                style={{ background: ORANGE, border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Next ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
