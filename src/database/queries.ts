import { getDatabase } from "@/database/db";
import type {
  CatalogoFilterOptions,
  CatalogoFilters,
  CatalogoItem,
  ConfiguracionEmpresa,
  ConfiguracionEmpresaDraft,
  DashboardStats,
  EstadoInventario,
  InventarioMovimientoOption,
  MovimientosFilters,
  MovimientoListado,
  MovimientoStockDraft,
  MovimientoTemplate,
  MovimientoTemplateDraft,
  ProductoDetalle,
  ProductoDraft,
  StockAlert,
} from "@/types";

async function getCount(query: string) {
  const db = await getDatabase();
  const rows = await db.select<{ total: number | null }[]>(query);
  return Number(rows[0]?.total ?? 0);
}

function normalizeOptionalText(value?: string) {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue ? normalizedValue : null;
}

interface InventarioStockRow {
  inventarioId: number;
  stockActual: number;
}

interface InventarioDeleteCheckRow {
  inventarioId: number;
  productoId: number;
  stockActual: number;
  totalMovimientos: number;
}

export async function getDashboardOverview(): Promise<DashboardStats> {
  const [
    totalProductos,
    totalVariantes,
    stockTotal,
    variantesBajoStock,
    movimientosHoy,
    totalInvertido,
  ] =
    await Promise.all([
      getCount("SELECT COUNT(*) AS total FROM productos"),
      getCount("SELECT COUNT(*) AS total FROM inventario"),
      getCount("SELECT COALESCE(SUM(stock_actual), 0) AS total FROM inventario"),
      getCount(
        "SELECT COUNT(*) AS total FROM inventario WHERE stock_actual <= stock_minimo",
      ),
      getCount(
        "SELECT COUNT(*) AS total FROM movimientos_stock WHERE DATE(fecha_movimiento) = DATE('now', 'localtime')",
      ),
      getCount(
        "SELECT COALESCE(SUM(stock_actual * precio_compra), 0) AS total FROM inventario",
      ),
    ]);

  return {
    totalProductos,
    totalVariantes,
    stockTotal,
    variantesBajoStock,
    movimientosHoy,
    totalInvertido,
  };
}

export async function getLowStockAlerts(limit = 6): Promise<StockAlert[]> {
  const db = await getDatabase();
  return db.select<StockAlert[]>(
    `SELECT
        i.id AS inventarioId,
        p.id AS productoId,
        p.nombre AS nombre,
        p.marca AS marca,
        i.variante AS variante,
        i.capacidad_medida AS capacidadMedida,
        i.sku AS sku,
        i.codigo_barras AS codigoBarras,
        i.stock_actual AS stockActual,
        i.stock_minimo AS stockMinimo
      FROM inventario i
      INNER JOIN productos p ON p.id = i.producto_id
      WHERE i.stock_actual <= i.stock_minimo
      ORDER BY i.stock_actual ASC, p.nombre ASC
      LIMIT $1`,
    [limit],
  );
}

export async function getCatalogoFilterOptions(): Promise<CatalogoFilterOptions> {
  const db = await getDatabase();

  const [categorias, marcas] = await Promise.all([
    db.select<{ value: string | null }[]>(
      `SELECT DISTINCT categoria AS value FROM productos
       WHERE categoria IS NOT NULL AND TRIM(categoria) <> ''
       ORDER BY categoria ASC`,
    ),
    db.select<{ value: string | null }[]>(
      `SELECT DISTINCT marca AS value FROM productos
       WHERE marca IS NOT NULL AND TRIM(marca) <> ''
       ORDER BY marca ASC`,
    ),
  ]);

  return {
    categorias: categorias.map((row) => row.value).filter((value): value is string => Boolean(value)),
    marcas: marcas.map((row) => row.value).filter((value): value is string => Boolean(value)),
  };
}

