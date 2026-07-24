import { getDatabase } from "@/database/db";
import type {
  Categoria,
  CategoriaRef,
  CategoriaTreeNode,
  CatalogoFilterOptions,
  CatalogoFilters,
  CatalogoItem,
  ConfiguracionEmpresa,
  ConfiguracionEmpresaDraft,
  Contacto,
  ContactoDraft,
  ContactosPage,
  DashboardStats,
  EstadoInventario,
  InventarioMovimientoOption,
  MovimientosFilters,
  MovimientoListado,
  MovimientoConcepto,
  MovimientoStockDraft,
  MovimientoTemplate,
  MovimientoTemplateDraft,
  ProductoDetalle,
  ProductoDraft,
  ProductoVarianteResumen,
  VarianteProductoDraft,
  StockAlert,
  ResumenMensualMovimientos,
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
  precioVenta: number | null;
  precioCompra: number | null;
}

const CONCEPTOS_VALIDOS: Record<string, MovimientoConcepto[]> = {
  ENTRADA: ["COMPRA_REPOSICION", "DEVOLUCION_CLIENTE", "CAMBIO_ENTRADA", "ENTRADA_OTRA"],
  SALIDA: ["VENTA", "ROTURA", "FALLA", "VENCIMIENTO", "REGALO_SORTEO", "CAMBIO_SALIDA", "CAMBIO_GARANTIA", "DEVOLUCION_PROVEEDOR", "PERDIDA_FALTANTE", "SALIDA_OTRA"],
  AJUSTE: ["CORRECCION_STOCK", "SINCRONIZACION_TN"],
};

const MONTHLY_SALES_UPDATED_EVENT = "soft_inventario_ventas_actualizadas";

export { MONTHLY_SALES_UPDATED_EVENT };

export function notifyMonthlySalesUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MONTHLY_SALES_UPDATED_EVENT));
  }
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
      getCount(`SELECT COUNT(*) AS total FROM (
        SELECT i.producto_id
        FROM inventario i
        GROUP BY i.producto_id
        HAVING COUNT(*) > 1
      ) AS productos_con_variantes`),
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

