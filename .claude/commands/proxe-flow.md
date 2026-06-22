---
description: Open the PROXe brand-diff flow visualizer (sync + feature diff across all brands)
---

Launch the brand-comparison visualizer for the user.

1. Run `node scripts/brand-diff.js --serve` in the background. It reads the live
   trees + `scripts/brand-shared.json`, regenerates `scripts/brand-diff.html`,
   serves it on `http://127.0.0.1:8777/brand-diff.html`, and opens the browser.
   - If `scripts/brand-diff.js` isn't in the current directory, run it from the
     promotion worktree `C:/Users/user/proxe-promote`.
   - If the port is busy, append `--port=8778` (or the next free port).
2. Report the URL to the user.

Read-only — this never edits brand code. The diagram shows, per brand: sync %
vs master (identical / drift / missing shared-core files) and per-feature pills
(Calls / Toggle / Brain / Funnel / Follow-up = on / off / absent).
