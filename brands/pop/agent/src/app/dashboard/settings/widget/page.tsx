'use client';

// Widget Appearance — search bar vs chat bubble. Extracted from the old
// single-scroll settings page when Configure became a card grid.

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { MdArrowBack } from 'react-icons/md';

type WidgetStyle = 'searchbar' | 'bubble';

export default function WidgetAppearancePage() {
  const [widgetStyle, setWidgetStyle] = useState<WidgetStyle>('searchbar');
  const [widgetStyleSaved, setWidgetStyleSaved] = useState(false);
  const [widgetStyleError, setWidgetStyleError] = useState<string | null>(null);
  const [loadingWidgetStyle, setLoadingWidgetStyle] = useState(true);

  useEffect(() => {
    async function fetchWidgetStyle() {
      try {
        const response = await fetch('/api/dashboard/settings/widget-style', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setWidgetStyle(data.style || 'searchbar');
        }
      } catch (error) {
        console.error('Error fetching widget style:', error);
      } finally {
        setLoadingWidgetStyle(false);
      }
    }
    fetchWidgetStyle();
  }, []);

  async function handleWidgetStyleSelect(style: WidgetStyle) {
    const previousStyle = widgetStyle;
    setWidgetStyle(style);
    setWidgetStyleError(null);
    try {
      const response = await fetch('/api/dashboard/settings/widget-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ style }),
      });
      if (response.ok) {
        setWidgetStyleSaved(true);
        setTimeout(() => setWidgetStyleSaved(false), 2000);
      } else {
        const error = await response.json();
        console.error('Error saving widget style:', error);
        if (response.status === 403) setWidgetStyleError('Admin access required to change widget style');
        else if (response.status === 401) setWidgetStyleError('Please log in to save settings');
        else setWidgetStyleError(error.error || 'Failed to save widget style');
        setWidgetStyle(previousStyle);
        setTimeout(() => setWidgetStyleError(null), 5000);
      }
    } catch (error) {
      console.error('Error saving widget style:', error);
      setWidgetStyleError('Network error. Please try again.');
      setWidgetStyle(previousStyle);
      setTimeout(() => setWidgetStyleError(null), 5000);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl">
        <a href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-xs mb-4" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <MdArrowBack size={15} /> Configure
        </a>
        <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Widget Appearance</h1>

        <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
            Choose how the chat widget appears on your website
          </h3>

          {loadingWidgetStyle ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Search Bar Option */}
              <button
                onClick={() => handleWidgetStyleSelect('searchbar')}
                className={`p-6 rounded-lg border-2 transition-all text-left ${widgetStyle === 'searchbar' ? 'border-current' : 'border-transparent hover:border-[var(--border-primary)]'}`}
                style={{ background: 'var(--bg-tertiary)', borderColor: widgetStyle === 'searchbar' ? 'var(--accent-primary)' : 'transparent' }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Search Bar</h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Search bar at bottom of page</p>
                  </div>
                  {widgetStyle === 'searchbar' && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--button-bg)' }}>
                      <svg className="w-4 h-4 text-[var(--text-button)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="mt-4 p-4 rounded border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-10 rounded-lg px-4 flex items-center" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                      <svg className="w-5 h-5 mr-2" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Search or ask a question...</span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Chat Bubble Option */}
              <button
                onClick={() => handleWidgetStyleSelect('bubble')}
                className={`p-6 rounded-lg border-2 transition-all text-left ${widgetStyle === 'bubble' ? 'border-current' : 'border-transparent hover:border-[var(--border-primary)]'}`}
                style={{ background: 'var(--bg-tertiary)', borderColor: widgetStyle === 'bubble' ? 'var(--accent-primary)' : 'transparent' }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Chat Bubble</h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Floating bubble icon on bottom-right</p>
                  </div>
                  {widgetStyle === 'bubble' && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--button-bg)' }}>
                      <svg className="w-4 h-4 text-[var(--text-button)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="mt-4 p-4 rounded border relative" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)', minHeight: '80px' }}>
                  <div className="absolute bottom-2 right-2">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg" style={{ background: 'var(--button-bg)' }}>
                      <svg className="w-7 h-7 text-[var(--text-button)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}

          {widgetStyleSaved && (
            <div className="mt-4 p-3 rounded-lg text-sm text-center" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
              Widget style saved successfully!
            </div>
          )}
          {widgetStyleError && (
            <div className="mt-4 p-3 rounded-lg text-sm text-center" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              {widgetStyleError}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
