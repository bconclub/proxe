/** Campaign banner image (leaders on the tricolor wash) shown as a small header
 *  strip above the brand text. Decorative — does not overlap the text. */
import React from 'react';
import { Image } from 'react-native';

const SRC = require('../../assets/header.webp');

export default function HeaderBanner({ height = 92 }: { height?: number }) {
  return (
    <Image
      source={SRC}
      resizeMode="cover"
      style={{ width: '100%', height }}
      accessibilityLabel="Punjab leaders banner"
    />
  );
}
