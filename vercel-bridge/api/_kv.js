import crypto from "crypto";

const MAX_EVENTS = 200;
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7;

export function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(payload));
}

export function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function kvCommand(command) {
  if (!kvConfigured()) throw new Error("KV storage is not configured.");
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `KV command failed with ${response.status}`);
  }
  return data?.result;
}

export async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export function safeJsonParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

export function bridgeTokenForStore(storeId) {
  if (!process.env.TIENDANUBE_CLIENT_SECRET) return null;
  return crypto
    .createHmac("sha256", process.env.TIENDANUBE_CLIENT_SECRET)
    .update(String(storeId))
    .digest("hex");
}

export function verifyBridgeToken(storeId, bridgeToken) {
  const expected = bridgeTokenForStore(storeId);
  if (!expected || !bridgeToken) return false;
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(String(bridgeToken), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function verifyWebhookSignature(rawBody, hmacHeader) {
  if (!process.env.TIENDANUBE_CLIENT_SECRET || !hmacHeader) return false;
  const expected = crypto
    .createHmac("sha256", process.env.TIENDANUBE_CLIENT_SECRET)
    .update(rawBody)
    .digest("hex");
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(String(hmacHeader), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function eventListKey(storeId) {
  return `tn:webhooks:${storeId}:events`;
}

export function eventAckKey(storeId) {
  return `tn:webhooks:${storeId}:acked`;
}

export function eventDedupeKey(payload, bodyHash) {
  return `${payload.store_id}:${payload.event}:${payload.id ?? "none"}:${payload.event_launch_ts ?? ""}:${bodyHash}`;
}

export async function storeWebhookEvent(event) {
  const dedupeResult = await kvCommand(["SET", `tn:webhooks:dedupe:${event.key}`, "1", "EX", String(EVENT_TTL_SECONDS), "NX"]);
  if (dedupeResult !== "OK") return false;

  const listKey = eventListKey(event.storeId);
  await kvCommand(["LPUSH", listKey, JSON.stringify(event)]);
  await kvCommand(["LTRIM", listKey, "0", String(MAX_EVENTS - 1)]);
  await kvCommand(["EXPIRE", listKey, String(EVENT_TTL_SECONDS)]);
  return true;
}

export async function acknowledgeEvents(storeId, eventKeys) {
  const keys = Array.from(new Set((eventKeys ?? []).filter(Boolean).map(String)));
  if (keys.length === 0) return 0;
  const ackKey = eventAckKey(storeId);
  await kvCommand(["SADD", ackKey, ...keys]);
  await kvCommand(["EXPIRE", ackKey, String(EVENT_TTL_SECONDS)]);
  return keys.length;
}