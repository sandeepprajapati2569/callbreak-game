import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import registerHandlers from './socket/handlers.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const ALLOWED_ORIGINS = CLIENT_ORIGIN.split(',').map(s => s.trim());

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------
const app = express();
const httpServer = createServer(app);

app.use(express.json());

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'Call Break',
    uptime: process.uptime(),
    rooms: rooms.size,
    games: games.size,
  });
});

// ---------------------------------------------------------------------------
// Socket.IO setup
// ---------------------------------------------------------------------------
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
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
// Start server
// ---------------------------------------------------------------------------
httpServer.listen(PORT, () => {
  console.log(`Call Break server running on port ${PORT}`);
  console.log(`Accepting connections from: ${CLIENT_ORIGIN}`);
});

export { app, httpServer, io };
