import { useState, useEffect } from 'react'

export function useOrientation() {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  })

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    window.addEventListener('resize', handleResize)

    const handleOrientationChange = () => {
      // Small delay to let the browser update dimensions after orientation change
      setTimeout(handleResize, 100)
    }
    window.addEventListener('orientationchange', handleOrientationChange)

    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationChange)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientationChange)
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', handleOrientationChange)
      }
    }
  }, [])

  const isLandscape = dimensions.width > dimensions.height
  const isMobile = dimensions.width < 640
  // Treat short landscape viewports as mobile game layout (phones + small tablets in landscape).
  const isLandscapeMobile = isLandscape && dimensions.height <= 560 && dimensions.width <= 1280
  const isPortraitMobile = !isLandscape && dimensions.width < 768

  return {
    ...dimensions,
    isLandscape,
    isMobile,
    isLandscapeMobile,
    isPortraitMobile,
  }
}
