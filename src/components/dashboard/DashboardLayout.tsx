'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  MdDashboard,
  MdPeople,
  MdCalendarToday,
  MdCampaign,
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
} from 'react-icons/md'

// Custom SVG Icon Components for Channels
const WebsiteIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    width="20" 
    height="20" 
    color="currentColor" 
    fill="none"
    className={className}
    style={style}
  >
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5"></path>
    <path d="M2.5 9H21.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"></path>
    <path d="M6.99981 6H7.00879" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M10.9998 6H11.0088" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
  </svg>
)

const WhatsAppIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    width="20" 
    height="20" 
    color="currentColor" 
    fill="none"
    className={className}
    style={style}
  >
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.3789 2.27907 14.6926 2.78382 15.8877C3.06278 16.5481 3.20226 16.8784 3.21953 17.128C3.2368 17.3776 3.16334 17.6521 3.01642 18.2012L2 22L5.79877 20.9836C6.34788 20.8367 6.62244 20.7632 6.87202 20.7805C7.12161 20.7977 7.45185 20.9372 8.11235 21.2162C9.30745 21.7209 10.6211 22 12 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"></path>
    <path d="M12.8824 12C14.0519 12 15 13.0074 15 14.25C15 15.4926 14.0519 16.5 12.8824 16.5H10.4118C9.74625 16.5 9.4135 16.5 9.20675 16.2972C9 16.0945 9 15.7681 9 15.1154V12M12.8824 12C14.0519 12 15 10.9926 15 9.75C15 8.50736 14.0519 7.5 12.8824 7.5H10.4118C9.74625 7.5 9.4135 7.5 9.20675 7.70277C9 7.90554 9 8.2319 9 8.88462V12M12.8824 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
  </svg>
)

const VoiceIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    width="20" 
    height="20" 
    color="currentColor" 
    fill="none"
    className={className}
    style={style}
  >
    <path d="M9 11V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M11.5 3C7.27027 3 5.1554 3 3.75276 4.19797C3.55358 4.36808 3.36808 4.55358 3.19797 4.75276C2 6.1554 2 8.27027 2 12.5C2 16.7297 2 18.8446 3.19797 20.2472C3.36808 20.4464 3.55358 20.6319 3.75276 20.802C5.1554 22 7.27027 22 11.5 22C15.7297 22 17.8446 22 19.2472 20.802C19.4464 20.6319 19.6319 20.4464 19.802 20.2472C21 18.8446 21 16.7297 21 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M12 8V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M15 10V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M6 12V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M15.3881 5.08714C16.796 4.91193 17.9119 3.79602 18.0871 2.38812C18.1137 2.17498 18.2852 2 18.5 2C18.7148 2 18.8863 2.17498 18.9129 2.38812C19.0881 3.79602 20.204 4.91193 21.6119 5.08714C21.825 5.11366 22 5.28522 22 5.5C22 5.71478 21.825 5.88634 21.6119 5.91286C20.204 6.08807 19.0881 7.20398 18.9129 8.61188C18.8863 8.82502 18.7148 9 18.5 9C18.2852 9 18.1137 8.82502 18.0871 8.61188C17.9119 7.20398 16.796 6.08807 15.3881 5.91286C15.175 5.88634 15 5.71478 15 5.5C15 5.28522 15.175 5.11366 15.3881 5.08714Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
  </svg>
)

const SocialIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    width="20" 
    height="20" 
    color="currentColor" 
    fill="none"
    className={className}
    style={style}
  >
    <path d="M18.9737 15.0215C18.9795 14.9928 19.0205 14.9928 19.0263 15.0215C19.3302 16.5081 20.4919 17.6698 21.9785 17.9737C22.0072 17.9795 22.0072 18.0205 21.9785 18.0263C20.4919 18.3302 19.3302 19.4919 19.0263 20.9785C19.0205 21.0072 18.9795 21.0072 18.9737 20.9785C18.6698 19.4919 17.5081 18.3302 16.0215 18.0263C15.9928 18.0205 15.9928 17.9795 16.0215 17.9737C17.5081 17.6698 18.6698 16.5081 18.9737 15.0215Z" stroke="currentColor" strokeWidth="1.5"></path>
    <path d="M14.6469 12.6727C15.3884 12.1531 15.7591 11.8934 15.9075 11.5158C16.0308 11.2021 16.0308 10.7979 15.9075 10.4842C15.7591 10.1066 15.3884 9.84685 14.6469 9.3273C14.1274 8.9633 13.5894 8.60214 13.1167 8.3165C12.7229 8.07852 12.2589 7.82314 11.7929 7.57784C11.005 7.16312 10.6111 6.95576 10.2297 7.00792C9.91348 7.05115 9.58281 7.25237 9.38829 7.5199C9.1536 7.84266 9.12432 8.30677 9.06577 9.23497C9.02725 9.84551 9 10.4661 9 11C9 11.5339 9.02725 12.1545 9.06577 12.765C9.12432 13.6932 9.1536 14.1573 9.38829 14.4801C9.58281 14.7476 9.91348 14.9489 10.2297 14.9921C10.6111 15.0442 11.005 14.8369 11.7929 14.4221C12.2589 14.1768 12.7229 13.9215 13.1167 13.6835C13.5894 13.3978 14.1274 13.0367 14.6469 12.6727Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"></path>
    <path d="M21.872 14.8357C22 13.9227 22 12.7279 22 11C22 8.19974 22 6.79961 21.455 5.73005C20.9757 4.78924 20.2108 4.02433 19.27 3.54497C18.2004 3 16.8003 3 14 3H10C7.19974 3 5.79961 3 4.73005 3.54497C3.78924 4.02433 3.02433 4.78924 2.54497 5.73005C2 6.79961 2 8.19974 2 11C2 13.8003 2 15.2004 2.54497 16.27C3.02433 17.2108 3.78924 17.9757 4.73005 18.455C5.79961 19 7.19974 19 10 19H13.4257" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
  </svg>
)

