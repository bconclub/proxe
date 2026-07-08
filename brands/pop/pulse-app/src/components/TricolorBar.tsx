/** The "lehar" - a tricolor (saffron → white → green) gradient strip, the
 *  signature accent pulled from the Punjab Yatra deck. */
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { TRICOLOR } from '../theme';

export default function TricolorBar({ height = 3 }: { height?: number }) {
  return (
    <LinearGradient
      colors={TRICOLOR as [string, string, string]}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ height, width: '100%' }}
    />
  );
}
