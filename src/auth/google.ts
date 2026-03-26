import { Google } from 'arctic';

export type AuthEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_REDIRECT_URI: string;
  COOKIE_SECRET: string;
};

let googleClient: Google | null = null;
let authEnv: AuthEnv | null = null;

export function setAuthEnv(env: AuthEnv): void {
  authEnv = env;
  googleClient = new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.AUTH_REDIRECT_URI
  );
}

export function getGoogleClient(): Google {
  if (!googleClient) {
    throw new Error('Google OAuth client not initialized. Call setAuthEnv first.');
  }
  return googleClient;
}

export function getAuthEnv(): AuthEnv {
  if (!authEnv) {
    throw new Error('Auth env not initialized. Call setAuthEnv first.');
  }
  return authEnv;
}

export function isAuthConfigured(): boolean {
  return authEnv !== null;
}

export const ALLOWED_DOMAIN = 'stackone.com';
