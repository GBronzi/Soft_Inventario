import type { CatalogoItem, TiendanubeSyncStatus } from "@/types";
import {
  aplicarPrecioDesdeTiendanube,
  aplicarStockDesdeTiendanube,
  getCatalogoProductos,
  getCategoriasArbol,
  setTnUpdatedAt,
  upsertCategorias,
  upsertProductoDesdeTiendanube,
  type CategoriaUpsert,
  type ProductoUpsert,
  type VarianteUpsert,
} from "@/database/queries";
import { fetch } from "@tauri-apps/plugin-http";

const CREDENTIALS_KEY = "tiendanube_credentials";
const SYNC_STATUS_KEY = "tiendanube_last_sync";
const SYNC_SINCE_KEY = "tiendanube_sync_since";
const AUTO_CHECK_SINCE_KEY = "tiendanube_auto_check_since";
const POLL_ENABLED_KEY = "tiendanube_poll_enabled";
const POLL_INTERVAL_KEY = "tiendanube_poll_interval";
const API_BASE = "https://api.tiendanube.com/v1";
const BRIDGE_BASE = "https://vercel-bridge-5fpy4bubs-mauricios-projects-45a56444.vercel.app";
const WEBHOOK_ENDPOINT = `${BRIDGE_BASE}/api/webhooks/tiendanube`;
const WEBHOOK_EVENTS = ["order/created", "order/paid", "order/updated", "order/cancelled", "product/created", "product/updated"] as const;
const USER_AGENT = "InventarioOffline (contacto@empresa.com)";

export interface TiendanubePollConfig {
  enabled: boolean;
  intervalSec: number;
}

export function getPollConfig(): TiendanubePollConfig {
  const enabledRaw = localStorage.getItem(POLL_ENABLED_KEY);
  const intervalRaw = Number(localStorage.getItem(POLL_INTERVAL_KEY));
  return {
    enabled: enabledRaw === null ? true : enabledRaw === "true",
    intervalSec: Number.isFinite(intervalRaw) && intervalRaw >= 30 ? intervalRaw : 60,
  };
}

export function setPollConfig(config: Partial<TiendanubePollConfig>) {
  if (typeof config.enabled === "boolean") {
    localStorage.setItem(POLL_ENABLED_KEY, String(config.enabled));
  }
  if (typeof config.intervalSec === "number" && config.intervalSec >= 30) {
    localStorage.setItem(POLL_INTERVAL_KEY, String(config.intervalSec));
  }
}

export interface TiendanubeCredentials {
  accessToken: string;
  userId: string;
  bridgeToken?: string | null;
}

export function getTiendanubeCredentials(): TiendanubeCredentials | null {
  const data = localStorage.getItem(CREDENTIALS_KEY);
  return data ? JSON.parse(data) : null;
}

export function saveTiendanubeCredentials(credentials: TiendanubeCredentials) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

export function clearTiendanubeCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY);
  localStorage.removeItem(SYNC_STATUS_KEY);
}

export type TiendanubeConnectionIssue = "none" | "auth" | "network" | "api";

export interface TiendanubeConnectionCheck {
  ok: boolean;
  message: string;
  statusCode?: number;
  issue: TiendanubeConnectionIssue;
}

export async function validateTiendanubeConnection(): Promise<TiendanubeConnectionCheck> {
  const creds = getTiendanubeCredentials();
  if (!creds) {
    return { ok: false, message: "Faltan credenciales (Token y User ID) para conectar con Tiendanube.", issue: "auth" };
  }

  try {
    const params = new URLSearchParams({ page: "1", per_page: "1" });
    const res = await fetch(`${API_BASE}/${creds.userId}/products?${params.toString()}`, {
      method: "GET",
      headers: buildTnHeaders(creds),
    });

    if (res.ok) {
      return { ok: true, message: "Conexión verificada con Tiendanube. Token activo y tienda accesible.", statusCode: res.status, issue: "none" };
    }

    const detail = await getErrorMessageFromResponse(res, res.statusText || "Error validando conexión");
    const authMessage = res.status === 401 || res.status === 403
      ? "La autorización de Tiendanube venció o fue rechazada. Desvincula y vuelve a vincular la tienda."
      : `Tiendanube respondió con error ${res.status}: ${detail}`;
    return { ok: false, message: authMessage, statusCode: res.status, issue: res.status === 401 || res.status === 403 ? "auth" : "api" };
  } catch (error) {
    return {
      ok: false,
      message: `No se pudo comprobar la conexión con Tiendanube: ${error instanceof Error ? error.message : String(error)}`,
      issue: "network",
    };
  }
}

export async function getTiendanubeSyncStatus(): Promise<TiendanubeSyncStatus> {
  const creds = getTiendanubeCredentials();
  const lastSync = localStorage.getItem(SYNC_STATUS_KEY);

  if (!creds) {
    return {
      connected: false,
      lastSync: null,
      message: "Faltan credenciales (Token y User ID) para conectar con Tiendanube.",
    };
  }

  const check = await validateTiendanubeConnection();
  return {
    connected: check.ok,
    lastSync,
    message: check.message,
  };
}

