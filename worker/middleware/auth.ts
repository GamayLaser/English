import { and, eq, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import type { UserProfile } from "@shared/schemas";
import { createDb } from "../db";
import { sessions, users } from "../db/schema";
import type { Env } from "../env";
import { sha256Hex } from "../services/crypto";

export const SESSION_COOKIE_NAME = "english_session";

export type AuthVariables = {
  user: UserProfile;
  sessionId: string;
};

export async function resolveSessionUser<T extends { Bindings: Env }>(
  c: Context<T>,
): Promise<{ user: UserProfile; sessionId: string } | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) return null;

  const db = createDb(c.env.DB);
  const tokenHash = await sha256Hex(token);
  const now = new Date();

  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      username: users.username,
      role: users.role,
      isEnabled: users.isEnabled,
      allowedMenus: users.allowedMenus,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isEnabled) return null;

  let parsedMenus: string[] = [];
  try {
    parsedMenus = JSON.parse(row.allowedMenus) as string[];
  } catch {
    parsedMenus = ["cards", "practice", "reading", "listening", "writing", "wrongbook"];
  }

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      username: row.username,
      role: row.role,
      allowedMenus: parsedMenus,
    },
  };
}

const DEV_GUEST_USER: UserProfile = {
  id: "dev-user",
  username: "dev",
  role: "admin",
  allowedMenus: ["cards", "practice", "reading", "listening", "writing", "wrongbook"],
};

export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> = async (c, next) => {
  const resolved = await resolveSessionUser(c);
  if (!resolved) {
    // Temporary dev bypass: allow unauthenticated access until login is re-enabled.
    c.set("user", DEV_GUEST_USER);
    c.set("sessionId", "dev-session");
    await next();
    return;
  }
  c.set("user", resolved.user);
  c.set("sessionId", resolved.sessionId);
  await next();
};