interface DashboardLayoutProps {
  children: React.ReactNode
}

interface NavItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  external?: boolean
}

// Navigation items in order
const navigation: NavItem[] = [
  { name: 'Overview', href: '/dashboard', icon: MdDashboard },
  { name: 'All Leads', href: '/dashboard/leads', icon: MdPeople },
  { name: 'Bookings', href: '/dashboard/bookings', icon: MdCalendarToday },
  { name: 'Website', href: '/dashboard/channels/web', icon: WebsiteIcon },
  { name: 'WhatsApp', href: '/dashboard/channels/whatsapp', icon: WhatsAppIcon },
  { name: 'Voice', href: '/dashboard/channels/voice', icon: VoiceIcon },
  { name: 'Social', href: '/dashboard/channels/social', icon: SocialIcon },
  { name: 'Marketing', href: '/dashboard/marketing', icon: MdCampaign },
  { name: 'Settings', href: '/dashboard/settings', icon: MdSettings },
  { name: 'Billing', href: '/dashboard/billing', icon: MdCreditCard },
  { name: 'Docs', href: 'https://docs.goproxe.com', icon: MdMenuBook, external: true },
  { name: 'Support', href: 'https://support.goproxe.com', icon: MdSupport, external: true },
]

// Divider positions: after Bookings (index 2), after Social (index 6), after Settings (index 8)
const DIVIDER_AFTER_INDICES = [2, 6, 8]

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true)

  // Load collapsed state and theme from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar-collapsed')
    if (savedState !== null) {
      setIsCollapsed(savedState === 'true')
    }

    // Load theme preference
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme !== null) {
      const isDark = savedTheme === 'dark'
      setIsDarkMode(isDark)
      if (isDark) {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('light')
      } else {
        document.documentElement.classList.add('light')
        document.documentElement.classList.remove('dark')
      }
    } else {
      // Default to dark mode or system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDarkMode(prefersDark)
      if (prefersDark) {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('light')
      } else {
        document.documentElement.classList.add('light')
        document.documentElement.classList.remove('dark')
      }
    }
  }, [])

  // Check if mobile
  useEffect(() => {
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

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const sidebarWidth = isCollapsed ? '64px' : '240px'
  const sidebarContentMargin = isMobile ? '0' : sidebarWidth

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Mobile overlay */}
      {isMobile && mobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Fixed Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-200 ease-in-out ${
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
          className="flex items-center justify-between flex-shrink-0"
          style={{ padding: '20px 16px' }}
        >
          {!isCollapsed && (
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>PROXe</h1>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: 'var(--accent-primary)' }}>
              P
            </div>
          )}
          {isMobile ? (
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-1.5 rounded-md transition-colors"
              style={{ backgroundColor: 'transparent', color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              aria-label="Close sidebar"
            >
              <MdClose className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md transition-colors"
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
                <MdChevronRight className="w-5 h-5" />
              ) : (
                <MdChevronLeft className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* Navigation - Split into main nav and account section */}
        <nav className="flex-1 overflow-y-auto flex flex-col" style={{ padding: isCollapsed ? '16px 0' : '16px' }}>
          {/* Main Navigation (Overview through Settings) */}
          <div className="space-y-1 flex-1">
            {navigation.slice(0, 9).map((item, index) => {
              // Check if we need a divider after the previous item
              const needsDivider = DIVIDER_AFTER_INDICES.includes(index - 1)
              const isActive = pathname === item.href
              
              return (
                <React.Fragment key={item.name}>
                  {needsDivider && !isCollapsed && (
                    <div 
                      style={{
                        borderTop: '1px solid var(--border-primary)',
                        margin: '12px 16px',
                      }}
                    />
                  )}
                  
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center rounded-md transition-all duration-200"
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        padding: isCollapsed ? '10px' : '10px 16px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                      }}
                      title={isCollapsed ? item.name : undefined}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <item.icon 
                        style={{ width: '20px', height: '20px', marginRight: isCollapsed ? '0' : '12px' }}
                      />
                      {!isCollapsed && <span>{item.name}</span>}
                    </a>
                  ) : (
                    <Link
                      href={item.href!}
                      className="flex items-center rounded-md transition-all duration-200 relative"
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                        backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                        borderLeft: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        padding: isCollapsed ? '10px' : '10px 16px',
                        paddingLeft: isActive && !isCollapsed ? '14px' : isCollapsed ? '10px' : '16px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                      }}
                      title={isCollapsed ? item.name : undefined}
                      onClick={() => {
                        if (isMobile) {
                          setMobileSidebarOpen(false)
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <item.icon 
                        style={{ width: '20px', height: '20px', marginRight: isCollapsed ? '0' : '12px' }}
                      />
                      {!isCollapsed && <span>{item.name}</span>}
                    </Link>
                  )}
                </React.Fragment>
              )
            })}
          </div>

          {/* Spacer to push account section down */}
          <div className="flex-1" />

          {/* Account Section (Usage, Billing, Docs, Support) */}
          {!isCollapsed && (
            <div 
              style={{
                borderTop: '1px solid var(--border-primary)',
                margin: '12px 16px',
              }}
            />
          )}
          <div className="space-y-1">
            {navigation.slice(9).map((item) => {
              const isActive = pathname === item.href
              
              return (
                <React.Fragment key={item.name}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center rounded-md transition-all duration-200"
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        padding: isCollapsed ? '10px' : '10px 16px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                      }}
                      title={isCollapsed ? item.name : undefined}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <item.icon 
                        style={{ width: '20px', height: '20px', marginRight: isCollapsed ? '0' : '12px' }}
                      />
                      {!isCollapsed && <span>{item.name}</span>}
                    </a>
                  ) : (
                    <Link
                      href={item.href!}
                      className="flex items-center rounded-md transition-all duration-200 relative"
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                        backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                        borderLeft: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        padding: isCollapsed ? '10px' : '10px 16px',
                        paddingLeft: isActive && !isCollapsed ? '14px' : isCollapsed ? '10px' : '16px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                      }}
                      title={isCollapsed ? item.name : undefined}
                      onClick={() => {
                        if (isMobile) {
                          setMobileSidebarOpen(false)
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <item.icon 
                        style={{ width: '20px', height: '20px', marginRight: isCollapsed ? '0' : '12px' }}
                      />
                      {!isCollapsed && <span>{item.name}</span>}
                    </Link>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </nav>

        {/* User Menu and Toggle at Bottom */}
        <div 
          className="flex-shrink-0 border-t flex flex-col"
          style={{ 
            borderColor: 'var(--border-primary)',
            padding: '16px',
          }}
        >
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center w-full rounded-md transition-all duration-200 mb-2"
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
            {isDarkMode ? (
              <MdLightMode style={{ width: '20px', height: '20px', marginRight: isCollapsed ? '0' : '12px' }} />
            ) : (
              <MdDarkMode style={{ width: '20px', height: '20px', marginRight: isCollapsed ? '0' : '12px' }} />
            )}
            {!isCollapsed && <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* User Menu */}
          <div className="relative mb-2">
            <button
              type="button"
              className="flex items-center w-full rounded-md transition-all duration-200"
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                padding: isCollapsed ? '10px' : '10px 16px',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
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
                className="rounded-full flex items-center justify-center text-white font-medium"
                style={{ 
                  width: '32px', 
                  height: '32px',
                  backgroundColor: 'var(--accent-primary)',
                  marginRight: isCollapsed ? '0' : '12px',
                }}
              >
                U
              </div>
              {!isCollapsed && <span>User</span>}
            </button>
            
            {userMenuOpen && !isCollapsed && (
              <div 
                className="absolute bottom-full left-0 mb-2 w-full rounded-md shadow-lg py-1"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm transition-colors duration-200"
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
              className="flex items-center justify-center w-full rounded-md transition-all duration-200"
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
                <MdChevronRight className="w-5 h-5" />
              ) : (
                <MdChevronLeft className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="fixed top-4 left-4 z-30 p-2 rounded-md transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          aria-label="Open sidebar"
        >
          <MdMenu className="w-6 h-6" />
        </button>
      )}

      {/* Main Content */}
      <div 
        className="flex flex-col min-h-screen transition-all duration-200 ease-in-out"
        style={{
          marginLeft: sidebarContentMargin,
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
