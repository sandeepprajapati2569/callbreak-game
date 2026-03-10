import { createVerify } from 'crypto';

const DEFAULT_FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'callgroup-77248';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const FIRESTORE_API_BASE = 'https://firestore.googleapis.com/v1/projects';

const certCache = {
  expiresAt: 0,
  certs: null,
};

function now() {
  return Date.now();
}

function base64UrlToBuffer(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Buffer.from(padded, 'base64');
}

export function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlToBuffer(parts[1]).toString('utf8'));
  } catch {
    return null;
  }
}

function decodeJwtHeader(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlToBuffer(parts[0]).toString('utf8'));
  } catch {
    return null;
  }
}

export function resolveFirestoreProjectId(token) {
  const payload = decodeJwtPayload(token);
  const aud = typeof payload?.aud === 'string' ? payload.aud.trim() : '';
  if (aud) return aud;

  const issuer = String(payload?.iss || '');
  const issuerMatch = issuer.match(/securetoken\.google\.com\/([^/]+)$/);
  if (issuerMatch?.[1]) return issuerMatch[1];

  return DEFAULT_FIREBASE_PROJECT_ID;
}

function parseCacheMaxAge(headerValue) {
  const match = String(headerValue || '').match(/max-age=(\d+)/i);
  return match ? Number(match[1]) * 1000 : 60 * 60 * 1000;
}

async function getFirebaseCerts() {
  if (certCache.certs && certCache.expiresAt > now()) {
    return certCache.certs;
  }

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase certs (${response.status})`);
  }

  const certs = await response.json();
  const maxAgeMs = parseCacheMaxAge(response.headers.get('cache-control'));
  certCache.certs = certs;
  certCache.expiresAt = now() + maxAgeMs;
  return certs;
}

export async function verifyFirebaseIdToken(idToken) {
  const rawToken = String(idToken || '').trim();
  if (!rawToken) {
    throw new Error('Missing Firebase auth token');
  }

  const header = decodeJwtHeader(rawToken);
  const payload = decodeJwtPayload(rawToken);
  if (!header || !payload) {
    throw new Error('Malformed Firebase auth token');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase auth token');
  }

  const projectId = resolveFirestoreProjectId(rawToken);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowSeconds = Math.floor(now() / 1000);

  if (payload.aud !== projectId) {
    throw new Error('Firebase auth token has invalid audience');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Firebase auth token has invalid issuer');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Firebase auth token is missing subject');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    throw new Error('Firebase auth token has expired');
  }

  const certs = await getFirebaseCerts();
  const certificate = certs?.[header.kid];
  if (!certificate) {
    throw new Error('Firebase auth token certificate not found');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = rawToken.split('.');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const isValidSignature = verifier.verify(certificate, base64UrlToBuffer(encodedSignature));
  if (!isValidSignature) {
    throw new Error('Firebase auth token signature is invalid');
  }

  return {
    uid: payload.user_id || payload.sub,
    projectId,
    claims: payload,
    idToken: rawToken,
  };
}

function firestoreDocumentPath(projectId, collectionName, documentId) {
  return `${FIRESTORE_API_BASE}/${projectId}/databases/(default)/documents/${collectionName}/${documentId}`;
}

function objectToFirestoreFields(value) {
  const entries = Object.entries(value || {}).filter(([, fieldValue]) => fieldValue !== undefined);
  return Object.fromEntries(entries.map(([key, fieldValue]) => [key, toFirestoreValue(fieldValue)]));
}

function toFirestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => toFirestoreValue(entry)),
      },
    };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      if (Number.isInteger(value)) {
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    case 'object':
      return {
        mapValue: {
          fields: objectToFirestoreFields(value),
        },
      };
    default:
      return { stringValue: String(value) };
  }
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return new Date(value.timestampValue).getTime();
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return Array.isArray(value.arrayValue?.values)
      ? value.arrayValue.values.map((entry) => fromFirestoreValue(entry))
      : [];
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([key, entry]) => [key, fromFirestoreValue(entry)]));
  }
  return null;
}

function documentToObject(document) {
  if (!document?.name) return null;
  const id = String(document.name).split('/').pop();
  const fields = document.fields || {};
  const data = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
  return {
    id,
    ...data,
  };
}

async function fetchFirestore(projectId, idToken, urlOrPath, { method = 'GET', body } = {}) {
  const targetUrl = String(urlOrPath).startsWith('http')
    ? urlOrPath
    : `${FIRESTORE_API_BASE}/${projectId}/databases/(default)/documents${urlOrPath}`;

  const response = await fetch(targetUrl, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
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

export async function savePartySnapshot({ projectId, idToken, party }) {
  if (!projectId || !idToken || !party?.partyId) return null;
  const url = firestoreDocumentPath(projectId, 'parties', party.partyId);
  return fetchFirestore(projectId, idToken, url, {
    method: 'PATCH',
    body: {
      fields: objectToFirestoreFields({
        ...party,
        persistedAt: now(),
      }),
    },
  });
}

export async function savePartyInvite({ projectId, idToken, invite }) {
  if (!projectId || !idToken || !invite?.id) return null;
  const url = firestoreDocumentPath(projectId, 'partyInvites', invite.id);
  return fetchFirestore(projectId, idToken, url, {
    method: 'PATCH',
    body: {
      fields: objectToFirestoreFields({
        ...invite,
        persistedAt: now(),
      }),
    },
  });
}

async function runStructuredQuery({ projectId, idToken, structuredQuery }) {
  const response = await fetchFirestore(projectId, idToken, ':runQuery', {
    method: 'POST',
    body: { structuredQuery },
  });

  if (!Array.isArray(response)) return [];
  return response
    .map((row) => documentToObject(row?.document))
    .filter(Boolean);
}

export async function loadPersistedPartyForUid({ projectId, idToken, uid }) {
  if (!projectId || !idToken || !uid) return null;

  const rows = await runStructuredQuery({
    projectId,
    idToken,
    structuredQuery: {
      from: [{ collectionId: 'parties' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'memberUids' },
          op: 'ARRAY_CONTAINS',
          value: { stringValue: uid },
        },
      },
      limit: 5,
    },
  });

  const activeParties = rows
    .filter((party) => party.status && party.status !== 'disbanded')
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  return activeParties[0] || null;
}

export async function loadPendingPartyInvitesForUid({ projectId, idToken, uid }) {
  if (!projectId || !idToken || !uid) return [];

  const rows = await runStructuredQuery({
    projectId,
    idToken,
    structuredQuery: {
      from: [{ collectionId: 'partyInvites' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'toUid' },
          op: 'EQUAL',
          value: { stringValue: uid },
        },
      },
      limit: 20,
    },
  });

  return rows
    .filter((invite) => invite.status === 'pending' && Number(invite.expiresAt || 0) > now())
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export async function loadPartyInviteById({ projectId, idToken, inviteId }) {
  if (!projectId || !idToken || !inviteId) return null;
  const url = firestoreDocumentPath(projectId, 'partyInvites', inviteId);
  const response = await fetchFirestore(projectId, idToken, url);
  return documentToObject(response);
}
