import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import registerHandlers from './socket/handlers.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const CARDTRAP_ORIGINS = ['https://cardtrap.com', 'https://www.cardtrap.com'];

// Build allowed origins list — always include localhost for dev
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  ...CARDTRAP_ORIGINS,
  ...CLIENT_ORIGIN.split(',').map(s => s.trim()).filter(Boolean),
];

// CORS config shared by Express and Socket.IO
const corsConfig = {
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, mobile apps, etc.)
    if (!origin) return callback(null, true);
    // Allow any vercel.app or onrender.com subdomain, plus explicit origins
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, origin);
    }
    callback(null, false);
  },
  methods: ['GET', 'POST'],
  credentials: true,
};

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------
const app = express();
const httpServer = createServer(app);

app.use(cors(corsConfig));
app.use(express.json());

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'Card Trap',
    uptime: process.uptime(),
    rooms: rooms.size,
    games: games.size,
  });
});

// ---------------------------------------------------------------------------
// Socket.IO setup
// ---------------------------------------------------------------------------
const io = new Server(httpServer, {
  cors: corsConfig,
});

// Shared state
const rooms = new Map();
const games = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  registerHandlers(io, socket, rooms, games);

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Start server (only in non-Vercel environments)
// ---------------------------------------------------------------------------
if (!process.env.VERCEL) {
  httpServer.listen(PORT, () => {
    console.log(`Card Trap server running on port ${PORT}`);
    console.log(`Accepting connections from: ${CLIENT_ORIGIN}`);
  });
}

export default app;
export { app, httpServer, io };
