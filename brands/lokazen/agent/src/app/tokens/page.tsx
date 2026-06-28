import { redirect } from 'next/navigation'

// Top-level /tokens shortcut → the real token-usage page lives under the
// authenticated dashboard. Founder asked for proxe.windchasers.in/tokens.
export default function TokensRedirect() {
  redirect('/dashboard/tokens')
}
