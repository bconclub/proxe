/** Web map — a real Leaflet slippy map (clean LIGHT basemap) with a strict,
 *  data-driven two-level hierarchy the user can drill through:
 *
 *    Level 0 · PUNJAB     → one brand-blue dot per district, label = seat count.
 *    Level 1 · DISTRICT   → click a district dot → fly in → that district's EXACT
 *                           constituencies appear as saffron named dots.
 *    Level 2 · DETAIL     → click a constituency dot (or its polygon) → onSelect →
 *                           the detail sheet opens ("inside" the constituency).
 *
 *  A "← All districts" control appears at Level 1 to step back out. The choropleth
 *  polygons stay underneath as a subtle heat wash driven by the active color mode.
 *  Every count/marker is derived from the real data (byNo + polygons) — nothing is
 *  approximated. react-native-maps is native-only, so this .web.tsx owns web;
 *  native keeps MapCanvas.tsx. Leaflet mounts on the View's underlying <div>. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import L from 'leaflet';
import { polygons, fillFor, type ColorMode } from '../lib/geo';
import type { Pulse } from '../lib/pulse';
import { byNo } from '../data';
import { geo } from '../data';
import { colors } from '../theme';

declare const __DEV__: boolean | undefined;

type Props = {
  pulse: Record<number, Pulse>;
  colorMode: ColorMode;
  activeNo: number | null;
  onSelect: (no: number) => void;
  zoomEnabled?: boolean;
};

const finite = (n: number) => Number.isFinite(n);

// ── Per-constituency centroid (skips malformed pts) ──────────────────────────
const SEAT_CENTROID: Record<number, [number, number]> = {};
polygons.forEach((p) => {
  let sx = 0, sy = 0, n = 0;
  p.coords.forEach((c) => {
    if (!finite(c.latitude) || !finite(c.longitude)) return;
    sx += c.latitude; sy += c.longitude; n += 1;
  });
  if (n > 0) SEAT_CENTROID[p.no] = [sx / n, sy / n];
});

// ── District geometry, precomputed once ──────────────────────────────────────
type Dist = {
  name: string;
  seats: number[];
  centroid: [number, number];
  bounds: [[number, number], [number, number]];
};

const DISTRICTS: Dist[] = (() => {
  const acc: Record<string, { seats: Set<number>; sx: number; sy: number; n: number; latMin: number; latMax: number; lonMin: number; lonMax: number }> = {};
  polygons.forEach((p) => {
    const d = byNo[p.no]?.district;
    if (!d) return;
    if (!acc[d]) acc[d] = { seats: new Set(), sx: 0, sy: 0, n: 0, latMin: Infinity, latMax: -Infinity, lonMin: Infinity, lonMax: -Infinity };
    const a = acc[d];
    a.seats.add(p.no);
    p.coords.forEach((c) => {
      if (!finite(c.latitude) || !finite(c.longitude)) return;
      a.sx += c.latitude; a.sy += c.longitude; a.n += 1;
      if (c.latitude < a.latMin) a.latMin = c.latitude;
      if (c.latitude > a.latMax) a.latMax = c.latitude;
      if (c.longitude < a.lonMin) a.lonMin = c.longitude;
      if (c.longitude > a.lonMax) a.lonMax = c.longitude;
    });
  });
  return Object.entries(acc).map(([name, a]) => ({
    name,
    seats: [...a.seats].sort((x, y) => x - y),
    centroid: [a.sx / a.n, a.sy / a.n] as [number, number],
    bounds: [[a.latMin, a.lonMin], [a.latMax, a.lonMax]] as [[number, number], [number, number]],
  }));
})();
const DIST_BY_NAME: Record<string, Dist> = Object.fromEntries(DISTRICTS.map((d) => [d.name, d]));

const PUNJAB_BOUNDS: [[number, number], [number, number]] = (() => {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  polygons.forEach((p) => p.coords.forEach((c) => {
    if (!finite(c.latitude) || !finite(c.longitude)) return;
    if (c.latitude < latMin) latMin = c.latitude;
    if (c.latitude > latMax) latMax = c.latitude;
    if (c.longitude < lonMin) lonMin = c.longitude;
    if (c.longitude > lonMax) lonMax = c.longitude;
  }));
  return [[latMin, lonMin], [latMax, lonMax]];
})();

const MAX_SEATS = Math.max(...DISTRICTS.map((d) => d.seats.length));

// ── Styles (light theme) — injected once ─────────────────────────────────────
function ensureLeafletCss() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  if (!document.getElementById('pop-map-css')) {
    const st = document.createElement('style');
    st.id = 'pop-map-css';
    st.textContent = `
      .pop-map { background: #EAECEF; }
      .pop-map .leaflet-control-attribution { background: rgba(255,255,255,0.82); color: #5B6472; }
      .pop-map .leaflet-control-attribution a { color: #345; }
      .pop-map .leaflet-bar a { background: #fff; color: ${colors.bg}; border-bottom-color: #E2E6EC; font-weight: 700; }
      .pop-map .leaflet-bar a:hover { background: #F2F5F9; }

      /* District count dot (Level 0) — brand blue */
      .pop-dist { display:flex; align-items:center; justify-content:center; border-radius:999px;
        font-family: Inter_700Bold, system-ui, sans-serif; font-weight:700; color:#fff;
        background:${colors.bg}; border:2.5px solid #fff;
        box-shadow:0 3px 10px rgba(0,30,90,0.35); cursor:pointer; transition:transform .12s ease; }
      .pop-dist:hover { transform:scale(1.09); }

      /* Constituency dot + label (Level 1) — brand saffron pill, anchored on the dot.
         When labels collide, '.dot-only' collapses the pill to just the dot. */
      .pop-seat { display:inline-flex; align-items:center; gap:5px; white-space:nowrap; border-radius:999px;
        font-family: Inter_600SemiBold, system-ui, sans-serif; font-weight:600; font-size:10px; color:#fff;
        background:${colors.accent}; border:2px solid #fff; padding:2px 8px 2px 5px;
        box-shadow:0 2px 8px rgba(240,108,24,0.4); cursor:pointer; transition:transform .12s ease; }
      .pop-seat:hover { transform:scale(1.06); z-index:650 !important; }
      .pop-seat.active { background:${colors.bg}; box-shadow:0 3px 12px rgba(0,30,90,0.5); transform:scale(1.08); z-index:640 !important; }
      .pop-seat .pop-seat-dot { width:8px; height:8px; border-radius:999px; background:#fff; flex:0 0 auto; }
      .pop-seat.dot-only { padding:3px; gap:0; }
      .pop-seat.dot-only .pop-seat-label { display:none; }
      /* Hovering a collapsed dot brings its name back (desktop discovery). */
      .pop-seat.dot-only:hover { padding:3px 10px 3px 6px; gap:6px; z-index:660 !important; }
      .pop-seat.dot-only:hover .pop-seat-label { display:inline; }

      /* Back breadcrumb control (Level 1) */
      .pop-back { display:flex; align-items:center; gap:7px; background:#fff; color:${colors.bg};
        font-family: Inter_600SemiBold, system-ui, sans-serif; font-weight:600; font-size:12.5px;
        padding:8px 12px; border-radius:10px; box-shadow:0 2px 10px rgba(0,30,90,0.22); cursor:pointer;
        border:1px solid #E2E6EC; }
      .pop-back:hover { background:#F2F5F9; }
      .pop-back b { color:${colors.accent}; }
    `;
    document.head.appendChild(st);
  }
}

export default function MapCanvas({ pulse, colorMode, activeNo, onSelect, zoomEnabled = true }: Props) {
  const hostRef = useRef<any>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersByNo = useRef<Record<number, L.Path>>({});
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const backDivRef = useRef<HTMLElement | null>(null);
  // Level-1 constituency markers, kept for label collision resolution.
  const seatMarkersRef = useRef<{ no: number; ll: [number, number]; w: number; marker: L.Marker }[]>([]);

  // Which district we've drilled into (null = Punjab overview).
  const [focused, setFocused] = useState<string | null>(null);

  // Latest props/state for stable Leaflet callbacks.
  const modeRef = useRef(colorMode); modeRef.current = colorMode;
  const pulseRef = useRef(pulse); pulseRef.current = pulse;
  const activeRef = useRef(activeNo); activeRef.current = activeNo;
  const zoomRef = useRef(zoomEnabled); zoomRef.current = zoomEnabled;
  const focusRef = useRef(focused); focusRef.current = focused;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  const styleSeat = (no: number): L.PathOptions => {
    const active = no === activeRef.current;
    return {
      color: active ? colors.accent : 'rgba(40,60,90,0.35)',
      weight: active ? 2.6 : 0.7,
      fillColor: fillFor(no, modeRef.current, pulseRef.current),
      fillOpacity: active ? 0.7 : 0.4,
    };
  };

  const enterDistrict = (name: string) => {
    const d = DIST_BY_NAME[name];
    if (!d) return;
    setFocused(name);
    mapRef.current?.flyToBounds(d.bounds, { padding: [60, 60], maxZoom: 12, duration: 0.6 });
  };

  const backToPunjab = () => {
    setFocused(null);
    onSelectRef.current(-1);
    mapRef.current?.flyToBounds(PUNJAB_BOUNDS, { padding: [24, 24], duration: 0.6 });
  };

  // Greedy label declutter for the constituency dots: the active seat keeps its
  // label, then each remaining label shows only if it doesn't overlap one already
  // shown at the current zoom; the rest collapse to just their dot. Re-runs on
  // every zoom/move so names reveal naturally as you zoom into a dense city.
  const declutter = () => {
    const map = mapRef.current;
    const items = seatMarkersRef.current;
    if (!map || !items.length) return;
    const order = [...items].sort(
      (a, b) => (b.no === activeRef.current ? 1 : 0) - (a.no === activeRef.current ? 1 : 0),
    );
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    order.forEach((it) => {
      const root = it.marker.getElement();
      const el = root ? (root.querySelector('.pop-seat') as HTMLElement | null) : null;
      if (!el) return;
      const p = map.latLngToContainerPoint(L.latLng(it.ll[0], it.ll[1]));
      const rect = { l: p.x - 13, r: p.x - 13 + it.w, t: p.y - 12, b: p.y + 12 };
      const hit = placed.some((q) => !(rect.r < q.l || rect.l > q.r || rect.b < q.t || rect.t > q.b));
      if (hit) el.classList.add('dot-only');
      else { el.classList.remove('dot-only'); placed.push(rect); }
    });
  };

  // ── Mount once ──────────────────────────────────────────────────────────────
  useEffect(() => {
    ensureLeafletCss();
    const el = hostRef.current as HTMLElement | null;
    if (!el || mapRef.current) return;

    const map = L.map(el, { zoomControl: true, attributionControl: true, minZoom: 6, maxZoom: 16, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    el.classList.add('pop-map');
    mapRef.current = map;
    // Dev-only debug handle so behaviour can be driven/inspected deterministically.
    if (typeof __DEV__ !== 'undefined' && __DEV__) (window as any).__popmap = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    const fitPunjab = () => map.fitBounds(PUNJAB_BOUNDS, { padding: [24, 24] });
    fitPunjab();

    // Choropleth (subtle heat wash under the dots).
    L.geoJSON(geo as any, {
      style: (f: any) => styleSeat(f.properties.no),
      onEachFeature: (f: any, layer: L.Layer) => {
        const no = f.properties.no as number;
        layersByNo.current[no] = layer as L.Path;
        layer.on('click', (e) => { L.DomEvent.stop(e); onSelectRef.current(no); });
      },
    }).addTo(map);

    markerGroupRef.current = L.layerGroup().addTo(map);

    // "← All districts" breadcrumb (hidden until we drill in).
    const back = L.control({ position: 'topleft' });
    back.onAdd = () => {
      const div = L.DomUtil.create('div', 'pop-back');
      div.style.display = 'none';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(div, 'click', (e) => { L.DomEvent.stop(e); backToPunjab(); });
      backDivRef.current = div;
      return div;
    };
    back.addTo(map);

    // Empty-map click → step out one level (district → Punjab) or clear selection.
    map.on('click', () => {
      if (focusRef.current != null) backToPunjab();
      else onSelectRef.current(-1);
    });

    // Reveal/hide constituency labels as the view changes.
    map.on('zoomend', declutter);
    map.on('moveend', declutter);
    map.on('zoom', declutter);

    // Keep sized to the flex container; re-fit once after first real measurement.
    let fitted = false;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!fitted && el.clientWidth > 0 && el.clientHeight > 0) {
        fitted = true;
        if (focusRef.current == null && activeRef.current == null) fitPunjab();
      }
    });
    ro.observe(el);

    // Leaflet reads the container's size synchronously at construction, which can
    // run before the surrounding flex layout (header banner image, tab bar, fonts)
    // has settled — it then caches the wrong size. Because ResizeObserver only
    // fires on a subsequent CHANGE, if the container is already stable by the time
    // it starts observing, that stale size is never corrected — every polygon/tile
    // pane stays offset from where the (independently-positioned) marker dots
    // render, which reads as the map "moving around" / not matching itself. Force
    // a few unconditional re-measures after mount to guarantee a correct sync.
    const forceResync = () => map.invalidateSize();
    const raf = requestAnimationFrame(forceResync);
    const t1 = setTimeout(forceResync, 300);
    const t2 = setTimeout(forceResync, 1000);
    window.addEventListener('load', forceResync);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('load', forceResync);
      map.remove();
      mapRef.current = null;
      layersByNo.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Single marker builder — the ONLY place dots are drawn, so the two levels
  //    can never drift out of sync. Rebuilt on level or selection change. ───────
  useEffect(() => {
    const map = mapRef.current;
    const group = markerGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();
    seatMarkersRef.current = [];

    if (focused == null) {
      // Level 0 — one brand-blue count dot per district (label = # constituencies).
      DISTRICTS.forEach((d) => {
        if (!finite(d.centroid[0]) || !finite(d.centroid[1])) return;
        const n = d.seats.length;
        const size = Math.round(30 + (n / MAX_SEATS) * 22); // 30..52 px
        const fontSize = size < 38 ? 12 : size < 46 ? 13 : 15;
        const icon = L.divIcon({
          className: '',
          html: `<div class="pop-dist" style="width:${size}px;height:${size}px;font-size:${fontSize}px;">${n}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const m = L.marker(d.centroid, { icon, title: `${d.name} · ${n} constituencies`, riseOnHover: true });
        m.on('click', (e) => { L.DomEvent.stop(e); enterDistrict(d.name); });
        m.addTo(group);
      });
    } else {
      // Level 1 — the focused district's EXACT constituencies. The marker is
      // anchored on its dot (so the dot always sits on the seat centroid); the
      // name label floats to the right and is decluttered separately.
      DIST_BY_NAME[focused]?.seats.forEach((no) => {
        const c = SEAT_CENTROID[no];
        if (!c) return;
        const name = byNo[no]?.name || `Seat ${no}`;
        const isActive = no === activeNo;
        const w = Math.round(name.length * 5.8 + 32); // dot + label extent, for collision tests
        const icon = L.divIcon({
          className: '',
          html: `<div class="pop-seat${isActive ? ' active' : ''}"><span class="pop-seat-dot"></span><span class="pop-seat-label">${name}</span></div>`,
          iconSize: [w, 24],
          iconAnchor: [13, 12], // anchor on the dot, not the pill centre
        });
        const m = L.marker(c, { icon, title: name, riseOnHover: true, zIndexOffset: isActive ? 1000 : 0 });
        m.on('click', (e) => { L.DomEvent.stop(e); onSelectRef.current(no); });
        m.addTo(group);
        seatMarkersRef.current.push({ no, ll: c, w, marker: m });
      });
    }

    // Breadcrumb reflects the current level.
    const div = backDivRef.current;
    if (div) {
      div.style.display = focused ? 'flex' : 'none';
      if (focused) div.innerHTML = `<span>←</span><span>All districts</span><span style="opacity:.5">·</span><b>${focused}</b>`;
    }

    // Resolve label overlaps now, and again after the fly-in settles.
    declutter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, activeNo]);

  // ── Restyle seats when the color mode / data change ──────────────────────────
  useEffect(() => {
    Object.entries(layersByNo.current).forEach(([no, layer]) => layer.setStyle(styleSeat(Number(no))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, pulse]);

  // ── React to selection: restyle polygons, keep the right district focused,
  //    and (on mobile) fly to the seat. Marker refresh is handled by the builder
  //    above (it also depends on activeNo). ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.entries(layersByNo.current).forEach(([no, layer]) => layer.setStyle(styleSeat(Number(no))));
    const activeLayer = activeNo != null ? layersByNo.current[activeNo] : null;
    if (activeLayer) (activeLayer as any).bringToFront?.();

    // Selecting a seat (e.g. from the list) drills to its district so the dots
    // stay in sync — keeps the hierarchy connected.
    if (activeNo != null) {
      const dist = byNo[activeNo]?.district;
      if (dist && dist !== focusRef.current) setFocused(dist);
    }

    if (!zoomEnabled) return; // desktop: highlight only, no camera move
    if (activeNo != null && activeLayer) {
      const b = (activeLayer as any).getBounds?.();
      if (b && b.isValid()) map.flyToBounds(b, { padding: [90, 90], maxZoom: 13, duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNo, zoomEnabled]);

  return <View style={styles.wrap} ref={hostRef} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: '#EAECEF' },
});
