# Changelog

## 2026-07-08 10:09 IST · Rebuild web map as a real Leaflet slippy map

- Replaced the flat SVG choropleth (MapCanvas.web.tsx) with a real Leaflet map: light CartoDB
  basemap, brand-colored dots (district = blue, constituency = saffron), and a connected two-level
  drill-down — district dot (exact seat count) → its exact constituencies → detail sheet → back.
- Added constituency label declutter: names show when they don't overlap, collapse to a plain dot
  otherwise, and reveal progressively as you zoom into dense areas (e.g. Ludhiana's 14 seats).
- Fixed a real desync bug: Leaflet cached its container size before the surrounding flex layout
  (header banner image, tab bar) finished settling, so the polygon layer rendered offset from the
  correctly-positioned dots — read as the map "moving around". Fixed by forcing a few unconditional
  `invalidateSize()` re-measures after mount.
- User-facing: the map now looks and behaves like a real interactive map (pan/zoom/drill) instead
  of a static colored outline, and no longer visually desyncs between the heat layer and the dots.
- Added `leaflet@1.9.4` + `@types/leaflet`. Native map (MapCanvas.tsx, react-native-maps) unchanged.
