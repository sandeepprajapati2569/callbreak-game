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

  const isMobile = dimensions.width < 640
  const isLandscapeMobile = !isMobile && dimensions.width < 1024 && dimensions.height < 500
  const isPortraitMobile = dimensions.width < 768 && dimensions.height > dimensions.width

  return {
    ...dimensions,
    isMobile,
    isLandscapeMobile,
    isPortraitMobile,
  }
}
