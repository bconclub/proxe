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
  MdCreditCard,
  MdMenuBook,
  MdSupport,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdMenu,
  MdLightMode,
  MdDarkMode,
  MdAccountTree,
  MdGroup,
  MdChatBubbleOutline,
  MdHelp,
  MdMonitorHeart,
  MdMoreHoriz,
  MdKeyboard,
  MdBugReport,
  MdFeedback,
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
  // PRIMARY (Active)
  { name: 'Overview', href: '/dashboard', icon: MdDashboard },
  { name: 'Conversations', href: '/dashboard/inbox', icon: MdInbox },
  { name: 'Leads', href: '/dashboard/leads', icon: MdPeople },
  { name: 'Events', href: '/dashboard/bookings', icon: MdCalendarToday },
  // AUTOMATION (Active)
  { name: 'Flows', href: '/dashboard/flows', icon: MdAccountTree },
  { name: 'Audience', href: '/dashboard/audience', icon: MdGroup, comingSoon: true },
  // SYSTEM
  {
    name: 'Configure',
    href: '/dashboard/settings',
    icon: MdSettings,
    children: [
      { name: 'Web Agent', href: '/dashboard/settings/web-agent', icon: MdChatBubbleOutline },
    ]
  },
  { name: 'Billing', href: '/dashboard/billing', icon: MdCreditCard, comingSoon: true },
  { name: 'Docs', href: '#', icon: MdMenuBook, external: false, comingSoon: true },
  { name: 'Support', href: '#', icon: MdSupport, external: false, comingSoon: true },
]

