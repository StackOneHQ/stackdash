import { Hono } from 'hono';
import { d1UserStore } from '../store/d1-users';

export function createUsersRoutes() {
  const users = new Hono();

  // GET /api/users - Fetch SE team members only (plus Pylon AI agent)
  users.get('/', async (c) => {
    // Check if we need to refresh the cache
    const hasUsers = await d1UserStore.hasUsers();
    const isStale = await d1UserStore.isCacheStale();

    if (!hasUsers || isStale) {
      const result = await d1UserStore.fetchAndStoreUsers();
      if (result.error) {
        console.error('[/api/users] Failed to fetch users:', result.error);
      }
    }

    const allUsers = await d1UserStore.getAllUsers();
    return c.json({ users: allUsers });
  });

  // GET /api/users/debug - Debug endpoint to check MCP response (must be before /:id)
  users.get('/debug', async (c) => {
    const hasUsers = await d1UserStore.hasUsers();
    const isStale = await d1UserStore.isCacheStale();
    const currentUsers = await d1UserStore.getAllUsers();
    const result = await d1UserStore.fetchAndStoreUsers();

    return c.json({
      cacheStatus: {
        hasUsers,
        isStale,
        currentUserCount: currentUsers.length,
      },
      fetchResult: {
        userCount: result.users.length,
        users: result.users,
        error: result.error || null,
      },
    });
  });

  // POST /api/users/refresh - Force refresh the users cache
  users.post('/refresh', async (c) => {
    const result = await d1UserStore.fetchAndStoreUsers();

    if (result.error) {
      return c.json({
        success: false,
        error: result.error,
      }, 500);
    }

    return c.json({
      success: true,
      count: result.users.length,
      users: result.users,
    });
  });

  // GET /api/users/:id - Get a single user
  users.get('/:id', async (c) => {
    const id = c.req.param('id');
    const user = await d1UserStore.getUser(id);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json(user);
  });

  return users;
}