// Tipo temporal para la consulta SQL (incluye tnCategoryIdsRaw que se procesa después)
type CatalogoItemRow = Omit<CatalogoItem, 'tnCategoryIds'> & { tnCategoryIdsRaw: string | null };

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

  if (filters.soloConVariantes) {
    whereClauses.push(`p.id IN (
      SELECT i2.producto_id
      FROM inventario i2
      GROUP BY i2.producto_id
      HAVING COUNT(*) > 1
    )`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  return db.select<CatalogoItemRow[]>(
    `SELECT
        i.id AS inventarioId,
        p.id AS productoId,
        p.nombre AS nombre,
        p.descripcion AS descripcion,
        p.categoria AS categoria,
        p.marca AS marca,
        p.notas AS notas,
        p.imagen_path_local AS imagenPathLocal,
        p.imagen_url AS imagenUrl,
        p.seo_titulo AS seoTitulo,
        p.seo_descripcion AS seoDescripcion,
        p.tags AS tags,
        COALESCE(p.publicado, 1) AS publicado,
        p.tn_product_id AS tnProductId,
        i.tn_variant_id AS tnVariantId,
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
        i.estado AS estado,
        (
          SELECT GROUP_CONCAT(c.tn_category_id, ',')
          FROM producto_categorias pc
          INNER JOIN categorias c ON c.id = pc.categoria_id
          WHERE pc.producto_id = p.id AND c.tn_category_id IS NOT NULL
        ) AS tnCategoryIdsRaw
      FROM inventario i
      INNER JOIN productos p ON p.id = i.producto_id
      ${whereSql}
      ORDER BY p.nombre ASC, i.capacidad_medida ASC, i.variante ASC`,
    bindValues,
  ).then(rows => rows.map(row => ({
    ...row,
    tnCategoryIds: row.tnCategoryIdsRaw
      ? String(row.tnCategoryIdsRaw).split(',').map(Number).filter(n => !isNaN(n))
      : []
  })) as CatalogoItem[]);
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
        p.imagen_url AS imagenUrl,
        p.seo_titulo AS seoTitulo,
        p.seo_descripcion AS seoDescripcion,
        p.tags AS tags,
        COALESCE(p.publicado, 1) AS publicado,
        p.tn_product_id AS tnProductId,
        i.tn_variant_id AS tnVariantId,
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

export async function getVariantesByProductoId(productoId: number): Promise<ProductoVarianteResumen[]> {
  const db = await getDatabase();
  return db.select<ProductoVarianteResumen[]>(
    `SELECT
        id AS inventarioId,
        variante,
        capacidad_medida AS capacidadMedida,
        sku,
        codigo_barras AS codigoBarras,
        COALESCE(precio_compra, 0) AS precioCompra,
        COALESCE(precio_venta, 0) AS precioVenta,
        COALESCE(stock_actual, 0) AS stockActual,
        COALESCE(stock_minimo, 0) AS stockMinimo,
        estado
      FROM inventario
      WHERE producto_id = $1
      ORDER BY capacidad_medida ASC, variante ASC, id ASC`,
    [productoId],
  );
}

export async function getProductoByCodigoBarras(codigoBarras: string): Promise<ProductoDetalle | null> {
  const codigoNormalizado = codigoBarras.trim();
  if (!codigoNormalizado) return null;

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
        p.imagen_url AS imagenUrl,
        p.seo_titulo AS seoTitulo,
        p.seo_descripcion AS seoDescripcion,
        p.tags AS tags,
        COALESCE(p.publicado, 1) AS publicado,
        p.tn_product_id AS tnProductId,
        i.tn_variant_id AS tnVariantId,
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
      WHERE TRIM(i.codigo_barras) = $1
      LIMIT 1`,
    [codigoNormalizado],
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
        m.concepto AS concepto,
        m.cantidad AS cantidad,
        m.stock_resultante AS stockResultante,
        m.motivo AS motivo,
        m.referencia AS referencia,
        m.precio_unitario AS precioUnitario,
        m.costo_unitario AS costoUnitario,
        m.importe_total AS importeTotal,
        m.operacion_id AS operacionId,
        m.fecha_movimiento AS fechaMovimiento
      FROM movimientos_stock m
      INNER JOIN inventario i ON i.id = m.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      ${whereSql}
      ORDER BY m.fecha_movimiento DESC, m.id DESC
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
        i.precio_compra AS precioCompra,
        i.precio_venta AS precioVenta,
        i.estado AS estado
      FROM inventario i
      INNER JOIN productos p ON p.id = i.producto_id
      ORDER BY p.nombre ASC, i.capacidad_medida ASC, i.variante ASC`,
  );
}

export async function registrarMovimientoStock(payload: MovimientoStockDraft) {
  const db = await getDatabase();
  const cantidad = Number(payload.cantidad);
  const concepto: MovimientoConcepto = payload.concepto ?? (
    payload.tipoMovimiento === "ENTRADA"
      ? "ENTRADA_OTRA"
      : payload.tipoMovimiento === "SALIDA"
        ? (payload.motivo?.toLowerCase().includes("venta") ? "VENTA" : "SALIDA_OTRA")
        : "CORRECCION_STOCK"
  );

  if (!Number.isInteger(cantidad)) {
    throw new Error("La cantidad debe ser un número entero.");
  }

  if (payload.tipoMovimiento !== "AJUSTE" && cantidad <= 0) {
    throw new Error("La cantidad debe ser mayor a cero para entradas y salidas.");
  }

  if (payload.tipoMovimiento === "AJUSTE" && cantidad === 0) {
    throw new Error("El ajuste no puede ser cero.");
  }

  if (!CONCEPTOS_VALIDOS[payload.tipoMovimiento]?.includes(concepto)) {
    throw new Error("El concepto seleccionado no corresponde al tipo de movimiento.");
  }

  const referencia = payload.referencia?.trim() || null;
  const esCambio = concepto === "CAMBIO_ENTRADA" || concepto === "CAMBIO_SALIDA";
  if (esCambio && !referencia) {
    throw new Error("Los cambios requieren una referencia compartida para vincular la entrada y la salida.");
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
          stock_actual AS stockActual,
          precio_venta AS precioVenta,
          precio_compra AS precioCompra
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
    const precioUnitario = Number(inventario.precioVenta ?? 0);
    const costoUnitario = payload.costoUnitario === undefined
      ? Number(inventario.precioCompra ?? 0)
      : Math.max(0, Number(payload.costoUnitario));
    if (!Number.isFinite(costoUnitario)) {
      throw new Error("El costo unitario no es válido.");
    }
    const importeSugerido = precioUnitario * Math.abs(cantidad);
    const importeTotal = concepto === "VENTA" || concepto === "DEVOLUCION_CLIENTE"
      ? Math.max(0, Number(payload.importeTotal ?? importeSugerido))
      : 0;
    const operacionId = esCambio ? referencia?.toUpperCase() ?? null : null;

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
          concepto,
          cantidad,
          stock_resultante,
          motivo,
          referencia,
          precio_unitario,
          costo_unitario,
          importe_total,
          operacion_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        payload.inventarioId,
        payload.tipoMovimiento,
        concepto,
        cantidad,
        stockResultante,
        payload.motivo?.trim() || null,
        referencia,
        precioUnitario,
        costoUnitario,
        importeTotal,
        operacionId,
      ],
    );

    if (concepto === "VENTA" || concepto === "DEVOLUCION_CLIENTE") {
      notifyMonthlySalesUpdate();
    }

    // await db.execute("COMMIT");
    return stockResultante;
  } catch (error: any) {
    // try { await db.execute("ROLLBACK"); } catch (e) { /* ignore rollback error */ }
    const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    console.error("Error en registrarMovimientoStock:", error);
    throw new Error(msg);
  }
}

