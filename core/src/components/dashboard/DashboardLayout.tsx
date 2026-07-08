'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import PageTransitionLoader from '@/components/PageTransitionLoader'
import HealthBarButton from '@/components/dashboard/HealthBarButton'
import { getBuildDate } from '@/lib/buildInfo'
import { getBrandConfig } from '@/configs'
import ArtifactSwitcher from '@/components/dashboard/ArtifactSwitcher'
import { useTheme } from './ThemeProvider'
import { applyAccentColor, type ThemeMode } from '@/lib/accent-theme'
import { fetchGlobalPrefs, applySoundsToLocal } from '@/lib/dashboard-prefs'
import {
  MdInbox,
  MdDashboard,
  MdPeople,
  MdCalendarToday,
  MdSettings,
  MdMenuBook,
  MdChevronLeft,
  MdChevronRight,
  MdUnfoldMore,
  MdClose,
  MdMenu,
  MdLightMode,
  MdDarkMode,
  MdChatBubbleOutline,
  MdMonitorHeart,
  MdTimeline,
  MdChecklist,
  MdViewKanban,
  MdCall,
  MdLogout,
  MdHandshake,
  MdMap,
} from 'react-icons/md'
import { useFeatureFlags } from '@/lib/useFeatureFlags'

interface DashboardLayoutProps {
  children: React.ReactNode
}

interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  external?: boolean
  comingSoon?: boolean
  children?: NavItem[]
}

// Navigation items in order
const navigation: NavItem[] = [
  // PRIMARY
  { name: 'Overview', href: '/dashboard', icon: MdDashboard },
  { name: 'Leads', href: '/dashboard/leads', icon: MdPeople },
  { name: 'Chats', href: '/dashboard/inbox', icon: MdInbox },
  { name: 'Calls', href: '/dashboard/calls', icon: MdCall },
  { name: 'Pipeline', href: '/dashboard/pipeline', icon: MdViewKanban },
  // Scouts (lokazen = "Gigs") sits directly under Pipeline; feature-gated per brand.
  { name: 'Scouts', href: '/dashboard/scouts', icon: MdHandshake },
  // War Room (pop) — the constituency map. Feature-gated; first-class nav for
  // the campaign brand instead of hiding in the profile dropdown.
  { name: 'War Room', href: '/war-room', icon: MdMap },
  // OPERATIONS
  { name: 'Events', href: '/dashboard/bookings', icon: MdCalendarToday },
  { name: 'Tasks', href: '/dashboard/tasks', icon: MdChecklist },
  { name: 'Flow', href: '/dashboard/flows', icon: MdTimeline },
  // SYSTEM
  { name: 'Agents', href: '/dashboard/agents', icon: MdChatBubbleOutline },
  { name: 'Humans', href: '/dashboard/humans', icon: MdPeople },
  { name: 'Knowledge', href: '/dashboard/settings/knowledge-base', icon: MdMenuBook },
  { name: 'Configure', href: '/dashboard/settings', icon: MdSettings },
]

