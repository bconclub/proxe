'use client'

import { useEffect, useState } from 'react'

// Shared viewport check for behavior-only switches (state defaults, handlers,
// drag). For pure styling prefer CSS breakpoint pairs — they don't flicker on
// hydration. SSR-safe: always false on the server and first client render.
export function useIsMobile(bp = 768) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [bp])
  return isMobile
}
