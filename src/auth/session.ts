import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getAuthEnv } from './google';

export type SessionData = {
  email: string;
  name: string;
  exp: number;
};

const SESSION_COOKIE_NAME = 'session';
const SESSION_DURATION_SECONDS = 24 * 60 * 60; // 24 hours

async function signData(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${data}.${signatureBase64}`;
}

async function verifyAndParseData(signedData: string, secret: string): Promise<string | null> {
  const lastDotIndex = signedData.lastIndexOf('.');
  if (lastDotIndex === -1) return null;

  const data = signedData.substring(0, lastDotIndex);
  const providedSignature = signedData.substring(lastDotIndex + 1);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expectedSignatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(expectedSignatureBuffer)));

  // Constant-time comparison
  if (providedSignature.length !== expectedSignature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < providedSignature.length; i++) {
    mismatch |= providedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  return data;
}

export async function createSession(c: Context, email: string, name: string): Promise<void> {
  const env = getAuthEnv();
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;

  const sessionData: SessionData = { email, name, exp };
  const dataString = JSON.stringify(sessionData);
  const signedData = await signData(dataString, env.COOKIE_SECRET);

  const isSecure = new URL(c.req.url).protocol === 'https:';

  setCookie(c, SESSION_COOKIE_NAME, signedData, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    maxAge: SESSION_DURATION_SECONDS,
    path: '/',
  });
}

export async function getSession(c: Context): Promise<SessionData | null> {
  const env = getAuthEnv();
  const signedData = getCookie(c, SESSION_COOKIE_NAME);

  if (!signedData) return null;

  const dataString = await verifyAndParseData(signedData, env.COOKIE_SECRET);
  if (!dataString) return null;

  try {
    const session: SessionData = JSON.parse(dataString);

    // Check expiry
    if (session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}