// Divider positions: after War Room (index 6), after Flow (index 9).
// Calls/Scouts/War Room are feature-gated per brand; their array slots are
// counted here so the dividers land in the same rendered position whether or
// not they are shown.
const DIVIDER_AFTER_INDICES = [6, 9]

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  // Brand logo + name come from the brand config so this layout shell stays
  // byte-identical across brands — only the resolved values differ per brand.
  const { name: brandName, brand: brandId, chatStructure: brandChat, markPath, colors: brandColors, artifacts: brandArtifacts } = getBrandConfig()
  // Brands with `artifacts` in config (pop) get the artifact switcher dropdown
  // on the brand header instead of a plain title / hardcoded war-room link.
  const hasArtifacts = Boolean(brandArtifacts && brandArtifacts.length > 0)
  const [artifactSwitcherOpen, setArtifactSwitcherOpen] = useState(false)
  // The artifact matching the current route (its name shows in the selector box,
  // and it's highlighted as "current" in the dropdown). External artifacts never
  // match a route.
  const activeArtifact = brandArtifacts?.find(
    (a) => a.href && !a.external && (pathname === a.href || pathname.startsWith(`${a.href}/`))
  )
  const brandLogo = brandChat?.avatar?.source || '' // never fall back to another brand's asset
  // Transparent mark for the full-screen auth loader (jpg avatars render as a
  // square box). Falls back to the avatar when a brand has no dedicated mark.
  const brandMark = markPath || brandLogo
  // Per-brand feature toggles — hides nav entries for features this brand has
  // switched off (e.g. a brand keeps Voice/Calls off).
  const brandFeatures = useFeatureFlags()
  // Per-brand nav label overrides — same base nav array across brands, only the
  // rendered label differs (pop: Leads→People, lokazen: Scouts→Gigs).
  const navLabel = (name: string): string => {
    if (name === 'Leads' && brandId === 'pop') return 'People'
    if (name === 'Scouts' && brandId === 'lokazen') return 'Gigs'
    // POP: the Tasks page is the automated agent-task queue → name it so, to sit
    // next to Agents (Agents · Agent Tasks · Humans).
    if (name === 'Tasks' && brandId === 'pop') return 'Agent Tasks'
    return name
  }
  const { setTheme } = useTheme()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null)
  // Hover state on the sidebar itself — used to expand the collapsed rail on hover
  const [isHovered, setIsHovered] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [unreadCount] = useState(0) // TODO: Implement unread count logic
  const [buildDate, setBuildDate] = useState<string>('')
  const [buildVersion, setBuildVersion] = useState<string>('0.0.1')
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const moreOptionsRef = React.useRef<HTMLDivElement>(null)
  const autoHideTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const sidebarCloseTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const [sidebarInteractionTime, setSidebarInteractionTime] = useState<number | null>(null)

  // Close more-options menu on click outside
  useEffect(() => {
    if (!moreOptionsOpen) return
    function handleClick(e: MouseEvent) {
      if (moreOptionsRef.current && !moreOptionsRef.current.contains(e.target as Node)) {
        setMoreOptionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOptionsOpen])

  // Get build/deployment date and version (only on client to avoid hydration mismatch)
  useEffect(() => {
    // Fetch build info from API
    fetch('/api/build-info')
      .then(res => res.json())
      .then(data => {
        setBuildVersion(data.version || '0.0.1')
        // Use buildDate from API if available, otherwise fallback to getBuildDate()
        if (data.buildDate) {
          setBuildDate(data.buildDate)
        } else {
          setBuildDate(getBuildDate())
        }
      })
      .catch(() => {
        // Fallback to existing method if API fails
        setBuildDate(getBuildDate())
      })
  }, [])

  // Activity heartbeat. POSTs to /api/auth/touch on mount + every 60s
  // while the tab is visible, so the team-members table can show
  // "Live now" / "Last active" per user. Skipped while the tab is
  // hidden so a backgrounded tab doesn't masquerade as live.
  useEffect(() => {
    let cancelled = false
    const ping = () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      fetch('/api/auth/touch', { method: 'POST' }).catch(() => {
        // Soft-fail — heartbeat is best-effort.
      })
    }
    ping() // fire once on mount
    const id = setInterval(ping, 60_000)
    // Also ping when the tab becomes visible again, so we don't wait
    // up to 60s after a long backgrounded session.
    const onVis = () => {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Global preferences hydration. Sounds + theme are stored server-side so one
  // founder's setting applies to every user (founder request — "whatever setting
  // I make should be for all users"). On load we paint the locally-cached accent
  // instantly (no bare flash), then fetch the global config and reconcile:
  // sounds → localStorage, dashboard mode → ThemeProvider, accent → CSS vars.
  // When nothing is saved globally yet, this is a no-op and per-user/local wins.
  useEffect(() => {
    let cancelled = false
    try {
      const cachedAccent = localStorage.getItem(`${brandId}-accent-theme`)
      if (cachedAccent) {
        const mode = (localStorage.getItem('proxe-theme') as ThemeMode) || 'bw-dark'
        applyAccentColor(cachedAccent, mode)
      }
    } catch { /* ignore */ }
    ;(async () => {
      const prefs = await fetchGlobalPrefs()
      if (cancelled) return
      applySoundsToLocal(prefs.sounds)
      const mode = prefs.theme?.mode
      if (mode) setTheme(mode)
      const accent = prefs.theme?.accent
      if (accent) {
        try { localStorage.setItem(`${brandId}-accent-theme`, accent) } catch { /* ignore */ }
        const effMode = mode || (localStorage.getItem('proxe-theme') as ThemeMode) || 'bw-dark'
        applyAccentColor(accent, effMode)
      }
    })()
    return () => { cancelled = true }
  }, [setTheme])

  // AUTHENTICATION DISABLED - Client-side auth check commented out
  // useEffect(() => {
  //   const checkAuth = async () => {
  //     try {
  //       const supabase = createClient()
  //       
  //       if (!session) {
  //         console.log('🚫 No session found client-side, redirecting to login...')
  //         window.location.href = '/auth/login'
  //       } else {
  //         setIsCheckingAuth(false)
  //       }
  //     } catch (error) {
  //       console.error('Auth check error:', error)
  //       setIsCheckingAuth(false)
  //     }
  //   }
  //   
  //   // Only check if we're in development (server-side already checked in production)
  //   if (process.env.NODE_ENV === 'development') {
  //     checkAuth()
  //   } else {
  //     setIsCheckingAuth(false)
  //   }
  // }, [])

  // Set checking auth to false immediately since auth is disabled
  useEffect(() => {
    setIsCheckingAuth(false)
  }, [])

  // Load collapsed state and theme from localStorage
  useEffect(() => {
    try {
      // Set theme immediately to prevent white screen
      if (typeof document !== 'undefined') {
        const savedTheme = localStorage.getItem('theme')
        if (savedTheme) {
          if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark')
            document.documentElement.classList.remove('light')
            setIsDarkMode(true)
          } else {
            document.documentElement.classList.add('light')
            document.documentElement.classList.remove('dark')
            setIsDarkMode(false)
          }
        } else {
          // Default to dark mode
          document.documentElement.classList.add('dark')
          document.documentElement.classList.remove('light')
          setIsDarkMode(true)
        }
      }

      const savedState = localStorage.getItem('sidebar-collapsed')
      if (savedState !== null) {
        setIsCollapsed(savedState === 'true')
      }
      // Note: Don't set default collapsed state here - let auto-hide handle it after initial render
    } catch (error) {
      console.error('Error loading preferences:', error)
      // Fallback to dark mode
      if (typeof document !== 'undefined') {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('light')
        setIsDarkMode(true)
      }
    }
  }, [])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current)
      }
      if (sidebarCloseTimeoutRef.current) {
        clearTimeout(sidebarCloseTimeoutRef.current)
      }
    }
  }, [])

  // Check if mobile
  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setMobileSidebarOpen(false)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const toggleSidebar = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    setHoveredNavItem(null)
    setIsScrolled(false)
    localStorage.setItem('sidebar-collapsed', String(newState))

    // Clear auto-hide timer when manually toggled
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current)
      autoHideTimeoutRef.current = null
    }
  }

  const handleSidebarMouseEnter = () => {
    if (isMobile) return
    setIsHovered(true)
  }

  const handleSidebarMouseLeave = () => {
    if (isMobile) return
    setIsHovered(false)
    setHoveredNavItem(null)
  }

  const handleSidebarItemClick = () => {
    // No-op — sidebar stays open/closed via manual toggle only
  }

  const toggleTheme = () => {
    const newMode = !isDarkMode
    setIsDarkMode(newMode)
    localStorage.setItem('theme', newMode ? 'dark' : 'light')

    if (newMode) {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
  }

  // Signs the user out of Supabase and bounces them back to the login screen.
  // Uses a full reload (not router.push) so the SSR layout re-runs its auth
  // check with no session and renders the login page cleanly without any
  // stale dashboard state lingering in memory.
  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[layout] signOut failed:', err)
      // Continue with redirect anyway — better to land on /auth/login than
      // stay stuck in a broken authed state.
    }
    window.location.href = '/auth/login'
  }

  // showExpanded: sidebar labels show when pinned open OR when hovered (hover-to-expand)
  const showExpanded = !isCollapsed || isHovered
  const sidebarWidth = showExpanded ? '184px' : '56px'
  // Content margin uses only the pinned state so the main area doesn't shift on hover
  const contentMarginWidth = isCollapsed ? '56px' : '220px'
  const sidebarContentMargin = isMobile ? '0' : contentMarginWidth

  // Show loading while checking auth in development
  if (isCheckingAuth && process.env.NODE_ENV === 'development') {
    return (
      <div className="dashboard-layout-auth-loader fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="dashboard-layout-auth-loader-content text-center">
          <div className="dashboard-layout-auth-loader-icon-container relative mb-4 mx-auto" style={{ width: '80px', height: '80px' }}>
            <div
              className="dashboard-layout-auth-loader-pulse absolute inset-0 rounded-full animate-ping opacity-30"
              style={{
                backgroundColor: brandColors?.primary || 'var(--accent-primary)',
                margin: '-10px',
              }}
            />
            <div className="dashboard-layout-auth-loader-icon-wrapper relative animate-pulse" style={{ width: '80px', height: '80px' }}>
              {brandMark && (
                <img
                  src={brandMark}
                  alt={brandName}
                  className="w-full h-full object-contain drop-shadow-lg"
                />
              )}
            </div>
          </div>
          <p className="dashboard-layout-auth-loader-text mt-4 text-gray-600 dark:text-gray-400">Checking authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-layout min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="dashboard-layout-mobile-overlay fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Fixed Sidebar */}
      <div
        className={`dashboard-layout-sidebar fixed inset-y-0 left-0 z-50 flex flex-col overflow-visible ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{
          width: sidebarWidth,
          backgroundColor: 'var(--bg-primary)',
          borderRight: '1px solid var(--border-primary)',
          transition: 'width 200ms cubic-bezier(0.2,0,0,1), transform 200ms cubic-bezier(0.2,0,0,1)',
        }}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {/* Logo and Toggle — the logo sits in the SAME 40px leading column as
            the nav icons below, so it never shifts between collapsed/expanded.
            Only the brand name reveals beside it. Slimmer, lighter header. */}
        <div
          className="dashboard-layout-sidebar-header relative flex items-center flex-shrink-0"
          style={{ padding: '6px 8px', minHeight: '44px' }}
        >
          <div
            className="dashboard-layout-sidebar-logo-box flex items-center justify-center flex-shrink-0"
            style={{ width: '40px', minWidth: '40px', height: '28px', cursor: (!showExpanded || hasArtifacts || brandId === 'pop') ? 'pointer' : 'default' }}
            onClick={() => {
              if (!showExpanded && !isMobile) {
                setIsCollapsed(false)
                localStorage.setItem('sidebar-collapsed', 'false')
              } else if (showExpanded && hasArtifacts) {
                setArtifactSwitcherOpen((v) => !v)
              } else if (showExpanded && brandId === 'pop') {
                router.push('/war-room')
              }
            }}
            title={!showExpanded ? 'Click to expand sidebar' : hasArtifacts ? 'Switch artifact' : brandId === 'pop' ? 'Enter the War Room' : undefined}
          >
            {brandLogo && (
              <img
                src={brandLogo}
                alt={brandName}
                className="object-contain"
                style={{ width: '24px', height: '24px' }}
              />
            )}
          </div>
          {showExpanded && (
            <>
              {hasArtifacts ? (
                <button
                  type="button"
                  title="Switch artifact"
                  onClick={() => setArtifactSwitcherOpen((v) => !v)}
                  className="dashboard-layout-sidebar-logo dashboard-layout-artifact-trigger flex-1 min-w-0 flex items-center text-left"
                  style={{
                    gap: '6px',
                    padding: '4px 6px 4px 8px',
                    borderRadius: '8px',
                    border: `1px solid ${artifactSwitcherOpen ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    background: artifactSwitcherOpen ? 'var(--bg-hover)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 120ms, border-color 120ms',
                  }}
                  onMouseEnter={(e) => { if (!artifactSwitcherOpen) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { if (!artifactSwitcherOpen) e.currentTarget.style.background = 'transparent' }}
                  aria-haspopup="menu"
                  aria-expanded={artifactSwitcherOpen}
                >
                  <span
                    className="min-w-0 truncate"
                    style={{ flex: 1, fontSize: '12.5px', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'var(--accent-primary)' }}
                  >
                    {activeArtifact?.name || brandName}
                  </span>
                  <MdUnfoldMore size={15} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
                </button>
              ) : brandId === 'pop' ? (
                <a
                  href="/war-room"
                  title="Enter the War Room"
                  className="dashboard-layout-sidebar-logo flex-1 min-w-0"
                  style={{ fontSize: '12.5px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--accent-primary)', textDecoration: 'none', whiteSpace: 'normal' }}
                >
                  {brandName}
                </a>
              ) : (
                <h1
                  className="dashboard-layout-sidebar-logo flex-1 truncate"
                  style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--accent-primary)' }}
                >
                  {brandName}
                </h1>
              )}
              {!isMobile && (
                <button
                  onClick={toggleSidebar}
                  className="dashboard-layout-sidebar-toggle-button p-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                  style={{ backgroundColor: 'transparent', color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  aria-label="Collapse sidebar"
                >
                  <MdChevronLeft size={18} />
                </button>
              )}
              {isMobile && (
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="dashboard-layout-sidebar-close-button p-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                  style={{ backgroundColor: 'transparent', color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  aria-label="Close sidebar"
                >
                  <MdClose size={18} />
                </button>
              )}
            </>
          )}
          {hasArtifacts && (
            <ArtifactSwitcher
              artifacts={brandArtifacts!}
              activeId={activeArtifact?.id}
              open={artifactSwitcherOpen && showExpanded}
              onClose={() => setArtifactSwitcherOpen(false)}
            />
          )}
        </div>

        {/* Navigation */}
        <nav className="dashboard-layout-sidebar-navigation flex-1 overflow-visible flex flex-col" style={{ padding: '8px' }}>
          {/* Main Navigation */}
          <div className="dashboard-layout-sidebar-navigation-list flex-1">
            {navigation.map((item, index) => {
              // Feature toggle: hide Calls when this brand has voice switched off.
              if (item.href === '/dashboard/calls' && !brandFeatures.voice) return null
              // Feature toggle: Scouts segment (lokazen) only for brands with scouts on.
              if (item.href === '/dashboard/scouts' && !brandFeatures.scouts) return null
              // Feature toggle: War Room only for brands with it on (pop).
              if (item.href === '/war-room' && !brandFeatures.warRoom) return null
              // POP is a campaign, not a sales org — keep the nav clear and
              // direct: no sales Pipeline, no Flow builder, no Humans page.
              // War Room is reachable from the collapsed sidebar / brand logo, so
              // it's kept out of the main menu list too.
              if (brandId === 'pop' && item.href && ['/dashboard/pipeline', '/dashboard/flows', '/war-room'].includes(item.href)) return null
              // Check if we need a divider after the previous item
              const needsDivider = DIVIDER_AFTER_INDICES.includes(index - 1)
              // Match the nav item active when:
              //   • pathname exactly matches its href, OR
              //   • pathname starts with `${href}/` (i.e. user is on a
              //     sub-page like /dashboard/settings/users — highlight the
              //     parent "Configure" item)
              // We exclude bare '/dashboard' from the prefix match, otherwise
              // Overview would light up on every page.
              const matchesSubPath = (href?: string) =>
                !!href && href !== '/dashboard' && pathname.startsWith(href + '/')
              const isActive = pathname === item.href
                || matchesSubPath(item.href)
                || (item.children && item.children.some(child => pathname === child.href || matchesSubPath(child.href)))
              const isInbox = item.href === '/dashboard/inbox'
              const hasChildren = item.children && item.children.length > 0

              const renderNavItem = (navItem: NavItem, isChild = false) => {
                const itemIsActive = pathname === navItem.href || matchesSubPath(navItem.href)
                const itemHref = navItem.comingSoon ? '#' : navItem.href
                const isItemHovered = !showExpanded && hoveredNavItem === navItem.name

                // Modern sidebar item styling — no hard borders, no filled
                // bg-hover for active. Active is an accent-tinted pill with
                // accent-coloured text+icon (picks up the brand colour).
                // Hover on inactive items gets a soft neutral tint via the
                // existing onMouseEnter handlers.
                const baseStyle: React.CSSProperties = {
                  fontSize: '13px',
                  fontWeight: itemIsActive ? 600 : 500,
                  color: itemIsActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  backgroundColor: itemIsActive ? 'var(--accent-subtle)' : 'transparent',
                  // Pin the icon: constant vertical margin + a left padding of 0
                  // in both states (the icon sits in a fixed 40px leading box,
                  // below). Only the label reveals on expand — the icon's X never
                  // moves. Child items indent via left padding (expanded only).
                  margin: '2px 0',
                  borderRadius: '8px',
                  padding: isChild && showExpanded ? '7px 10px 7px 28px' : '7px 10px 7px 0',
                  justifyContent: 'flex-start',
                  opacity: navItem.comingSoon ? 0.5 : 1,
                  cursor: navItem.comingSoon ? 'not-allowed' : 'pointer',
                  transition: 'background-color 180ms ease, color 180ms ease, box-shadow 200ms ease, transform 200ms ease, opacity 180ms ease',
                  position: 'relative',
                  overflow: 'hidden',
                  width: !showExpanded ? '40px' : 'auto',
                  zIndex: !showExpanded && isItemHovered ? 40 : 1,
                  transform: !showExpanded && isItemHovered ? 'translateX(1px)' : 'translateX(0)',
                  boxShadow: !showExpanded && isItemHovered ? '0 6px 14px rgba(0,0,0,0.2)' : 'none',
                }

                const content = (
                  <>
                    <span
                      className="dashboard-layout-nav-item-icon"
                      style={{
                        // Fixed-width AND fixed-height leading box, icon centered.
                        // The fixed 20px height matches the label's line-height so
                        // the row is the SAME height whether collapsed (icon only)
                        // or expanded (icon + label) — otherwise the taller label
                        // line grows every row and the icons drift downward.
                        width: '40px',
                        minWidth: '40px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'inherit',
                      }}
                    >
                      <navItem.icon size={16} />
                    </span>
                    {showExpanded && (
                      <>
                        <span className="dashboard-layout-nav-item-label flex-1 truncate" style={{ lineHeight: '20px' }}>{navLabel(navItem.name)}</span>
                        {isInbox && !isChild && unreadCount > 0 && (
                          <span className="dashboard-layout-nav-item-badge bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                            {unreadCount}
                          </span>
                        )}
                        {navItem.comingSoon && (
                          <span className="text-[9px] uppercase tracking-tighter font-semibold ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>Soon</span>
                        )}
                      </>
                    )}
                    {!showExpanded && isItemHovered && (
                      <span
                        className="dashboard-layout-nav-item-flyout-label"
                        style={{
                          position: 'absolute',
                          left: 'calc(100% + 8px)',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          height: '36px',
                          padding: '0 14px',
                          borderRadius: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          whiteSpace: 'nowrap',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          background: 'rgba(18, 22, 32, 0.78)',
                          backdropFilter: 'blur(14px) saturate(135%)',
                          WebkitBackdropFilter: 'blur(14px) saturate(135%)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
                          pointerEvents: 'none',
                        }}
                      >
                        {navLabel(navItem.name)}
                      </span>
                    )}
                  </>
                )

                if (navItem.comingSoon) {
                  // Coming Soon items are not clickable
                  return (
                    <div
                      key={navItem.name}
                      className="dashboard-layout-nav-item dashboard-layout-nav-item-coming-soon flex items-center rounded-md transition-all duration-200 relative"
                      style={baseStyle}
                      title={!showExpanded ? navItem.name : undefined}
                      onMouseEnter={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem(navItem.name)
                        }
                        if (!itemIsActive) {
                          // Soft neutral tint on hover — sits below the active
                          // accent tint visually so the active item still pops.
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem((prev) => (prev === navItem.name ? null : prev))
                        }
                        if (!itemIsActive) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }
                      }}
                    >
                      {content}
                    </div>
                  )
                } else if (navItem.external) {
                  // External links (not coming soon)
                  return (
                    <a
                      key={navItem.name}
                      href={navItem.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dashboard-layout-nav-item dashboard-layout-nav-item-external flex items-center rounded-md transition-all duration-200"
                      style={baseStyle}
                      title={!showExpanded ? navItem.name : undefined}
                      onClick={() => {
                        if (!isMobile) {
                          handleSidebarItemClick()
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem(navItem.name)
                        }
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      }}
                      onMouseLeave={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem((prev) => (prev === navItem.name ? null : prev))
                        }
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      {content}
                    </a>
                  )
                } else {
                  // Regular internal links
                  return (
                    <Link
                      key={navItem.name}
                      href={itemHref!}
                      className="dashboard-layout-nav-item dashboard-layout-nav-item-internal flex items-center rounded-md transition-all duration-200 relative"
                      style={baseStyle}
                      title={!showExpanded ? navItem.name : undefined}
                      onClick={() => {
                        if (isMobile) {
                          setMobileSidebarOpen(false)
                        } else {
                          handleSidebarItemClick()
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem(navItem.name)
                        }
                        if (!itemIsActive) {
                          // Soft neutral tint on hover — sits below the active
                          // accent tint visually so the active item still pops.
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem((prev) => (prev === navItem.name ? null : prev))
                        }
                        if (!itemIsActive) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }
                      }}
                    >
                      {content}
                    </Link>
                  )
                }
              }

              return (
                <React.Fragment key={item.name}>
                  {needsDivider && (
                    <div style={{ borderTop: '1px solid var(--border-primary)', margin: '8px 12px 4px' }} />
                  )}

                  {renderNavItem(item)}

                  {/* Render children if not collapsed */}
                  {hasChildren && showExpanded && (
                    <div className="dashboard-layout-nav-children space-y-1">
                      {item.children!.map((child) => renderNavItem(child, true))}
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </nav>

        {/* Footer Section: User + Menu + Version in one compact strip */}
        <div
          className="dashboard-layout-sidebar-footer flex-shrink-0 border-t flex flex-col"
          style={{
            borderColor: 'var(--border-primary)',
          }}
        >
          {/* Compact footer row: three-dot menu + version */}
          <div
            className="dashboard-layout-footer-row flex items-center"
            style={{
              padding: !showExpanded ? '6px' : '5px 10px',
              justifyContent: !showExpanded ? 'center' : 'space-between',
            }}
          >
            {/* Three-dot menu */}
            <div className="dashboard-layout-more-options relative" ref={moreOptionsRef}>
              <button
                onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}
                className="dashboard-layout-icon-button flex items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]"
                style={{
                  width: '24px',
                  height: '24px',
                  minWidth: '24px',
                  minHeight: '24px',
                  color: 'var(--text-secondary)',
                  backgroundColor: moreOptionsOpen ? 'var(--bg-hover)' : 'transparent',
                }}
                title="System"
                aria-expanded={moreOptionsOpen}
                aria-haspopup="menu"
                onMouseEnter={(e) => {
                  if (!moreOptionsOpen) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!moreOptionsOpen) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <MdMonitorHeart size={16} />
              </button>

              {moreOptionsOpen && (
                <div
                  className="dashboard-layout-more-options-dropdown absolute bottom-0 left-full ml-2 rounded-md shadow-lg py-1 z-50"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    minWidth: '200px',
                  }}
                >
                  {/* "Endpoint Health" used to live here as a popover modal,
                     but System Status (/dashboard/status) already renders
                     HealthStrip + EndpointHealthDetail on a single page —
                     one source of truth, no menu duplication. */}
                  <Link
                    href="/status"
                    onClick={() => {
                      setMoreOptionsOpen(false)
                      if (isMobile) {
                        setMobileSidebarOpen(false)
                      }
                    }}
                    className="dashboard-layout-more-options-item flex items-center w-full text-left px-4 py-2 text-sm transition-colors duration-200"
                    style={{
                      color: 'var(--text-primary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <MdMonitorHeart size={18} style={{ marginRight: '12px' }} />
                    System Status
                  </Link>

                  {/* Divider before destructive action */}
                  <div
                    style={{
                      height: '1px',
                      backgroundColor: 'var(--border-primary)',
                      margin: '4px 0',
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setMoreOptionsOpen(false)
                      if (isMobile) {
                        setMobileSidebarOpen(false)
                      }
                      handleLogout()
                    }}
                    className="dashboard-layout-more-options-item flex items-center w-full text-left px-4 py-2 text-sm transition-colors duration-200"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <MdLogout size={18} style={{ marginRight: '12px' }} />
                    Sign out
                  </button>
                </div>
              )}
            </div>

            {/* Version badge inline */}
            {showExpanded && (
              <div
                className="dashboard-layout-version-badge px-1.5 py-0.5 rounded text-[10px] font-normal"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-primary)',
                }}
                title={buildDate ? `v${buildVersion} - Build: ${buildDate}` : `v${buildVersion}`}
                suppressHydrationWarning
              >
                v{buildVersion}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className={`dashboard-layout-main-content flex flex-col ${isCollapsed ? 'md:ml-14' : 'md:ml-[220px]'}`}
        style={{
          backgroundColor: 'var(--bg-primary)',
          height: '100vh',
          overflow: 'hidden',
          transition: 'margin-left 200ms cubic-bezier(0.2,0,0,1)',
        }}
      >
        {/* Page Transition Loader */}
        <PageTransitionLoader />

        {/* Endpoint health — controlled by the sidebar three-dot menu's "Endpoint Health" item. */}
        <HealthBarButton open={healthOpen} onClose={() => setHealthOpen(false)} />

        {/* Mobile top bar — only visible on mobile */}
        <div
          className="md:hidden flex items-center gap-3 flex-shrink-0 border-b px-4"
          style={{
            height: '56px',
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
            }}
            aria-label="Open sidebar"
          >
            <MdMenu size={20} />
          </button>
          <h1 className="text-xl font-black" style={{ color: 'var(--accent-primary)' }}>{brandName}</h1>
        </div>

        {/* Page content */}
        {/* Home (/dashboard) + inbox render in a NON-scrolling full-height main
            so the home page fits exactly one viewport (founder: "one VH completely").
            FounderDashboard handles its own padding + internal scroll. */}
        {pathname === '/dashboard/inbox' || pathname === '/dashboard' || pathname === '/war-room' ? (
          <main className="dashboard-layout-main-content-wrapper flex-1 min-h-0" style={{ backgroundColor: 'var(--bg-primary)', position: 'relative', overflow: 'hidden' }}>
            {children}
          </main>
        ) : (
          <main className="dashboard-layout-main-content-wrapper flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)', position: 'relative' }}>
            <div className="dashboard-layout-main-content-container py-4 sm:py-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <div className="dashboard-layout-main-content-inner px-4 sm:px-6 md:px-8">
                {children}
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