export async function getResumenMensualMovimientos(mes: string): Promise<ResumenMensualMovimientos> {
  const db = await getDatabase();
  const rows = await db.select<Array<Omit<ResumenMensualMovimientos, "mes">>>(
    `SELECT
      COALESCE(SUM(CASE WHEN concepto = 'VENTA' THEN importe_total ELSE 0 END), 0) AS ventasBrutas,
      COALESCE(SUM(CASE WHEN concepto = 'DEVOLUCION_CLIENTE' THEN importe_total ELSE 0 END), 0) AS devoluciones,
      COALESCE(SUM(CASE WHEN concepto = 'VENTA' THEN importe_total WHEN concepto = 'DEVOLUCION_CLIENTE' THEN -importe_total ELSE 0 END), 0) AS ventasNetas,
      COALESCE(SUM(CASE WHEN concepto = 'VENTA' THEN ABS(cantidad) ELSE 0 END), 0) AS unidadesVendidas,
      COALESCE(SUM(CASE WHEN concepto = 'COMPRA_REPOSICION' THEN ABS(cantidad) ELSE 0 END), 0) AS comprasUnidades,
      COALESCE(SUM(CASE WHEN concepto = 'CAMBIO_ENTRADA' THEN ABS(cantidad) ELSE 0 END), 0) AS cambiosEntradas,
      COALESCE(SUM(CASE WHEN concepto = 'CAMBIO_SALIDA' THEN ABS(cantidad) ELSE 0 END), 0) AS cambiosSalidas,
      COALESCE(SUM(CASE WHEN concepto = 'CAMBIO_GARANTIA' THEN ABS(cantidad) * costo_unitario ELSE 0 END), 0) AS cambiosGarantiaCosto,
      COALESCE(SUM(CASE WHEN concepto = 'CAMBIO_GARANTIA' THEN ABS(cantidad) ELSE 0 END), 0) AS cambiosGarantiaUnidades,
      COALESCE(SUM(CASE WHEN concepto IN ('ROTURA', 'FALLA') THEN ABS(cantidad) * costo_unitario ELSE 0 END), 0) AS roturasFallasCosto,
      COALESCE(SUM(CASE WHEN concepto IN ('ROTURA', 'FALLA') THEN ABS(cantidad) ELSE 0 END), 0) AS roturasFallasUnidades,
      COALESCE(SUM(CASE WHEN concepto = 'VENCIMIENTO' THEN ABS(cantidad) * costo_unitario ELSE 0 END), 0) AS vencimientosCosto,
      COALESCE(SUM(CASE WHEN concepto = 'VENCIMIENTO' THEN ABS(cantidad) ELSE 0 END), 0) AS vencimientosUnidades,
      COALESCE(SUM(CASE WHEN concepto = 'REGALO_SORTEO' THEN ABS(cantidad) * costo_unitario ELSE 0 END), 0) AS regalosCosto,
      COALESCE(SUM(CASE WHEN concepto = 'PERDIDA_FALTANTE' THEN ABS(cantidad) * costo_unitario ELSE 0 END), 0) AS perdidasCosto,
      COALESCE(SUM(CASE WHEN concepto IN ('CORRECCION_STOCK', 'SINCRONIZACION_TN') AND cantidad > 0 THEN cantidad ELSE 0 END), 0) AS ajustesPositivos,
      COALESCE(SUM(CASE WHEN concepto IN ('CORRECCION_STOCK', 'SINCRONIZACION_TN') AND cantidad < 0 THEN ABS(cantidad) ELSE 0 END), 0) AS ajustesNegativos
     FROM movimientos_stock
     WHERE strftime('%Y-%m', fecha_movimiento, 'localtime') = $1`,
    [mes],
  );
  const row = rows[0];
  return {
    mes,
    ventasBrutas: Number(row?.ventasBrutas ?? 0),
    devoluciones: Number(row?.devoluciones ?? 0),
    ventasNetas: Number(row?.ventasNetas ?? 0),
    unidadesVendidas: Number(row?.unidadesVendidas ?? 0),
    comprasUnidades: Number(row?.comprasUnidades ?? 0),
    cambiosEntradas: Number(row?.cambiosEntradas ?? 0),
    cambiosSalidas: Number(row?.cambiosSalidas ?? 0),
    cambiosGarantiaCosto: Number(row?.cambiosGarantiaCosto ?? 0),
    cambiosGarantiaUnidades: Number(row?.cambiosGarantiaUnidades ?? 0),
    roturasFallasCosto: Number(row?.roturasFallasCosto ?? 0),
    roturasFallasUnidades: Number(row?.roturasFallasUnidades ?? 0),
    vencimientosCosto: Number(row?.vencimientosCosto ?? 0),
    vencimientosUnidades: Number(row?.vencimientosUnidades ?? 0),
    regalosCosto: Number(row?.regalosCosto ?? 0),
    perdidasCosto: Number(row?.perdidasCosto ?? 0),
    ajustesPositivos: Number(row?.ajustesPositivos ?? 0),
    ajustesNegativos: Number(row?.ajustesNegativos ?? 0),
  };
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
           imagen_url = COALESCE($7, imagen_url),
           seo_titulo = $8,
           seo_descripcion = $9,
           tags = $10,
           publicado = $11,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $12`,
      [
        payload.nombre,
        payload.descripcion || null,
        payload.categoria || null,
        payload.marca || null,
        payload.notas || null,
        payload.imagenPathLocal || null,
        payload.imagenUrl || null,
        payload.seoTitulo || null,
        payload.seoDescripcion || null,
        payload.tags || null,
        payload.publicado === false ? 0 : 1,
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
        imagen_url,
        seo_titulo,
        seo_descripcion,
        tags,
        publicado,
        actualizado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
    [
      payload.nombre,
      payload.descripcion || null,
      payload.categoria || null,
      payload.marca || null,
      payload.notas || null,
      payload.imagenPathLocal || null,
      payload.imagenUrl || null,
      payload.seoTitulo || null,
      payload.seoDescripcion || null,
      payload.tags || null,
      payload.publicado === false ? 0 : 1,
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
          concepto,
          cantidad,
          stock_resultante,
          motivo,
          referencia,
          fecha_movimiento
        ) VALUES ($1, $2, 'ENTRADA_OTRA', $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP))`,
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

export async function createVarianteProducto(productoId: number, payload: VarianteProductoDraft): Promise<number> {
  const db = await getDatabase();
  const producto = await db.select<{ id: number }[]>("SELECT id FROM productos WHERE id = $1 LIMIT 1", [productoId]);
  if (!producto[0]) throw new Error("El producto al que se agregará la variante no existe.");

  const result = await db.execute(
    `INSERT INTO inventario (
      producto_id, variante, capacidad_medida, codigo_barras, sku,
      precio_compra, precio_venta, stock_actual, stock_minimo,
      ubicacion, lote, vencimiento, estado, actualizado_en
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)`,
    [
      productoId,
      normalizeOptionalText(payload.variante),
      normalizeOptionalText(payload.capacidadMedida),
      normalizeOptionalText(payload.codigoBarras),
      normalizeOptionalText(payload.sku),
      payload.precioCompra ?? 0,
      payload.precioVenta ?? 0,
      payload.stockInicial ?? 0,
      payload.stockMinimo ?? 0,
      normalizeOptionalText(payload.ubicacion),
      normalizeOptionalText(payload.lote),
      normalizeOptionalText(payload.vencimiento),
      payload.estado ?? "ACTIVO",
    ],
  );
  const inventarioId = Number(result.lastInsertId);
  if (!inventarioId) throw new Error("No se pudo crear la variante.");

  if ((payload.stockInicial ?? 0) > 0) {
    await db.execute(
      `INSERT INTO movimientos_stock (
        inventario_id, tipo_movimiento, concepto, cantidad, stock_resultante,
        motivo, referencia, fecha_movimiento
      ) VALUES ($1, 'ENTRADA', 'ENTRADA_OTRA', $2, $2, 'Carga inicial desde formulario', 'ALTA_INICIAL', COALESCE($3, CURRENT_TIMESTAMP))`,
      [inventarioId, payload.stockInicial ?? 0, payload.fechaIngreso ? `${payload.fechaIngreso} 00:00:00` : null],
    );
  }

  return inventarioId;
}

export async function createProductoConVariantes(
  payload: ProductoDraft,
  variantesAdicionales: VarianteProductoDraft[],
): Promise<{ productoId: number; inventarioIds: number[] }> {
  const db = await getDatabase();
  await db.execute("BEGIN");
  try {
    const productoId = await createProducto(payload);
    const principal = await db.select<{ inventarioId: number }[]>(
      "SELECT id AS inventarioId FROM inventario WHERE producto_id = $1 ORDER BY id ASC LIMIT 1",
      [productoId],
    );
    if (!principal[0]) throw new Error("No se pudo localizar la variante principal recién creada.");

    const inventarioIds = [principal[0].inventarioId];
    for (const variante of variantesAdicionales) {
      inventarioIds.push(await createVarianteProducto(productoId, variante));
    }
    await db.execute("COMMIT");
    return { productoId, inventarioIds };
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
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

  if (Number(inventario.totalMovimientos ?? 0) > 0) {
    throw new Error("La variante tiene historial de movimientos. Usa baja lógica o estado DISCONTINUADO.");
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

const CONTACTO_SELECT = `SELECT
    id,
    nombre,
    apellidos,
    empresa,
    cargo,
    email,
    email_alternativo AS emailAlternativo,
    telefono,
    telefono_alternativo AS telefonoAlternativo,
    direccion,
    ciudad,
    provincia,
    codigo_postal AS codigoPostal,
    pais,
    sitio_web AS sitioWeb,
    fecha_nacimiento AS fechaNacimiento,
    notas,
    creado_en AS creadoEn,
    actualizado_en AS actualizadoEn
  FROM contactos`;

function contactoValues(payload: ContactoDraft) {
  return [
    payload.nombre.trim(),
    normalizeOptionalText(payload.apellidos),
    normalizeOptionalText(payload.empresa),
    normalizeOptionalText(payload.cargo),
    normalizeOptionalText(payload.email),
    normalizeOptionalText(payload.emailAlternativo),
    normalizeOptionalText(payload.telefono),
    normalizeOptionalText(payload.telefonoAlternativo),
    normalizeOptionalText(payload.direccion),
    normalizeOptionalText(payload.ciudad),
    normalizeOptionalText(payload.provincia),
    normalizeOptionalText(payload.codigoPostal),
    normalizeOptionalText(payload.pais),
    normalizeOptionalText(payload.sitioWeb),
    normalizeOptionalText(payload.fechaNacimiento),
    normalizeOptionalText(payload.notas),
  ];
}

function contactoFilter(search: string) {
  const term = search.trim();
  const where = term
    ? ` WHERE nombre LIKE $1 OR apellidos LIKE $1 OR empresa LIKE $1 OR cargo LIKE $1
        OR email LIKE $1 OR email_alternativo LIKE $1 OR telefono LIKE $1 OR telefono_alternativo LIKE $1`
    : "";
  const values = term ? [`%${term}%`] : [];
  return { where, values };
}

export async function getContactos(search = ""): Promise<Contacto[]> {
  const db = await getDatabase();
  const { where, values } = contactoFilter(search);
  return db.select<Contacto[]>(`${CONTACTO_SELECT}${where} ORDER BY nombre COLLATE NOCASE, apellidos COLLATE NOCASE`, values);
}

export async function getContactosPage(search = "", limit = 100, offset = 0): Promise<ContactosPage> {
  const db = await getDatabase();
  const { where, values } = contactoFilter(search);
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  const safeOffset = Math.max(0, Math.trunc(offset));
  const limitPlaceholder = `$${values.length + 1}`;
  const offsetPlaceholder = `$${values.length + 2}`;
  const [items, countRows] = await Promise.all([
    db.select<Contacto[]>(
      `${CONTACTO_SELECT}${where} ORDER BY nombre COLLATE NOCASE, apellidos COLLATE NOCASE LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      [...values, safeLimit, safeOffset],
    ),
    db.select<{ total: number }[]>(`SELECT COUNT(*) AS total FROM contactos${where}`, values),
  ]);
  return { items, total: Number(countRows[0]?.total ?? 0) };
}

export async function createContacto(payload: ContactoDraft): Promise<number> {
  if (!payload.nombre.trim()) throw new Error("El nombre del contacto es obligatorio.");
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO contactos (
      nombre, apellidos, empresa, cargo, email, email_alternativo, telefono,
      telefono_alternativo, direccion, ciudad, provincia, codigo_postal, pais,
      sitio_web, fecha_nacimiento, notas, actualizado_en
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)`,
    contactoValues(payload),
  );
  return Number(result.lastInsertId);
}

export async function updateContacto(contactoId: number, payload: ContactoDraft): Promise<void> {
  if (!payload.nombre.trim()) throw new Error("El nombre del contacto es obligatorio.");
  const db = await getDatabase();
  await db.execute(
    `UPDATE contactos SET
      nombre = $1, apellidos = $2, empresa = $3, cargo = $4, email = $5,
      email_alternativo = $6, telefono = $7, telefono_alternativo = $8,
      direccion = $9, ciudad = $10, provincia = $11, codigo_postal = $12,
      pais = $13, sitio_web = $14, fecha_nacimiento = $15, notas = $16,
      actualizado_en = CURRENT_TIMESTAMP
    WHERE id = $17`,
    [...contactoValues(payload), contactoId],
  );
}

export async function deleteContacto(contactoId: number): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM contactos WHERE id = $1", [contactoId]);
}

// ===== Sincronización con Tiendanube (cruce por IDs internos) =====

export interface CategoriaUpsert {
  tnCategoryId: number;
  nombre: string;
  tnParentId: number | null;
}

export interface VarianteUpsert {
  tnVariantId: number;
  variante: string | null;
  capacidadMedida: string | null;
  sku: string | null;
  codigoBarras: string | null;
  precioVenta: number;
  stock: number;
}

export interface ProductoUpsert {
  tnProductId: number;
  nombre: string;
  descripcion: string | null;
  marca: string | null;
  categoriaNombre: string | null;
  categoriaLocalIds: number[];
  imagenUrl: string | null;
  seoTitulo: string | null;
  seoDescripcion: string | null;
  tags: string | null;
  publicado: boolean;
  tnUpdatedAt: string | null;
  variantes: VarianteUpsert[];
}

export async function upsertCategorias(cats: CategoriaUpsert[]): Promise<Map<number, number>> {
  const db = await getDatabase();
  const map = new Map<number, number>();
  for (const c of cats) {
    const existing = await db.select<{ id: number }[]>(
      "SELECT id FROM categorias WHERE tn_category_id = $1 LIMIT 1",
      [c.tnCategoryId],
    );
    if (existing[0]) {
      await db.execute(
        `UPDATE categorias SET nombre = $1, tn_parent_id = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = $3`,
        [c.nombre, c.tnParentId, existing[0].id],
      );
      map.set(c.tnCategoryId, existing[0].id);
    } else {
      const res = await db.execute(
        `INSERT INTO categorias (tn_category_id, nombre, tn_parent_id) VALUES ($1, $2, $3)`,
        [c.tnCategoryId, c.nombre, c.tnParentId],
      );
      map.set(c.tnCategoryId, Number(res.lastInsertId));
    }
  }
  return map;
}

export async function getCategoriasArbol(): Promise<CategoriaTreeNode[]> {
  const db = await getDatabase();
  const rows = await db.select<Categoria[]>(
    `SELECT id, tn_category_id AS tnCategoryId, nombre, tn_parent_id AS tnParentId
       FROM categorias ORDER BY nombre ASC`,
  );
  const byTnId = new Map<number, CategoriaTreeNode>();
  const nodes: CategoriaTreeNode[] = rows.map((r) => ({ ...r, hijos: [] }));
  for (const n of nodes) {
    if (n.tnCategoryId != null) byTnId.set(n.tnCategoryId, n);
  }
  const roots: CategoriaTreeNode[] = [];
  for (const n of nodes) {
    if (n.tnParentId != null && byTnId.has(n.tnParentId)) {
      byTnId.get(n.tnParentId)!.hijos.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

export async function getProductoCategorias(productoId: number): Promise<CategoriaRef[]> {
  const db = await getDatabase();
  return db.select<CategoriaRef[]>(
    `SELECT c.id AS id, c.tn_category_id AS tnCategoryId, c.nombre AS nombre
       FROM producto_categorias pc
       INNER JOIN categorias c ON c.id = pc.categoria_id
       WHERE pc.producto_id = $1
       ORDER BY c.nombre ASC`,
    [productoId],
  );
}

export async function getCategoriaByNombre(nombre: string): Promise<Categoria | null> {
  const db = await getDatabase();
  const rows = await db.select<Categoria[]>(
    `SELECT id, tn_category_id AS tnCategoryId, nombre, tn_parent_id AS tnParentId
       FROM categorias
       WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
       LIMIT 1`,
    [nombre],
  );
  return rows[0] ?? null;
}

export async function setTnUpdatedAt(tnProductId: number, updatedAt: string | null, imagenUrl?: string | null): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE productos SET tn_updated_at = $1, imagen_url = COALESCE($2, imagen_url) WHERE tn_product_id = $3",
    [updatedAt, imagenUrl || null, tnProductId],
  );
}

export async function getTnUpdatedAt(tnProductId: number): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<{ tnUpdatedAt: string | null }[]>(
    "SELECT tn_updated_at AS tnUpdatedAt FROM productos WHERE tn_product_id = $1 LIMIT 1",
    [tnProductId],
  );
  return rows[0]?.tnUpdatedAt ?? null;
}

export async function aplicarStockDesdeTiendanube(payload: {
  inventarioId: number;
  tnProductId: number;
  tnVariantId: number;
  stock: number;
  precioVenta?: number;
}): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ stockActual: number; precioCompra: number | null; precioVenta: number | null }>>(
    "SELECT COALESCE(stock_actual, 0) AS stockActual, precio_compra AS precioCompra, precio_venta AS precioVenta FROM inventario WHERE id = $1 LIMIT 1",
    [payload.inventarioId],
  );
  const current = rows[0];
  if (!current) throw new Error("No se encontro el inventario local para aplicar el stock de Tiendanube.");

  const previousStock = Number(current.stockActual ?? 0);
  const nextStock = Number(payload.stock ?? 0);
  const stockDelta = nextStock - previousStock;
  const nextPrice = typeof payload.precioVenta === "number" ? payload.precioVenta : Number(current.precioVenta ?? 0);
  const syncReference = `TN-P${payload.tnProductId}-V${payload.tnVariantId}`;

  await db.execute(
    `UPDATE inventario
       SET stock_actual = $1, precio_venta = $2, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $3`,
    [nextStock, nextPrice, payload.inventarioId],
  );

  if (stockDelta !== 0) {
    await db.execute(
      `INSERT INTO movimientos_stock (
        inventario_id, tipo_movimiento, concepto, cantidad, stock_resultante,
        motivo, referencia, precio_unitario, costo_unitario, importe_total, operacion_id
      ) VALUES ($1, 'AJUSTE', 'SINCRONIZACION_TN', $2, $3, $4, $5, $6, $7, 0, $5)`,
      [
        payload.inventarioId,
        stockDelta,
        nextStock,
        `Ajuste por sincronizacion Tiendanube (${previousStock} -> ${nextStock})`,
        syncReference,
        nextPrice,
        Number(current.precioCompra ?? 0),
      ],
    );
  }
}

export async function aplicarPrecioDesdeTiendanube(payload: {
  inventarioId: number;
  precioVenta: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE inventario
       SET precio_venta = $1, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $2`,
    [payload.precioVenta, payload.inventarioId],
  );
}

export async function upsertProductoDesdeTiendanube(p: ProductoUpsert): Promise<void> {
  const db = await getDatabase();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM productos WHERE tn_product_id = $1 LIMIT 1",
    [p.tnProductId],
  );

  let productoId: number;
  if (existing[0]) {
    productoId = existing[0].id;
    await db.execute(
      `UPDATE productos
         SET nombre = $1, descripcion = $2, categoria = $3, marca = $4, imagen_url = $5,
             seo_titulo = $6, seo_descripcion = $7, tags = $8, publicado = $9, tn_updated_at = $10,
             actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $11`,
      [
        p.nombre, p.descripcion, p.categoriaNombre, p.marca, p.imagenUrl,
        p.seoTitulo, p.seoDescripcion, p.tags, p.publicado ? 1 : 0, p.tnUpdatedAt, productoId,
      ],
    );
  } else {
    const res = await db.execute(
      `INSERT INTO productos (
          nombre, descripcion, categoria, marca, imagen_url, seo_titulo,
          seo_descripcion, tags, publicado, tn_product_id, tn_updated_at, actualizado_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
      [
        p.nombre, p.descripcion, p.categoriaNombre, p.marca, p.imagenUrl, p.seoTitulo,
        p.seoDescripcion, p.tags, p.publicado ? 1 : 0, p.tnProductId, p.tnUpdatedAt,
      ],
    );
    productoId = Number(res.lastInsertId);
  }

  await db.execute("DELETE FROM producto_categorias WHERE producto_id = $1", [productoId]);
  for (const catId of p.categoriaLocalIds) {
    await db.execute(
      "INSERT OR IGNORE INTO producto_categorias (producto_id, categoria_id) VALUES ($1, $2)",
      [productoId, catId],
    );
  }

  for (const v of p.variantes) {
    const ev = await db.select<Array<{ id: number; stockActual: number; precioCompra: number | null }>>(
      "SELECT id, COALESCE(stock_actual, 0) AS stockActual, precio_compra AS precioCompra FROM inventario WHERE tn_variant_id = $1 LIMIT 1",
      [v.tnVariantId],
    );
    if (ev[0]) {
      const previousStock = Number(ev[0].stockActual ?? 0);
      const nextStock = Number(v.stock ?? 0);
      const stockDelta = nextStock - previousStock;
      const syncReference = `TN-P${p.tnProductId}-V${v.tnVariantId}`;

      await db.execute(
        `UPDATE inventario
           SET variante = $1, capacidad_medida = $2, sku = $3, codigo_barras = $4,
               precio_venta = $5, stock_actual = $6, actualizado_en = CURRENT_TIMESTAMP
           WHERE id = $7`,
        [v.variante, v.capacidadMedida, v.sku, v.codigoBarras, v.precioVenta, nextStock, ev[0].id],
      );

      if (stockDelta !== 0) {
        await db.execute(
          `INSERT INTO movimientos_stock (
            inventario_id, tipo_movimiento, concepto, cantidad, stock_resultante,
            motivo, referencia, precio_unitario, costo_unitario, importe_total, operacion_id
          ) VALUES ($1, 'AJUSTE', 'SINCRONIZACION_TN', $2, $3, $4, $5, $6, $7, 0, $5)`,
          [
            ev[0].id,
            stockDelta,
            nextStock,
            `Ajuste automatico por sincronizacion Tiendanube (${previousStock} -> ${nextStock})`,
            syncReference,
            v.precioVenta,
            Number(ev[0].precioCompra ?? 0),
          ],
        );
      }
    } else {
      await db.execute(
        `INSERT INTO inventario (
            producto_id, variante, capacidad_medida, codigo_barras, sku,
            precio_venta, stock_actual, estado, tn_variant_id, actualizado_en
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVO', $8, CURRENT_TIMESTAMP)`,
        [productoId, v.variante, v.capacidadMedida, v.codigoBarras, v.sku, v.precioVenta, v.stock, v.tnVariantId],
      );
    }
  }
}