export async function getCatalogoProductos(filters: CatalogoFilters = {}): Promise<CatalogoItem[]> {
  const db = await getDatabase();
  const whereClauses: string[] = [];
  const bindValues: unknown[] = [];

  if (filters.search?.trim()) {
    bindValues.push(`%${filters.search.trim()}%`);
    const index = bindValues.length;
    whereClauses.push(
      `(p.nombre LIKE $${index} OR p.marca LIKE $${index} OR p.categoria LIKE $${index} OR i.codigo_barras LIKE $${index} OR i.sku LIKE $${index} OR i.variante LIKE $${index})`,
    );
  }

  if (filters.categoria?.trim()) {
    bindValues.push(filters.categoria.trim());
    whereClauses.push(`p.categoria = $${bindValues.length}`);
  }

  if (filters.marca?.trim()) {
    bindValues.push(filters.marca.trim());
    whereClauses.push(`p.marca = $${bindValues.length}`);
  }

  if (filters.estado?.trim() && filters.estado !== "TODOS") {
    bindValues.push(filters.estado.trim());
    whereClauses.push(`i.estado = $${bindValues.length}`);
  }

  if (filters.soloBajoStock) {
    whereClauses.push("COALESCE(i.stock_actual, 0) <= COALESCE(i.stock_minimo, 0)");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  return db.select<CatalogoItem[]>(
    `SELECT
        i.id AS inventarioId,
        p.id AS productoId,
        p.nombre AS nombre,
        p.descripcion AS descripcion,
        p.categoria AS categoria,
        p.marca AS marca,
        p.notas AS notas,
        p.imagen_path_local AS imagenPathLocal,
        i.variante AS variante,
        i.capacidad_medida AS capacidadMedida,
        i.sku AS sku,
        i.codigo_barras AS codigoBarras,
        COALESCE(i.stock_actual, 0) AS stockActual,
        COALESCE(i.stock_minimo, 0) AS stockMinimo,
        COALESCE(i.precio_compra, 0) AS precioCompra,
        COALESCE(i.precio_venta, 0) AS precioVenta,
        i.ubicacion AS ubicacion,
        i.lote AS lote,
        i.vencimiento AS vencimiento,
        i.estado AS estado
      FROM inventario i
      INNER JOIN productos p ON p.id = i.producto_id
      ${whereSql}
      ORDER BY p.nombre ASC, i.capacidad_medida ASC, i.variante ASC`,
    bindValues,
  );
}

export async function getProductoByInventarioId(inventarioId: number): Promise<ProductoDetalle | null> {
  const db = await getDatabase();
  const rows = await db.select<ProductoDetalle[]>(
    `SELECT
        i.id AS inventarioId,
        p.id AS productoId,
        p.nombre AS nombre,
        p.descripcion AS descripcion,
        p.categoria AS categoria,
        p.marca AS marca,
        p.notas AS notas,
        p.imagen_path_local AS imagenPathLocal,
        i.variante AS variante,
        i.capacidad_medida AS capacidadMedida,
        i.sku AS sku,
        i.codigo_barras AS codigoBarras,
        COALESCE(i.stock_actual, 0) AS stockActual,
        COALESCE(i.stock_minimo, 0) AS stockMinimo,
        COALESCE(i.precio_compra, 0) AS precioCompra,
        COALESCE(i.precio_venta, 0) AS precioVenta,
        i.ubicacion AS ubicacion,
        i.lote AS lote,
        i.vencimiento AS vencimiento,
        i.estado AS estado
      FROM inventario i
      INNER JOIN productos p ON p.id = i.producto_id
      WHERE i.id = $1
      LIMIT 1`,
    [inventarioId],
  );

  return rows[0] ?? null;
}

export async function getMovimientos(filters: MovimientosFilters = {}): Promise<MovimientoListado[]> {
  const db = await getDatabase();
  const whereClauses: string[] = [];
  const bindValues: unknown[] = [];

  if (filters.inventarioId && Number.isInteger(filters.inventarioId)) {
    bindValues.push(filters.inventarioId);
    whereClauses.push(`m.inventario_id = $${bindValues.length}`);
  }

  if (filters.tipoMovimiento) {
    bindValues.push(filters.tipoMovimiento);
    whereClauses.push(`m.tipo_movimiento = $${bindValues.length}`);
  }

  if (filters.search?.trim()) {
    bindValues.push(`%${filters.search.trim()}%`);
    const index = bindValues.length;
    whereClauses.push(
      `(p.nombre LIKE $${index} OR i.variante LIKE $${index} OR i.sku LIKE $${index} OR i.codigo_barras LIKE $${index} OR m.motivo LIKE $${index} OR m.referencia LIKE $${index})`,
    );
  }

  if (filters.fechaDesde?.trim()) {
    bindValues.push(filters.fechaDesde.trim());
    whereClauses.push(`DATE(m.fecha_movimiento) >= DATE($${bindValues.length})`);
  }

  if (filters.fechaHasta?.trim()) {
    bindValues.push(filters.fechaHasta.trim());
    whereClauses.push(`DATE(m.fecha_movimiento) <= DATE($${bindValues.length})`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  bindValues.push(Math.max(1, filters.limit ?? 20));
  const limitPlaceholder = `$${bindValues.length}`;
  let paginationSql = `LIMIT ${limitPlaceholder}`;

  if (typeof filters.offset === "number" && filters.offset > 0) {
    bindValues.push(Math.max(0, filters.offset));
    paginationSql += ` OFFSET $${bindValues.length}`;
  }

  return db.select<MovimientoListado[]>(
    `SELECT
        m.id AS id,
        m.inventario_id AS inventarioId,
        p.nombre AS producto,
        i.variante AS variante,
        m.tipo_movimiento AS tipoMovimiento,
        m.cantidad AS cantidad,
        m.stock_resultante AS stockResultante,
        m.motivo AS motivo,
        m.referencia AS referencia,
        m.fecha_movimiento AS fechaMovimiento
      FROM movimientos_stock m
      INNER JOIN inventario i ON i.id = m.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      ${whereSql}
      ORDER BY m.fecha_movimiento DESC
      ${paginationSql}`,
    bindValues,
  );
}

export async function getRecentMovimientos(limit = 10): Promise<MovimientoListado[]> {
  return getMovimientos({ limit });
}

export async function getMovimientosByInventarioId(
  inventarioId: number,
  limit = 50,
  offset = 0,
): Promise<MovimientoListado[]> {
  return getMovimientos({ inventarioId, limit, offset });
}

export async function getMovimientoTemplatesByInventarioId(inventarioId: number): Promise<MovimientoTemplate[]> {
  const db = await getDatabase();
  return db.select<MovimientoTemplate[]>(
    `SELECT
        id,
        inventario_id AS inventarioId,
        nombre,
        tipo_movimiento AS tipoMovimiento,
        cantidad,
        motivo,
        referencia,
        actualizado_en AS actualizadaEn
      FROM plantillas_movimientos
      WHERE inventario_id = $1
      ORDER BY actualizado_en DESC, id DESC`,
    [inventarioId],
  );
}

export async function getInventarioMovimientoOptions(): Promise<InventarioMovimientoOption[]> {
  const db = await getDatabase();
  return db.select<InventarioMovimientoOption[]>(
    `SELECT
        i.id AS inventarioId,
        p.nombre AS producto,
        i.variante AS variante,
        i.capacidad_medida AS capacidadMedida,
        i.sku AS sku,
        i.stock_actual AS stockActual,
        i.stock_minimo AS stockMinimo,
        i.estado AS estado
      FROM inventario i
      INNER JOIN productos p ON p.id = i.producto_id
      ORDER BY p.nombre ASC, i.capacidad_medida ASC, i.variante ASC`,
  );
}

export async function registrarMovimientoStock(payload: MovimientoStockDraft) {
  const db = await getDatabase();
  const cantidad = Number(payload.cantidad);

  if (!Number.isInteger(cantidad)) {
    throw new Error("La cantidad debe ser un número entero.");
  }

  if (payload.tipoMovimiento !== "AJUSTE" && cantidad <= 0) {
    throw new Error("La cantidad debe ser mayor a cero para entradas y salidas.");
  }

  if (payload.tipoMovimiento === "AJUSTE" && cantidad === 0) {
    throw new Error("El ajuste no puede ser cero.");
  }

  if (isNaN(cantidad)) {
    throw new Error("La cantidad no es un número válido.");
  }

  // Eliminamos BEGIN IMMEDIATE TRANSACTION porque tauri-plugin-sql usa un pool de conexiones
  // y las transacciones manuales a través de múltiples llamadas no son confiables.
  // La seguridad la proporciona el Mutex en db.ts.

  try {
    const rows = await db.select<InventarioStockRow[]>(
      `SELECT
          id AS inventarioId,
          stock_actual AS stockActual
        FROM inventario
        WHERE id = $1`,
      [payload.inventarioId],
    );

    const inventario = rows[0];

    if (!inventario) {
      throw new Error("La variante seleccionada no existe.");
    }

    const delta =
      payload.tipoMovimiento === "ENTRADA"
        ? cantidad
        : payload.tipoMovimiento === "SALIDA"
          ? -cantidad
          : cantidad;

    const stockResultante = Number(inventario.stockActual ?? 0) + delta;

    if (stockResultante < 0) {
      throw new Error(`La salida o ajuste de ${cantidad} dejaría el stock en negativo (Actual: ${inventario.stockActual}).`);
    }

    if (isNaN(stockResultante)) {
      throw new Error("Error en el cálculo de stock: resultado no válido.");
    }

    await db.execute(
      `UPDATE inventario
       SET stock_actual = $1,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [stockResultante, payload.inventarioId],
    );

    await db.execute(
      `INSERT INTO movimientos_stock (
          inventario_id,
          tipo_movimiento,
          cantidad,
          stock_resultante,
          motivo,
          referencia
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        payload.inventarioId,
        payload.tipoMovimiento,
        cantidad,
        stockResultante,
        payload.motivo?.trim() || null,
        payload.referencia?.trim() || null,
      ],
    );

    // await db.execute("COMMIT");
    return stockResultante;
  } catch (error: any) {
    // try { await db.execute("ROLLBACK"); } catch (e) { /* ignore rollback error */ }
    const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    console.error("Error en registrarMovimientoStock:", error);
    throw new Error(msg);
  }
}

export async function saveMovimientoTemplate(payload: MovimientoTemplateDraft) {
  const db = await getDatabase();
  const nombre = payload.nombre.trim();
  const cantidad = Number(payload.cantidad);

  if (!nombre) {
    throw new Error("El nombre de la plantilla es obligatorio.");
  }

  if (!Number.isInteger(cantidad)) {
    throw new Error("La cantidad de la plantilla debe ser un número entero.");
  }

  if (payload.tipoMovimiento !== "AJUSTE" && cantidad <= 0) {
    throw new Error("La cantidad de la plantilla debe ser mayor a cero para entradas y salidas.");
  }

  if (payload.tipoMovimiento === "AJUSTE" && cantidad === 0) {
    throw new Error("La plantilla de ajuste no puede ser cero.");
  }

  const inventarioRows = await db.select<{ inventarioId: number }[]>(
    `SELECT id AS inventarioId
      FROM inventario
      WHERE id = $1`,
    [payload.inventarioId],
  );

  if (!inventarioRows[0]) {
    throw new Error("La variante seleccionada no existe.");
  }

  await db.execute(
    `INSERT INTO plantillas_movimientos (
        inventario_id,
        nombre,
        tipo_movimiento,
        cantidad,
        motivo,
        referencia,
        actualizado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT(inventario_id, nombre) DO UPDATE SET
        tipo_movimiento = excluded.tipo_movimiento,
        cantidad = excluded.cantidad,
        motivo = excluded.motivo,
        referencia = excluded.referencia,
        actualizado_en = CURRENT_TIMESTAMP`,
    [
      payload.inventarioId,
      nombre,
      payload.tipoMovimiento,
      cantidad,
      normalizeOptionalText(payload.motivo),
      normalizeOptionalText(payload.referencia),
    ],
  );
}

export async function deleteMovimientoTemplate(templateId: number) {
  const db = await getDatabase();
  await db.execute("DELETE FROM plantillas_movimientos WHERE id = $1", [templateId]);
}

export async function updateProducto(inventarioId: number, payload: ProductoDraft) {
  if (!inventarioId || isNaN(inventarioId)) {
    throw new Error("ID de inventario no válido para actualización.");
  }
  const db = await getDatabase();
  const inventarioRows = await db.select<{ productoId: number }[]>(
    `SELECT producto_id AS productoId
      FROM inventario
      WHERE id = $1`,
    [inventarioId],
  );

  const inventario = inventarioRows[0];

  if (!inventario) {
    throw new Error("La variante seleccionada no existe.");
  }

  // Transacción eliminada por incompatibilidad con el pool de conexiones del plugin
  // await db.execute("BEGIN IMMEDIATE TRANSACTION");

  try {
    await db.execute(
      `UPDATE productos
       SET nombre = $1,
           descripcion = $2,
           categoria = $3,
           marca = $4,
           notas = $5,
           imagen_path_local = $6,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        payload.nombre,
        payload.descripcion || null,
        payload.categoria || null,
        payload.marca || null,
        payload.notas || null,
        payload.imagenPathLocal || null,
        inventario.productoId,
      ],
    );

    await db.execute(
      `UPDATE inventario
       SET variante = $1,
           capacidad_medida = $2,
           codigo_barras = $3,
           sku = $4,
           precio_compra = $5,
           precio_venta = $6,
           stock_minimo = $7,
           ubicacion = $8,
           lote = $9,
           vencimiento = $10,
           estado = $11,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $12`,
      [
        payload.variante || null,
        payload.capacidadMedida || null,
        payload.codigoBarras || null,
        payload.sku || null,
        payload.precioCompra ?? 0,
        payload.precioVenta ?? 0,
        payload.stockMinimo ?? 0,
        payload.ubicacion || null,
        payload.lote || null,
        payload.vencimiento || null,
        payload.estado || "ACTIVO",
        inventarioId,
      ],
    );

    // await db.execute("COMMIT");
  } catch (error: any) {
    // try { await db.execute("ROLLBACK"); } catch (e) { /* ignore rollback error */ }
    const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    console.error("Error en updateProducto:", error);
    throw new Error(msg);
  }
}


export async function createProducto(payload: ProductoDraft) {
  const db = await getDatabase();
  const productoResult = await db.execute(
    `INSERT INTO productos (
        nombre,
        descripcion,
        categoria,
        marca,
        notas,
        imagen_path_local,
        actualizado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
    [
      payload.nombre,
      payload.descripcion || null,
      payload.categoria || null,
      payload.marca || null,
      payload.notas || null,
      payload.imagenPathLocal || null,
    ],
  );

  const productoId = productoResult.lastInsertId;

  if (!productoId) {
    throw new Error("No se pudo obtener el id del producto insertado.");
  }

  const inventarioResult = await db.execute(
    `INSERT INTO inventario (
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
        actualizado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)`,
    [
      productoId,
      payload.variante || null,
      payload.capacidadMedida || null,
      payload.codigoBarras || null,
      payload.sku || null,
      payload.precioCompra && !isNaN(payload.precioCompra) ? payload.precioCompra : 0,
      payload.precioVenta && !isNaN(payload.precioVenta) ? payload.precioVenta : 0,
      payload.stockInicial && !isNaN(payload.stockInicial) ? payload.stockInicial : 0,
      payload.stockMinimo && !isNaN(payload.stockMinimo) ? payload.stockMinimo : 0,
      payload.ubicacion || null,
      payload.lote || null,
      payload.vencimiento || null,
      payload.estado || "ACTIVO",
    ],
  );

  if ((payload.stockInicial || 0) > 0 && !isNaN(payload.stockInicial || 0) && inventarioResult.lastInsertId) {
    await db.execute(
      `INSERT INTO movimientos_stock (
          inventario_id,
          tipo_movimiento,
          cantidad,
          stock_resultante,
          motivo,
          referencia,
          fecha_movimiento
        ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP))`,
      [
        inventarioResult.lastInsertId,
        "ENTRADA",
        payload.stockInicial ?? 0,
        payload.stockInicial ?? 0,
        "Carga inicial desde formulario",
        "ALTA_INICIAL",
        payload.fechaIngreso ? `${payload.fechaIngreso} 00:00:00` : null,
      ],
    );
  }

  return Number(productoId);
}

export async function updateEstadoInventario(inventarioId: number, estado: EstadoInventario) {
  const db = await getDatabase();
  await db.execute(
    `UPDATE inventario
      SET estado = $1,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $2`,
    [estado, inventarioId],
  );
}

export async function deleteInventarioSeguro(inventarioId: number) {
  const db = await getDatabase();
  const rows = await db.select<InventarioDeleteCheckRow[]>(
    `SELECT
        i.id AS inventarioId,
        i.producto_id AS productoId,
        COALESCE(i.stock_actual, 0) AS stockActual,
        (
          SELECT COUNT(*)
          FROM movimientos_stock m
          WHERE m.inventario_id = i.id
        ) AS totalMovimientos
      FROM inventario i
      WHERE i.id = $1
      LIMIT 1`,
    [inventarioId],
  );

  const inventario = rows[0];

  if (!inventario) {
    throw new Error("La variante seleccionada no existe.");
  }

  // Transacción eliminada por incompatibilidad con el pool de conexiones del plugin
  // await db.execute("BEGIN IMMEDIATE TRANSACTION");

  try {
    // 1. Eliminar hijos explícitamente para no depender del CASCADE que falla si PRAGMA está off
    await db.execute("DELETE FROM plantillas_movimientos WHERE inventario_id = $1", [inventarioId]);
    await db.execute("DELETE FROM movimientos_stock WHERE inventario_id = $1", [inventarioId]);
    
    // 2. Eliminar la variante
    await db.execute("DELETE FROM inventario WHERE id = $1", [inventarioId]);

    const remainingRows = await db.select<{ total: number }[]>(
      "SELECT COUNT(*) AS total FROM inventario WHERE producto_id = $1",
      [inventario.productoId],
    );

    const remainingInventario = Number(remainingRows[0]?.total ?? 0);
    const productoEliminado = remainingInventario === 0;

    if (productoEliminado) {
      await db.execute("DELETE FROM productos WHERE id = $1", [inventario.productoId]);
    }

    return {
      inventarioEliminado: true,
      productoEliminado,
    };
  } catch (error: any) {
    const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    console.error("Error en deleteInventarioSeguro:", error);
    throw new Error(msg);
  }
}

export async function getConfiguracionEmpresa(): Promise<ConfiguracionEmpresa> {
  const db = await getDatabase();
  const rows = await db.select<
    {
      nombreEmpresa: string | null;
      logoPathLocal: string | null;
      moneda: string | null;
    }[]
  >(
    `SELECT
        nombre_empresa AS nombreEmpresa,
        logo_path_local AS logoPathLocal,
        moneda AS moneda
      FROM configuracion_empresa
      WHERE id = 1`,
  );

  return {
    nombreEmpresa: rows[0]?.nombreEmpresa ?? null,
    logoPathLocal: rows[0]?.logoPathLocal ?? null,
    moneda: rows[0]?.moneda ?? "ARS",
  };
}

export async function saveConfiguracionEmpresa(payload: ConfiguracionEmpresaDraft) {
  const db = await getDatabase();

  await db.execute(
    `UPDATE configuracion_empresa SET
        nombre_empresa = $1,
        logo_path_local = $2,
        moneda = $3,
        actualizada_en = CURRENT_TIMESTAMP
      WHERE id = 1`,
    [payload.nombreEmpresa || null, payload.logoPathLocal || null, payload.moneda || "ARS"],
  );
}

export async function getUniqueVariantes(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ value: string }[]>(
    "SELECT DISTINCT variante AS value FROM inventario WHERE variante IS NOT NULL AND TRIM(variante) <> '' ORDER BY variante ASC"
  );
  return rows.map((r) => r.value);
}

export async function getUniqueCapacidades(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ value: string }[]>(
    "SELECT DISTINCT capacidad_medida AS value FROM inventario WHERE capacidad_medida IS NOT NULL AND TRIM(capacidad_medida) <> '' ORDER BY capacidad_medida ASC"
  );
  return rows.map((r) => r.value);
}

export async function getUniqueMarcas(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ value: string }[]>(
    "SELECT DISTINCT marca AS value FROM productos WHERE marca IS NOT NULL AND TRIM(marca) <> '' ORDER BY marca ASC"
  );
  return rows.map((r) => r.value);
}