import crypto from "crypto";
import {
  eventDedupeKey,
  json,
  kvConfigured,
  readRawBody,
  safeJsonParse,
  storeWebhookEvent,
  verifyWebhookSignature,
} from "../_kv.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);
  const payload = safeJsonParse(rawBody);
  if (!payload?.store_id || !payload?.event) {
    return json(res, 400, { ok: false, error: "Invalid webhook payload" });
  }

  const signature = req.headers["x-linkedstore-hmac-sha256"] || req.headers["http_x_linkedstore_hmac_sha256"];
  if (!verifyWebhookSignature(rawBody, signature)) {
    return json(res, 401, { ok: false, error: "Invalid webhook signature" });
  }

  if (!kvConfigured()) {
    return json(res, 503, { ok: false, error: "Webhook storage is not configured" });
  }

  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const key = eventDedupeKey(payload, bodyHash);
  const event = {
    key,
    storeId: String(payload.store_id),
    event: String(payload.event),
    resourceId: payload.id == null ? null : String(payload.id),
    bodyHash,
    receivedAt: new Date().toISOString(),
    payload,
  };

  const stored = await storeWebhookEvent(event);
  return json(res, 202, { ok: true, key, stored });
}