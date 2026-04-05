import { Hono } from "hono";
import type { Bindings } from "../types";
import { sseClients } from "../sse";

const events = new Hono<{ Bindings: Bindings }>();

// POST /events — report an agent activity event
events.post("/", async (c) => {
  const body = await c.req.json();
  const { sessionId, action, filePath, summary, metadata } = body;

  if (!sessionId || !action || !summary) {
    return c.json({ error: "sessionId, action, and summary are required" }, 400);
  }

  const id = crypto.randomUUID();
  const ts = Date.now();

  // Insert event
  await c.env.DB.prepare(
    `INSERT INTO events (id, session_id, action, file_path, summary, ts, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, sessionId, action, filePath || null, summary, ts, metadata ? JSON.stringify(metadata) : null)
    .run();

  // Check for conflicts: same file being touched by different sessions
  if (filePath && (action === "edit" || action === "create" || action === "delete")) {
    const recent = await c.env.DB.prepare(
      `SELECT DISTINCT session_id FROM events WHERE file_path = ? AND action IN ('edit','create','delete') AND ts > ? AND session_id != ?`
    )
      .bind(filePath, ts - 300000, sessionId) // 5 min window
      .all();

    if (recent.results.length > 0) {
      const allSessionIds = [sessionId, ...recent.results.map((r: Record<string, unknown>) => r.session_id as string)];
      const conflictId = crypto.randomUUID();

      await c.env.DB.prepare(
        `INSERT INTO conflicts (id, file_path, session_ids, detected_at) VALUES (?, ?, ?, ?)`
      )
        .bind(conflictId, filePath, JSON.stringify(allSessionIds), ts)
        .run();
    }
  }

  // Broadcast to SSE clients
  const event = { id, sessionId, action, filePath, summary, timestamp: ts, metadata };
  sseClients.broadcast(JSON.stringify(event));

  return c.json({ ok: true, id, timestamp: ts });
});

// GET /events/stream — SSE real-time event feed
events.get("/stream", async (c) => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const clientId = crypto.randomUUID();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          sseClients.remove(clientId);
        }
      };

      // Send initial ping
      send(JSON.stringify({ type: "connected", clientId }));

      sseClients.add(clientId, send);

      // Heartbeat every 30s to keep connection alive
      const interval = setInterval(() => {
        send(JSON.stringify({ type: "ping", ts: Date.now() }));
      }, 30000);

      // Cleanup when stream is cancelled
      const checkClosed = setInterval(() => {
        if (controller.desiredSize === null || controller.desiredSize <= 0) {
          sseClients.remove(clientId);
          clearInterval(interval);
          clearInterval(checkClosed);
        }
      }, 5000);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
});

// GET /events/history — paginated event history
events.get("/history", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
  const before = c.req.query("before"); // timestamp cursor
  const sessionId = c.req.query("sessionId");

  let query = "SELECT * FROM events";
  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (before) {
    conditions.push("ts < ?");
    binds.push(parseInt(before));
  }
  if (sessionId) {
    conditions.push("session_id = ?");
    binds.push(sessionId);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY ts DESC LIMIT ?";
  binds.push(limit);

  const result = await c.env.DB.prepare(query).bind(...binds).all();

  return c.json({
    events: result.results.map((r: Record<string, unknown>) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
    })),
    hasMore: result.results.length === limit,
  });
});

export { events };
