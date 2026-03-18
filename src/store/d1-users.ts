import type { Assignee } from '../types';
import { mcpClient } from '../mcp/client';

// Global D1 reference (set per-request in worker)
let db: D1Database | null = null;

const SE_TEAM_NAME = 'SEs & PSEs';
const SECONDARY_TEAM_NAME = 'Secondary Team';
const USERS_CACHE_KEY = 'users_last_updated';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Pylon AI agent - hardcoded since it's not returned by the teams API
const PYLON_AI_AGENT = {
  id: '9b76d9de-6c32-4176-9654-b463094e626d',
  email: 'ai-agent@pylon.com',
  name: 'Pylon AI',
};

function formatNameFromEmail(email: string): string {
  const namePart = email.split('@')[0];
  return namePart
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function setUsersD1Database(database: D1Database) {
  db = database;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  updated_at: string;
}

interface MetadataRow {
  key: string;
  value: string;
  updated_at: string;
}

export const d1UserStore = {
  async setUsers(users: Array<{ id: string; name?: string; email?: string }>): Promise<void> {
    if (!db) return;

    // Clear existing users and insert new ones
    const statements: D1PreparedStatement[] = [
      db.prepare(`DELETE FROM users`),
    ];

    // Insert all users
    for (const user of users) {
      statements.push(
        db.prepare(`
          INSERT INTO users (id, name, email, updated_at)
          VALUES (?, ?, ?, datetime('now'))
        `).bind(user.id, user.name || null, user.email || null)
      );
    }

    // Update the metadata timestamp
    statements.push(
      db.prepare(`
        INSERT OR REPLACE INTO metadata (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
      `).bind(USERS_CACHE_KEY, new Date().toISOString())
    );

    await db.batch(statements);
  },

  async getUser(userId: string): Promise<Assignee | undefined> {
    if (!db) return undefined;

    const result = await db.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).first<UserRow>();

    if (!result) return undefined;

    return {
      id: result.id,
      name: result.name || undefined,
      email: result.email || undefined,
    };
  },

  async getAllUsers(): Promise<Assignee[]> {
    if (!db) return [];

    const result = await db.prepare(`
      SELECT * FROM users ORDER BY COALESCE(name, email, '') ASC
    `).all<UserRow>();

    return (result.results || []).map(row => ({
      id: row.id,
      name: row.name || undefined,
      email: row.email || undefined,
    }));
  },

  async hasUsers(): Promise<boolean> {
    if (!db) return false;

    const result = await db.prepare(`
      SELECT COUNT(*) as count FROM users
    `).first<{ count: number }>();

    return (result?.count || 0) > 0;
  },

  async isCacheStale(): Promise<boolean> {
    if (!db) return true;

    const result = await db.prepare(`
      SELECT value FROM metadata WHERE key = ?
    `).bind(USERS_CACHE_KEY).first<MetadataRow>();

    if (!result?.value) return true;

    const lastUpdated = new Date(result.value).getTime();
    return Date.now() - lastUpdated > CACHE_TTL_MS;
  },

  /**
   * Fetch SE team members from Pylon via MCP and store in D1.
   * This is the single source of truth for user fetching.
   * Returns the list of users or an error message.
   */
  async fetchAndStoreUsers(): Promise<{ users: Assignee[]; error?: string }> {
    console.log('[d1UserStore] Fetching SE team members from Pylon...');

    const teamsResult = await mcpClient.listTeams();

    if (teamsResult.isError) {
      const error = `MCP listTeams failed: ${teamsResult.errorMessage}`;
      console.error('[d1UserStore]', error);
      return { users: [], error };
    }

    if (!teamsResult.content || !Array.isArray(teamsResult.content)) {
      const error = `MCP listTeams returned invalid content: ${JSON.stringify(teamsResult.content)}`;
      console.error('[d1UserStore]', error);
      return { users: [], error };
    }

    console.log(`[d1UserStore] Found ${teamsResult.content.length} teams:`,
      teamsResult.content.map(t => t.name).join(', '));

    const seTeam = teamsResult.content.find(team => team.name === SE_TEAM_NAME);
    const secondaryTeam = teamsResult.content.find(team => team.name === SECONDARY_TEAM_NAME);

    if (!seTeam && !secondaryTeam) {
      const error = `No matching teams found. Available teams: ${teamsResult.content.map(t => t.name).join(', ')}`;
      console.error('[d1UserStore]', error);
      return { users: [], error };
    }

    const usersMap = new Map<string, { id: string; email: string; name: string }>();

    // Add SE team members
    if (seTeam) {
      console.log(`[d1UserStore] Found SE team with ${seTeam.users?.length || 0} members`);
      for (const member of seTeam.users || []) {
        if (member.id && member.email) {
          usersMap.set(member.id, {
            id: member.id,
            email: member.email,
            name: formatNameFromEmail(member.email),
          });
        }
      }
    }

    // Add Secondary team members (deduplicates automatically via Map)
    if (secondaryTeam) {
      console.log(`[d1UserStore] Found Secondary team with ${secondaryTeam.users?.length || 0} members`);
      for (const member of secondaryTeam.users || []) {
        if (member.id && member.email && !usersMap.has(member.id)) {
          usersMap.set(member.id, {
            id: member.id,
            email: member.email,
            name: formatNameFromEmail(member.email),
          });
        }
      }
    }

    // Add Pylon AI agent for name lookup
    usersMap.set(PYLON_AI_AGENT.id, PYLON_AI_AGENT);

    const users = Array.from(usersMap.values());
    console.log(`[d1UserStore] Storing ${users.length} users in D1`);

    if (users.length > 0) {
      await this.setUsers(users);
    }

    return { users };
  },

  /**
   * Ensure users are loaded, fetching from MCP if cache is empty or stale.
   */
  async ensureUsersLoaded(): Promise<void> {
    const hasUsers = await this.hasUsers();
    const isStale = await this.isCacheStale();

    if (!hasUsers || isStale) {
      await this.fetchAndStoreUsers();
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
