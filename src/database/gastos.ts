import { getDatabase } from "@/database/db";
import type { GastoDetalle, GastoRegistro } from "@/types";

const LEGACY_STORAGE_KEY = "soft_inventario_gastos";

interface GastoRow {
  id: string;
  nombre: string;
  fecha: string;
  descripcion: string | null;
  itemsJson: string;
  total: number;
  creadoEn: string;
}

function validItem(value: unknown): value is GastoDetalle {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GastoDetalle>;
  return typeof item.id === "string" && typeof item.concepto === "string" && typeof item.valor === "number" && Number.isFinite(item.valor);
}

function validGasto(value: unknown): value is GastoRegistro {
  if (!value || typeof value !== "object") return false;
  const gasto = value as Partial<GastoRegistro>;
  return typeof gasto.id === "string" && typeof gasto.nombre === "string" && typeof gasto.fecha === "string"
    && (gasto.descripcion === undefined || typeof gasto.descripcion === "string")
    && Array.isArray(gasto.items) && gasto.items.every(validItem)
    && typeof gasto.total === "number" && Number.isFinite(gasto.total)
    && typeof gasto.creadoEn === "string";
}

function readLegacyGastos(): GastoRegistro[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(validGasto)) return parsed;
  } catch {
    // El dato original se conserva para poder recuperarlo manualmente.
  }
  throw new Error("Los gastos anteriores no tienen un formato válido. Se conservó el dato original sin importarlo.");
}

function migrationOrigin(): string {
  if (typeof window === "undefined") return "sin-ventana";
  return window.location.origin === "null"
    ? `${window.location.protocol}//${window.location.host}`
    : window.location.origin;
}

let migrationPromise: Promise<void> | null = null;

export function ensureLegacyGastosMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const db = await getDatabase();
      const origin = migrationOrigin();
      const marker = await db.select<{ origen: string }[]>("SELECT origen FROM gastos_migracion WHERE origen = $1", [origin]);
      if (marker.length > 0) return;

      const legacyGastos = readLegacyGastos();
      if (legacyGastos.length === 0) return;
      for (const gasto of legacyGastos) {
        await db.execute(
          `INSERT OR IGNORE INTO gastos (id, nombre, fecha, descripcion, items_json, total, creado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [gasto.id, gasto.nombre, gasto.fecha, gasto.descripcion ?? null, JSON.stringify(gasto.items), gasto.total, gasto.creadoEn],
        );
      }
      await db.execute("INSERT OR IGNORE INTO gastos_migracion (origen) VALUES ($1)", [origin]);
    })().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

export async function getGastos(): Promise<GastoRegistro[]> {
  await ensureLegacyGastosMigrated();
  const db = await getDatabase();
  const rows = await db.select<GastoRow[]>(
    `SELECT id, nombre, fecha, descripcion, items_json AS itemsJson, total, creado_en AS creadoEn
     FROM gastos ORDER BY fecha DESC, creado_en DESC`,
  );
  return rows.map((row) => {
    const items: unknown = JSON.parse(row.itemsJson);
    const gasto = {
      id: row.id,
      nombre: row.nombre,
      fecha: row.fecha,
      descripcion: row.descripcion ?? undefined,
      items,
      total: Number(row.total),
      creadoEn: row.creadoEn,
    };
    if (!validGasto(gasto)) throw new Error(`El gasto ${row.id} contiene datos inválidos en el respaldo.`);
    return gasto;
  });
}

export async function saveGasto(gasto: GastoRegistro): Promise<void> {
  await ensureLegacyGastosMigrated();
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO gastos (id, nombre, fecha, descripcion, items_json, total, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET
       nombre = excluded.nombre,
       fecha = excluded.fecha,
       descripcion = excluded.descripcion,
       items_json = excluded.items_json,
       total = excluded.total`,
    [gasto.id, gasto.nombre, gasto.fecha, gasto.descripcion ?? null, JSON.stringify(gasto.items), gasto.total, gasto.creadoEn],
  );
}

export async function deleteGasto(id: string): Promise<void> {
  await ensureLegacyGastosMigrated();
  const db = await getDatabase();
  await db.execute("DELETE FROM gastos WHERE id = $1", [id]);
}
