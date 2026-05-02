'use client'

import React, { useState, useEffect, useRef } from 'react';
import type { BrandConfig } from '@/configs';

interface CostGuideFormInlineProps {
  prefillName?: string;
  prefillPhone?: string;
  waNumber: string;
  brand?: string;
  config?: BrandConfig;
  onContactDraft?: (data: { name?: string; phone?: string }) => void;
  onSubmit: (name: string, phone: string) => Promise<void>;
  onClose: () => void;
}

export function CostGuideFormInline({
  prefillName = '',
  prefillPhone = '',
  waNumber,
  config,
  onContactDraft,
  onSubmit,
  onClose,
}: CostGuideFormInlineProps) {
  const [name, setName] = useState(prefillName);
  const [phone, setPhone] = useState(prefillPhone.replace(/^\+1\s*/, '').trim());
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSubmitting(true);
    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const waText = encodeURIComponent(
        `Hi Windchasers, please send me the pilot training cost guide. My name is ${name.trim()}.`
      );
      await onSubmit(name.trim(), phone.trim());
      window.open(`https://wa.me/${waNumber}?text=${waText}`, '_blank', 'noopener,noreferrer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={scrollRef}
      style={{
        margin: '8px 0',
        borderRadius: '16px',
        background: 'var(--dark-card, rgba(0,0,0,0.4))',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: '1px solid var(--border-accent, rgba(255,255,255,0.2))',
        padding: '16px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%',
          width: 28,
          height: 28,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-primary, #fff)',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>

      <p style={{
        margin: '0 0 4px',
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--text-primary, #fff)',
      }}>
        Get the cost guide on WhatsApp
      </p>
      <p style={{
        margin: '0 0 14px',
        fontSize: 12,
        color: 'var(--text-secondary, rgba(255,255,255,0.7))',
      }}>
        We'll send it instantly — no calls.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            onContactDraft?.({ name: e.target.value });
          }}
          required
          style={{
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10,
            color: 'var(--text-primary, #fff)',
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
          }}
        />
        <input
          type="tel"
          placeholder="Phone number"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            onContactDraft?.({ phone: e.target.value });
          }}
          required
          style={{
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10,
            color: 'var(--text-primary, #fff)',
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
          }}
        />
        <button
          type="submit"
          disabled={submitting || !name.trim() || !phone.trim()}
          style={{
            padding: '11px 14px',
            background: 'var(--primary-color, #C5A572)',
            border: 'none',
            borderRadius: 10,
            color: '#1A1A1A',
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting || !name.trim() || !phone.trim() ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
          {submitting ? 'Opening WhatsApp…' : 'Send on WhatsApp'}
        </button>
      </form>
    </div>
  );
}
