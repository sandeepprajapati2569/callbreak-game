const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'callgroup-77248'
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`
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
    email: getStringField(fields, 'email') || null,
    emailLower: getStringField(fields, 'emailLower') || null,
    photoURL: getStringField(fields, 'photoURL') || null,
    isGuest: getBoolField(fields, 'isGuest'),
  }
}

async function fetchFirestoreRest(path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${FIRESTORE_REST_BASE}${path}`, {
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
  })

  if (!Array.isArray(rows)) return null
  const row = rows.find((entry) => entry?.document?.name)
  return parseRestUserDocument(row?.document)
}

async function findUserByLookup(token, lookup) {
  const normalized = normalizeLookup(lookup)
  if (!normalized) return null

  if (lookup.includes('@')) {
    const emailMatch = await runUserQueryByField(token, 'emailLower', normalized)
    if (emailMatch) return emailMatch

    const exactEmailMatch = await runUserQueryByField(token, 'email', lookup)
    if (exactEmailMatch) return exactEmailMatch

    if (lookup !== normalized) {
      const normalizedEmailMatch = await runUserQueryByField(token, 'email', normalized)
      if (normalizedEmailMatch) return normalizedEmailMatch
    }
  }

  const directDoc = await fetchFirestoreRest(`/users/${encodeURIComponent(lookup)}`, token)
  const directMatch = parseRestUserDocument(directDoc)
  if (directMatch) return directMatch

  return runUserQueryByField(token, 'displayNameLower', normalized)
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
    const user = await findUserByLookup(token, lookup)
    return res.status(200).json({ success: true, user })
  } catch (error) {
    const status = Number(error?.status) || 500
    return res.status(status).json({
      success: false,
      error: error?.message || 'Failed to search user',
    })
  }
}
