import type { CatalogoItem, TiendanubeSyncStatus } from "@/types";
import {
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
const POLL_ENABLED_KEY = "tiendanube_poll_enabled";
const POLL_INTERVAL_KEY = "tiendanube_poll_interval";
const API_BASE = "https://api.tiendanube.com/v1";
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

  return {
    connected: true,
    lastSync,
    message: "Conectado y listo para sincronizar stock cruzando SKU o Código de barras.",
  };
}

// Función auxiliar para buscar y actualizar en la API de Tiendanube por ID
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
    if (!sku) {
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

export async function importarDesdeTiendanube(
  onProgress: (msg: string) => void,
  options: { updatedAtMin?: string | null } = {},
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

export async function runIncrementalSync(onProgress: (msg: string) => void): Promise<{ procesados: number; errores: number }> {
  const since = localStorage.getItem(SYNC_SINCE_KEY);
  return importarDesdeTiendanube(onProgress, { updatedAtMin: since });
}