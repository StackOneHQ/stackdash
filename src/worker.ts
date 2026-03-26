import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { health } from './api/health';
import { createIssuesRoutes } from './api/issues-kv';
import { createTodosRoutes } from './api/todos-kv';
import { createUsersRoutes } from './api/users-kv';
import { createGenerationRoutes } from './api/generation-kv';
import { createMeetingsRoutes, setMeetingsEnv } from './api/meetings-kv';
import { createWebhookHandler } from './pylon/handler-kv';
import { setMCPEnv } from './mcp/client';
import { setD1Database } from './store/d1-issues';
import { setUsersD1Database } from './store/d1-users';
import { setAgentEnv } from './agent';
import { setVerifyEnv } from './pylon/verify';
import { setAuthEnv } from './auth/google';
import { createAuthRoutes } from './auth/routes';
import { authMiddleware } from './auth/middleware';

type Bindings = {
  ANTHROPIC_API_KEY: string;
  STACKONE_API_KEY: string;
  STACKONE_ACCOUNT_ID: string;
  STACKONE_FIREFLIES_ACCOUNT_ID?: string;
  PYLON_WEBHOOK_SECRET?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_REDIRECT_URI: string;
  COOKIE_SECRET: string;
  DB: D1Database;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
};

const app = new Hono<{ Bindings: Bindings }>();

// Set env and D1 for each request
app.use('*', async (c, next) => {
  setMCPEnv(c.env);
  setD1Database(c.env.DB);
  setUsersD1Database(c.env.DB);
  setAgentEnv(c.env);
  setVerifyEnv(c.env);
  setMeetingsEnv(c.env);
  // Only set auth env if all required vars are present
  if (c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET && c.env.AUTH_REDIRECT_URI && c.env.COOKIE_SECRET) {
    setAuthEnv({
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
      AUTH_REDIRECT_URI: c.env.AUTH_REDIRECT_URI,
      COOKIE_SECRET: c.env.COOKIE_SECRET,
    });
  }
  await next();
});

// Auth routes (public)
app.route('/auth', createAuthRoutes());

// Google OAuth protection (skip health check, webhook, and auth routes)
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;

  // Skip auth for health check, webhook, and auth routes
  if (path === '/health' || path === '/api/pylon/webhook' || path.startsWith('/auth')) {
    return next();
  }

  // Apply Google OAuth middleware
  return authMiddleware(c, next);
});

// Middleware
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.route('/health', health);

// API routes (KV-backed)
app.route('/api/issues', createIssuesRoutes());
app.route('/api/todos', createTodosRoutes());
app.route('/api/users', createUsersRoutes());
app.route('/api/generate', createGenerationRoutes());
app.route('/api/meetings', createMeetingsRoutes());

// Pylon webhook (KV-backed)
app.post('/api/pylon/webhook', createWebhookHandler());



// Fallback to index.html for SPA routing (non-API routes)
app.get('*', async (c) => {
  const assets = c.env.ASSETS;
  if (assets) {
    // Try to serve the requested file, fallback to index.html
    const url = new URL(c.req.url);
    let response = await assets.fetch(new Request(url.origin + url.pathname));
    if (response.status === 404) {
      response = await assets.fetch(new Request(url.origin + '/index.html'));
    }
    return response;
  }
  return c.text('Not found', 404);
});

export default app;
