import {
  acknowledgeEvents,
  eventAckKey,
  eventListKey,
  json,
  kvCommand,
  kvConfigured,
  readRawBody,
  safeJsonParse,
  verifyBridgeToken,
} from "../_kv.js";

function getQueryValue(req, name) {
  return req.query?.[name] ?? new URL(req.url, "https://bridge.local").searchParams.get(name);
}

export default async function handler(req, res) {
  if (!kvConfigured()) {
    return json(res, 503, { ok: false, error: "Webhook storage is not configured", events: [] });
  }

  if (req.method === "GET") {
    const storeId = getQueryValue(req, "store_id");
    const bridgeToken = getQueryValue(req, "bridge_token");
    if (!verifyBridgeToken(storeId, bridgeToken)) {
      return json(res, 401, { ok: false, error: "Invalid bridge token", events: [] });
    }

    const rawEvents = await kvCommand(["LRANGE", eventListKey(storeId), "0", "199"]);
    const acked = new Set((await kvCommand(["SMEMBERS", eventAckKey(storeId)])) ?? []);
    const events = (rawEvents ?? [])
      .map((raw) => safeJsonParse(raw))
      .filter((event) => event?.key && !acked.has(event.key));

    return json(res, 200, { ok: true, events, count: events.length });
  }

  if (req.method === "POST") {
    const rawBody = await readRawBody(req);
    const body = safeJsonParse(rawBody);
    const storeId = body?.store_id;
    const bridgeToken = body?.bridge_token;
    if (!verifyBridgeToken(storeId, bridgeToken)) {
      return json(res, 401, { ok: false, error: "Invalid bridge token" });
    }
    const acknowledged = await acknowledgeEvents(storeId, body?.event_keys ?? []);
    return json(res, 200, { ok: true, acknowledged });
  }

  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { ok: false, error: "Method not allowed" });
}