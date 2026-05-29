import Database from "@tauri-apps/plugin-sql";

import schemaSql from "@/database/schema.sql?raw";

const DATABASE_URL = "sqlite:inventario_v4.db";
const SCHEMA_VERSION = 2;

let databasePromise: Promise<Database> | null = null;

interface CountRow {
  total: number;
}

interface TableInfoRow {
  name: string;
}

function getSchemaStatements() {
  return schemaSql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

async function executeStatements(db: Database, statements: string[]) {
  for (const statement of statements) {
    await db.execute(statement);
  }
}

async function tableExists(db: Database, tableName: string) {
  const rows = await db.select<CountRow[]>(
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = $1",
    [tableName],
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function getTableColumns(db: Database, tableName: string) {
  if (!(await tableExists(db, tableName))) {
    return [];
  }

  const rows = await db.select<TableInfoRow[]>(`PRAGMA table_info(${tableName})`);
  return rows.map((row) => row.name);
}

async function ensureEmpresaConfigRow(db: Database) {
  await db.execute(
    `INSERT OR IGNORE INTO configuracion_empresa (
        id,
        nombre_empresa,
        logo_path_local,
        moneda
      ) VALUES (1, NULL, NULL, 'ARS')`,
  );
}

async function needsLegacyMigration(db: Database) {
  const [productoColumns, inventarioColumns] = await Promise.all([
    getTableColumns(db, "productos"),
    getTableColumns(db, "inventario"),
  ]);

  return productoColumns.includes("sku") || inventarioColumns.includes("cantidad_actual");
}

async function migrateLegacySchema(db: Database) {
  await db.execute("PRAGMA foreign_keys = OFF");
  await db.execute("BEGIN IMMEDIATE TRANSACTION");

  try {
    if (await tableExists(db, "movimientos_stock")) {
      await db.execute("ALTER TABLE movimientos_stock RENAME TO movimientos_stock_legacy");
    }

    if (await tableExists(db, "inventario")) {
      await db.execute("ALTER TABLE inventario RENAME TO inventario_legacy");
    }

    if (await tableExists(db, "productos")) {
      await db.execute("ALTER TABLE productos RENAME TO productos_legacy");
    }

    await executeStatements(db, getSchemaStatements());

    await db.execute(
      `INSERT INTO productos (
          id,
          nombre,
          descripcion,
          categoria,
          marca,
          notas,
          imagen_path_local,
          creado_en,
          actualizado_en
        )
        SELECT
          id,
          nombre,
          descripcion,
          categoria,
          marca,
          NULL,
          NULL,
          creado_en,
          creado_en
        FROM productos_legacy`,
    );

    await db.execute(
      `INSERT INTO inventario (
          id,
          producto_id,
          variante,
          capacidad_medida,
          codigo_barras,
          sku,
          precio_compra,
          precio_venta,
          stock_actual,
          stock_minimo,
          ubicacion,
          lote,
          vencimiento,
          estado,
          creado_en,
          actualizado_en
        )
        SELECT
          i.id,
          i.producto_id,
          'Presentación principal',
          NULL,
          p.codigo_barras,
          p.sku,
          COALESCE(p.precio_compra, 0),
          COALESCE(p.precio_venta, 0),
          COALESCE(i.cantidad_actual, 0),
          COALESCE(i.stock_minimo, 0),
          i.ubicacion,
          NULL,
          NULL,
          'ACTIVO',
          COALESCE(i.ultima_actualizacion, CURRENT_TIMESTAMP),
          COALESCE(i.ultima_actualizacion, CURRENT_TIMESTAMP)
        FROM inventario_legacy i
        INNER JOIN productos_legacy p ON p.id = i.producto_id`,
    );

    if (await tableExists(db, "movimientos_stock_legacy")) {
      await db.execute(
        `INSERT INTO movimientos_stock (
            id,
            inventario_id,
            tipo_movimiento,
            cantidad,
            stock_resultante,
            fecha_movimiento,
            motivo,
            referencia
          )
          SELECT
            id,
            inventario_id,
            tipo_movimiento,
            cantidad,
            NULL,
            fecha_movimiento,
            motivo,
            NULL
          FROM movimientos_stock_legacy`,
      );
    }

    await ensureEmpresaConfigRow(db);
    await db.execute("DROP TABLE IF EXISTS movimientos_stock_legacy");
    await db.execute("DROP TABLE IF EXISTS inventario_legacy");
    await db.execute("DROP TABLE IF EXISTS productos_legacy");
    await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  } finally {
    await db.execute("PRAGMA foreign_keys = ON");
  }
}

async function initializeSchema(db: Database) {
  // Optimizaciones de concurrencia y rendimiento
  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA busy_timeout = 5000");
  await db.execute("PRAGMA foreign_keys = ON");
  await db.execute("PRAGMA synchronous = NORMAL");

  if (await needsLegacyMigration(db)) {
    await migrateLegacySchema(db);
  }

  await executeStatements(db, getSchemaStatements());
  await ensureEmpresaConfigRow(db);
  await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export interface SafeDatabase {
  execute(query: string, values?: any[]): Promise<{ lastInsertId?: number; rowsAffected: number }>;
  select<T>(query: string, values?: any[]): Promise<T>;
}

let dbQueue = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const next = dbQueue.then(op);
  dbQueue = next.catch(() => {
    // Registramos el error de la operación individual pero permitimos que la cola continúe
    return undefined as any; 
  });
  return next;
}

export async function getDatabase(): Promise<SafeDatabase> {
  if (!databasePromise) {
    console.log("[DB] Iniciando conexión a la base de datos...");
    databasePromise = Database.load(DATABASE_URL)
      .then(async (db) => {
        console.log("[DB] Conexión establecida. Inicializando esquema...");
        await initializeSchema(db);
        console.log("[DB] Esquema inicializado correctamente.");
        return db;
      })
      .catch((error) => {
        console.error("[DB] Error fatal al cargar la base de datos:", error);
        databasePromise = null;
        throw error;
      });
  }

  const db = await databasePromise;
  
  // Retornamos un envoltorio que encola todas las operaciones
  return {
    execute: (query, values) => enqueue(() => db.execute(query, values)),
    select: (query, values) => enqueue(() => db.select(query, values)),
  };
}

export async function pingDatabase() {
  const db = await getDatabase();
  const result = await db.select<{ ok: number }[]>("SELECT 1 AS ok");
  return result[0]?.ok === 1;
}

export { DATABASE_URL };