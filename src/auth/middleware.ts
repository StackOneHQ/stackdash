import type { Context, Next } from 'hono';
import { getSession, type SessionData } from './session';
import { isAuthConfigured } from './google';

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionData;
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Check if auth is configured
  if (!isAuthConfigured()) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Auth Not Configured</title></head>
      <body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: #e2e8f0;">
        <h1>Authentication Not Configured</h1>
        <p>Google OAuth is not configured. Please set the following secrets:</p>
        <ul>
          <li>GOOGLE_CLIENT_ID</li>
          <li>GOOGLE_CLIENT_SECRET</li>
          <li>AUTH_REDIRECT_URI</li>
          <li>COOKIE_SECRET</li>
        </ul>
        <p>Run: <code>npx wrangler secret put SECRET_NAME</code> for each.</p>
      </body>
      </html>
    `, 500);
  }

  const session = await getSession(c);

  if (!session) {
    const currentUrl = new URL(c.req.url);
    const redirectParam = encodeURIComponent(currentUrl.pathname + currentUrl.search);
    return c.redirect(`/auth/login?redirect=${redirectParam}`);
  }

  c.set('user', session);
  await next();
}
