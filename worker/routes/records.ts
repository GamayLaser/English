import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { privateRecordUpsertSchema } from "@shared/schemas";
import { createDb } from "../db";
import { privateRecords } from "../db/schema";
import type { Env } from "../env";
import { requireAuth, type AuthVariables } from "../middleware/auth";

export const recordRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

recordRoutes.use("*", requireAuth);

recordRoutes.get("/:namespace", async (c) => {
  const namespace = c.req.param("namespace");
  const user = c.get("user");
  const db = createDb(c.env.DB);

  const rows = await db
    .select({
      key: privateRecords.recordKey,
      value: privateRecords.value,
      version: privateRecords.version,
      updatedAt: privateRecords.updatedAt,
    })
    .from(privateRecords)
    .where(and(eq(privateRecords.userId, user.id), eq(privateRecords.namespace, namespace)));

  return c.json({
    records: rows.map((r) => ({
      key: r.key,
      value: JSON.parse(r.value) as unknown,
      version: r.version,
      updatedAt: r.updatedAt,
    })),
  });
});

recordRoutes.get("/:namespace/manifest", async (c) => {
  const namespace = c.req.param("namespace");
  const user = c.get("user");
  const db = createDb(c.env.DB);

  const rows = await db
    .select({
      key: privateRecords.recordKey,
      version: privateRecords.version,
    })
    .from(privateRecords)
    .where(and(eq(privateRecords.userId, user.id), eq(privateRecords.namespace, namespace)));

  return c.json({ records: rows });
});

recordRoutes.get("/:namespace/:key", async (c) => {
  const namespace = c.req.param("namespace");
  const key = c.req.param("key");
  const user = c.get("user");
  const db = createDb(c.env.DB);

  const rows = await db
    .select({
      key: privateRecords.recordKey,
      value: privateRecords.value,
      version: privateRecords.version,
    })
    .from(privateRecords)
    .where(
      and(
        eq(privateRecords.userId, user.id),
        eq(privateRecords.namespace, namespace),
        eq(privateRecords.recordKey, key),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return c.json({ error: "Not Found" }, 404);

  return c.json({
    record: {
      key: row.key,
      value: JSON.parse(row.value) as unknown,
      version: row.version,
    },
  });
});

recordRoutes.put("/:namespace/:key", async (c) => {
  const namespace = c.req.param("namespace");
  const key = c.req.param("key");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = privateRecordUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "数据格式不正确" }, 400);
  }

  const db = createDb(c.env.DB);
  const now = new Date();
  const serialized = JSON.stringify(parsed.data.value ?? null);

  const existing = await db
    .select({ id: privateRecords.id, version: privateRecords.version })
    .from(privateRecords)
    .where(
      and(
        eq(privateRecords.userId, user.id),
        eq(privateRecords.namespace, namespace),
        eq(privateRecords.recordKey, key),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(privateRecords).values({
      id: crypto.randomUUID(),
      userId: user.id,
      namespace,
      recordKey: key,
      value: serialized,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ record: { key, version: 1 } });
  }

  const current = existing[0];
  if (parsed.data.version !== current.version) {
    return c.json({ error: "云端数据已更新，请刷新后重试", currentVersion: current.version }, 409);
  }

  const nextVersion = current.version + 1;
  await db
    .update(privateRecords)
    .set({ value: serialized, version: nextVersion, updatedAt: now })
    .where(eq(privateRecords.id, current.id));

  return c.json({ record: { key, version: nextVersion } });
});

recordRoutes.delete("/:namespace/:key", async (c) => {
  const namespace = c.req.param("namespace");
  const key = c.req.param("key");
  const user = c.get("user");
  const db = createDb(c.env.DB);

  await db
    .delete(privateRecords)
    .where(
      and(
        eq(privateRecords.userId, user.id),
        eq(privateRecords.namespace, namespace),
        eq(privateRecords.recordKey, key),
      ),
    );

  return c.json({ ok: true });
});
