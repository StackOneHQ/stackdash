import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { generateState, generateCodeVerifier, OAuth2Tokens } from 'arctic';
import { getGoogleClient, ALLOWED_DOMAIN } from './google';
import { createSession, clearSession } from './session';

const STATE_COOKIE_NAME = 'oauth_state';
const CODE_VERIFIER_COOKIE_NAME = 'oauth_code_verifier';
const REDIRECT_COOKIE_NAME = 'oauth_redirect';

type GoogleUserInfo = {
  email: string;
  name: string;
  verified_email: boolean;
};

const errorMessages: Record<string, string> = {
  unauthorized_domain: `Access restricted to @${ALLOWED_DOMAIN} accounts`,
  access_denied: 'Google sign-in was cancelled',
  invalid_state: 'Session expired. Please try again.',
  token_error: 'Authentication failed. Please try again.',
};

function loginPage(error?: string): string {
  const errorHtml = error
    ? `<p style="color: #dc2626; margin-bottom: 16px;">${errorMessages[error] || 'An error occurred'}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - StackDash</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 32px;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #94a3b8;
      margin-bottom: 32px;
    }
    .login-btn {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: #fff;
      color: #1f2937;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      transition: background 0.2s;
    }
    .login-btn:hover {
      background: #f1f5f9;
    }
    .login-btn svg {
      width: 20px;
      height: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>StackDash</h1>
    <p class="subtitle">Sign in with your StackOne account</p>
    ${errorHtml}
    <a href="/auth/start" class="login-btn">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </a>
  </div>
</body>
</html>`;
}

export function createAuthRoutes(): Hono {
  const auth = new Hono();

  // Login page - shows login button or redirects to Google
  auth.get('/login', async (c) => {
    const error = c.req.query('error');

    // If there's an error or no action, show the login page
    if (error || !c.req.query('action')) {
      return c.html(loginPage(error || undefined));
    }

    // Generate state, code verifier, and redirect to Google
    const google = getGoogleClient();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const scopes = ['openid', 'email', 'profile'];
    const url = google.createAuthorizationURL(state, codeVerifier, scopes);

    const isSecure = new URL(c.req.url).protocol === 'https:';

    // Store state in cookie
    setCookie(c, STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax',
      maxAge: 60 * 5, // 5 minutes
      path: '/',
    });

    // Store code verifier in cookie
    setCookie(c, CODE_VERIFIER_COOKIE_NAME, codeVerifier, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax',
      maxAge: 60 * 5,
      path: '/',
    });

    // Store redirect URL if provided
    const redirect = c.req.query('redirect');
    if (redirect) {
      setCookie(c, REDIRECT_COOKIE_NAME, redirect, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'Lax',
        maxAge: 60 * 5,
        path: '/',
      });
    }

    return c.redirect(url.toString());
  });

  // Start OAuth flow (from login button click)
  auth.get('/start', async (c) => {
    const google = getGoogleClient();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const scopes = ['openid', 'email', 'profile'];
    const url = google.createAuthorizationURL(state, codeVerifier, scopes);

    const isSecure = new URL(c.req.url).protocol === 'https:';

    // Store state in cookie
    setCookie(c, STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax',
      maxAge: 60 * 5,
      path: '/',
    });

    // Store code verifier in cookie
    setCookie(c, CODE_VERIFIER_COOKIE_NAME, codeVerifier, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax',
      maxAge: 60 * 5,
      path: '/',
    });

    // Store redirect URL if provided
    const redirect = c.req.query('redirect');
    if (redirect) {
      setCookie(c, REDIRECT_COOKIE_NAME, redirect, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'Lax',
        maxAge: 60 * 5,
        path: '/',
      });
    }

    return c.redirect(url.toString());
  });

  // OAuth callback
  auth.get('/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const storedState = getCookie(c, STATE_COOKIE_NAME);
    const storedCodeVerifier = getCookie(c, CODE_VERIFIER_COOKIE_NAME);

    // Clean up cookies
    deleteCookie(c, STATE_COOKIE_NAME, { path: '/' });
    deleteCookie(c, CODE_VERIFIER_COOKIE_NAME, { path: '/' });

    // Validate state
    if (!state || !storedState || state !== storedState) {
      return c.redirect('/auth/login?error=invalid_state');
    }

    // Validate code verifier exists
    if (!storedCodeVerifier) {
      return c.redirect('/auth/login?error=invalid_state');
    }

    // Check for error from Google
    const error = c.req.query('error');
    if (error) {
      return c.redirect('/auth/login?error=access_denied');
    }

    if (!code) {
      return c.redirect('/auth/login?error=token_error');
    }

    // Exchange code for tokens
    let tokens: OAuth2Tokens;
    try {
      const google = getGoogleClient();
      tokens = await google.validateAuthorizationCode(code, storedCodeVerifier);
    } catch {
      return c.redirect('/auth/login?error=token_error');
    }

    // Fetch user info
    let userInfo: GoogleUserInfo;
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.accessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      userInfo = await response.json() as GoogleUserInfo;
    } catch {
      return c.redirect('/auth/login?error=token_error');
    }

    // Validate email domain
    const emailDomain = userInfo.email.split('@')[1];
    if (emailDomain !== ALLOWED_DOMAIN) {
      return c.redirect('/auth/login?error=unauthorized_domain');
    }

    // Create session
    await createSession(c, userInfo.email, userInfo.name || userInfo.email);

    // Get redirect URL and clean up
    const redirectUrl = getCookie(c, REDIRECT_COOKIE_NAME) || '/';
    deleteCookie(c, REDIRECT_COOKIE_NAME, { path: '/' });

    return c.redirect(redirectUrl);
  });

  // Logout
  auth.get('/logout', (c) => {
    clearSession(c);
    return c.redirect('/auth/login');
  });

  return auth;
}
