'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const ACCENT_THEMES = [
  { id: 'proxe', name: 'PROXe Purple', color: '#8B5CF6', darkColor: '#8B5CF6' },
  { id: 'gold', name: 'Electric Lime', color: '#afd510', darkColor: '#afd510' },
  { id: 'orange', name: 'Sunset Orange', color: '#fc7301', darkColor: '#fc7301' },
  { id: 'grey', name: 'Neutral Grey', color: '#6B7280', darkColor: '#9CA3AF' },
];

type WidgetStyle = 'searchbar' | 'bubble';

export default function SettingsPage() {
  const [selectedTheme, setSelectedTheme] = useState('proxe');
  const [saved, setSaved] = useState(false);
  const [widgetStyle, setWidgetStyle] = useState<WidgetStyle>('searchbar');
  const [widgetStyleSaved, setWidgetStyleSaved] = useState(false);
  const [loadingWidgetStyle, setLoadingWidgetStyle] = useState(true);

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('proxe-accent-theme');
    if (savedTheme) {
      setSelectedTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  // Load saved widget style on mount
  useEffect(() => {
    async function fetchWidgetStyle() {
      try {
        const response = await fetch('/api/dashboard/settings/widget-style');
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

  // Apply theme to CSS variables
  function applyTheme(themeId: string) {
    const theme = ACCENT_THEMES.find(t => t.id === themeId);
    if (theme) {
      document.documentElement.style.setProperty('--accent-primary', theme.color);
      document.documentElement.style.setProperty('--accent-light', theme.color);
      document.documentElement.style.setProperty('--accent-subtle', `${theme.color}20`);
    }
  }

  // Handle theme selection
  function handleThemeSelect(themeId: string) {
    setSelectedTheme(themeId);
    applyTheme(themeId);
    localStorage.setItem('proxe-accent-theme', themeId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Handle widget style selection
  async function handleWidgetStyleSelect(style: WidgetStyle) {
    setWidgetStyle(style);
    try {
      const response = await fetch('/api/dashboard/settings/widget-style', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ style }),
      });

      if (response.ok) {
        setWidgetStyleSaved(true);
        setTimeout(() => setWidgetStyleSaved(false), 2000);
      } else {
        const error = await response.json();
        console.error('Error saving widget style:', error);
        // Revert on error
        const currentStyle = widgetStyle;
        setWidgetStyle(currentStyle);
      }
    } catch (error) {
      console.error('Error saving widget style:', error);
      // Revert on error
      const currentStyle = widgetStyle;
      setWidgetStyle(currentStyle);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h1>

        {/* Theme Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Theme
          </h2>
          
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
              Accent Color
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ACCENT_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedTheme === theme.id ? 'border-current' : 'border-transparent'
                  }`}
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: selectedTheme === theme.id ? theme.color : 'transparent',
                  }}
                >
                  {/* Color Preview Circle */}
                  <div
                    className="w-12 h-12 rounded-full mx-auto mb-3"
                    style={{ background: theme.color }}
                  />
                  
                  {/* Theme Name */}
                  <p 
                    className="text-sm font-medium text-center"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {theme.name}
                  </p>
                  
                  {/* Color Code */}
                  <p 
                    className="text-xs text-center mt-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {theme.color}
                  </p>
                  
                  {/* Selected Indicator */}
                  {selectedTheme === theme.id && (
                    <div 
                      className="mt-2 text-xs text-center font-medium"
                      style={{ color: theme.color }}
                    >
                      ✓ Active
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Saved Notification */}
            {saved && (
              <div 
                className="mt-4 p-3 rounded-lg text-sm text-center"
                style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
              >
                Theme saved successfully!
              </div>
            )}
          </div>
        </div>

        {/* Widget Appearance Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Widget Appearance
          </h2>
          
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
              Choose how the chat widget appears on your website
            </h3>
            
            {loadingWidgetStyle ? (
              <div className="text-center py-8">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Loading...
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Search Bar Option */}
                <button
                  onClick={() => handleWidgetStyleSelect('searchbar')}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    widgetStyle === 'searchbar'
                      ? 'border-current'
                      : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor:
                      widgetStyle === 'searchbar'
                        ? 'var(--accent-primary)'
                        : 'transparent',
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4
                        className="text-base font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Search Bar
                      </h4>
                      <p
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Search bar at bottom of page
                      </p>
                    </div>
                    {widgetStyle === 'searchbar' && (
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--accent-primary)' }}
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* Visual Preview */}
                  <div
                    className="mt-4 p-4 rounded border"
                    style={{
                      background: 'var(--bg-primary)',
                      borderColor: 'var(--border-primary)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 h-10 rounded-lg px-4 flex items-center"
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-primary)',
                        }}
                      >
                        <svg
                          className="w-5 h-5 mr-2"
                          style={{ color: 'var(--text-secondary)' }}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <span
                          className="text-sm"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Search or ask a question...
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Chat Bubble Option */}
                <button
                  onClick={() => handleWidgetStyleSelect('bubble')}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    widgetStyle === 'bubble'
                      ? 'border-current'
                      : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor:
                      widgetStyle === 'bubble'
                        ? 'var(--accent-primary)'
                        : 'transparent',
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4
                        className="text-base font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Chat Bubble
                      </h4>
                      <p
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Floating bubble icon on bottom-right
                      </p>
                    </div>
                    {widgetStyle === 'bubble' && (
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--accent-primary)' }}
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* Visual Preview */}
                  <div
                    className="mt-4 p-4 rounded border relative"
                    style={{
                      background: 'var(--bg-primary)',
                      borderColor: 'var(--border-primary)',
                      minHeight: '80px',
                    }}
                  >
                    <div className="absolute bottom-2 right-2">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
                        style={{ background: 'var(--accent-primary)' }}
                      >
                        <svg
                          className="w-7 h-7 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Saved Notification */}
            {widgetStyleSaved && (
              <div
                className="mt-4 p-3 rounded-lg text-sm text-center"
                style={{
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)',
                }}
              >
                Widget style saved successfully!
              </div>
            )}
          </div>
        </div>

        {/* Preview Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Preview
          </h2>
          
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex flex-wrap gap-4">
              {/* Button Preview */}
              <button
                className="px-4 py-2 rounded-lg font-medium text-white"
                style={{ background: 'var(--accent-primary)' }}
              >
                Primary Button
              </button>
              
              {/* Secondary Button Preview */}
              <button
                className="px-4 py-2 rounded-lg font-medium border"
                style={{ 
                  borderColor: 'var(--accent-primary)', 
                  color: 'var(--accent-primary)',
                  background: 'transparent'
                }}
              >
                Secondary Button
              </button>
              
              {/* Badge Preview */}
              <span
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{ 
                  background: 'var(--accent-subtle)', 
                  color: 'var(--accent-primary)' 
                }}
              >
                Badge
              </span>
              
              {/* Link Preview */}
              <a
                href="#"
                className="font-medium hover:underline"
                style={{ color: 'var(--accent-primary)' }}
              >
                Link Text
              </a>
            </div>
            
            {/* Card Preview */}
            <div 
              className="mt-4 p-4 rounded-lg border-l-4"
              style={{ 
                background: 'var(--bg-tertiary)', 
                borderColor: 'var(--accent-primary)' 
              }}
            >
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                This is how accent colors appear in cards and highlights.
              </p>
            </div>
          </div>
        </div>

        {/* Other Settings Placeholder */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Other Settings
          </h2>
          
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              More settings coming soon...
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
