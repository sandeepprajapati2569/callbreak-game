import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import registerHandlers from './socket/handlers.js';
import { verifyFirebaseIdToken } from './services/firebasePartyStore.js';
import {
  acceptFriendRequest,
  acceptGameInvite,
  buildSocialContext,
  cancelFriendRequest,
  cancelGameInvite,
  claimUsername,
  declineFriendRequest,
  declineGameInvite,
  findUserByLookup as findSocialUserByLookup,
  getSocialState,
  markUserOffline,
  removeFriend,
  sendFriendRequest,
  sendGameInvite,
  setSocialEdge,
} from './services/firebaseSocialStore.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const DEFAULT_FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'callgroup-77248';
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

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24);
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function resolveFirestoreProjectId(token) {
  const payload = decodeJwtPayload(token);
  const fromAud = typeof payload?.aud === 'string' ? payload.aud.trim() : '';
  if (fromAud) return fromAud;

  const issuer = String(payload?.iss || '');
  const issuerMatch = issuer.match(/securetoken\.google\.com\/([^/]+)$/);
  if (issuerMatch?.[1]) return issuerMatch[1];

  return DEFAULT_FIREBASE_PROJECT_ID;
}

function firestoreRestBase(projectId) {
  const resolved = String(projectId || '').trim();
  if (!resolved) {
    throw new Error('Missing Firebase project configuration.');
  }
  return `https://firestore.googleapis.com/v1/projects/${resolved}/databases/(default)/documents`;
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
    username: getStringField(fields, 'username') || null,
    usernameLower: getStringField(fields, 'usernameLower') || null,
    claimedUsername: getStringField(fields, 'claimedUsername') || null,
    claimedUsernameLower: getStringField(fields, 'claimedUsernameLower') || null,
    email: getStringField(fields, 'email') || null,
    emailLower: getStringField(fields, 'emailLower') || null,
    photoURL: getStringField(fields, 'photoURL') || null,
    isGuest: getBoolField(fields, 'isGuest'),
  };
}

async function fetchFirestoreRest(path, token, projectId, options = {}) {
  const response = await fetch(`${firestoreRestBase(projectId)}${path}`, {
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

async function runUserQueryByField(token, projectId, fieldPath, value) {
  const rows = await fetchFirestoreRest(':runQuery', token, projectId, {
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

async function findUserByLookup(token, projectId, lookup) {
  const normalized = normalizeLookup(lookup);
  const normalizedUsername = normalizeUsername(lookup);
  if (!normalized) return null;

  if (normalizedUsername) {
    const usernameMatch = await runUserQueryByField(token, projectId, 'claimedUsernameLower', normalizedUsername);
    if (usernameMatch) return usernameMatch;
  }

  if (lookup.includes('@')) {
    const emailMatch = await runUserQueryByField(token, projectId, 'emailLower', normalized);
    if (emailMatch) return emailMatch;

    const exactEmailMatch = await runUserQueryByField(token, projectId, 'email', lookup);
    if (exactEmailMatch) return exactEmailMatch;

    if (lookup !== normalized) {
      const normalizedEmailMatch = await runUserQueryByField(token, projectId, 'email', normalized);
      if (normalizedEmailMatch) return normalizedEmailMatch;
    }
  }

  const directDoc = await fetchFirestoreRest(`/users/${encodeURIComponent(lookup)}`, token, projectId);
  const directMatch = parseRestUserDocument(directDoc);
  if (directMatch) return directMatch;

  return runUserQueryByField(token, projectId, 'displayNameLower', normalized);
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
async function getVerifiedSocialContext(req) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    const error = new Error('Missing auth token');
    error.status = 401;
    throw error;
  }

  const verified = await verifyFirebaseIdToken(token);
  return buildSocialContext({
    uid: verified.uid,
    projectId: verified.projectId,
    idToken: token,
  });
}

function handleSocialRoute(handler) {
  return async (req, res) => {
    try {
      const socialContext = await getVerifiedSocialContext(req);
      const payload = req.body || {};
      const result = await handler(socialContext, payload, req, res);
      return res.json({
        success: true,
        ...(result || {}),
      });
    } catch (error) {
      const status = Number(error?.status) || 500;
      console.error('[social-api] request failed:', error?.message || error);
      return res.status(status).json({
        success: false,
        error: error?.message || 'Social request failed',
      });
    }
  };
}

app.post('/api/social/find-user', handleSocialRoute(async (ctx, payload) => {
  const lookup = String(payload?.lookup || '').trim();
  if (!lookup) {
    const error = new Error('Lookup is required');
    error.status = 400;
    throw error;
  }
  const user = await findSocialUserByLookup(ctx, lookup);
  return { user };
}));

app.post('/api/social/sync', handleSocialRoute(async (ctx, payload) => {
  const state = await getSocialState(ctx, payload || {});
  return { state };
}));

app.post('/api/social/presence/offline', handleSocialRoute(async (ctx) => {
  await markUserOffline(ctx);
  return {};
}));

app.post('/api/social/username/claim', handleSocialRoute(async (ctx, payload) => {
  const profile = await claimUsername(ctx, payload || {});
  return { profile };
}));

app.post('/api/social/friend-request/send', handleSocialRoute(async (ctx, payload) => {
  const result = await sendFriendRequest(ctx, payload || {});
  return { result };
}));

app.post('/api/social/friend-request/accept', handleSocialRoute(async (ctx, payload) => {
  const request = await acceptFriendRequest(ctx, payload || {});
  return { request };
}));

app.post('/api/social/friend-request/decline', handleSocialRoute(async (ctx, payload) => {
  const request = await declineFriendRequest(ctx, payload || {});
  return { request };
}));

app.post('/api/social/friend-request/cancel', handleSocialRoute(async (ctx, payload) => {
  const request = await cancelFriendRequest(ctx, payload || {});
  return { request };
}));

app.post('/api/social/friend/remove', handleSocialRoute(async (ctx, payload) => {
  const result = await removeFriend(ctx, payload || {});
  return { result };
}));

app.post('/api/social/game-invite/send', handleSocialRoute(async (ctx, payload) => {
  const invite = await sendGameInvite(ctx, payload || {});
  return { invite };
}));

app.post('/api/social/game-invite/accept', handleSocialRoute(async (ctx, payload) => {
  const invite = await acceptGameInvite(ctx, payload || {});
  return { invite };
}));

app.post('/api/social/game-invite/decline', handleSocialRoute(async (ctx, payload) => {
  const invite = await declineGameInvite(ctx, payload || {});
  return { invite };
}));

app.post('/api/social/game-invite/cancel', handleSocialRoute(async (ctx, payload) => {
  const invite = await cancelGameInvite(ctx, payload || {});
  return { invite };
}));

app.post('/api/social/edge', handleSocialRoute(async (ctx, payload) => {
  const edge = await setSocialEdge(ctx, payload || {});
  return { edge };
}));

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
