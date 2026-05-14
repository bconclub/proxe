# Changelog

## 2026-05-14 · feat(windchasers): make quick-reply buttons full-width clickable cards

- `ChatWidget.module.css`: Added windchasers brand overrides so quick-reply and flow-override buttons stack in a column and stretch to full width — the entire card area is now the click target, not just the text label
- User-facing: Buttons like "Airplane", "Helicopter", "Starting Fresh", "Yes, Completed DGCA" now render as tall full-width cards with left-aligned text, consistent with a card-tap UI pattern

## 2026-05-14 · fix(windchasers): allow microphone in embedded widget iframe

- `embed.js/route.ts`: Added `allow="microphone; camera"` attribute to the dynamically-created iframe so browsers delegate mic permission to the widget on external/live sites
- User-facing: Voice button (Avia) now triggers the microphone permission prompt on all embedded pages, not just the dashboard preview
- Root cause: dashboard preview iframe had `allow="microphone; camera"` but the embed script did not