// Función auxiliar para buscar y actualizar en la API de Tiendanube por ID
async function postTnJson<T>(creds: TiendanubeCredentials, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/${creds.userId}/${path}`, {
    method: "POST",
    headers: buildTnHeaders(creds),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await getErrorMessageFromResponse(res, res.statusText || "Error enviando datos a Tiendanube");
    throw new Error(`Error ${res.status} en ${path}: ${detail}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export async function ensureTiendanubeWebhooks(onProgress: (msg: string) => void = () => undefined): Promise<{ existing: number; created: number; errors: number; failedEvents: string[] }> {
  const creds = getTiendanubeCredentials();
  if (!creds) throw new Error("No hay credenciales activas.");

  let existing = 0;
  let created = 0;
  let errors = 0;
  const failedEvents: string[] = [];

  for (const event of WEBHOOK_EVENTS) {
    try {
      const registered = await tnGetPaginated<{ id: number; event: string; url: string }>(creds, "webhooks", { event, url: WEBHOOK_ENDPOINT });
      const alreadyExists = registered.some((webhook) => webhook.event === event && webhook.url === WEBHOOK_ENDPOINT);
      if (alreadyExists) {
        existing++;
        continue;
      }

      await postTnJson(creds, "webhooks", { event, url: WEBHOOK_ENDPOINT });
      created++;
      onProgress(`Webhook registrado: ${event}`);
    } catch (error) {
      console.warn("No se pudo registrar webhook Tiendanube", event, error);
      errors++;
      failedEvents.push(event);
      onProgress(`Aviso: no se pudo registrar webhook ${event} (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  return { existing, created, errors, failedEvents };
}

export async function fetchTiendanubeWebhookEvents(onProgress: (msg: string) => void): Promise<{ ok: boolean; events: TiendanubeWebhookBridgeEvent[]; error?: string; enabled: boolean }> {
  const creds = getTiendanubeCredentials();
  if (!creds?.bridgeToken) return { ok: false, events: [], enabled: false, error: "La tienda debe volver a vincularse para habilitar el bridge de webhooks." };

  const params = new URLSearchParams({ store_id: creds.userId, bridge_token: creds.bridgeToken });
  try {
    const res = await fetch(`${BRIDGE_BASE}/api/webhooks/pending?${params.toString()}`, { method: "GET", headers: { Accept: "application/json" } });
    const payload = (await res.json().catch(() => null)) as { ok?: boolean; events?: TiendanubeWebhookBridgeEvent[]; error?: string } | null;
    if (!res.ok || !payload?.ok) {
      const error = payload?.error ?? `Bridge respondió ${res.status}`;
      onProgress(`Aviso bridge: ${error}. Se usará revisión directa con Tiendanube.`);
      return { ok: false, events: [], enabled: true, error };
    }
    return { ok: true, events: payload.events ?? [], enabled: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onProgress(`Aviso bridge: no se pudo consultar eventos (${message}). Se usará revisión directa con Tiendanube.`);
    return { ok: false, events: [], enabled: true, error: message };
  }
}

export async function acknowledgeTiendanubeWebhookEvents(eventKeys: string[]): Promise<void> {
  const creds = getTiendanubeCredentials();
  const keys = Array.from(new Set(eventKeys.filter(Boolean)));
  if (!creds?.bridgeToken || keys.length === 0) return;

  await fetch(`${BRIDGE_BASE}/api/webhooks/pending`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ store_id: creds.userId, bridge_token: creds.bridgeToken, event_keys: keys }),
  }).catch((error) => console.warn("No se pudieron confirmar eventos del bridge", error));
}
async function updateVariantById(creds: TiendanubeCredentials, tnProductId: number, tnVariantId: number, stock: number, nombre: string) {
  const updateUrl = `https://api.tiendanube.com/v1/${creds.userId}/products/${tnProductId}/variants/${tnVariantId}`;
  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: buildTnHeaders(creds),
    body: JSON.stringify({ stock: Number(stock) })
  });

  if (!updateResponse.ok) {
    const detail = await getErrorMessageFromResponse(updateResponse, updateResponse.statusText || "Error actualizando stock");
    throw new Error(`Error actualizando "${nombre}": ${detail}`);
  }

  return true;
}

// Sincronización por IDs internos de Tiendanube (para productos importados)
export async function syncStockWithTiendanube(onProgress: (msg: string) => void): Promise<void> {
  const creds = getTiendanubeCredentials();
  if (!creds) throw new Error("No hay credenciales activas.");

  onProgress("Leyendo base de datos local...");
  const catalogo = await getCatalogoProductos();
  
  // Filtramos los que tienen tnProductId y tnVariantId (productos importados de Tiendanube)
  const sincronizables = catalogo.filter(c => c.tnProductId && c.tnVariantId);
  
  if (sincronizables.length === 0) {
    throw new Error("No hay productos vinculados a Tiendanube para sincronizar. Primero importá desde Tiendanube.");
  }

  let sincronizados = 0;
  let errores = 0;

  for (const item of sincronizables) {
    try {
      onProgress(`Sincronizando "${item.nombre}"...`);
      await updateVariantById(creds, item.tnProductId!, item.tnVariantId!, item.stockActual, item.nombre);
      sincronizados++;
    } catch (e) {
      console.warn("Fallo sincronizando", item.nombre, e);
      errores++;
    }
  }

  const finishDate = new Date().toLocaleString();
  localStorage.setItem(SYNC_STATUS_KEY, finishDate);

  onProgress(`Completado. ${sincronizados} actualizado/s, ${errores} error/es.`);
}

// ===== Importación / sincronización bidireccional (cruce por IDs internos de Tiendanube) =====

type LocalizedField = string | Record<string, string> | null | undefined;

interface TNCategory {
  id: number;
  name: LocalizedField;
  parent?: number | null;
}

interface TNVariant {
  id: number;
  product_id: number;
  price: string | number | null;
  stock: number | null;
  sku: string | null;
  barcode: string | null;
  values?: LocalizedField[];
}

interface TNProduct {
  id: number;
  name: LocalizedField;
  description: LocalizedField;
  brand?: string | null;
  tags?: string | null;
  published?: boolean;
  seo_title?: LocalizedField;
  seo_description?: LocalizedField;
  updated_at?: string | null;
  categories?: TNCategory[];
  images?: { src?: string }[];
  variants?: TNVariant[];
}

function pickLocale(value: LocalizedField): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  const values = Object.values(value).filter((v) => typeof v === "string" && v.trim());
  if (values.length === 0) return null;
  return (value.es?.trim() || values[0]).trim() || null;
}

export function buildTnHeaders(creds: TiendanubeCredentials) {
  const token = creds.accessToken.trim();
  return {
    Authentication: `Bearer ${token}`,
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    Accept: "application/json",
  } as Record<string, string>;
}

function getErrorMessageFromResponse(response: Response, fallback: string) {
  return response.text()
    .then((text) => {
      if (!text) return fallback;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
        if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error;
      } catch {
        // Ignorar y usar texto plano.
      }
      return text.trim() || fallback;
    })
    .catch(() => fallback);
}

