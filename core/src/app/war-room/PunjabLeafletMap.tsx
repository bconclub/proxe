'use client';

// War Room constituency map — the SAME Leaflet + CartoDB approach used on the
// Pulse Punjab leader app (real slippy map: pan/zoom, tiles behind the 117
// seats), colored by the war-room data with the same heat/lean/issue/turnout
// modes and click→drawer. Client-only (Leaflet needs window) — loaded via
// next/dynamic ssr:false from WarRoomClient.

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import raw from '@/data/punjab-ac.json';
import { normName } from '@/lib/war-room/constituencies';
import type { ColorMode } from './PunjabMap';

interface SeatStat { constituency: string; count: number; topCategory: string | null; leanScore: number; voteShare: number; }

const SAFFRON = '#F06C18';
const GREEN = '#4EB457';
const BLUE = '#3B82F6';
const ISSUE_COLORS: Record<string, string> = {
  jobs: '#3B82F6', water: '#14B8A6', power: '#F59E0B', roads: '#8B7BFF',
  drugs: '#F43F5E', farm_debt: '#22A152', health: '#F06C18', education: '#A855F7', other: '#94A3B8',
};
function mix(a: string, b: string, t: number): string {
  const pa = a.replace('#', '').match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.replace('#', '').match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('');
}
function isLightHex(hex: string): boolean {
  const m = hex.replace('#', '').match(/\w\w/g);
  if (!m) return true;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}
const LIGHT_P = { empty: '#EAEDF1', heatLo: '#FFE0C2', heatHi: '#E2570A', turnLo: '#DCEBFB', turnHi: '#2563EB', leanMid: '#CBD5E1', stroke: 'rgba(15,23,42,0.18)', sel: '#0F172A' };
const DARK_P = { empty: '#16263C', heatLo: '#16273D', heatHi: SAFFRON, turnLo: '#16273D', turnHi: BLUE, leanMid: '#46566E', stroke: 'rgba(255,255,255,0.12)', sel: '#FFFFFF' };

export default function PunjabLeafletMap({
  mode, byConstituency, pulseSeat, selected, onSelect,
}: {
  mode: ColorMode;
  byConstituency: SeatStat[];
  pulseSeat?: string | null;
  selected?: string | null;
  onSelect: (name: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersByName = useRef<Record<string, L.Path>>({});

  // Latest props for stable Leaflet callbacks + restyle.
  const modeRef = useRef(mode); modeRef.current = mode;
  const dataRef = useRef(byConstituency); dataRef.current = byConstituency;
  const selRef = useRef(selected); selRef.current = selected;
  const pulseRef = useRef(pulseSeat); pulseRef.current = pulseSeat;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  const palette = () => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
    return bg && isLightHex(bg) ? LIGHT_P : DARK_P;
  };

  const styleFor = (name: string): L.PathOptions => {
    const P = palette();
    const data = dataRef.current;
    const max = Math.max(1, ...data.map((s) => s.count));
    const s = data.find((x) => normName(x.constituency) === normName(name));
    let fill = P.empty;
    if (s && s.count > 0) {
      switch (modeRef.current) {
        case 'heat': fill = mix(P.heatLo, P.heatHi, 0.18 + 0.82 * (s.count / max)); break;
        case 'lean': { const t = (s.leanScore + 1) / 2; fill = t < 0.5 ? mix(SAFFRON, P.leanMid, t * 2) : mix(P.leanMid, GREEN, (t - 0.5) * 2); break; }
        case 'issue': fill = ISSUE_COLORS[s.topCategory || 'other'] || ISSUE_COLORS.other; break;
        case 'turnout': fill = mix(P.turnLo, P.turnHi, 0.18 + 0.82 * (s.voteShare / 100)); break;
      }
    }
    const isSel = selRef.current && normName(selRef.current) === normName(name);
    const isPulse = pulseRef.current && normName(pulseRef.current) === normName(name);
    return {
      fillColor: fill,
      fillOpacity: isSel ? 0.9 : 0.62,
      color: isSel ? P.sel : isPulse ? SAFFRON : P.stroke,
      weight: isSel ? 2.6 : isPulse ? 2.2 : 0.6,
    };
  };

  const restyle = () => {
    Object.entries(layersByName.current).forEach(([name, layer]) => layer.setStyle(styleFor(name)));
  };

  // ── Mount once ──
  useEffect(() => {
    const el = hostRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, { zoomControl: true, attributionControl: true, minZoom: 6, maxZoom: 14, zoomSnap: 0.25, scrollWheelZoom: true });
    map.attributionControl.setPrefix(false);
    mapRef.current = map;

    const dark = !(() => { const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(); return bg && isLightHex(bg); })();
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    const gj = L.geoJSON(raw as any, {
      style: (f: any) => styleFor(f.properties.name),
      onEachFeature: (f: any, layer: L.Layer) => {
        const name = f.properties.name as string;
        layersByName.current[name] = layer as L.Path;
        layer.on('click', (e) => { L.DomEvent.stop(e); onSelectRef.current(name); });
        layer.on('mouseover', () => (layer as L.Path).setStyle({ weight: 2.4 }));
        layer.on('mouseout', () => (layer as L.Path).setStyle(styleFor(name)));
        (layer as L.Path).bindTooltip(name, { sticky: true, direction: 'top', opacity: 0.9, className: 'wr-leaflet-tip' });
      },
    }).addTo(map);

    map.fitBounds(gj.getBounds(), { padding: [16, 16] });
    map.on('click', () => onSelectRef.current(''));

    // Keep sized to the flex container.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; layersByName.current = {}; };
  }, []);

  // Restyle when mode / data / selection / pulse change.
  useEffect(() => { restyle(); }, [mode, byConstituency, selected, pulseSeat]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden' }} />
      <style>{`.wr-leaflet-tip{background:rgba(6,24,46,0.9);color:#EAF1FB;border:none;font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px}.leaflet-container{background:transparent;font-family:inherit}`}</style>
    </div>
  );
}
