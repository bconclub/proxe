# Changelog

## 2026-05-14 · fix(bcon): replace underscores with spaces in lead profile display fields

- `LeadDetailsModal.tsx`: Applied `.replace(/_/g, ' ')` to `user_type`, `course_interest`, `education`, and `timeline` display values — raw enum-style strings like `full_time` now render as `full time` in the lead details panel.
- User-facing: Lead profile cards in the BCON dashboard inbox no longer show underscored slugs.

## 2026-05-14 · fix(windchasers): preflight getUserMedia to beat Chrome's transient activation expiry

- `ChatWidget.tsx` (`handleVoiceToggle`): Added a preflight `navigator.mediaDevices.getUserMedia({ audio: true })` call immediately after the env-key guard, before creating the Vapi instance. Root cause: in cross-origin iframes Chrome's transient user-activation window is ~1 second; Vapi's `vapi.start()` fires a server network request before calling `getUserMedia()` internally, so the window expires before the mic dialog can appear. The preflight call happens synchronously in the click handler, firing the permission prompt while the activation is still valid. Once the user grants access the permission is stored and Vapi's own internal `getUserMedia()` succeeds.
- User-facing: Mic button on embedded `windchasers.in` pages and incognito tabs will now correctly trigger the browser's microphone permission dialog.

## 2026-05-14 · fix(windchasers): force embed.js no-cache + full mic permissions on widget iframe

- `embed.js/route.ts`: Changed `Cache-Control` from `public, max-age=3600` to `no-cache, no-store, must-revalidate` — previous 1-hour cache meant all visitors who loaded the page before the mic-fix deploy were still running the old iframe without `allow="microphone"`. Now every page load fetches the latest embed.js immediately.
- Added `allowusermedia=""` attribute alongside `allow="microphone; camera; autoplay; clipboard-write"` for maximum browser compatibility (covers older Chrome/Safari)
- User-facing: Vapi mic button on windchasers.in live pages now triggers mic permission dialog immediately for all visitors, not just new ones after cache expiry

## 2026-05-14 · feat(windchasers): make quick-reply buttons full-width clickable cards

- `ChatWidget.module.css`: Added windchasers brand overrides so quick-reply and flow-override buttons stack in a column and stretch to full width — the entire card area is now the click target, not just the text label
- User-facing: Buttons like "Airplane", "Helicopter", "Starting Fresh", "Yes, Completed DGCA" now render as tall full-width cards with left-aligned text, consistent with a card-tap UI pattern

## 2026-05-14 · fix(windchasers): allow microphone in embedded widget iframe

- `embed.js/route.ts`: Added `allow="microphone; camera"` attribute to the dynamically-created iframe so browsers delegate mic permission to the widget on external/live sites
- User-facing: Voice button (Avia) now triggers the microphone permission prompt on all embedded pages, not just the dashboard preview
- Root cause: dashboard preview iframe had `allow="microphone; camera"` but the embed script did not

