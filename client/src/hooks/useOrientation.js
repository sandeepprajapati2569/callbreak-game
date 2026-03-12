import { useEffect, useMemo, useState } from 'react'

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

    const orientation = typeof screen !== 'undefined' ? screen.orientation : null
    if (orientation) {
      orientation.addEventListener('change', handleOrientationChange)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientationChange)
      if (orientation) {
        orientation.removeEventListener('change', handleOrientationChange)
      }
    }
  }, [])

  const isLandscape = dimensions.width > dimensions.height
  const layoutTier = useMemo(() => {
    if (isLandscape && dimensions.height <= 430) {
      return 'compactLandscape'
    }

    if (!isLandscape && dimensions.width <= 390) {
      return 'compactPortrait'
    }

    if (
      dimensions.width >= 1180
      || (!isLandscape && dimensions.width >= 900)
      || (isLandscape && dimensions.width >= 1024 && dimensions.height >= 720)
    ) {
      return 'wide'
    }

    return 'medium'
  }, [dimensions.height, dimensions.width, isLandscape])

  const isCompactPortrait = layoutTier === 'compactPortrait'
  const isCompactLandscape = layoutTier === 'compactLandscape'
  const isCompactLayout = isCompactPortrait || isCompactLandscape
  const isMobile = dimensions.width < 640 || isCompactLayout
  // Preserve the legacy behavior for views that still need a tighter landscape layout.
  const isLandscapeMobile = isCompactLandscape || (isLandscape && dimensions.height <= 560 && dimensions.width <= 1280)
  const isPortraitMobile = isCompactPortrait || (!isLandscape && dimensions.width < 768)
  const stationDensity = isCompactLandscape
    ? 'compact'
    : layoutTier === 'wide'
      ? 'expanded'
      : 'standard'

  return {
    ...dimensions,
    isLandscape,
    isMobile,
    isLandscapeMobile,
    isPortraitMobile,
    layoutTier,
    isCompactPortrait,
    isCompactLandscape,
    isCompactLayout,
    isMediumLayout: layoutTier === 'medium',
    isWideLayout: layoutTier === 'wide',
    stationDensity,
  }
}
