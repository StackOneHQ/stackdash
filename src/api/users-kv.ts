import { Hono } from 'hono';
import { kvUserStore } from '../store/kv-users';
import { mcpClient } from '../mcp/client';

const SE_TEAM_NAME = 'SEs';

function formatNameFromEmail(email: string): string {
  const namePart = email.split('@')[0];
  return namePart
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function createUsersRoutes() {
  const users = new Hono();

  // GET /api/users - Fetch SE team users (from cache or MCP)
  users.get('/', async (c) => {
    // Check if we need to refresh the cache
    const hasUsers = await kvUserStore.hasUsers();
    const isStale = await kvUserStore.isCacheStale();

    if (!hasUsers || isStale) {
      // Fetch teams to get SE team members only
      const teamsResult = await mcpClient.listTeams();

      const usersMap = new Map<string, { id: string; email: string; name: string }>();

      // Only include SE team members
      if (!teamsResult.isError && teamsResult.content) {
        const seTeam = teamsResult.content.find(team => team.name === SE_TEAM_NAME);
        if (seTeam) {
          for (const member of seTeam.users) {
            usersMap.set(member.id, {
              id: member.id,
              email: member.email,
              name: formatNameFromEmail(member.email),
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
    // Fetch teams to get SE team members only
    const teamsResult = await mcpClient.listTeams();

    const usersMap = new Map<string, { id: string; email: string; name: string }>();

    // Only include SE team members
    if (!teamsResult.isError && teamsResult.content) {
      const seTeam = teamsResult.content.find(team => team.name === SE_TEAM_NAME);
      if (seTeam) {
        for (const member of seTeam.users) {
          usersMap.set(member.id, {
            id: member.id,
            email: member.email,
            name: formatNameFromEmail(member.email),
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
        users: allUsers,
      });
    }

    return c.json({
      success: false,
      error: 'No SE team members found from MCP',
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
