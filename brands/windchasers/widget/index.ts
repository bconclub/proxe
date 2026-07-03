// Windchasers uses the core widget as-is — core WAS the windchasers build.
// A brand pack can replace this re-export with its own ChatWidget implementation
// (see brands/bcon/widget) to keep fork-exact behavior.
// '@/' (core/src) keeps this junction-proof: relative paths break when the pack
// is reached through the core/.brand link with resolve.symlinks=false.
export { ChatWidget } from '@/components/widget/ChatWidget';
