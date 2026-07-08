/** Native choropleth - all 117 constituency polygons on a dark map.
 *  Tap a seat to zoom to it; tap empty map to zoom out / deselect. */
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Platform } from 'react-native';
import MapView, { Polygon, Region } from 'react-native-maps';
import { polygons, fillFor, type ColorMode } from '../lib/geo';
import type { Pulse } from '../lib/pulse';
import { colors } from '../theme';
import { DARK_MAP_STYLE } from './mapStyle';

const PUNJAB: Region = {
  latitude: 30.95,
  longitude: 75.4,
  latitudeDelta: 3.0,
  longitudeDelta: 2.8,
};

const byNoCoords: Record<number, { latitude: number; longitude: number }[]> = Object.fromEntries(
  polygons.map((p) => [p.no, p.coords]),
);

type Props = {
  pulse: Record<number, Pulse>;
  colorMode: ColorMode;
  activeNo: number | null;
  onSelect: (no: number) => void;
  zoomEnabled?: boolean;
};

export default function MapCanvas({ pulse, colorMode, activeNo, onSelect, zoomEnabled = true }: Props) {
  const mapRef = useRef<MapView>(null);
  const lastSeatTap = useRef(0);

  // Recompute fills only when mode / data / selection change.
  const styled = useMemo(
    () =>
      polygons.map((p) => ({
        ...p,
        fill: fillFor(p.no, colorMode, pulse),
      })),
    [colorMode, pulse],
  );

  // Zoom to the selected seat; zoom back out to all of Punjab when cleared.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomEnabled) return;
    if (activeNo != null && byNoCoords[activeNo]) {
      map.fitToCoordinates(byNoCoords[activeNo], {
        edgePadding: { top: 90, right: 70, bottom: 90, left: 70 },
        animated: true,
      });
    } else {
      map.animateToRegion(PUNJAB, 420);
    }
  }, [activeNo]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={PUNJAB}
      customMapStyle={DARK_MAP_STYLE}
      userInterfaceStyle="dark"
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      showsBuildings={false}
      mapType={Platform.OS === 'android' ? 'standard' : 'mutedStandard'}
      onPress={() => {
        // Ignore the map tap that rides along with a polygon tap.
        if (Date.now() - lastSeatTap.current < 300) return;
        onSelect(-1);
      }}
    >
      {styled.map((p) => {
        const active = p.no === activeNo;
        return (
          <Polygon
            key={p.no}
            coordinates={p.coords}
            fillColor={hexA(p.fill, active ? 0.95 : 0.82)}
            strokeColor={active ? colors.accent : 'rgba(255,255,255,0.35)'}
            strokeWidth={active ? 2.5 : 0.6}
            tappable
            onPress={() => {
              lastSeatTap.current = Date.now();
              onSelect(p.no);
            }}
            zIndex={active ? 10 : 1}
          />
        );
      })}
    </MapView>
  );
}

/** Apply alpha to a #RRGGBB color → #RRGGBBAA. */
function hexA(hex: string, a: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const alpha = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex.slice(0, 7)}${alpha}`;
}
