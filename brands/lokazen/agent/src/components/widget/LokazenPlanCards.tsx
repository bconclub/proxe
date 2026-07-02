'use client'

import React from 'react'

/**
 * Lokazen plan cards — a compact, in-widget rendering of the /for-brands#plans
 * pricing section, so the plans land with some visual weight instead of a flat
 * wall of text. Self-contained (inline styles, brand orange) so it drops into
 * the chat message stream cleanly. Triggered by the [[PLANS]] marker the agent
 * emits on its "how we work / choose a plan" message.
 *
 * Reusable shape: the PLAN data is a plain array — lift it to brand config to
 * make this work for other brands.
 */

export interface WidgetPlan {
  name: string
  price: string
  popular?: boolean
  features: string[]
  /** The exact button label the agent expects, so Choose reuses the plan flow. */
  selectLabel: string
}

export const LOKAZEN_PLANS: WidgetPlan[] = [
  {
    name: 'Starter',
    price: '₹4,999',
    features: ['Property database access', 'AI matching', 'Location reports', 'Owner contacts', '30 days validity'],
    selectLabel: 'Starter Rs 4,999',
  },
  {
    name: 'Professional',
    price: '₹9,999',
    popular: true,
    features: ['Everything in Starter', 'Dedicated account manager', 'On-ground site visits', 'Negotiation support', 'WhatsApp support', '60 days validity'],
    selectLabel: 'Professional 9,999',
  },
  {
    name: 'Premium',
    price: '₹19,999',
    features: ['Everything in Professional', '24/7 priority support', 'Unlimited site visits', 'Legal document review', 'Multi-location search', '90 days validity'],
    selectLabel: 'Premium Rs 19,999',
  },
]

const ORANGE = '#FF5200'

export function LokazenPlanCards({
  plans = LOKAZEN_PLANS,
  focus,
  onChoose,
  onAction,
}: {
  plans?: WidgetPlan[]
  /** When set to a plan name, render only that plan, expanded, with CTAs. */
  focus?: string
  /** Overview: send the plan's select label to pick it. */
  onChoose?: (selectLabel: string) => void
  /** Detail (focus) view: primary "Start this plan" / secondary "Talk to the team". */
  onAction?: (label: string) => void
}) {
  // Single-plan detail view: one expanded card with Start / Talk CTAs.
  const focused = focus ? plans.find((p) => p.name.toLowerCase() === focus.toLowerCase()) : null
  if (focused) {
    return (
      <div style={{ width: '100%', marginTop: 4 }}>
        <div
          style={{
            borderRadius: 14,
            padding: '14px 16px',
            background: 'rgba(255,82,0,0.06)',
            border: `1px solid ${ORANGE}`,
            boxShadow: `0 6px 18px rgba(255,82,0,0.14)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #F8F9FA)' }}>{focused.name}</span>
            <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary, #F8F9FA)' }}>{focused.price}<span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted, #6B7280)' }}> one-time</span></span>
          </div>
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {focused.features.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.4, color: 'var(--text-secondary, #B8BCC4)' }}>
                <span style={{ color: ORANGE, flexShrink: 0, fontWeight: 800 }}>·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => onAction?.('Start this plan')}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none', background: ORANGE, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Start this plan
            </button>
            <button
              type="button"
              onClick={() => onAction?.('Talk to the team')}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: `1px solid ${ORANGE}`, background: 'transparent', color: ORANGE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Talk to the team
            </button>
          </div>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--text-muted, #6B7280)', textAlign: 'center' }}>
          Success fee applies on deal closure
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 4 }}>
      {plans.map((p) => (
        <div
          key={p.name}
          style={{
            position: 'relative',
            borderRadius: 14,
            padding: '12px 14px',
            background: p.popular ? 'rgba(255,82,0,0.06)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${p.popular ? ORANGE : 'rgba(255,255,255,0.10)'}`,
            boxShadow: p.popular ? `0 0 0 1px ${ORANGE}, 0 6px 18px rgba(255,82,0,0.14)` : 'none',
          }}
        >
          {p.popular && (
            <span
              style={{
                position: 'absolute',
                top: -9,
                left: 14,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#fff',
                background: ORANGE,
                borderRadius: 999,
                padding: '2px 8px',
              }}
            >
              Most Popular
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #F8F9FA)' }}>{p.name}</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary, #F8F9FA)' }}>{p.price}</span>
          </div>

          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {p.features.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, lineHeight: 1.35, color: 'var(--text-secondary, #B8BCC4)' }}>
                <span style={{ color: ORANGE, flexShrink: 0, fontWeight: 800 }}>·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => onChoose?.(p.selectLabel)}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '8px 12px',
              borderRadius: 10,
              border: p.popular ? 'none' : `1px solid ${ORANGE}`,
              background: p.popular ? ORANGE : 'transparent',
              color: p.popular ? '#fff' : ORANGE,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Choose {p.name}
          </button>
        </div>
      ))}

      <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--text-muted, #6B7280)', textAlign: 'center' }}>
        Success fee applies on deal closure
      </p>
    </div>
  )
}
