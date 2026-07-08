/** Mobile detail - bottom-sheet modal wrapping the shared DetailContent.
 *  Drag the handle / top of the sheet downward to dismiss (not just the X). */
import React, { useEffect, useRef } from 'react';
import { Modal, View, Pressable, StyleSheet, Animated, PanResponder, Dimensions } from 'react-native';
import DetailContent from './DetailContent';
import { colors, radius } from '../theme';
import type { Pulse } from '../lib/pulse';

const H = Dimensions.get('window').height;

export default function DetailSheet({
  no,
  pulse,
  onClose,
}: {
  no: number | null;
  pulse: Record<number, Pulse>;
  onClose: () => void;
}) {
  const open = no != null;
  const translateY = useRef(new Animated.Value(0)).current;

  // Reset to resting position whenever a new seat opens the sheet.
  useEffect(() => {
    if (open) translateY.setValue(0);
  }, [open, translateY]);

  const dismiss = () => {
    Animated.timing(translateY, { toValue: H, duration: 200, useNativeDriver: true }).start(() => {
      translateY.setValue(0);
      onClose();
    });
  };

  const pan = useRef(
    PanResponder.create({
      // Engage only on a clear downward drag (so inner scrolling still works).
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.9) dismiss();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2 }).start();
      },
    }),
  ).current;

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Drag handle - pull down to close */}
          <View style={styles.dragZone} {...pan.panHandlers}>
            <View style={styles.grab} />
          </View>
          <DetailContent no={no} pulse={pulse} onClose={onClose} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,7,12,0.6)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bgElev,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  dragZone: { alignItems: 'center', paddingVertical: 9 },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border2 },
});
