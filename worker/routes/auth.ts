import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { loginInputSchema, registerInputSchema } from "@shared/schemas";
import { createDb } from "../db";
import { sessions, users } from "../db/schema";
import type { Env } from "../env";
import { resolveSessionUser, SESSION_COOKIE_NAME } from "../middleware/auth";
import { generateSessionToken, hashPassword, sha256Hex, verifyPassword } from "../services/crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const authRoutes = new Hono<{ Bindings: Env }>();

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string) {
  const isHttps = c.req.url.startsWith("https://");
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: isHttps,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

authRoutes.get("/me", async (c) => {
  const resolved = await resolveSessionUser(c);
  if (!resolved) return c.json({ user: null }, 200);
  return c.json({ user: resolved.user });
});

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "用户名至少 3 位，密码至少 8 位" }, 400);
  }

  const db = createDb(c.env.DB);
  const normalized = parsed.data.username.toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameNormalized, normalized))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "该用户名已被注册" }, 409);
  }

  const now = new Date();
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(parsed.data.password);

  await db.insert(users).values({
    id: userId,
    username: parsed.data.username,
    usernameNormalized: normalized,
    passwordHash,
    role: "member",
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  });

  const token = generateSessionToken();
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastUsedAt: now,
    createdAt: now,
  });

  setSessionCookie(c, token);
  return c.json(
    {
      user: {
        id: userId,
        username: parsed.data.username,
        role: "member" as const,
        allowedMenus: ["cards", "practice", "reading", "listening", "writing", "wrongbook"],
      },
    },
    201,
  );
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "请输入有效的用户名和密码" }, 400);
  }

  const db = createDb(c.env.DB);
  const normalized = parsed.data.username.toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.usernameNormalized, normalized))
    .limit(1);

  const user = rows[0];
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return c.json({ error: "用户名或密码错误" }, 401);
  }
  if (!user.isEnabled) {
    return c.json({ error: "该账号已被禁用" }, 403);
  }

  const now = new Date();
  const token = generateSessionToken();
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastUsedAt: now,
    createdAt: now,
  });

  setSessionCookie(c, token);
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      allowedMenus: JSON.parse(user.allowedMenus) as string[],
    },
  });
});

authRoutes.post("/logout", async (c) => {
  const resolved = await resolveSessionUser(c);
  if (resolved) {
    const db = createDb(c.env.DB);
    await db.delete(sessions).where(eq(sessions.id, resolved.sessionId));
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});
