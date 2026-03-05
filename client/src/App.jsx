import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { SocketProvider } from './context/SocketContext'
import { GameProvider } from './context/GameContext'
import { VoiceChatProvider } from './context/VoiceChatContext'
import LandingPage from './pages/LandingPage'
import LobbyPage from './pages/LobbyPage'
import GamePage from './pages/GamePage'

function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <GameProvider>
          <VoiceChatProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/lobby" element={<LobbyPage />} />
              <Route path="/game" element={<GamePage />} />
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
  )
}

export default App
