/**
 * The workspace cookie's name, and nothing else.
 *
 * Deliberately its own module with no imports. `lib/server/workspace.ts` reads
 * `next/headers`, which makes it server-only; the switcher is a client
 * component and needs the same name to read the cookie in the browser. Sharing
 * the constant from the server module dragged next/headers into the client
 * bundle and failed the build, so the name lives here and both sides import it.
 */
export const WORKSPACE_COOKIE = 'workspace'
