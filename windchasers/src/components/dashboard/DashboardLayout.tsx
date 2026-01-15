'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  { name: 'Configure', href: '/dashboard/settings', icon: MdSettings },
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
  const [isMobile, setIsMobile] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [unreadCount] = useState(0) // TODO: Implement unread count logic
  const [buildDate, setBuildDate] = useState<string>('')
  
  // Get build/deployment date (only on client to avoid hydration mismatch)
  useEffect(() => {
    setBuildDate(getBuildDate())
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
    localStorage.setItem('sidebar-collapsed', String(newState))
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
          <div 
            className="dashboard-layout-auth-loader-spinner animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
            style={{ borderColor: 'var(--accent-primary)' }}
          ></div>
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
        className={`dashboard-layout-sidebar fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-200 ease-in-out ${
          isMobile && !mobileSidebarOpen ? '-translate-x-full' : 'translate-x-0'
        }`}
        style={{
          width: sidebarWidth,
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-primary)',
        }}
      >
        {/* Logo and Toggle */}
        <div 
          className="dashboard-layout-sidebar-header flex items-center justify-between flex-shrink-0"
          style={{ padding: '20px 16px' }}
        >
          {!isCollapsed && (
            <h1 className="dashboard-layout-sidebar-logo text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Windchasers</h1>
          )}
          {isCollapsed && (
            <div className="dashboard-layout-sidebar-logo-collapsed w-8 h-8 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: 'var(--accent-primary)' }}>
              W
            </div>
          )}
          {isMobile ? (
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
          ) : (
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
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <MdChevronRight size={20} />
              ) : (
                <MdChevronLeft size={20} />
              )}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="dashboard-layout-sidebar-navigation flex-1 overflow-y-auto flex flex-col" style={{ padding: isCollapsed ? '16px 0' : '16px' }}>
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
                const baseStyle: React.CSSProperties = {
                  fontSize: '14px',
                  fontWeight: 500,
                  color: itemIsActive ? 'var(--accent-light)' : 'var(--text-primary)',
                  backgroundColor: itemIsActive ? 'var(--accent-subtle)' : 'transparent',
                  borderLeft: itemIsActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  padding: isCollapsed ? '10px' : isChild ? '10px 16px 10px 40px' : '10px 16px',
                  paddingLeft: itemIsActive && !isCollapsed && !isChild ? '14px' : isCollapsed ? '10px' : isChild ? '40px' : '16px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  opacity: navItem.comingSoon ? 0.6 : 1,
                  cursor: navItem.comingSoon ? 'not-allowed' : 'pointer',
                }

                const content = (
                  <>
                    <span className="dashboard-layout-nav-item-icon" style={{ marginRight: isCollapsed ? '0' : '12px', display: 'flex', alignItems: 'center' }}>
                      <navItem.icon size={20} />
                    </span>
                    {!isCollapsed && (
                      <>
                        <span className="dashboard-layout-nav-item-label" style={{ flex: 1 }}>{navItem.name}</span>
                        {isInbox && !isChild && unreadCount > 0 && (
                          <span className="dashboard-layout-nav-item-badge bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-2">
                            {unreadCount}
                          </span>
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

        {/* User Menu and Toggle at Bottom */}
        <div 
          className="dashboard-layout-sidebar-footer flex-shrink-0 border-t flex flex-col"
          style={{ 
            borderColor: 'var(--border-primary)',
            padding: '16px',
          }}
        >
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="dashboard-layout-theme-toggle-button flex items-center w-full rounded-md transition-all duration-200 mb-2"
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              padding: isCollapsed ? '10px' : '10px 16px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
            }}
            title={isCollapsed ? (isDarkMode ? 'Switch to light mode' : 'Switch to dark mode') : undefined}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span className="dashboard-layout-theme-toggle-icon" style={{ marginRight: isCollapsed ? '0' : '12px', display: 'flex', alignItems: 'center' }}>
              {isDarkMode ? (
                <MdLightMode size={20} />
              ) : (
                <MdDarkMode size={20} />
              )}
            </span>
            {!isCollapsed && <span className="dashboard-layout-theme-toggle-label">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* User Menu */}
          <div className="dashboard-layout-user-menu relative mb-2">
            <button
              type="button"
              className="dashboard-layout-user-menu-button flex items-center w-full rounded-md transition-all duration-200"
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                padding: isCollapsed ? '10px' : '10px 16px',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                minWidth: isCollapsed ? 'auto' : '100%',
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
                  marginRight: isCollapsed ? '0' : '12px',
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
                className="dashboard-layout-user-menu-dropdown absolute bottom-full left-0 mb-2 w-full rounded-md shadow-lg py-1"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                }}
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

          {/* Collapse Toggle (Desktop only, at bottom) */}
          {!isMobile && (
            <button
              onClick={toggleSidebar}
              className="dashboard-layout-sidebar-collapse-button flex items-center justify-center w-full rounded-md transition-all duration-200 mb-2"
              style={{
                padding: '10px',
                color: 'var(--text-primary)',
              }}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {isCollapsed ? (
                <MdChevronRight size={20} />
              ) : (
                <MdChevronLeft size={20} />
              )}
            </button>
          )}

          {/* Version Badge and Last Updated */}
          {!isCollapsed && (
            <div 
              className="dashboard-layout-version-info text-center pt-2 border-t"
              style={{ 
                borderColor: 'var(--border-primary)',
                paddingTop: '12px',
              }}
            >
              <div 
                className="dashboard-layout-version-badge inline-block px-2 py-1 rounded text-xs font-medium mb-1"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                }}
              >
                v1.0.0
              </div>
              <p 
                className="dashboard-layout-version-date text-xs mt-1"
                style={{ color: 'var(--text-secondary)' }}
                suppressHydrationWarning
              >
                Updated: {buildDate || 'Loading...'}
              </p>
            </div>
          )}
          {isCollapsed && (
            <div className="dashboard-layout-version-info-collapsed text-center pt-2">
              <div 
                className="dashboard-layout-version-badge-collapsed inline-block px-1.5 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                }}
                title={buildDate ? `v1.0.0 - Updated: ${buildDate}` : 'v1.0.0'}
              >
                v1.0
              </div>
            </div>
          )}
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
        className="dashboard-layout-main-content flex flex-col min-h-screen transition-all duration-200 ease-in-out"
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
