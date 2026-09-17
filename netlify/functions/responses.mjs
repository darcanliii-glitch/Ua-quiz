// Netlify Function (v2, ESM) — public, anonymous backend for the
// Under Armour quiz. Stores/retrieves participant results using
// Netlify Blobs (no external database needed).
//
// Routes (configured via `config.path` below):
//   GET    /api/responses        -> list all responses (JSON array)
//   POST   /api/responses        -> add one response (JSON body)
//   DELETE /api/responses?admin=CLEAR_KEY -> wipe all responses
//
// CORS is open (Access-Control-Allow-Origin: *) since this is a
// public quiz meant to be reachable from any device without login.

import { getStore } from "@netlify/blobs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// Change this to any secret string you like before deploying if you
// want to protect the "clear all" endpoint. Leave as-is otherwise.
const ADMIN_CLEAR_KEY = "ua-clear-2026";

export default async (req) => {
  const store = getStore("quiz-responses");
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: CORS_HEADERS });
    }
    const id = crypto.randomUUID();
    const record = {
      id,
      name: String(body.name || "").slice(0, 200),
      dealer: String(body.dealer || "").slice(0, 200),
      correct: Number(body.correct) || 0,
      wrong: Number(body.wrong) || 0,
      total: Number(body.total) || 0,
      comment: String(body.comment || "").slice(0, 1000),
      rating: Number(body.rating) || 0,
      ts: Date.now(),
    };
    await store.setJSON(id, record);
    return new Response(JSON.stringify({ ok: true, id }), { status: 200, headers: CORS_HEADERS });
  }

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    items.sort((a, b) => (b?.ts || 0) - (a?.ts || 0));
    return new Response(JSON.stringify(items), { status: 200, headers: CORS_HEADERS });
  }

  if (req.method === "PATCH") {
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "missing_id" }), { status: 400, headers: CORS_HEADERS });
    }
    const existing = await store.get(id, { type: "json" });
    if (!existing) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: CORS_HEADERS });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: CORS_HEADERS });
    }
    const updated = {
      ...existing,
      comment: body.comment !== undefined ? String(body.comment).slice(0, 1000) : existing.comment,
      rating: body.rating !== undefined ? Number(body.rating) || 0 : existing.rating,
    };
    await store.setJSON(id, updated);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
  }

  if (req.method === "DELETE") {
    if (url.searchParams.get("admin") !== ADMIN_CLEAR_KEY) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS_HEADERS });
    }
    const { blobs } = await store.list();
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return new Response(JSON.stringify({ ok: true, deleted: blobs.length }), { status: 200, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS_HEADERS });
};

export const config = { path: "/api/responses" };
