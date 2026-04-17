'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import PageTransitionLoader from '@/components/PageTransitionLoader'
import { getBuildDate } from '@/lib/buildInfo'
import {
  MdInbox,
  MdDashboard,
  MdPeople,
  MdCalendarToday,
  MdSettings,
  MdMenuBook,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdMenu,
  MdLightMode,
  MdDarkMode,
  MdChatBubbleOutline,
  MdMonitorHeart,
  MdMoreHoriz,
  MdTimeline,
  MdChecklist,
  MdViewKanban,
} from 'react-icons/md'

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
  { name: 'Conversations', href: '/dashboard/inbox', icon: MdInbox },
  { name: 'Leads', href: '/dashboard/leads', icon: MdPeople },
  { name: 'Pipeline', href: '/dashboard/pipeline', icon: MdViewKanban },
  // OPERATIONS
  { name: 'Events', href: '/dashboard/bookings', icon: MdCalendarToday },
  { name: 'Tasks', href: '/dashboard/tasks', icon: MdChecklist },
  { name: 'Flow', href: '/dashboard/flows', icon: MdTimeline },
  // SYSTEM
  { name: 'Agents', href: '/dashboard/agents', icon: MdChatBubbleOutline },
  { name: 'Knowledge', href: '/dashboard/settings/knowledge-base', icon: MdMenuBook },
  { name: 'Configure', href: '/dashboard/settings', icon: MdSettings },
]

