const DEFAULT_FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'callgroup-77248'
const ALLOWED_ORIGINS = [
  'https://cardtrap.com',
  'https://www.cardtrap.com',
  'https://localhost',
  'https://127.0.0.1',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
]

function normalizeLookup(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24)
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length < 2) return null
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    const padded = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function resolveFirestoreProjectId(token) {
  const payload = decodeJwtPayload(token)
  const fromAud = typeof payload?.aud === 'string' ? payload.aud.trim() : ''
  if (fromAud) return fromAud

  const issuer = String(payload?.iss || '')
  const issuerMatch = issuer.match(/securetoken\.google\.com\/([^/]+)$/)
  if (issuerMatch?.[1]) return issuerMatch[1]

  return DEFAULT_FIREBASE_PROJECT_ID
}

function firestoreRestBase(projectId) {
  const resolved = String(projectId || '').trim()
  if (!resolved) {
    throw new Error('Missing Firebase project configuration.')
  }
  return `https://firestore.googleapis.com/v1/projects/${resolved}/databases/(default)/documents`
}

function parseBearerToken(authorizationHeader) {
  const raw = String(authorizationHeader || '')
  if (!raw.toLowerCase().startsWith('bearer ')) return null
  const token = raw.slice(7).trim()
  return token || null
}

function getStringField(fields, key) {
  return fields?.[key]?.stringValue ?? null
}

function getBoolField(fields, key) {
  return fields?.[key]?.booleanValue ?? false
}

function parseRestUserDocument(document) {
  if (!document?.name) return null
  const uid = String(document.name).split('/').pop()
  if (!uid) return null
  const fields = document.fields || {}

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
  }
}

async function fetchFirestoreRest(path, token, projectId, { method = 'GET', body } = {}) {
  const response = await fetch(`${firestoreRestBase(projectId)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 404) return null

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Firestore REST error (${response.status})`)
    error.status = response.status
    throw error
  }

  return payload
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
  })

  if (!Array.isArray(rows)) return null
  const row = rows.find((entry) => entry?.document?.name)
  return parseRestUserDocument(row?.document)
}

async function findUserByLookup(token, projectId, lookup) {
  const normalized = normalizeLookup(lookup)
  const normalizedUsername = normalizeUsername(lookup)
  if (!normalized) return null

  if (normalizedUsername) {
    const usernameMatch = await runUserQueryByField(token, projectId, 'claimedUsernameLower', normalizedUsername)
    if (usernameMatch) return usernameMatch
  }

  if (lookup.includes('@')) {
    const emailMatch = await runUserQueryByField(token, projectId, 'emailLower', normalized)
    if (emailMatch) return emailMatch

    const exactEmailMatch = await runUserQueryByField(token, projectId, 'email', lookup)
    if (exactEmailMatch) return exactEmailMatch

    if (lookup !== normalized) {
      const normalizedEmailMatch = await runUserQueryByField(token, projectId, 'email', normalized)
      if (normalizedEmailMatch) return normalizedEmailMatch
    }
  }

  const directDoc = await fetchFirestoreRest(`/users/${encodeURIComponent(lookup)}`, token, projectId)
  const directMatch = parseRestUserDocument(directDoc)
  if (directMatch) return directMatch

  return runUserQueryByField(token, projectId, 'displayNameLower', normalized)
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || '')
  const allowOrigin = (
    ALLOWED_ORIGINS.includes(origin)
    || origin.endsWith('.vercel.app')
    || origin.endsWith('.onrender.com')
  )

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const lookup = String(req.body?.lookup || '').trim()
  const token = parseBearerToken(req.headers.authorization)

  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing auth token' })
  }
  if (!lookup) {
    return res.status(400).json({ success: false, error: 'Lookup is required' })
  }

  try {
    const projectId = resolveFirestoreProjectId(token)
    const user = await findUserByLookup(token, projectId, lookup)
    return res.status(200).json({ success: true, user })
  } catch (error) {
    const status = Number(error?.status) || 500
    return res.status(status).json({
      success: false,
      error: error?.message || 'Failed to search user',
    })
  }
}
