// Accent presets are BRAND DATA - each pack carries its own accents.ts
// (fork-exact for migrated brands). This file only re-exports the active
// brand's module so existing '@/lib/accent-theme' imports keep working.
// The old shared list here had windchasers-named accents ("Aviation Gold")
// leaking into every brand's Configure page.
export * from '@brand/accents';
