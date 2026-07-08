/** Live indicator - a green dot with an expanding/fading ripple ("pulse").
 *  Sits next to the "Pulse of Punjab" title to signal the feed is live. */
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

const GREEN = '#2FD08A';

export default function PulseDot({ size = 9 }: { size?: number }) {
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, {
        toValue: 1,
        duration: 1700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);

  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 3] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, backgroundColor: GREEN, transform: [{ scale }], opacity },
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GREEN }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
