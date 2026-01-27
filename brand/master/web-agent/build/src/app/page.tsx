'use client';

import React from 'react';
import { ChatWidget } from '@/components/ChatWidget';
import { MasterConfig } from '@/configs/brand.config';
import '@/styles/theme.css';

export default function MasterPage() {
  const colors = MasterConfig.colors;
  
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#000000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <div style={{ 
        maxWidth: '1200px', 
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <h1 style={{ 
          color: colors.textPrimary, 
          marginBottom: '1rem',
          fontSize: '3rem',
          fontWeight: '700',
          textAlign: 'center',
          textShadow: `0 2px 10px ${colors.primaryVibrant}40`
        }}>
          Master
        </h1>
        <p style={{ 
          color: colors.textSecondary, 
          marginBottom: '2rem',
          fontSize: '1.25rem',
          textAlign: 'center',
          maxWidth: '800px'
        }}>
          Master Platform
        </p>
      </div>
      <ChatWidget widgetStyle="bubble" />
    </div>
  );
}
