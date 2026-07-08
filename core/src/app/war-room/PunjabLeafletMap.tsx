'use client';

// War Room constituency map - Leaflet + CartoDB tiles (same approach as the
// Pulse Punjab leader app). A light choropleth under numbered, clickable count
// bubbles per seat (bigger = more voices), so you see the numbers and click
// into any place. Client-only (Leaflet needs window); loaded via next/dynamic
// ssr:false from WarRoomClient.

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import raw from '@/data/punjab-ac.json';
import { normName, CONSTITUENCIES } from '@/lib/war-room/constituencies';
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

const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

// district lookup for clustering (seat → district)
const DISTRICT_BY_SEAT: Record<string, string> = Object.fromEntries(
  CONSTITUENCIES.map((c) => [normName(c.name), c.district || 'Punjab']),
);
// Below this zoom the map shows one aggregated bubble per DISTRICT; clicking a
// cluster flies into that district, where the per-seat bubbles take over.
const CLUSTER_MAX_ZOOM = 8.75;

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
  const centerByName = useRef<Record<string, L.LatLng>>({});
  const markersRef = useRef<L.LayerGroup | null>(null);

  const modeRef = useRef(mode); modeRef.current = mode;
  const dataRef = useRef(byConstituency); dataRef.current = byConstituency;
  const selRef = useRef(selected); selRef.current = selected;
  const pulseRef = useRef(pulseSeat); pulseRef.current = pulseSeat;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  const palette = () => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
    return bg && isLightHex(bg) ? LIGHT_P : DARK_P;
  };

  // Fill color for a seat under the given mode (the light choropleth wash).
  const fillColor = (name: string): string => {
    const P = palette();
    const data = dataRef.current;
    const max = Math.max(1, ...data.map((s) => s.count));
    const s = data.find((x) => normName(x.constituency) === normName(name));
    if (!s || s.count <= 0) return P.empty;
    switch (modeRef.current) {
      case 'heat': return mix(P.heatLo, P.heatHi, 0.18 + 0.82 * (s.count / max));
      case 'lean': { const t = (s.leanScore + 1) / 2; return t < 0.5 ? mix(SAFFRON, P.leanMid, t * 2) : mix(P.leanMid, GREEN, (t - 0.5) * 2); }
      case 'issue': return ISSUE_COLORS[s.topCategory || 'other'] || ISSUE_COLORS.other;
      case 'turnout': return mix(P.turnLo, P.turnHi, 0.18 + 0.82 * (s.voteShare / 100));
    }
  };

  const styleFor = (name: string): L.PathOptions => {
    const P = palette();
    const isSel = selRef.current && normName(selRef.current) === normName(name);
    const isPulse = pulseRef.current && normName(pulseRef.current) === normName(name);
    return {
      fillColor: fillColor(name),
      fillOpacity: isSel ? 0.7 : 0.45, // lighter wash — bubbles carry the numbers
      color: isSel ? P.sel : isPulse ? SAFFRON : P.stroke,
      weight: isSel ? 2.6 : isPulse ? 2.2 : 0.6,
    };
  };

  // Rebuild the count bubbles for the current data + mode + zoom. Zoomed out →
  // ONE aggregated cluster per district (click = fly into it); zoomed in →
  // per-seat bubbles (click = open the seat drawer).
  const renderMarkers = () => {
    const grp = markersRef.current;
    const map = mapRef.current;
    if (!grp || !map) return;
    grp.clearLayers();
    const data = dataRef.current;
    const clustered = map.getZoom() < CLUSTER_MAX_ZOOM;

    if (clustered) {
      // aggregate by district: total voices, count-weighted centroid, member bounds
      const byDist = new Map<string, { total: number; seats: number; latSum: number; lngSum: number; w: number; bounds: L.LatLngBounds | null; cats: Record<string, number>; leanSum: number; leanW: number }>();
      data.forEach((s) => {
        if (!s.count) return;
        const center = centerByName.current[normName(s.constituency)];
        if (!center) return;
        const dist = DISTRICT_BY_SEAT[normName(s.constituency)] || 'Punjab';
        const a = byDist.get(dist) || { total: 0, seats: 0, latSum: 0, lngSum: 0, w: 0, bounds: null, cats: {}, leanSum: 0, leanW: 0 };
        a.total += s.count; a.seats++;
        a.latSum += center.lat * s.count; a.lngSum += center.lng * s.count; a.w += s.count;
        a.bounds = a.bounds ? a.bounds.extend(center) : L.latLngBounds(center, center);
        if (s.topCategory) a.cats[s.topCategory] = (a.cats[s.topCategory] || 0) + s.count;
        a.leanSum += s.leanScore * s.count; a.leanW += s.count;
        byDist.set(dist, a);
      });
      const P = palette();
      const maxTotal = Math.max(1, ...Array.from(byDist.values()).map((a) => a.total));
      byDist.forEach((a, dist) => {
        const clusterColor = (() => {
          switch (modeRef.current) {
            case 'heat': return mix(P.heatLo, P.heatHi, 0.25 + 0.75 * (a.total / maxTotal));
            case 'lean': { const t = ((a.leanW ? a.leanSum / a.leanW : 0) + 1) / 2; return t < 0.5 ? mix(SAFFRON, P.leanMid, t * 2) : mix(P.leanMid, GREEN, (t - 0.5) * 2); }
            case 'issue': { const top = Object.entries(a.cats).sort((x, y) => y[1] - x[1])[0]?.[0]; return ISSUE_COLORS[top || 'other'] || ISSUE_COLORS.other; }
            case 'turnout': return mix(P.turnLo, P.turnHi, 0.25 + 0.75 * (a.total / maxTotal));
          }
        })();
        const size = Math.round(42 + 34 * Math.sqrt(a.total / maxTotal)); // 42-76px
        const center = L.latLng(a.latSum / a.w, a.lngSum / a.w);
        const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${clusterColor};border:3px solid rgba(255,255,255,0.65);box-shadow:0 0 0 6px ${clusterColor}33,0 3px 10px rgba(0,0,0,0.4);display:grid;place-items:center;color:#fff;font-family:Inter,system-ui,sans-serif;line-height:1.05;text-align:center;cursor:pointer;">
          <div><div style="font-weight:800;font-size:${size < 54 ? 13 : 15}px;">${fmtK(a.total)}</div><div style="font-size:8.5px;font-weight:600;opacity:0.85;">${a.seats} seats</div></div>
        </div>`;
        const icon = L.divIcon({ html, className: 'wr-count-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const m = L.marker(center, { icon, riseOnHover: true, keyboard: false });
        // click a cluster → zoom INTO the district; the zoomend re-render swaps to
        // seat bubbles. fitBounds (instant) not flyTo — animated flights get
        // cancelled by follow-on events in some environments. Deferred a tick so
        // the same click reaching the map container can't interrupt it.
        m.on('click', (e) => {
          L.DomEvent.stop(e);
          const b = a.bounds;
          setTimeout(() => { if (b) map.fitBounds(b.pad(0.35), { maxZoom: 10.5, animate: false }); }, 0);
        });
        m.bindTooltip(`${dist} — ${fmtK(a.total)} voices · ${a.seats} seats · click to open`, { direction: 'top', offset: [0, -size / 2], opacity: 0.92, className: 'wr-leaflet-tip' });
        grp.addLayer(m);
      });
      return;
    }

    const max = Math.max(1, ...data.map((s) => s.count));
    data.forEach((s) => {
      if (!s.count) return;
      const center = centerByName.current[normName(s.constituency)];
      if (!center) return;
      const size = Math.round(20 + 40 * Math.sqrt(s.count / max)); // 20-60px by count
      const col = fillColor(s.constituency);
      const isSel = selRef.current && normName(selRef.current) === normName(s.constituency);
      const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${col};border:2px solid ${isSel ? '#fff' : 'rgba(255,255,255,0.55)'};box-shadow:0 2px 8px rgba(0,0,0,0.35);display:grid;place-items:center;color:#fff;font-weight:800;font-size:${size < 30 ? 10 : size < 44 ? 12 : 14}px;font-family:Inter,system-ui,sans-serif;">${fmtK(s.count)}</div>`;
      const icon = L.divIcon({ html, className: 'wr-count-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      const m = L.marker(center, { icon, riseOnHover: true, keyboard: false });
      m.on('click', (e) => { L.DomEvent.stop(e); onSelectRef.current(s.constituency); });
      m.bindTooltip(`${s.constituency} — ${s.count} voices`, { direction: 'top', offset: [0, -size / 2], opacity: 0.92, className: 'wr-leaflet-tip' });
      grp.addLayer(m);
    });
  };

  const restyle = () => {
    Object.entries(layersByName.current).forEach(([name, layer]) => layer.setStyle(styleFor(name)));
    renderMarkers();
  };

  // ── Mount once ──
  useEffect(() => {
    const el = hostRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, { zoomControl: true, attributionControl: true, minZoom: 6, maxZoom: 14, zoomSnap: 0.25, scrollWheelZoom: true });
    map.attributionControl.setPrefix(false);
    mapRef.current = map;
    ;(el as any)._wrMap = map; // dev/testing handle

    const dark = !(() => { const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(); return bg && isLightHex(bg); })();
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    const gj = L.geoJSON(raw as any, {
      style: (f: any) => styleFor(f.properties.name),
      onEachFeature: (f: any, layer: L.Layer) => {
        const name = f.properties.name as string;
        layersByName.current[name] = layer as L.Path;
        try { centerByName.current[normName(name)] = (layer as L.Polygon).getBounds().getCenter(); } catch {}
        layer.on('click', (e) => { L.DomEvent.stop(e); onSelectRef.current(name); });
        layer.on('mouseover', () => (layer as L.Path).setStyle({ weight: 2.2 }));
        layer.on('mouseout', () => (layer as L.Path).setStyle(styleFor(name)));
      },
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    map.fitBounds(gj.getBounds(), { padding: [16, 16] });
    map.on('click', () => onSelectRef.current(''));
    // clusters ↔ seat bubbles swap on zoom
    map.on('zoomend', renderMarkers);
    renderMarkers();

    // Robust sizing: Leaflet caches the container size at construction, which can
    // be wrong before the surrounding flex/grid settles. Re-measure a couple of
    // times + on every resize so the map never renders collapsed or overflowing.
    const invalidate = () => { map.invalidateSize(); map.fitBounds(gj.getBounds(), { padding: [16, 16] }); };
    const t1 = setTimeout(invalidate, 120);
    const t2 = setTimeout(invalidate, 400);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    return () => { clearTimeout(t1); clearTimeout(t2); ro.disconnect(); map.remove(); mapRef.current = null; layersByName.current = {}; centerByName.current = {}; };
  }, []);

  useEffect(() => { restyle(); }, [mode, byConstituency, selected, pulseSeat]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden' }} />
      <style>{`.wr-leaflet-tip{background:rgba(6,24,46,0.92);color:#EAF1FB;border:none;font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px}.leaflet-container{background:transparent;font-family:inherit}.wr-count-marker{background:transparent;border:none}`}</style>
    </div>
  );
}
