import type { Assignee } from '../types';
import { mcpClient } from '../mcp/client';

// Global KV reference (set per-request in worker)
let kvNamespace: KVNamespace | null = null;

const SE_TEAM_NAME = 'SEs';

export function setUsersKVNamespace(kv: KVNamespace) {
  kvNamespace = kv;
}

const USERS_KEY = 'users';

interface StoredUsersData {
  users: Record<string, Assignee>;
  lastUpdated: string;
}

async function getData(): Promise<StoredUsersData> {
  if (!kvNamespace) {
    return { users: {}, lastUpdated: '' };
  }
  const data = await kvNamespace.get(USERS_KEY, 'json') as StoredUsersData | null;
  return data || { users: {}, lastUpdated: '' };
}

async function saveData(data: StoredUsersData): Promise<void> {
  if (!kvNamespace) return;
  await kvNamespace.put(USERS_KEY, JSON.stringify(data));
}

export const kvUserStore = {
  async setUsers(users: Array<{ id: string; name?: string; email?: string }>): Promise<void> {
    const data: StoredUsersData = {
      users: {},
      lastUpdated: new Date().toISOString(),
    };

    for (const user of users) {
      data.users[user.id] = {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    }

    await saveData(data);
  },

  async getUser(userId: string): Promise<Assignee | undefined> {
    const data = await getData();
    return data.users[userId];
  },

  async getAllUsers(): Promise<Assignee[]> {
    const data = await getData();
    return Object.values(data.users).sort((a, b) => {
      const nameA = a.name || a.email || '';
      const nameB = b.name || b.email || '';
      return nameA.localeCompare(nameB);
    });
  },

  async hasUsers(): Promise<boolean> {
    const data = await getData();
    return Object.keys(data.users).length > 0;
  },

  async isCacheStale(): Promise<boolean> {
    const data = await getData();
    if (!data.lastUpdated) return true;
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    return Date.now() - new Date(data.lastUpdated).getTime() > CACHE_TTL_MS;
  },

  // Ensure users are loaded from MCP if cache is empty or stale
  async ensureUsersLoaded(): Promise<void> {
    const hasUsers = await this.hasUsers();
    const isStale = await this.isCacheStale();

    if (!hasUsers || isStale) {
      const [teamsResult, usersResult] = await Promise.all([
        mcpClient.listTeams(),
        mcpClient.listUsers(),
      ]);

      const usersMap = new Map<string, { id: string; email: string; name: string }>();

      // Add all users from listUsers
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
        await this.setUsers(Array.from(usersMap.values()));
      }
    }
  },

  async enrichAssignee(assignee: { id: string; name?: string; email?: string }): Promise<Assignee> {
    // Ensure users are loaded before trying to enrich
    await this.ensureUsersLoaded();

    const cachedUser = await this.getUser(assignee.id);
    if (cachedUser) {
      return {
        id: assignee.id,
        name: assignee.name || cachedUser.name,
        email: assignee.email || cachedUser.email,
      };
    }
    return assignee;
  },
};