// Divider positions: after Pipeline (index 3), after Flow (index 6)
const DIVIDER_AFTER_INDICES = [3, 6]

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [unreadCount] = useState(0) // TODO: Implement unread count logic
  const [buildDate, setBuildDate] = useState<string>('')
  const [buildVersion, setBuildVersion] = useState<string>('0.0.1')
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
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
  }

  const handleSidebarMouseLeave = () => {
    if (isMobile) return
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

  // AUTHENTICATION DISABLED - Logout function disabled
  const handleLogout = async () => {
    // const supabase = createClient()
    // await supabase.auth.signOut()
    // window.location.href = '/auth/login'
    console.log('Logout disabled - authentication is not enabled')
  }

  // showExpanded: sidebar labels show only when pinned open
  const showExpanded = !isCollapsed
  const sidebarWidth = showExpanded ? '220px' : '56px'
  // Content margin uses only the pinned state so the main area doesn't shift on hover
  const contentMarginWidth = isCollapsed ? '56px' : '220px'
  const sidebarContentMargin = isMobile ? '0' : contentMarginWidth

  // Show loading while checking auth in development
  if (isCheckingAuth && process.env.NODE_ENV === 'development') {
    return (
      <div className="dashboard-layout-auth-loader min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="dashboard-layout-auth-loader-content text-center">
          <div className="dashboard-layout-auth-loader-icon-container relative mb-4">
            <div
              className="dashboard-layout-auth-loader-pulse absolute inset-0 rounded-full animate-ping opacity-30"
              style={{
                backgroundColor: 'var(--accent-primary)',
                width: '100px',
                height: '100px',
                margin: '-10px auto',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            />
            <div className="dashboard-layout-auth-loader-icon-wrapper relative animate-pulse mx-auto" style={{ width: '80px', height: '80px' }}>
              <img
                src="/logo.png"
                alt="Windchasers"
                className="w-full h-full object-contain drop-shadow-lg"
              />
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
        {/* Logo and Toggle */}
        <div
          className="dashboard-layout-sidebar-header flex items-center justify-between flex-shrink-0"
          style={{
            padding: !showExpanded ? '10px' : '10px 12px',
            justifyContent: !showExpanded ? 'center' : 'space-between',
          }}
        >
          {showExpanded && (
            <>
              <h1 className="dashboard-layout-sidebar-logo text-xl font-black tracking-tight" style={{ color: 'var(--accent-primary)' }}>Windchasers</h1>
              {!isMobile && (
                <button
                  onClick={toggleSidebar}
                  className="dashboard-layout-sidebar-toggle-button p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]"
                  style={{ backgroundColor: 'transparent', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  aria-label="Collapse sidebar"
                >
                  <MdChevronLeft size={20} />
                </button>
              )}
              {isMobile && (
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="dashboard-layout-sidebar-close-button p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]"
                  style={{ backgroundColor: 'transparent', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  aria-label="Close sidebar"
                >
                  <MdClose size={20} />
                </button>
              )}
            </>
          )}
          {!showExpanded && (
            <div
              className="dashboard-layout-sidebar-logo-collapsed flex items-center justify-center cursor-pointer"
              style={{
                width: '32px',
                height: '32px',
              }}
              onClick={() => {
                if (!isMobile) {
                  setIsCollapsed(false)
                  localStorage.setItem('sidebar-collapsed', 'false')
                }
              }}
              title="Click to expand sidebar"
            >
              <img
                src="/logo.png"
                alt="Windchasers"
                className="w-full h-full object-contain"
                style={{ maxWidth: '32px', maxHeight: '32px' }}
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="dashboard-layout-sidebar-navigation flex-1 overflow-visible flex flex-col" style={{ padding: !showExpanded ? '8px 0' : '4px 8px' }}>
          {/* Main Navigation */}
          <div className="dashboard-layout-sidebar-navigation-list flex-1">
            {navigation.map((item, index) => {
              // Check if we need a divider after the previous item
              const needsDivider = DIVIDER_AFTER_INDICES.includes(index - 1)
              const isActive = pathname === item.href || (item.children && item.children.some(child => pathname === child.href))
              const isInbox = item.name === 'Conversations'
              const hasChildren = item.children && item.children.length > 0

              const renderNavItem = (navItem: NavItem, isChild = false) => {
                const itemIsActive = pathname === navItem.href
                const itemHref = navItem.comingSoon ? '#' : navItem.href
                const isItemHovered = !showExpanded && hoveredNavItem === navItem.name

                const baseStyle: React.CSSProperties = {
                  fontSize: '13px',
                  fontWeight: itemIsActive ? 600 : 400,
                  color: itemIsActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: itemIsActive ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: itemIsActive && showExpanded ? '2px solid var(--text-primary)' : '2px solid transparent',
                  margin: !showExpanded ? '2px 6px' : '1px 4px',
                  borderRadius: '6px',
                  padding: !showExpanded ? '10px' : isChild ? '7px 12px 7px 36px' : '7px 12px',
                  justifyContent: !showExpanded ? 'center' : 'flex-start',
                  opacity: navItem.comingSoon ? 0.5 : 1,
                  cursor: navItem.comingSoon ? 'not-allowed' : 'pointer',
                  transition: 'background 180ms ease, box-shadow 200ms ease, transform 200ms ease, opacity 180ms ease',
                  position: 'relative',
                  overflow: 'hidden',
                  width: !showExpanded ? '44px' : 'auto',
                  zIndex: !showExpanded && isItemHovered ? 40 : 1,
                  transform: !showExpanded && isItemHovered ? 'translateX(1px)' : 'translateX(0)',
                  boxShadow: !showExpanded && isItemHovered ? '0 6px 14px rgba(0,0,0,0.2)' : 'none',
                }

                const content = (
                  <>
                    <span
                      className="dashboard-layout-nav-item-icon"
                      style={{
                        marginRight: !showExpanded ? '0' : '10px',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'inherit',
                      }}
                    >
                      <navItem.icon size={16} />
                    </span>
                    {showExpanded && (
                      <>
                        <span className="dashboard-layout-nav-item-label flex-1 truncate">{navItem.name}</span>
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
                        {navItem.name}
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
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem((prev) => (prev === navItem.name ? null : prev))
                        }
                        if (!itemIsActive) {
                          e.currentTarget.style.backgroundColor = 'transparent'
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
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showExpanded) {
                          setHoveredNavItem((prev) => (prev === navItem.name ? null : prev))
                        }
                        if (!itemIsActive) {
                          e.currentTarget.style.backgroundColor = 'transparent'
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
                title="More Options"
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
                <MdMoreHoriz size={16} />
              </button>

              {moreOptionsOpen && (
                <div
                  className="dashboard-layout-more-options-dropdown absolute bottom-0 left-full ml-2 rounded-md shadow-lg py-1 z-50"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    minWidth: '180px',
                  }}
                >
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
          <h1 className="text-xl font-black" style={{ color: 'var(--accent-primary)' }}>Windchasers</h1>
        </div>

        {/* Page content */}
        {pathname === '/dashboard/inbox' ? (
          <main className="dashboard-layout-main-content-wrapper flex-1" style={{ backgroundColor: 'var(--bg-primary)', position: 'relative', overflow: 'hidden' }}>
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
