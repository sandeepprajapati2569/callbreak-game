import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { StatusBar, Style } from '@capacitor/status-bar'
import { AuthProvider } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import { GameProvider } from './context/GameContext'
import { VoiceChatProvider } from './context/VoiceChatContext'
import OfflineBanner from './components/OfflineBanner'
import LandingPage from './pages/LandingPage'
import LobbyPage from './pages/LobbyPage'
import GamePage from './pages/GamePage'
import DonkeyGamePage from './pages/DonkeyGamePage'

function App() {
  useEffect(() => {
    const isNativePlatform = Boolean(window?.Capacitor?.isNativePlatform?.())
    if (!isNativePlatform) {
      document.documentElement.style.setProperty('--native-status-bar-offset', '0px')
      return
    }

    const updateNativeStatusBarOffset = () => {
      const isLandscape = window.innerWidth > window.innerHeight
      document.documentElement.style.setProperty(
        '--native-status-bar-offset',
        isLandscape ? '2px' : '4px'
      )
    }

    const setupStatusBar = async () => {
      try {
        // Keep status bar visible and outside WebView content.
        await StatusBar.setOverlaysWebView({ overlay: false })
        await StatusBar.setStyle({ style: Style.Light })
        await StatusBar.setBackgroundColor({ color: '#0A3622' })
        await StatusBar.show()
        const themeMeta = document.querySelector('meta[name="theme-color"]')
        if (themeMeta) themeMeta.setAttribute('content', '#0A3622')
        updateNativeStatusBarOffset()
        window.addEventListener('resize', updateNativeStatusBarOffset)
        window.addEventListener('orientationchange', updateNativeStatusBarOffset)
      } catch (error) {
        console.error('Status bar setup failed:', error)
      }
    }

    setupStatusBar()

    return () => {
      window.removeEventListener('resize', updateNativeStatusBarOffset)
      window.removeEventListener('orientationchange', updateNativeStatusBarOffset)
    }
  }, [])

  return (
    <AuthProvider>
      <OfflineBanner />
      <BrowserRouter>
        <SocketProvider>
          <GameProvider>
            <VoiceChatProvider>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/lobby" element={<LobbyPage />} />
                <Route path="/game" element={<GamePage />} />
                <Route path="/donkey-game" element={<DonkeyGamePage />} />
              </Routes>
            </VoiceChatProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#0A3622',
                color: '#f0f0f0',
                border: '1px solid rgba(212, 175, 55, 0.3)',
              },
              success: {
                iconTheme: {
                  primary: '#D4AF37',
                  secondary: '#0A3622',
                },
              },
              error: {
                iconTheme: {
                  primary: '#DC2626',
                  secondary: '#0A3622',
                },
              },
            }}
          />
        </GameProvider>
      </SocketProvider>
    </BrowserRouter>
    </AuthProvider>
  )
}

export default App
