import type { TiendanubeSyncStatus } from "@/types";
import { getCatalogoProductos } from "@/database/queries";
import { fetch } from "@tauri-apps/plugin-http";

const CREDENTIALS_KEY = "tiendanube_credentials";
const SYNC_STATUS_KEY = "tiendanube_last_sync";

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

// Función auxiliar para buscar y actualizar en la API de Tiendanube
async function findAndUpdateVariant(creds: TiendanubeCredentials, sku: string, stock: number) {
  // 1. Buscar variante por SKU
  const searchUrl = `https://api.tiendanube.com/v1/${creds.userId}/variants?sku=${encodeURIComponent(sku)}`;
  
  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    headers: {
      "Authentication": `bearer ${creds.accessToken}`,
      "User-Agent": "InventarioOffline (contacto@empresa.com)",
      "Content-Type": "application/json"
    }
  });

  if (!searchResponse.ok) {
    throw new Error(`Error buscando SKU ${sku}: ${searchResponse.statusText}`);
  }

  const variants = await searchResponse.json();
  if (variants.length === 0) {
    return false; // No se encontró en Tiendanube
  }

  const variant = variants[0];
  const variantId = variant.id;
  const productId = variant.product_id;

  // 2. Actualizar stock
  const updateUrl = `https://api.tiendanube.com/v1/${creds.userId}/products/${productId}/variants/${variantId}`;
  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      "Authentication": `bearer ${creds.accessToken}`,
      "User-Agent": "InventarioOffline (contacto@empresa.com)",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ stock })
  });

  if (!updateResponse.ok) {
    throw new Error(`Error actualizando SKU ${sku}: ${updateResponse.statusText}`);
  }

  return true;
}

export async function syncStockWithTiendanube(onProgress: (msg: string) => void): Promise<void> {
  const creds = getTiendanubeCredentials();
  if (!creds) throw new Error("No hay credenciales activas.");

  onProgress("Leyendo base de datos local...");
  const catalogo = await getCatalogoProductos();
  
  // Filtramos los que tienen SKU o código de barras, porque necesitamos un identificador para cruzar
  const variantesSincronizables = catalogo.filter(c => c.sku || c.codigoBarras);
  
  if (variantesSincronizables.length === 0) {
    throw new Error("No hay productos con SKU o Código de barras para sincronizar.");
  }

  let sincronizados = 0;
  let errores = 0;

  for (const item of variantesSincronizables) {
    const identificador = item.sku || item.codigoBarras;
    if (!identificador) continue;

    try {
      onProgress(`Sincronizando SKU ${identificador} (${item.nombre})...`);
      const success = await findAndUpdateVariant(creds, identificador, item.stockActual);
      if (success) {
        sincronizados++;
      } else {
        // No se encontró en TN
      }
    } catch (e) {
      console.warn("Fallo sincronizando", identificador, e);
      errores++;
    }
  }

  const finishDate = new Date().toLocaleString();
  localStorage.setItem(SYNC_STATUS_KEY, finishDate);

  onProgress(`Completado. ${sincronizados} actualizados, ${errores} errores. Las variantes sin SKU matching en Tiendanube fueron ignoradas.`);
}