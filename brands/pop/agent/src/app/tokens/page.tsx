import { redirect } from 'next/navigation'

// Top-level /tokens shortcut → the real token-usage page lives under the
// authenticated dashboard.
export default function TokensRedirect() {
  redirect('/dashboard/tokens')
}
