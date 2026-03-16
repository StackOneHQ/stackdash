import { Hono } from 'hono';
import { kvUserStore } from '../store/kv-users';
import { mcpClient } from '../mcp/client';

const SE_TEAM_NAME = 'SEs';

export function createUsersRoutes() {
  const users = new Hono();

  // GET /api/users - Fetch all users (from cache or MCP)
  users.get('/', async (c) => {
    // Check if we need to refresh the cache
    const hasUsers = await kvUserStore.hasUsers();
    const isStale = await kvUserStore.isCacheStale();

    if (!hasUsers || isStale) {
      // Fetch both teams (for SE display names) and all users (for complete coverage)
      const [teamsResult, usersResult] = await Promise.all([
        mcpClient.listTeams(),
        mcpClient.listUsers(),
      ]);

      // Build user map, starting with all users
      const usersMap = new Map<string, { id: string; email: string; name: string }>();

      // First, add all users from listUsers (provides complete coverage)
      if (!usersResult.isError && usersResult.content) {
        for (const user of usersResult.content) {
          if (user.id && user.email) {
            const namePart = user.email.split('@')[0];
            const capitalizedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            usersMap.set(user.id, {
              id: user.id,
              email: user.email,
              name: user.name || capitalizedName,
            });
          }
        }
      }

      // Then, override with SE team members (they get priority for display names)
      if (!teamsResult.isError && teamsResult.content) {
        const seTeam = teamsResult.content.find(team => team.name === SE_TEAM_NAME);
        if (seTeam) {
          for (const member of seTeam.users) {
            const namePart = member.email.split('@')[0];
            const capitalizedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            usersMap.set(member.id, {
              id: member.id,
              email: member.email,
              name: capitalizedName,
            });
          }
        }
      }

      if (usersMap.size > 0) {
        await kvUserStore.setUsers(Array.from(usersMap.values()));
      }
    }

    const allUsers = await kvUserStore.getAllUsers();
    return c.json({ users: allUsers });
  });

  // POST /api/users/refresh - Force refresh the users cache
  users.post('/refresh', async (c) => {
    // Fetch both teams and all users
    const [teamsResult, usersResult] = await Promise.all([
      mcpClient.listTeams(),
      mcpClient.listUsers(),
    ]);

    // Build user map
    const usersMap = new Map<string, { id: string; email: string; name: string }>();

    // First, add all users from listUsers
    if (!usersResult.isError && usersResult.content) {
      for (const user of usersResult.content) {
        if (user.id && user.email) {
          const namePart = user.email.split('@')[0];
          const capitalizedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
          usersMap.set(user.id, {
            id: user.id,
            email: user.email,
            name: user.name || capitalizedName,
          });
        }
      }
    }

    // Override with SE team members
    let seTeamCount = 0;
    if (!teamsResult.isError && teamsResult.content) {
      const seTeam = teamsResult.content.find(team => team.name === SE_TEAM_NAME);
      if (seTeam) {
        seTeamCount = seTeam.users.length;
        for (const member of seTeam.users) {
          const namePart = member.email.split('@')[0];
          const capitalizedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
          usersMap.set(member.id, {
            id: member.id,
            email: member.email,
            name: capitalizedName,
          });
        }
      }
    }

    if (usersMap.size > 0) {
      const allUsers = Array.from(usersMap.values());
      await kvUserStore.setUsers(allUsers);
      return c.json({
        success: true,
        count: usersMap.size,
        seTeamCount,
        users: allUsers,
      });
    }

    return c.json({
      success: false,
      error: 'No users found from MCP',
    }, 500);
  });

  // GET /api/users/:id - Get a single user
  users.get('/:id', async (c) => {
    const id = c.req.param('id');
    const user = await kvUserStore.getUser(id);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json(user);
  });

  return users;
}
