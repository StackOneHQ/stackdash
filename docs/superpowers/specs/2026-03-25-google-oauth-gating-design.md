# Google OAuth Gating for Dashboard

## Summary

Replace basic auth with Google OAuth, restricting access to @stackone.com email domain only. Uses Arctic OAuth library for edge-compatible implementation on Cloudflare Workers.

## Requirements

- Google OAuth as sole authentication method
- Only @stackone.com emails allowed
- 24-hour session duration
- Remove existing basic auth

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Browser   │────▶│ Cloudflare Worker│────▶│ Google OAuth│
│             │◀────│   (Hono + Arctic)│◀────│   Server    │
└─────────────┘     └─────────────────┘     └─────────────┘
                            │
                    ┌───────┴───────┐
                    │ Signed Cookie │
                    │   (Session)   │
                    └───────────────┘
```

**Components:**
- **Arctic** - handles OAuth 2.0 flow with Google
- **Hono middleware** - protects routes, redirects unauthenticated users
- **Signed cookie** - stores session (email + expiry), signed with secret key
- **No database sessions** - stateless auth via cookie signature verification

**New files:**
- `src/auth/google.ts` - Arctic Google provider setup
- `src/auth/session.ts` - Cookie session management
- `src/auth/middleware.ts` - Auth middleware for route protection
- `src/auth/routes.ts` - `/auth/login`, `/auth/callback`, `/auth/logout`

## Authentication Flow

**Login (`/auth/login`):**
1. Generate random `state` parameter (CSRF protection)
2. Store `state` in short-lived cookie (5 min)
3. Redirect to Google OAuth consent screen

**Callback (`/auth/callback`):**
1. Validate `state` matches cookie (prevents CSRF)
2. Exchange authorization code for tokens via Arctic
3. Fetch user info from Google (email, name)
4. Reject if email domain ≠ @stackone.com
5. Create signed session cookie (24h expiry)
6. Redirect to dashboard (`/`)

**Logout (`/auth/logout`):**
1. Clear session cookie
2. Redirect to `/auth/login`

**Unauthenticated access:**
- Any protected route → redirect to `/auth/login`
- After login → redirect back to originally requested URL

## Session Management

**Session cookie structure:**
```typescript
{
  email: "user@stackone.com",
  name: "User Name",
  exp: 1711324800  // Unix timestamp (24h from login)
}
```

**Cookie configuration:**
- **Name:** `session`
- **Signed:** Yes, using `COOKIE_SECRET` env var (HMAC-SHA256)
- **HttpOnly:** Yes (not accessible via JavaScript)
- **Secure:** Yes (HTTPS only in production)
- **SameSite:** Lax (allows redirects from Google)
- **Max-Age:** 86400 (24 hours)

## Route Protection

**Protected routes (require auth):**
- `/` - Dashboard
- `/api/*` - All API endpoints (except webhook)

**Public routes (no auth):**
- `/auth/login` - Login page/redirect
- `/auth/callback` - OAuth callback
- `/auth/logout` - Logout
- `/health` - Health check
- `/api/pylon/webhook` - Pylon webhook (has its own HMAC verification)

## Error Handling

**OAuth errors (callback failures):**
- Invalid state → redirect to `/auth/login?error=invalid_state`
- Google denies access → redirect to `/auth/login?error=access_denied`
- Token exchange fails → redirect to `/auth/login?error=token_error`

**Domain rejection:**
- Non-@stackone.com email → redirect to `/auth/login?error=unauthorized_domain`

**Error messages:**
| Error | Message |
|-------|---------|
| `unauthorized_domain` | "Access restricted to @stackone.com accounts" |
| `access_denied` | "Google sign-in was cancelled" |
| `invalid_state` | "Session expired. Please try again." |
| `token_error` | "Authentication failed. Please try again." |

## Environment Configuration

**New environment variables:**

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `COOKIE_SECRET` | Random string for signing cookies (32+ chars) |
| `AUTH_REDIRECT_URI` | OAuth callback URL |

**Removed:**
- `DASHBOARD_PASSWORD` - no longer needed

**Google Cloud Console setup required:**
1. Create OAuth 2.0 credentials (Web application)
2. Add authorized redirect URI: `{domain}/auth/callback`
3. Enable Google People API (for user info)
