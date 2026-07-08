/** Shared UI atoms - typography + surfaces tuned to the dark theme. */
import React from 'react';
import { Text, View, TextProps, ViewProps, StyleSheet } from 'react-native';
import { colors, font, radius } from '../theme';

type TxtProps = TextProps & {
  size?: number;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'display';
  color?: string;
  dim?: boolean;
  faint?: boolean;
};

const FAM = {
  regular: font.ui,
  medium: font.medium,
  semibold: font.semibold,
  bold: font.bold,
  display: font.display,
};

export function Txt({ size = 14, weight = 'regular', color, dim, faint, style, ...rest }: TxtProps) {
  const c = color || (faint ? colors.faint : dim ? colors.textDim : colors.text);
  return (
    <Text
      {...rest}
      style={[{ fontFamily: FAM[weight], fontSize: size, color: c }, style]}
    />
  );
}

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
});
