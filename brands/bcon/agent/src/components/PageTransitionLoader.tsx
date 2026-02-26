'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'

export default function PageTransitionLoader() {
  const [isLoading, setIsLoading] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Show loader when pathname changes
    setIsLoading(true)
    
    // Hide loader after a short delay (simulating page load)
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [pathname])

  if (!isLoading) return null

  return (
    <div
      className="page-transition-loader-overlay fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div className="page-transition-loader-content flex flex-col items-center">
        {/* Windchasers Icon with Animation */}
        <div className="page-transition-loader-icon-container relative">
          {/* Pulse effect with transparent accent color */}
          <div
            className="page-transition-loader-pulse absolute inset-0 rounded-full animate-ping opacity-30"
            style={{
              backgroundColor: 'var(--accent-primary)',
              width: '100px',
              height: '100px',
              margin: '-10px',
            }}
          />
          <div className="page-transition-loader-icon-wrapper relative animate-pulse">
            <Image
              src="/windchasers-icon.png"
              alt="Windchasers"
              width={80}
              height={80}
              className="page-transition-loader-icon drop-shadow-lg"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  )
}