// Divider positions: after Events (index 3), after Audience (index 5), after Configure (index 6)
const DIVIDER_AFTER_INDICES = [3, 5, 6]

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [unreadCount] = useState(0) // TODO: Implement unread count logic
  const [buildDate, setBuildDate] = useState<string>('')
  const [buildVersion, setBuildVersion] = useState<string>('1.0.0')
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const autoHideTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const sidebarCloseTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const [sidebarInteractionTime, setSidebarInteractionTime] = useState<number | null>(null)

  // Get build/deployment date and version (only on client to avoid hydration mismatch)
  useEffect(() => {
    // Fetch build info from API
    fetch('/api/build-info')
      .then(res => res.json())
      .then(data => {
        setBuildVersion(data.version || '1.0.0')
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

  // Auto-hide sidebar after inactivity (only on desktop, not mobile)
  useEffect(() => {
    if (isMobile || isCheckingAuth) return

    const startAutoHideTimer = () => {
      // Clear existing timer
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current)
      }

      // Only auto-hide if not manually expanded and not hovered
      if (!isCollapsed && !isHovered && !isScrolled) {
        autoHideTimeoutRef.current = setTimeout(() => {
          setIsCollapsed(true)
          localStorage.setItem('sidebar-collapsed', 'true')
        }, 3000) // Auto-hide after 3 seconds of inactivity
      }
    }

    // Start timer when sidebar is expanded and not hovered/scrolled
    if (!isCollapsed && !isHovered && !isScrolled) {
      startAutoHideTimer()
    }

    return () => {
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current)
      }
      if (sidebarCloseTimeoutRef.current) {
        clearTimeout(sidebarCloseTimeoutRef.current)
      }
    }
  }, [isCollapsed, isHovered, isScrolled, isMobile, isCheckingAuth])

  // Initial auto-hide after page load (only on desktop)
  useEffect(() => {
    if (isMobile || isCheckingAuth) return

    // Only auto-hide if user hasn't manually set a preference
    const savedState = localStorage.getItem('sidebar-collapsed')
    if (savedState !== null) return // User has a preference, don't override

    // Start auto-hide timer after initial load (give user time to see sidebar)
    const initialTimer = setTimeout(() => {
      if (!isHovered && !isScrolled && !isCollapsed) {
        setIsCollapsed(true)
        localStorage.setItem('sidebar-collapsed', 'true')
      }
    }, 5000) // Auto-hide after 5 seconds on initial load

    return () => {
      clearTimeout(initialTimer)
    }
  }, [isMobile, isCheckingAuth]) // Run when mobile/auth state changes

  // Cleanup all timeouts on unmount
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
    setIsHovered(false)
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
    // Expand sidebar on hover if collapsed
    if (isCollapsed) {
      setIsCollapsed(false)
    }
    // Clear any close timers
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current)
      autoHideTimeoutRef.current = null
    }
    if (sidebarCloseTimeoutRef.current) {
      clearTimeout(sidebarCloseTimeoutRef.current)
      sidebarCloseTimeoutRef.current = null
    }
  }

  const handleSidebarMouseLeave = () => {
    if (isMobile) return
    setIsHovered(false)

    // Don't close if manually expanded or scrolled
    if (isScrolled) return

    // Calculate delay based on recent interaction
    // If user clicked something recently, keep it open longer
    const baseDelay = 1500 // 1.5 seconds base delay
    const interactionBonus = sidebarInteractionTime
      ? Math.min(2000, Date.now() - sidebarInteractionTime) // Up to 2 seconds bonus
      : 0
    const delay = baseDelay + interactionBonus

    // Clear any existing close timer
    if (sidebarCloseTimeoutRef.current) {
      clearTimeout(sidebarCloseTimeoutRef.current)
      sidebarCloseTimeoutRef.current = null
    }

    // Set timer to close smoothly after delay
    if (!isCollapsed) {
      sidebarCloseTimeoutRef.current = setTimeout(() => {
        setIsCollapsed(true)
        localStorage.setItem('sidebar-collapsed', 'true')
        sidebarCloseTimeoutRef.current = null
      }, delay)
    }
  }

  // Handle clicks on sidebar items - keep sidebar open longer
  const handleSidebarItemClick = () => {
    if (isMobile) return
    // Record interaction time to extend close delay
    setSidebarInteractionTime(Date.now())
    // Clear any close timers
    if (sidebarCloseTimeoutRef.current) {
      clearTimeout(sidebarCloseTimeoutRef.current)
      sidebarCloseTimeoutRef.current = null
    }
    // Reset interaction time after a delay
    setTimeout(() => {
      setSidebarInteractionTime(null)
    }, 3000)
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

  const sidebarWidth = isCollapsed ? '64px' : '240px'
  const sidebarContentMargin = isMobile ? '0' : sidebarWidth

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
                src="/proxe-icon.png"
                alt="PROXe"
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
      {isMobile && mobileSidebarOpen && (
        <div
          className="dashboard-layout-mobile-overlay fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Fixed Sidebar */}
      <div
        className={`dashboard-layout-sidebar fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-500 ease-in-out overflow-hidden ${isMobile && !mobileSidebarOpen ? '-translate-x-full' : 'translate-x-0'
          }`}
        style={{
          width: sidebarWidth,
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-primary)',
        }}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {/* Logo and Toggle */}
        <div
          className="dashboard-layout-sidebar-header flex items-center justify-between flex-shrink-0"
          style={{
            padding: isCollapsed ? '20px' : '20px 16px',
            justifyContent: isCollapsed ? 'center' : 'space-between',
          }}
        >
          {!isCollapsed && (
            <>
              <h1 className="dashboard-layout-sidebar-logo text-xl font-black font-zen-dots tracking-tighter" style={{ color: 'var(--accent-primary)' }}>PROXe</h1>
              {!isMobile && (
                <button
                  onClick={toggleSidebar}
                  className="dashboard-layout-sidebar-toggle-button p-1.5 rounded-md transition-colors"
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
                  className="dashboard-layout-sidebar-close-button p-1.5 rounded-md transition-colors"
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
          {isCollapsed && (
            <div
              className="dashboard-layout-sidebar-logo-collapsed flex items-center justify-center cursor-pointer"
              style={{
                width: '40px',
                height: '40px',
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
                src="/proxe-icon.png"
                alt="PROXe"
                className="w-full h-full object-contain"
                style={{ maxWidth: '40px', maxHeight: '40px' }}
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="dashboard-layout-sidebar-navigation flex-1 overflow-hidden flex flex-col" style={{ padding: isCollapsed ? '16px 0' : '16px' }}>
          {/* Main Navigation */}
          <div className="dashboard-layout-sidebar-navigation-list space-y-1 flex-1">
            {navigation.map((item, index) => {
              // Check if we need a divider after the previous item
              const needsDivider = DIVIDER_AFTER_INDICES.includes(index - 1)
              const isActive = pathname === item.href || (item.children && item.children.some(child => pathname === child.href))
              const isInbox = item.name === 'Conversations'
              const hasChildren = item.children && item.children.length > 0

              const renderNavItem = (navItem: NavItem, isChild = false) => {
                const itemIsActive = pathname === navItem.href
                const itemHref = navItem.comingSoon ? '#' : navItem.href

                // Premium Item Style
                const baseStyle: React.CSSProperties = {
                  fontSize: '13px',
                  fontWeight: itemIsActive ? 700 : 500,
                  color: itemIsActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  backgroundColor: itemIsActive ? 'var(--accent-subtle)' : 'transparent',
                  margin: isCollapsed ? '4px 8px' : '4px 12px',
                  borderRadius: '12px',
                  padding: isCollapsed ? '12px' : isChild ? '10px 16px 10px 44px' : '10px 16px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  opacity: navItem.comingSoon ? 0.5 : 1,
                  cursor: navItem.comingSoon ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                }

                // Sub-active indicator glow
                const activeGlow = itemIsActive && !isCollapsed ? (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-amber-500 rounded-r-full shadow-[0_0_10px_rgba(201,169,97,0.8)]"
                  />
                ) : null;

                const content = (
                  <>
                    {activeGlow}
                    <span
                      className="dashboard-layout-nav-item-icon"
                      style={{
                        marginRight: isCollapsed ? '0' : '12px',
                        display: 'flex',
                        alignItems: 'center',
                        color: itemIsActive ? 'var(--accent-primary)' : 'inherit',
                        transform: itemIsActive ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 0.3s ease'
                      }}
                    >
                      <navItem.icon size={18} />
                    </span>
                    {!isCollapsed && (
                      <>
                        <span className="dashboard-layout-nav-item-label flex-1 truncate">{navItem.name}</span>
                        {isInbox && !isChild && unreadCount > 0 && (
                          <span className="dashboard-layout-nav-item-badge bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                            {unreadCount}
                          </span>
                        )}
                        {navItem.comingSoon && (
                          <span className="text-[9px] uppercase tracking-tighter opacity-50 font-black ml-2 px-1 bg-gray-500/10 rounded">Soon</span>
                        )}
                      </>
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
                      title={isCollapsed ? navItem.name : undefined}
                      onMouseEnter={(e) => {
                        if (!itemIsActive) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
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
                      title={isCollapsed ? navItem.name : undefined}
                      onClick={() => {
                        if (!isMobile) {
                          handleSidebarItemClick()
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      }}
                      onMouseLeave={(e) => {
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
                      title={isCollapsed ? navItem.name : undefined}
                      onClick={() => {
                        if (isMobile) {
                          setMobileSidebarOpen(false)
                        } else {
                          handleSidebarItemClick()
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!itemIsActive) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
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
                  {needsDivider && !isCollapsed && (
                    <div
                      className="dashboard-layout-nav-divider"
                      style={{
                        borderTop: '1px solid var(--border-primary)',
                        margin: '12px 16px',
                      }}
                    />
                  )}

                  {renderNavItem(item)}

                  {/* Render children if not collapsed */}
                  {hasChildren && !isCollapsed && (
                    <div className="dashboard-layout-nav-children space-y-1">
                      {item.children!.map((child) => renderNavItem(child, true))}
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </nav>

        {/* Footer Section: User, Icon Bar, Version */}
        <div
          className="dashboard-layout-sidebar-footer flex-shrink-0 border-t flex flex-col"
          style={{
            borderColor: 'var(--border-primary)',
          }}
        >
          {/* 1. User Section - Center-aligned */}
          <div
            className="dashboard-layout-user-section flex items-center justify-center"
            style={{
              padding: '16px',
            }}
          >
            <div className="dashboard-layout-user-menu relative">
              <button
                type="button"
                className="dashboard-layout-user-menu-button flex items-center rounded-md transition-all duration-200"
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  padding: isCollapsed ? '0' : '8px 12px',
                  justifyContent: 'center',
                }}
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div
                  className="dashboard-layout-user-avatar rounded-full flex items-center justify-center text-white font-medium flex-shrink-0"
                  style={{
                    width: '32px',
                    height: '32px',
                    minWidth: '32px',
                    minHeight: '32px',
                    backgroundColor: 'var(--accent-primary)',
                    marginRight: isCollapsed ? '0' : '8px',
                    fontSize: '14px',
                    lineHeight: '1',
                  }}
                >
                  U
                </div>
                {!isCollapsed && <span className="dashboard-layout-user-label">User</span>}
              </button>

              {userMenuOpen && !isCollapsed && (
                <div
                  className="dashboard-layout-user-menu-dropdown absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 rounded-md shadow-lg py-1 z-50"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    minWidth: '120px',
                  }}
                  onMouseLeave={() => setUserMenuOpen(false)}
                >
                  <button
                    onClick={handleLogout}
                    className="dashboard-layout-user-menu-logout-button block w-full text-left px-4 py-2 text-sm transition-colors duration-200"
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
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Icon Bar - Below User Section (only show when expanded, or show three-dot menu when collapsed) */}
          {!isCollapsed ? (
            <div
              className="dashboard-layout-icon-bar flex-shrink-0 border-t flex items-center justify-center"
              style={{
                borderColor: 'var(--border-primary)',
                backgroundColor: 'transparent',
                padding: '12px',
                gap: '12px',
              }}
            >
              {/* Help Icon */}
              <button
                onClick={() => window.open('https://docs.goproxe.com', '_blank')}
                className="dashboard-layout-icon-button flex items-center justify-center rounded-md transition-colors"
                style={{
                  width: '24px',
                  height: '24px',
                  minWidth: '24px',
                  minHeight: '24px',
                  color: 'var(--text-primary)',
                  backgroundColor: 'transparent',
                }}
                title="Help & Documentation"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <MdHelp size={24} />
              </button>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="dashboard-layout-icon-button flex items-center justify-center rounded-md transition-colors"
                style={{
                  width: '24px',
                  height: '24px',
                  minWidth: '24px',
                  minHeight: '24px',
                  color: 'var(--text-primary)',
                  backgroundColor: 'transparent',
                }}
                title="Toggle Theme"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {isDarkMode ? <MdLightMode size={24} /> : <MdDarkMode size={24} />}
              </button>

              {/* Status Icon */}
              <Link
                href="/dashboard/status"
                className="dashboard-layout-icon-button flex items-center justify-center rounded-md transition-colors"
                style={{
                  width: '24px',
                  height: '24px',
                  minWidth: '24px',
                  minHeight: '24px',
                  color: 'var(--text-primary)',
                  backgroundColor: 'transparent',
                }}
                title="System Status"
                onClick={() => {
                  if (isMobile) {
                    setMobileSidebarOpen(false)
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <MdMonitorHeart size={24} />
              </Link>

              {/* More Options */}
              <div className="dashboard-layout-more-options relative">
                <button
                  onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}
                  className="dashboard-layout-icon-button flex items-center justify-center rounded-md transition-colors"
                  style={{
                    width: '24px',
                    height: '24px',
                    minWidth: '24px',
                    minHeight: '24px',
                    color: 'var(--text-primary)',
                    backgroundColor: moreOptionsOpen ? 'var(--bg-hover)' : 'transparent',
                  }}
                  title="More Options"
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
                  <MdMoreHoriz size={24} />
                </button>

                {moreOptionsOpen && (
                  <div
                    className="dashboard-layout-more-options-dropdown absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 rounded-md shadow-lg py-1 z-50"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      minWidth: '180px',
                    }}
                    onMouseLeave={() => setMoreOptionsOpen(false)}
                  >
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        // TODO: Implement keyboard shortcuts modal
                        console.log('Keyboard Shortcuts')
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
                      <MdKeyboard size={18} style={{ marginRight: '12px' }} />
                      Keyboard Shortcuts
                    </button>
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        // TODO: Implement report issue
                        window.open('https://github.com/bconclub/proxe-dashboard/issues/new', '_blank')
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
                      <MdBugReport size={18} style={{ marginRight: '12px' }} />
                      Report Issue
                    </button>
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        // TODO: Implement send feedback
                        window.open('mailto:support@goproxe.com?subject=Dashboard Feedback', '_blank')
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
                      <MdFeedback size={18} style={{ marginRight: '12px' }} />
                      Send Feedback
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* When collapsed, show only three-dot menu */
            <div
              className="dashboard-layout-icon-bar-collapsed flex-shrink-0 border-t flex items-center justify-center"
              style={{
                borderColor: 'var(--border-primary)',
                backgroundColor: 'transparent',
                padding: '12px 8px',
              }}
            >
              <div className="dashboard-layout-more-options relative">
                <button
                  onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}
                  className="dashboard-layout-icon-button flex items-center justify-center rounded-md transition-colors"
                  style={{
                    width: '32px',
                    height: '32px',
                    minWidth: '32px',
                    minHeight: '32px',
                    color: 'var(--text-primary)',
                    backgroundColor: moreOptionsOpen ? 'var(--bg-hover)' : 'transparent',
                  }}
                  title="More Options"
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
                  <MdMoreHoriz size={20} />
                </button>

                {moreOptionsOpen && (
                  <div
                    className="dashboard-layout-more-options-dropdown absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 rounded-md shadow-lg py-1 z-50"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      minWidth: '180px',
                    }}
                    onMouseLeave={() => setMoreOptionsOpen(false)}
                  >
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        window.open('https://docs.goproxe.com', '_blank')
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
                      <MdHelp size={18} style={{ marginRight: '12px' }} />
                      Help & Documentation
                    </button>
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        toggleTheme()
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
                      {isDarkMode ? (
                        <>
                          <MdLightMode size={18} style={{ marginRight: '12px' }} />
                          Light Mode
                        </>
                      ) : (
                        <>
                          <MdDarkMode size={18} style={{ marginRight: '12px' }} />
                          Dark Mode
                        </>
                      )}
                    </button>
                    <Link
                      href="/dashboard/status"
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
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        // TODO: Implement keyboard shortcuts modal
                        console.log('Keyboard Shortcuts')
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
                      <MdKeyboard size={18} style={{ marginRight: '12px' }} />
                      Keyboard Shortcuts
                    </button>
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        // TODO: Implement report issue
                        window.open('https://github.com/bconclub/proxe-dashboard/issues/new', '_blank')
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
                      <MdBugReport size={18} style={{ marginRight: '12px' }} />
                      Report Issue
                    </button>
                    <button
                      onClick={() => {
                        setMoreOptionsOpen(false)
                        // TODO: Implement send feedback
                        window.open('mailto:support@goproxe.com?subject=Dashboard Feedback', '_blank')
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
                      <MdFeedback size={18} style={{ marginRight: '12px' }} />
                      Send Feedback
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Version Badge - Below Icon Bar */}
          <div
            className="dashboard-layout-version-info text-center"
            style={{
              padding: '12px 16px',
            }}
          >
            {!isCollapsed ? (
              <>
                <div
                  className="dashboard-layout-version-badge inline-block px-2 py-1 rounded text-xs font-medium mb-1"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: 'white',
                  }}
                >
                  v{buildVersion}
                </div>
                <p
                  className="dashboard-layout-version-date text-xs mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                  suppressHydrationWarning
                >
                  Build {buildDate || 'Loading...'}
                </p>
              </>
            ) : (
              <div
                className="dashboard-layout-version-badge-collapsed inline-block px-1.5 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                }}
                title={buildDate ? `v${buildVersion} - Build: ${buildDate}` : `v${buildVersion}`}
              >
                v{buildVersion.split('.').slice(0, 2).join('.')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="dashboard-layout-mobile-menu-button fixed top-4 left-4 z-30 p-2 rounded-md transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          aria-label="Open sidebar"
        >
          <MdMenu size={24} />
        </button>
      )}

      {/* Main Content */}
      <div
        className="dashboard-layout-main-content flex flex-col min-h-screen transition-all duration-300 ease-in-out"
        style={{
          marginLeft: sidebarContentMargin,
          backgroundColor: 'var(--bg-primary)',
          minHeight: '100vh',
          width: isMobile ? '100%' : `calc(100% - ${sidebarWidth})`,
        }}
      >
        {/* Page Transition Loader */}
        <PageTransitionLoader />

        {/* Page content */}
        <main className="dashboard-layout-main-content-wrapper flex-1" style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
          <div className="dashboard-layout-main-content-container py-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="dashboard-layout-main-content-inner max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
