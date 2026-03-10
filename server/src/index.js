import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import registerHandlers from './socket/handlers.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'callgroup-77248';
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const CARDTRAP_ORIGINS = ['https://cardtrap.com', 'https://www.cardtrap.com'];

// Build allowed origins list — always include localhost for dev
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost',
  'https://localhost',
  'https://127.0.0.1',
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

function normalizeLookup(value) {
  return String(value || '').trim().toLowerCase();
}

function parseBearerToken(authorizationHeader) {
  const raw = String(authorizationHeader || '');
  if (!raw.toLowerCase().startsWith('bearer ')) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

function getStringField(fields, key) {
  return fields?.[key]?.stringValue ?? null;
}

function getBoolField(fields, key) {
  return fields?.[key]?.booleanValue ?? false;
}

function parseRestUserDocument(document) {
  if (!document?.name) return null;
  const uid = String(document.name).split('/').pop();
  if (!uid) return null;

  const fields = document.fields || {};
  return {
    uid,
    displayName: getStringField(fields, 'displayName') || 'Player',
    displayNameLower: getStringField(fields, 'displayNameLower') || null,
    email: getStringField(fields, 'email') || null,
    emailLower: getStringField(fields, 'emailLower') || null,
    photoURL: getStringField(fields, 'photoURL') || null,
    isGuest: getBoolField(fields, 'isGuest'),
  };
}

async function fetchFirestoreRest(path, token, options = {}) {
  const response = await fetch(`${FIRESTORE_REST_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 404) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Firestore REST error (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function runUserQueryByField(token, fieldPath, value) {
  const rows = await fetchFirestoreRest(':runQuery', token, {
    method: 'POST',
    body: {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue: value },
          },
        },
        limit: 1,
      },
    },
  });

  if (!Array.isArray(rows)) return null;
  const row = rows.find((entry) => entry?.document?.name);
  return parseRestUserDocument(row?.document);
}

async function findUserByLookup(token, lookup) {
  const normalized = normalizeLookup(lookup);
  if (!normalized) return null;

  if (lookup.includes('@')) {
    const emailMatch = await runUserQueryByField(token, 'emailLower', normalized);
    if (emailMatch) return emailMatch;

    const exactEmailMatch = await runUserQueryByField(token, 'email', lookup);
    if (exactEmailMatch) return exactEmailMatch;

    if (lookup !== normalized) {
      const normalizedEmailMatch = await runUserQueryByField(token, 'email', normalized);
      if (normalizedEmailMatch) return normalizedEmailMatch;
    }
  }

  const directDoc = await fetchFirestoreRest(`/users/${encodeURIComponent(lookup)}`, token);
  const directMatch = parseRestUserDocument(directDoc);
  if (directMatch) return directMatch;

  return runUserQueryByField(token, 'displayNameLower', normalized);
}

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

// Social lookup fallback endpoint. Uses caller's Firebase ID token and
// Firestore REST API so search still works if browser/WebView SDK transport
// is unstable.
app.post('/api/social/find-user', async (req, res) => {
  const lookup = String(req.body?.lookup || '').trim();
  const token = parseBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing auth token' });
  }
  if (!lookup) {
    return res.status(400).json({ success: false, error: 'Lookup is required' });
  }

  try {
    const user = await findUserByLookup(token, lookup);
    return res.json({ success: true, user });
  } catch (error) {
    console.error('[social/find-user] lookup failed:', error?.message || error);
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      success: false,
      error: error?.message || 'Failed to search user',
    });
  }
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
