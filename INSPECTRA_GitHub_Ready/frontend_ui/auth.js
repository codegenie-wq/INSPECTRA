/**
 * INSPECTRA Authentication Service
 * Vercel-Compatible Stateless Cryptographic Authentication
 * HMAC-SHA256 session tokens, Scrypt password hashing, and route protection.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TMP_USERS_FILE = path.join('/tmp', 'inspectra_users.json');

// Session secret for signing stateless tokens
const AUTH_SECRET = process.env.SESSION_SECRET || 'inspectra-vision-os-secret-key-2026';

// In-memory cache of users
let users = [];

// ------------------------------------------------------------
// CRYPTOGRAPHIC PASSWORD HASHING (Scrypt)
// ------------------------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, storedHash) {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (err) {
    return false;
  }
}

// ------------------------------------------------------------
// STATELESS HMAC-SHA256 SESSION TOKENS (Vercel-Compatible)
// ------------------------------------------------------------

/**
 * Creates a stateless, tamper-proof session token containing user claims.
 * Compatible with serverless environments since it requires zero server memory.
 */
export function createSessionToken(user) {
  const payload = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 3600) // 7 days expiration
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const token = `${encodedHeader}.${encodedPayload}.${signature}`;
  const expiresAt = Date.now() + (7 * 24 * 3600 * 1000);
  return { token, expiresAt };
}

/**
 * Validates a stateless session token's cryptographic signature and expiration.
 * Can be executed statelessly by any Vercel lambda container in 0ms.
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  try {
    const expectedSig = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSig.length) return null;
    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!isValid) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);

    if (!payload || !payload.exp || payload.exp < now) {
      return null;
    }

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      username: payload.username,
      role: payload.role
    };
  } catch (err) {
    return null;
  }
}

// Backwards-compatibility alias for createSession
export function createSession(userId) {
  const user = users.find(u => u.id === userId) || { id: userId, name: 'Operator', username: 'operator', role: 'AI Inspection Operator' };
  return createSessionToken(user);
}

// Backwards-compatibility alias for getSessionUser
export function getSessionUser(token) {
  return verifySessionToken(token);
}

// Backwards-compatibility alias for destroySession
export function destroySession(token) {
  // Stateless tokens are invalidated on client by dropping cookie and localStorage
  return true;
}

// ------------------------------------------------------------
// PERSISTENCE HELPERS (With Serverless Fallbacks)
// ------------------------------------------------------------
function saveUsers() {
  let saved = false;
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    saved = true;
  } catch (_) {}

  // Fallback to /tmp on serverless environments if app directory is read-only
  if (!saved) {
    try {
      fs.writeFileSync(TMP_USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    } catch (_) {}
  }
}

// ------------------------------------------------------------
// INITIALIZATION & PRE-SEEDED OPERATORS
// ------------------------------------------------------------
function getSeededUsers() {
  const { salt: salt1, hash: hash1 } = hashPassword('Password123!');
  const defaultUser = {
    id: 'OP-2026-001',
    name: 'Santhosh',
    email: 'santhosh@inspectra.ai',
    username: 'santhosh',
    password_hash: hash1,
    salt: salt1,
    role: 'AI Inspection Operator',
    created_at: '2026-01-01T00:00:00.000Z'
  };

  const { salt: salt2, hash: hash2 } = hashPassword('Password123!');
  const operator1 = {
    id: 'OP-2026-002',
    name: 'Lead Operator',
    email: 'operator1@inspectra.ai',
    username: 'operator1',
    password_hash: hash2,
    salt: salt2,
    role: 'AI Inspection Operator',
    created_at: '2026-01-01T00:00:00.000Z'
  };

  return [defaultUser, operator1];
}

export function initAuth() {
  users = [];

  // Try loading from USERS_FILE
  if (fs.existsSync(USERS_FILE)) {
    try {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      users = JSON.parse(data) || [];
    } catch (_) {}
  }

  // Try loading from /tmp on serverless
  if (users.length === 0 && fs.existsSync(TMP_USERS_FILE)) {
    try {
      const data = fs.readFileSync(TMP_USERS_FILE, 'utf-8');
      users = JSON.parse(data) || [];
    } catch (_) {}
  }

  // Guarantee seeded default operators are ALWAYS present
  const seeded = getSeededUsers();
  for (const s of seeded) {
    if (!users.some(u => u.username.toLowerCase() === s.username.toLowerCase())) {
      users.push(s);
    }
  }

  saveUsers();
  console.log(`[INSPECTRA Auth] Initialized with ${users.length} registered operators (Stateless HMAC-SHA256 active).`);
}

// Ensure auth is initialized on module load
initAuth();

// ------------------------------------------------------------
// USER OPERATIONS
// ------------------------------------------------------------
export function findUserByUsernameOrEmail(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  // Ensure seeded users are checked if users array was somehow emptied
  if (users.length === 0) initAuth();
  return users.find(u => u.username.toLowerCase() === clean || u.email.toLowerCase() === clean) || null;
}

export function registerUser({ fullName, email, username, password, role = 'AI Inspection Operator' }) {
  if (!fullName || !email || !username || !password) {
    return { error: 'MISSING_FIELDS', message: 'All fields are required.' };
  }

  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail = String(email).trim().toLowerCase();

  if (cleanUsername.length < 3) {
    return { error: 'INVALID_USERNAME', message: 'Username must be at least 3 characters long.' };
  }

  if (password.length < 6) {
    return { error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters long.' };
  }

  if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return { error: 'USERNAME_EXISTS', message: 'USERNAME ALREADY EXISTS' };
  }

  if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
    return { error: 'EMAIL_EXISTS', message: 'EMAIL ALREADY REGISTERED' };
  }

  const { salt, hash } = hashPassword(password);
  const newUser = {
    id: `OP-${Date.now()}`,
    name: fullName.trim(),
    email: cleanEmail,
    username: cleanUsername,
    password_hash: hash,
    salt: salt,
    role: role,
    created_at: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers();

  return {
    success: true,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role
    }
  };
}

export function authenticateUser(identifier, password) {
  const user = findUserByUsernameOrEmail(identifier);
  if (!user) return null;

  const valid = verifyPassword(password, user.salt, user.password_hash);
  if (!valid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role
  };
}

// ------------------------------------------------------------
// COOKIE & TOKEN PARSER HELPERS
// ------------------------------------------------------------
export function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    try {
      list[name] = decodeURIComponent(value);
    } catch {
      list[name] = value;
    }
  });

  return list;
}

export function getTokenFromRequest(req) {
  // 1. Check cookies
  const cookies = parseCookies(req);
  if (cookies.inspectra_session) return cookies.inspectra_session;

  // 2. Check Authorization header (Bearer <token>)
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 3. Check query param for fallback / deep-linking
  if (req.query?.token) {
    return String(req.query.token).trim();
  }

  return null;
}

// ------------------------------------------------------------
// EXPRESS ROUTE PROTECTION MIDDLEWARE
// ------------------------------------------------------------
export function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  const user = verifySessionToken(token);

  if (!user) {
    if (req.accepts('html')) {
      const returnUrl = encodeURIComponent(req.originalUrl || req.url || '/');
      return res.redirect(`/login?returnUrl=${returnUrl}`);
    }
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'SESSION EXPIRED. PLEASE LOGIN AGAIN.'
    });
  }

  req.user = user;
  next();
}
