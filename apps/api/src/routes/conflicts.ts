import { Hono } from "hono";
import type { Bindings } from "../types";

const conflicts = new Hono<{ Bindings: Bindings }>();

// GET /conflicts — active (unresolved) conflicts
conflicts.get("/", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT * FROM conflicts WHERE resolved_at IS NULL ORDER BY detected_at DESC LIMIT 50`
  ).all();

  return c.json({
    conflicts: result.results.map((r: Record<string, unknown>) => ({
      ...r,
      sessionIds: JSON.parse(r.session_ids as string),
    })),
  });
});

// POST /conflicts/:id/resolve — mark a conflict as resolved
conflicts.post("/:id/resolve", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  await c.env.DB.prepare(
    `UPDATE conflicts SET resolved_at = ?, resolution = ? WHERE id = ?`
  ).bind(Date.now(), body.resolution || "manual", id).run();

  return c.json({ ok: true });
});

export { conflicts };
