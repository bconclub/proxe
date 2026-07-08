/** Pulse of Punjab - app root.
 *  Desktop (>=960px): 3-pane dashboard (DesktopLayout).
 *  Mobile: brand header + tab nav (Map / Seats / Program / Journey) + detail sheet. */
import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Sora_700Bold } from '@expo-google-fonts/sora';

import { Txt } from './src/components/ui';
import AuthGate from './src/components/AuthGate';
import HeaderBanner from './src/components/HeaderBanner';
import PulseDot from './src/components/PulseDot';
import TricolorBar from './src/components/TricolorBar';
import MapCanvas from './src/components/MapCanvas';
import ColorModeBar from './src/components/ColorModeBar';
import Legend from './src/components/Legend';
import SeatList from './src/components/SeatList';
import DetailSheet from './src/components/DetailSheet';
import DesktopLayout from './src/components/DesktopLayout';
import ProgramScreen from './src/screens/ProgramScreen';
import JourneyScreen from './src/screens/JourneyScreen';

import { api } from './src/lib/api';
import { registerForPush, sendLocal } from './src/lib/notifications';
import type { Pulse } from './src/lib/pulse';
import type { ColorMode } from './src/lib/geo';
import { constituencies, districts } from './src/data';
import { colors, radius } from './src/theme';

type Tab = 'map' | 'seats' | 'program' | 'journey';
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'seats', label: 'Seats', icon: 'list' },
  { id: 'program', label: 'Program', icon: 'layers' },
  { id: 'journey', label: 'Journey', icon: 'smartphone' },
];

const bell = () => sendLocal('Pulse of Punjab', 'Notifications are live on this device. ✓');

// Compact number for headline stats (1200 → "1.2k").
const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Sora_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Login gate wraps the whole experience; in mock mode it's transparent, and
  // AppInner (with its data fetch) only mounts once authorized.
  return (
    <AuthGate>
      <AppInner />
    </AuthGate>
  );
}

function AppInner() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const [tab, setTab] = useState<Tab>('map');
  const [colorMode, setColorMode] = useState<ColorMode>('grievances');
  const [pulse, setPulse] = useState<Record<number, Pulse>>({});
  const [activeNo, setActiveNo] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<null | 'program' | 'journey'>(null);

  // State-wide intensity headline — sums the live per-seat pulse.
  const totals = React.useMemo(() => {
    let volunteers = 0, supporters = 0;
    Object.values(pulse).forEach((p) => {
      volunteers += p.volunteers || 0;
      supporters += p.supporters || 0;
    });
    return { volunteers, supporters };
  }, [pulse]);

  useEffect(() => {
    api.getPulseAll().then(setPulse);
    registerForPush().catch(() => {});
  }, []);

  // no < 0 is the "clear selection" signal from the desktop right panel.
  const select = (no: number) => setActiveNo(no < 0 ? null : no);

  if (isDesktop) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView style={styles.app} edges={['top']}>
          <DesktopLayout
            pulse={pulse}
            colorMode={colorMode}
            setColorMode={setColorMode}
            activeNo={activeNo}
            onSelect={select}
            onOpenProgram={() => setOverlay('program')}
            onOpenJourney={() => setOverlay('journey')}
            onBell={bell}
          />
        </SafeAreaView>
        <OverlayModal visible={overlay != null} onClose={() => setOverlay(null)}>
          {overlay === 'program' ? (
            <ProgramScreen />
          ) : overlay === 'journey' ? (
            <JourneyScreen activeNo={activeNo} />
          ) : null}
        </OverlayModal>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.app} edges={['top']}>
        {/* Campaign banner */}
        <HeaderBanner height={92} />
        <TricolorBar />
        {/* Brand header - compact: title left, stats + bell inline right */}
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={16} weight="display">
                Pulse of Punjab
              </Txt>
              <PulseDot size={9} />
              <Txt size={9} weight="bold" color="#2FD08A" style={{ letterSpacing: 0.6 }}>
                LIVE
              </Txt>
            </View>
            <Txt size={13} color={colors.accent} weight="semibold" style={{ letterSpacing: 0.2, marginTop: 1 }}>
              ਸਭ ਦੀ ਸੁਣਾਂਗੇ · Sab di sunenge
            </Txt>
          </View>
          <View style={styles.headStats}>
            {totals.supporters > 0 || totals.volunteers > 0 ? (
              <>
                <MiniStat n={fmt(totals.supporters)} l="Support" color={colors.accent} />
                <MiniStat n={fmt(totals.volunteers)} l="Volunteers" color={colors.azure} />
              </>
            ) : (
              <>
                <MiniStat n={String(constituencies.length)} l="Seats" color={colors.accent} />
                <MiniStat n={String(districts.length)} l="Districts" color={colors.azure} />
              </>
            )}
            <Pressable hitSlop={10} style={styles.bell} onPress={bell}>
              <Feather name="bell" size={18} color={colors.textDim} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {tab === 'map' && (
            <View style={{ flex: 1 }}>
              <MapCanvas pulse={pulse} colorMode={colorMode} activeNo={activeNo} onSelect={select} />
              <View style={styles.topOverlay} pointerEvents="box-none">
                <ColorModeBar mode={colorMode} onChange={setColorMode} />
              </View>
              <View style={styles.legendOverlay} pointerEvents="none">
                <Legend mode={colorMode} />
              </View>
            </View>
          )}
          {tab === 'seats' && <SeatList onSelect={select} activeNo={activeNo} />}
          {tab === 'program' && <ProgramScreen />}
          {tab === 'journey' && <JourneyScreen activeNo={activeNo} />}
        </View>

        {/* Bottom tab bar */}
        <View style={styles.tabbar}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <Pressable key={t.id} style={styles.tabItem} onPress={() => setTab(t.id)}>
                <Feather name={t.icon} size={20} color={active ? colors.accent : colors.faint} />
                <Txt
                  size={10.5}
                  weight={active ? 'semibold' : 'medium'}
                  color={active ? colors.accent : colors.faint}
                  style={{ marginTop: 3 }}
                >
                  {t.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      {/* Detail (mobile only - desktop shows it in the right panel) */}
      <DetailSheet no={activeNo} pulse={pulse} onClose={() => setActiveNo(null)} />
    </SafeAreaProvider>
  );
}

function OverlayModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlayBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.overlayCard}>
          <Pressable style={styles.overlayClose} onPress={onClose} hitSlop={10}>
            <Feather name="x" size={20} color={colors.textDim} />
          </Pressable>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function MiniStat({ n, l, color }: { n: string; l: string; color: string }) {
  return (
    <View style={[styles.miniStat, { backgroundColor: color + '24', borderColor: color + '66' }]}>
      <Txt size={14} weight="bold" color={color}>
        {n}
      </Txt>
      <Txt size={8} faint style={{ letterSpacing: 0.3, marginTop: 1 }}>
        {l.toUpperCase()}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  app: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniStat: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 40,
  },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlay: { position: 'absolute', top: 10, left: 0, right: 0 },
  legendOverlay: { position: 'absolute', left: 12, bottom: 16 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElev,
    paddingTop: 8,
    paddingBottom: 6,
  },
  tabItem: { flex: 1, alignItems: 'center' },
  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(4,7,12,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  overlayCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingTop: 8,
  },
  overlayClose: { position: 'absolute', top: 14, right: 14, zIndex: 5, padding: 4 },
});
