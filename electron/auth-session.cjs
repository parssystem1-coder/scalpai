/**
 * auth-session.cjs — نشست احراز هویت در main process
 * -----------------------------------------------------------------------
 * به‌جای فلگ سادهٔ loggedIn در localStorage، پس از تأیید پسورد یک توکن
 * تصادفی صادر می‌شود که فقط در حافظهٔ main معتبر است. با بستن اپ،
 * نشست‌ها از بین می‌روند و ورود مجدد لازم است.
 */

const crypto = require('crypto');

/** @type {Map<string, { username: string, createdAt: number }>} */
const sessions = new Map();

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // ۱۲ ساعت

function createSession(username) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { username, createdAt: Date.now() });
  return token;
}

function validateSession(token) {
  if (!token || typeof token !== 'string') return { valid: false };
  const session = sessions.get(token);
  if (!session) return { valid: false };
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return { valid: false };
  }
  return { valid: true, username: session.username };
}

function destroySession(token) {
  if (token) sessions.delete(token);
  return { success: true };
}

function updateSessionUsername(token, username) {
  const session = sessions.get(token);
  if (!session) return false;
  session.username = username;
  return true;
}

module.exports = {
  createSession,
  validateSession,
  destroySession,
  updateSessionUsername,
};