async function tnGetOne<T>(creds: TiendanubeCredentials, path: string): Promise<T> {
  const url = `${API_BASE}/${creds.userId}/${path}`;
  const res = await fetch(url, { method: "GET", headers: buildTnHeaders(creds) });
  if (!res.ok) {
    const detail = await getErrorMessageFromResponse(res, res.statusText || "Error consultando Tiendanube");
    throw new Error(`Error ${res.status} consultando ${path}: ${detail}`);
  }
  return (await res.json()) as T;
}

async function tnGetPaginated<T>(creds: TiendanubeCredentials, path: string, query: Record<string, string> = {}): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const perPage = 200;
  // Recorremos páginas hasta que una venga vacía
  // (la API responde 404/422 cuando se pasa de la última página en algunos casos)
  while (true) {
    const params = new URLSearchParams({ ...query, page: String(page), per_page: String(perPage) });
    const url = `${API_BASE}/${creds.userId}/${path}?${params.toString()}`;
    const res = await fetch(url, { method: "GET", headers: buildTnHeaders(creds) });
    if (res.status === 404 || res.status === 422) break;
    if (!res.ok) {
      const detail = await getErrorMessageFromResponse(res, res.statusText || "Error consultando Tiendanube");
      throw new Error(`Error ${res.status} consultando ${path}: ${detail}`);
    }
    const batch = (await res.json()) as T[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}

async function importarCategorias(creds: TiendanubeCredentials): Promise<Map<number, number>> {
  const cats = await tnGetPaginated<TNCategory>(creds, "categories");
  const payload: CategoriaUpsert[] = cats.map((c) => ({
    tnCategoryId: c.id,
    nombre: pickLocale(c.name) ?? `Categoría ${c.id}`,
    tnParentId: c.parent && c.parent > 0 ? c.parent : null,
  }));
  return upsertCategorias(payload);
}

async function generarSkuEnTiendanube(creds: TiendanubeCredentials, variant: TNVariant): Promise<string> {
  const nuevoSku = `TN${variant.product_id}-${variant.id}`;
  const url = `${API_BASE}/${creds.userId}/products/${variant.product_id}/variants/${variant.id}`;
  const res = await fetch(url, { method: "PUT", headers: buildTnHeaders(creds), body: JSON.stringify({ sku: nuevoSku }) });
  if (!res.ok) {
    const detail = await getErrorMessageFromResponse(res, res.statusText || "Error generando SKU");
    throw new Error(`No se pudo generar SKU para variante ${variant.id}: ${detail}`);
  }
  return nuevoSku;
}

async function resolveCreatedProductId(creds: TiendanubeCredentials, item: CatalogoItem, createdProduct: TNProduct | null, prodRes: Response): Promise<number> {
  if (createdProduct?.id) return createdProduct.id;
  if (typeof item.tnProductId === "number") return item.tnProductId;

  const locationHeader = prodRes.headers.get("location") ?? prodRes.headers.get("Location");
  const locationMatch = locationHeader?.match(/\/products\/(\d+)/i);
  if (locationMatch?.[1]) return Number(locationMatch[1]);

  const productName = item.nombre?.trim();
  if (productName) {
    const products = await tnGetPaginated<TNProduct>(creds, "products");
    const match = products.find((candidate) => pickLocale(candidate.name)?.trim().toLowerCase() === productName.toLowerCase());
    if (match?.id) return match.id;
  }

  throw new Error("Tiendanube no devolvió el id del producto creado.");
}

export async function resolveTiendanubeProductTarget(creds: TiendanubeCredentials, item: Pick<CatalogoItem, "tnProductId" | "tnVariantId" | "nombre" | "sku" | "codigoBarras">): Promise<{ productId: number; variantId?: number } | null> {
  if (typeof item.tnProductId === "number") {
    return { productId: item.tnProductId, ...(typeof item.tnVariantId === "number" ? { variantId: item.tnVariantId } : {}) };
  }

  const products = await tnGetPaginated<TNProduct>(creds, "products");
  const normalizedName = item.nombre?.trim().toLowerCase();
  const normalizedSku = item.sku?.trim().toLowerCase();
  const normalizedBarcode = item.codigoBarras?.trim().toLowerCase();

  for (const product of products) {
    for (const variant of product.variants ?? []) {
      const variantSku = variant.sku?.trim().toLowerCase();
      const variantBarcode = variant.barcode?.trim().toLowerCase();
      if (normalizedSku && variantSku && variantSku === normalizedSku) {
        return { productId: product.id, variantId: variant.id };
      }
      if (normalizedBarcode && variantBarcode && variantBarcode === normalizedBarcode) {
        return { productId: product.id, variantId: variant.id };
      }
    }

    const candidateName = pickLocale(product.name)?.trim().toLowerCase();
    if (normalizedName && candidateName && candidateName === normalizedName) {
      return { productId: product.id };
    }
  }

  return null;
}

async function normalizarProducto(
  creds: TiendanubeCredentials,
  prod: TNProduct,
  catMap: Map<number, number>,
  onProgress: (msg: string) => void,
  options: { generateMissingSku?: boolean } = { generateMissingSku: true },
): Promise<ProductoUpsert> {
  const categoriasProducto = prod.categories ?? [];
  const categoriaLocalIds = categoriasProducto
    .map((c) => catMap.get(c.id))
    .filter((id): id is number => typeof id === "number");
  const categoriaNombre = categoriasProducto.length
    ? pickLocale(categoriasProducto[categoriasProducto.length - 1].name)
    : null;

  const variantes: VarianteUpsert[] = [];
  for (const v of prod.variants ?? []) {
    let sku = v.sku?.trim() || null;
    if (!sku && options.generateMissingSku !== false) {
      onProgress(`Generando SKU para variante ${v.id} de "${pickLocale(prod.name)}"...`);
      sku = await generarSkuEnTiendanube(creds, v);
    }
    const presentacion = (v.values ?? []).map(pickLocale).filter(Boolean).join(" / ") || null;
    variantes.push({
      tnVariantId: v.id,
      variante: presentacion,
      capacidadMedida: presentacion,
      sku,
      codigoBarras: v.barcode?.trim() || null,
      precioVenta: Number(v.price ?? 0) || 0,
      stock: Number(v.stock ?? 0) || 0,
    });
  }

  return {
    tnProductId: prod.id,
    nombre: pickLocale(prod.name) ?? `Producto ${prod.id}`,
    descripcion: pickLocale(prod.description),
    marca: prod.brand?.trim() || null,
    categoriaNombre,
    categoriaLocalIds,
    imagenUrl: prod.images?.[0]?.src ?? null,
    seoTitulo: pickLocale(prod.seo_title),
    seoDescripcion: pickLocale(prod.seo_description),
    tags: prod.tags?.trim() || null,
    publicado: prod.published !== false,
    tnUpdatedAt: prod.updated_at ?? null,
    variantes,
  };
}

interface TNOrderProduct {
  product_id: number;
  variant_id: number;
  name?: string | null;
  quantity: number;
  price?: string | number | null;
}

interface TNOrder {
  id: number;
  number: number | string;
  status?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  total?: string | number | null;
  products?: TNOrderProduct[];
}

export interface TiendanubeWebhookBridgeEvent {
  key: string;
  storeId: string;
  event: string;
  resourceId: string | null;
  receivedAt: string;
  payload: Record<string, unknown>;
}

interface TiendanubeOrderMatch {
  id: number;
  number: string;
  quantity: number;
  total: number | null;
  createdAt: string | null;
  paymentStatus: string | null;
  status: string | null;
}

export type TiendanubeSyncChangeType = "PRODUCTO_NUEVO" | "VARIANTE_NUEVA" | "VENTA_TN" | "STOCK" | "PRECIO" | "DATOS";

export interface TiendanubeSyncChange {
  id: string;
  type: TiendanubeSyncChangeType;
  producto: string;
  variante: string | null;
  detalle: string;
  accion: string;
  tnProductId: number;
  tnVariantId: number | null;
  inventarioId: number | null;
  localStock: number | null;
  remoteStock: number | null;
  stockDelta: number | null;
  localPrice: number | null;
  remotePrice: number | null;
  orderMatches?: TiendanubeOrderMatch[];
}

export interface TiendanubeSyncPreview {
  cambios: TiendanubeSyncChange[];
  productos: ProductoUpsert[];
  fetchedAt: string;
  signature: string;
  webhookEventKeys: string[];
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function moneyValue(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function variantDisplay(value: string | null | undefined) {
  return value?.trim() || "Variante principal";
}

function buildLocalIndexes(catalogo: CatalogoItem[]) {
  const byProduct = new Map<number, CatalogoItem[]>();
  const byVariant = new Map<number, CatalogoItem>();
  for (const item of catalogo) {
    if (typeof item.tnProductId === "number") {
      const list = byProduct.get(item.tnProductId) ?? [];
      list.push(item);
      byProduct.set(item.tnProductId, list);
    }
    if (typeof item.tnVariantId === "number") {
      byVariant.set(item.tnVariantId, item);
    }
  }
  return { byProduct, byVariant };
}

function getDefaultOrdersMinDate() {
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return date.toISOString();
}

async function obtenerOrdenesRecientesTiendanube(
  creds: TiendanubeCredentials,
  onProgress: (msg: string) => void,
  updatedAtMin?: string | null,
): Promise<TNOrder[]> {
  try {
    onProgress("Descargando ventas recientes de Tiendanube...");
    const query: Record<string, string> = {
      status: "any",
      payment_status: "any",
      updated_at_min: updatedAtMin || getDefaultOrdersMinDate(),
    };
    return await tnGetPaginated<TNOrder>(creds, "orders", query);
  } catch (error) {
    console.warn("No se pudieron leer órdenes de Tiendanube", error);
    onProgress(`Aviso: no se pudieron leer ventas de Tiendanube (${error instanceof Error ? error.message : String(error)}). Se revisará sólo stock/productos.`);
    return [];
  }
}

function buildOrderMatchesByVariant(orders: TNOrder[]) {
  const map = new Map<number, TiendanubeOrderMatch[]>();
  for (const order of orders) {
    if (order.status === "cancelled" || order.payment_status === "voided" || order.payment_status === "refunded") continue;
    for (const product of order.products ?? []) {
      const variantId = Number(product.variant_id);
      if (!Number.isFinite(variantId)) continue;
      const entry: TiendanubeOrderMatch = {
        id: Number(order.id),
        number: String(order.number ?? order.id),
        quantity: Number(product.quantity ?? 0),
        total: order.total == null ? null : Number(order.total),
        createdAt: order.created_at ?? null,
        paymentStatus: order.payment_status ?? null,
        status: order.status ?? null,
      };
      const list = map.get(variantId) ?? [];
      list.push(entry);
      map.set(variantId, list);
    }
  }
  return map;
}

function describeOrderMatches(matches: TiendanubeOrderMatch[], delta: number) {
  if (matches.length === 0) return null;
  const totalQuantity = matches.reduce((total, match) => total + Number(match.quantity ?? 0), 0);
  const refs = matches.slice(0, 3).map((match) => `#${match.number}`).join(", ");
  const suffix = matches.length > 3 ? ` y ${matches.length - 3} más` : "";
  return `Venta/s Tiendanube ${refs}${suffix}: ${totalQuantity} unidad/es vendida/s. Diferencia de stock: ${Math.abs(delta)} u.`;
}

function buildSyncPreviewSignature(cambios: TiendanubeSyncChange[]) {
  return cambios
    .map((cambio) => [
      cambio.id,
      cambio.type,
      cambio.tnProductId,
      cambio.tnVariantId ?? "",
      cambio.localStock ?? "",
      cambio.remoteStock ?? "",
      cambio.localPrice ?? "",
      cambio.remotePrice ?? "",
      (cambio.orderMatches ?? []).map((order) => `${order.id}:${order.quantity}`).join("|"),
    ].join(":"))
    .sort()
    .join(";");
}

export async function revisarCambiosTiendanube(
  onProgress: (msg: string) => void,
  options: { updatedAtMin?: string | null; webhookEvents?: TiendanubeWebhookBridgeEvent[] } = {},
): Promise<TiendanubeSyncPreview> {
  const creds = getTiendanubeCredentials();
  if (!creds) throw new Error("No hay credenciales activas.");

  onProgress("Validando conexión con Tiendanube...");
  const connection = await validateTiendanubeConnection();
  if (!connection.ok) throw new Error(connection.message);

  onProgress("Descargando categorías de Tiendanube...");
  const catMap = await importarCategorias(creds);

  onProgress("Descargando productos de Tiendanube para revisar cambios...");
  const query: Record<string, string> = {};
  const webhookDates = (options.webhookEvents ?? [])
    .map((event) => Date.parse(event.receivedAt))
    .filter((time) => Number.isFinite(time));
  const earliestWebhookDate = webhookDates.length > 0
    ? new Date(Math.min(...webhookDates) - 5 * 60 * 1000).toISOString()
    : null;
  const updatedAtMin = earliestWebhookDate ?? options.updatedAtMin;
  if (updatedAtMin) query.updated_at_min = updatedAtMin;
  const productosTn = await tnGetPaginated<TNProduct>(creds, "products", query);

  const ordenes = await obtenerOrdenesRecientesTiendanube(creds, onProgress, updatedAtMin);
  const productosById = new Map(productosTn.map((product) => [product.id, product]));
  const orderProductIds = new Set<number>();
  for (const order of ordenes) {
    if (order.status === "cancelled" || order.payment_status === "voided" || order.payment_status === "refunded") continue;
    for (const product of order.products ?? []) {
      const productId = Number(product.product_id);
      if (Number.isFinite(productId) && !productosById.has(productId)) orderProductIds.add(productId);
    }
  }
  for (const productId of orderProductIds) {
    try {
      const product = await tnGetOne<TNProduct>(creds, `products/${productId}`);
      productosById.set(product.id, product);
    } catch (error) {
      onProgress(`Aviso: no se pudo leer producto ${productId} asociado a una venta (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  const productos = await Promise.all(Array.from(productosById.values()).map((prod) => normalizarProducto(creds, prod, catMap, onProgress, { generateMissingSku: false })));
  const orderMatchesByVariant = buildOrderMatchesByVariant(ordenes);

  onProgress("Comparando Tiendanube contra la base local...");
  const catalogo = await getCatalogoProductos();
  const { byProduct, byVariant } = buildLocalIndexes(catalogo);
  const cambios: TiendanubeSyncChange[] = [];

  for (const producto of productos) {
    const localProductRows = byProduct.get(producto.tnProductId) ?? [];
    const existingProduct = localProductRows[0];

    if (!existingProduct) {
      const unidades = producto.variantes.reduce((total, variante) => total + Number(variante.stock ?? 0), 0);
      cambios.push({
        id: `producto-${producto.tnProductId}`,
        type: "PRODUCTO_NUEVO",
        producto: producto.nombre,
        variante: producto.variantes.length > 1 ? `${producto.variantes.length} variantes` : variantDisplay(producto.variantes[0]?.variante),
        detalle: `Producto existe en Tiendanube y no está en el programa. Stock total: ${unidades} u.`,
        accion: "Crear producto local con sus variantes",
        tnProductId: producto.tnProductId,
        tnVariantId: null,
        inventarioId: null,
        localStock: null,
        remoteStock: unidades,
        stockDelta: null,
        localPrice: null,
        remotePrice: producto.variantes[0]?.precioVenta ?? null,
      });
      continue;
    }

    const metadataChanged =
      normalizeText(existingProduct.nombre) !== normalizeText(producto.nombre) ||
      normalizeText(existingProduct.descripcion) !== normalizeText(producto.descripcion) ||
      normalizeText(existingProduct.marca) !== normalizeText(producto.marca) ||
      normalizeText(existingProduct.categoria) !== normalizeText(producto.categoriaNombre) ||
      Boolean(existingProduct.publicado) !== producto.publicado;

    if (metadataChanged) {
      cambios.push({
        id: `datos-${producto.tnProductId}`,
        type: "DATOS",
        producto: producto.nombre,
        variante: null,
        detalle: "Nombre, descripción, marca, categoría o visibilidad difieren entre Tiendanube y el programa.",
        accion: "Actualizar datos locales del producto",
        tnProductId: producto.tnProductId,
        tnVariantId: null,
        inventarioId: existingProduct.inventarioId,
        localStock: null,
        remoteStock: null,
        stockDelta: null,
        localPrice: null,
        remotePrice: null,
      });
    }

    for (const variante of producto.variantes) {
      const localVariant = byVariant.get(variante.tnVariantId);
      if (!localVariant) {
        cambios.push({
          id: `variante-${producto.tnProductId}-${variante.tnVariantId}`,
          type: "VARIANTE_NUEVA",
          producto: producto.nombre,
          variante: variantDisplay(variante.variante),
          detalle: `Variante existe en Tiendanube y no está en el programa. Stock: ${variante.stock} u.`,
          accion: "Crear variante local",
          tnProductId: producto.tnProductId,
          tnVariantId: variante.tnVariantId,
          inventarioId: null,
          localStock: null,
          remoteStock: variante.stock,
          stockDelta: null,
          localPrice: null,
          remotePrice: variante.precioVenta,
        });
        continue;
      }

      const localStock = Number(localVariant.stockActual ?? 0);
      const remoteStock = Number(variante.stock ?? 0);
      if (localStock !== remoteStock) {
        const delta = remoteStock - localStock;
        const orderMatches = delta < 0 ? (orderMatchesByVariant.get(variante.tnVariantId) ?? []) : [];
        const orderDetail = describeOrderMatches(orderMatches, delta);
        cambios.push({
          id: `${orderMatches.length > 0 ? "venta" : "stock"}-${producto.tnProductId}-${variante.tnVariantId}`,
          type: orderMatches.length > 0 ? "VENTA_TN" : "STOCK",
          producto: producto.nombre,
          variante: variantDisplay(variante.variante),
          detalle: orderDetail ?? (delta < 0
            ? `Tiendanube tiene ${Math.abs(delta)} unidad/es menos. Posible venta o ajuste hecho en la tienda online.`
            : `Tiendanube tiene ${delta} unidad/es más. Posible reposición o ajuste hecho en la tienda online.`),
          accion: orderMatches.length > 0 ? "Registrar stock actualizado por venta Tiendanube" : "Tomar stock de Tiendanube en el programa",
          tnProductId: producto.tnProductId,
          tnVariantId: variante.tnVariantId,
          inventarioId: localVariant.inventarioId,
          localStock,
          remoteStock,
          stockDelta: delta,
          localPrice: moneyValue(localVariant.precioVenta),
          remotePrice: moneyValue(variante.precioVenta),
          orderMatches,
        });
      }

      const localPrice = moneyValue(localVariant.precioVenta);
      const remotePrice = moneyValue(variante.precioVenta);
      if (localPrice !== remotePrice) {
        cambios.push({
          id: `precio-${producto.tnProductId}-${variante.tnVariantId}`,
          type: "PRECIO",
          producto: producto.nombre,
          variante: variantDisplay(variante.variante),
          detalle: `Precio local $${localPrice.toLocaleString("es-AR")} y Tiendanube $${remotePrice.toLocaleString("es-AR")}.`,
          accion: "Tomar precio de Tiendanube en el programa",
          tnProductId: producto.tnProductId,
          tnVariantId: variante.tnVariantId,
          inventarioId: localVariant.inventarioId,
          localStock: localStock,
          remoteStock: remoteStock,
          stockDelta: null,
          localPrice,
          remotePrice,
        });
      }
    }
  }

  return {
    cambios,
    productos,
    fetchedAt: new Date().toISOString(),
    signature: buildSyncPreviewSignature(cambios),
    webhookEventKeys: (options.webhookEvents ?? []).map((event) => event.key),
  };
}

export async function aplicarCambiosSeleccionadosTiendanube(
  preview: TiendanubeSyncPreview,
  selectedIds: string[],
  onProgress: (msg: string) => void,
): Promise<{ aplicados: number; errores: number }> {
  const selected = new Set(selectedIds);
  if (selected.size === 0) throw new Error("Selecciona al menos un cambio para aplicar.");

  const productosById = new Map(preview.productos.map((producto) => [producto.tnProductId, producto]));
  const productLevelIds = new Set<number>();
  for (const cambio of preview.cambios) {
    if (!selected.has(cambio.id)) continue;
    if (cambio.type === "PRODUCTO_NUEVO" || cambio.type === "VARIANTE_NUEVA" || cambio.type === "DATOS") {
      productLevelIds.add(cambio.tnProductId);
    }
  }

  let aplicados = 0;
  let errores = 0;

  for (const tnProductId of productLevelIds) {
    const producto = productosById.get(tnProductId);
    if (!producto) continue;
    try {
      onProgress(`Aplicando producto "${producto.nombre}" desde Tiendanube...`);
      await upsertProductoDesdeTiendanube(producto);
      aplicados++;
    } catch (error) {
      console.warn("Error aplicando producto Tiendanube", tnProductId, error);
      errores++;
    }
  }

  for (const cambio of preview.cambios) {
    if (!selected.has(cambio.id) || productLevelIds.has(cambio.tnProductId)) continue;
    try {
      if ((cambio.type === "STOCK" || cambio.type === "VENTA_TN") && cambio.inventarioId != null && cambio.tnVariantId != null && cambio.remoteStock != null) {
        onProgress(`Aplicando stock de "${cambio.producto}" (${variantDisplay(cambio.variante)})...`);
        await aplicarStockDesdeTiendanube({
          inventarioId: cambio.inventarioId,
          tnProductId: cambio.tnProductId,
          tnVariantId: cambio.tnVariantId,
          stock: cambio.remoteStock,
        });
        aplicados++;
      }
      if (cambio.type === "PRECIO" && cambio.inventarioId != null && cambio.remotePrice != null) {
        onProgress(`Aplicando precio de "${cambio.producto}" (${variantDisplay(cambio.variante)})...`);
        await aplicarPrecioDesdeTiendanube({ inventarioId: cambio.inventarioId, precioVenta: cambio.remotePrice });
        aplicados++;
      }
    } catch (error) {
      console.warn("Error aplicando cambio Tiendanube", cambio.id, error);
      errores++;
    }
  }

  const nowIso = new Date().toISOString();
  localStorage.setItem(SYNC_SINCE_KEY, nowIso);
  localStorage.setItem(AUTO_CHECK_SINCE_KEY, nowIso);
  localStorage.setItem(SYNC_STATUS_KEY, new Date().toLocaleString());
  onProgress(`Sincronización aplicada: ${aplicados} cambio/s, ${errores} error/es.`);
  return { aplicados, errores };
}
export async function importarDesdeTiendanube(
  onProgress: (msg: string) => void,
  options: { updatedAtMin?: string | null; webhookEvents?: TiendanubeWebhookBridgeEvent[] } = {},
): Promise<{ procesados: number; errores: number }> {
  const creds = getTiendanubeCredentials();
  if (!creds) throw new Error("No hay credenciales activas.");

  onProgress("Descargando categorías de Tiendanube...");
  const catMap = await importarCategorias(creds);

  onProgress("Descargando productos de Tiendanube...");
  const query: Record<string, string> = {};
  if (options.updatedAtMin) query.updated_at_min = options.updatedAtMin;
  const productos = await tnGetPaginated<TNProduct>(creds, "products", query);

  let procesados = 0;
  let errores = 0;
  for (const prod of productos) {
    try {
      const upsert = await normalizarProducto(creds, prod, catMap, onProgress);
      onProgress(`Importando "${upsert.nombre}" (${upsert.variantes.length} variante/s)...`);
      await upsertProductoDesdeTiendanube(upsert);
      procesados++;
    } catch (e) {
      console.warn("Error importando producto", prod?.id, e);
      errores++;
    }
  }

  const nowIso = new Date().toISOString();
  localStorage.setItem(SYNC_SINCE_KEY, nowIso);
  localStorage.setItem(SYNC_STATUS_KEY, new Date().toLocaleString());
  onProgress(`Importación completa: ${procesados} producto/s procesado/s, ${errores} con error.`);
  return { procesados, errores };
}

export function buildTiendanubeProductPayload(item: Pick<CatalogoItem, "nombre" | "descripcion" | "marca" | "tags" | "publicado" | "seoTitulo" | "seoDescripcion" | "precioVenta" | "stockActual" | "sku" | "codigoBarras">) {
  return {
    name: item.nombre,
    description: item.descripcion ?? "",
    brand: item.marca ?? "",
    tags: item.tags ?? "",
    published: item.publicado !== 0,
    seo_title: item.seoTitulo ?? "",
    seo_description: item.seoDescripcion ?? "",
    price: item.precioVenta ?? 0,
    stock: item.stockActual ?? 0,
    sku: item.sku ?? null,
    barcode: item.codigoBarras ?? null,
  };
}

function findCategoryIdInTree(nodes: Awaited<ReturnType<typeof getCategoriasArbol>>, pathSegments: string[], parentPath: string[] = []): number | null {
  for (const node of nodes) {
    const nodePath = [...parentPath, node.nombre];
    const normalizedNodePath = nodePath.map((segment) => segment.trim().toLowerCase());
    const normalizedTargetPath = pathSegments.map((segment) => segment.trim().toLowerCase());

    if (normalizedNodePath.length === normalizedTargetPath.length && normalizedNodePath.every((segment, index) => segment === normalizedTargetPath[index])) {
      return node.tnCategoryId ?? null;
    }

    const childMatch = findCategoryIdInTree(node.hijos, pathSegments, nodePath);
    if (childMatch != null) return childMatch;
  }

  return null;
}

function findCategoryIdByName(nodes: Awaited<ReturnType<typeof getCategoriasArbol>>, categoryName: string): number | null {
  const normalizedName = categoryName.trim().toLowerCase();
  for (const node of nodes) {
    if (node.nombre.trim().toLowerCase() === normalizedName && node.tnCategoryId != null) {
      return node.tnCategoryId;
    }

    const childMatch = findCategoryIdByName(node.hijos, categoryName);
    if (childMatch != null) return childMatch;
  }

  return null;
}

export async function resolveTiendanubeCategoryIds(item: Pick<CatalogoItem, "categoria" | "tnCategoryIds">): Promise<number[]> {
  if (item.tnCategoryIds && item.tnCategoryIds.length > 0) return item.tnCategoryIds;

  const categoria = item.categoria?.trim();
  if (!categoria) return [];

  const pathSegments = categoria.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (pathSegments.length === 0) return [];

  const tree = await getCategoriasArbol();
  const directMatch = findCategoryIdInTree(tree, pathSegments);
  if (directMatch != null) return [directMatch];

  const lastSegment = pathSegments[pathSegments.length - 1];
  const fallbackMatch = findCategoryIdByName(tree, lastSegment);
  return fallbackMatch != null ? [fallbackMatch] : [];
}

export function buildTiendanubeVariantPayload(item: Pick<CatalogoItem, "precioVenta" | "stockActual" | "sku" | "codigoBarras">) {
  return {
    price: String(item.precioVenta ?? 0),
    stock: item.stockActual ?? 0,
    sku: item.sku ?? null,
    barcode: item.codigoBarras ?? null,
  };
}

export function buildTiendanubeSyncFeedbackMessage({ isEditing, categoryAssigned }: { isEditing: boolean; categoryAssigned: boolean }) {
  if (categoryAssigned) {
    return isEditing
      ? "Cambios guardados correctamente y sincronizados con Tiendanube."
      : "Producto creado y sincronizado con Tiendanube.";
  }

  return isEditing
    ? "Cambios guardados localmente y subidos a Tiendanube, pero la categoría no pudo asignarse."
    : "Producto creado localmente y subido a Tiendanube, pero la categoría no pudo asignarse.";
}

export async function pushProductoATiendanube(item: CatalogoItem): Promise<{ categoryAssigned: boolean }> {
  const creds = getTiendanubeCredentials();
  if (!creds) return { categoryAssigned: false };

  const productBody = buildTiendanubeProductPayload(item);
  const existingTarget = await resolveTiendanubeProductTarget(creds, item);
  const tnProductId = existingTarget?.productId ?? item.tnProductId;
  const method = tnProductId ? "PUT" : "POST";
  const prodUrl = tnProductId
    ? `${API_BASE}/${creds.userId}/products/${tnProductId}`
    : `${API_BASE}/${creds.userId}/products`;

  const prodRes = await fetch(prodUrl, { method, headers: buildTnHeaders(creds), body: JSON.stringify(productBody) });
  if (!prodRes.ok) {
    const detail = await getErrorMessageFromResponse(prodRes, prodRes.statusText || "Error actualizando producto");
    throw new Error(`Error enviando producto a Tiendanube: ${detail}`);
  }

  const createdProduct = (await prodRes.json().catch(() => null)) as TNProduct | null;
  const resolvedProductId = await resolveCreatedProductId(creds, item, createdProduct, prodRes);
  const targetVariantId = existingTarget?.variantId ?? item.tnVariantId;

  let categoryAssigned = false;
  const tnCategoryIds = await resolveTiendanubeCategoryIds(item);
  if (tnCategoryIds.length > 0) {
    const catUrl = `${API_BASE}/${creds.userId}/products/${resolvedProductId}/categories`;
    const catBody = { categories: tnCategoryIds };
    const catRes = await fetch(catUrl, { method: "PUT", headers: buildTnHeaders(creds), body: JSON.stringify(catBody) });
    if (!catRes.ok) {
      const detail = await getErrorMessageFromResponse(catRes, catRes.statusText || "Error actualizando categorías");
      console.warn(`No se pudo asignar la categoría al producto ${item.nombre}: ${detail}`);
    } else {
      categoryAssigned = true;
    }
  }

  const variantBody = buildTiendanubeVariantPayload(item);
  const variantUrl = targetVariantId
    ? `${API_BASE}/${creds.userId}/products/${resolvedProductId}/variants/${targetVariantId}`
    : `${API_BASE}/${creds.userId}/products/${resolvedProductId}/variants`;
  const variantMethod = targetVariantId ? "PUT" : "POST";
  const varRes = await fetch(variantUrl, { method: variantMethod, headers: buildTnHeaders(creds), body: JSON.stringify(variantBody) });
  if (!varRes.ok) {
    const detail = await getErrorMessageFromResponse(varRes, varRes.statusText || "Error actualizando variante");
    throw new Error(`Error enviando variante a Tiendanube: ${detail}`);
  }

  const createdVariant = (await varRes.json().catch(() => null)) as { id?: number; variant_id?: number } | null;
  const tnVariantId = createdVariant?.id ?? createdVariant?.variant_id ?? item.tnVariantId;

  if (createdProduct?.updated_at || createdVariant) {
    await setTnUpdatedAt(resolvedProductId, createdProduct?.updated_at ?? null);
  }

  if (!item.tnProductId || !item.tnVariantId || item.tnProductId !== resolvedProductId || item.tnVariantId !== tnVariantId) {
    const catalogo = await getCatalogoProductos();
    const updatedItem = catalogo.find((c) => c.inventarioId === item.inventarioId) ?? item;
    if (updatedItem.tnProductId !== resolvedProductId || updatedItem.tnVariantId !== tnVariantId) {
      await updateLocalLinkAfterCreate(item.inventarioId, resolvedProductId, tnVariantId);
    }
  }

  return { categoryAssigned };
}

async function updateLocalLinkAfterCreate(inventarioId: number, tnProductId: number, tnVariantId: number | null | undefined) {
  const db = await (await import("@/database/db")).getDatabase();
  await db.execute(
    `UPDATE productos SET tn_product_id = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = (SELECT producto_id FROM inventario WHERE id = $2)`,
    [tnProductId, inventarioId],
  );
  await db.execute(
    `UPDATE inventario SET tn_variant_id = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`,
    [tnVariantId ?? null, inventarioId],
  );
}

export async function pushInventarioIdATiendanube(inventarioId: number): Promise<{ categoryAssigned: boolean }> {
  const catalogo = await getCatalogoProductos();
  const item = catalogo.find((c) => c.inventarioId === inventarioId);
  if (item) {
    return pushProductoATiendanube(item);
  }
  return { categoryAssigned: false };
}

export async function runIncrementalSync(onProgress: (msg: string) => void): Promise<{ procesados: number; errores: number; signature: string }> {
  const bridge = await fetchTiendanubeWebhookEvents(onProgress);
  const webhookEvents = bridge.ok ? bridge.events : undefined;

  // Algunos cambios manuales de stock en Tiendanube no disparan webhook de producto
  // ni actualizan siempre el filtro updated_at_min. Para no perder esos casos, el
  // chequeo automatico compara el catalogo completo igual que el boton manual.
  const preview = await revisarCambiosTiendanube(onProgress, { webhookEvents });
  localStorage.setItem(AUTO_CHECK_SINCE_KEY, preview.fetchedAt);
  return { procesados: preview.cambios.length, errores: 0, signature: preview.signature || `checked-${preview.fetchedAt}` };
}
