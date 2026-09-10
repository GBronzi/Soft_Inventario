import { getDatabase } from "@/database/db";
import { notifyMonthlySalesUpdate, sqliteLocalDateExpression, sqliteLocalMonthExpression } from "@/database/queries";
import { localDateKey, localMonthKey } from "@/lib/datetime";
import type { RegistroVentasMensual, ResumenVentasDia, VentaAnulableItem, VentaAnuladaResultado, VentaDraft, VentaRegistroItem, VentaRegistrada } from "@/types";

function optionalText(value?: string) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

const NATIONAL_BRAND = "yves d'orgeval";

function normalizeBrand(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isNationalBrand(value: string | null | undefined) {
  return normalizeBrand(value) === NATIONAL_BRAND;
}

export async function registrarVenta(payload: VentaDraft): Promise<VentaRegistrada> {
  const db = await getDatabase();
  const mediosValidos = new Set(["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"]);
  if (!mediosValidos.has(payload.medioPago)) throw new Error("El medio de pago no es valido.");
  if (!payload.items.length) throw new Error("Agrega al menos un producto a la venta.");

  const agrupados = new Map<number, { cantidad: number; precioUnitario: number }>();
  for (const item of payload.items) {
    const inventarioId = Number(item.inventarioId);
    const cantidad = Math.trunc(Number(item.cantidad));
    const precioUnitario = Number(item.precioUnitario);
    if (!inventarioId || cantidad <= 0) throw new Error("Todas las cantidades deben ser mayores a cero.");
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) throw new Error("Hay un precio de venta invalido.");
    const actual = agrupados.get(inventarioId);
    agrupados.set(inventarioId, { cantidad: (actual?.cantidad ?? 0) + cantidad, precioUnitario });
  }

  const numero = `V-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  try {
    const preparados: Array<{ inventarioId: number; cantidad: number; precioUnitario: number; costoUnitario: number; stockResultante: number }> = [];
    for (const [inventarioId, item] of agrupados) {
      const rows = await db.select<Array<{ stockActual: number; costoUnitario: number }>>(
        `SELECT stock_actual AS stockActual, precio_compra AS costoUnitario
         FROM inventario WHERE id = $1 AND estado = 'ACTIVO'`,
        [inventarioId],
      );
      const inventario = rows[0];
      if (!inventario) throw new Error("Uno de los productos ya no esta disponible.");
      const stockResultante = Number(inventario.stockActual) - item.cantidad;
      if (stockResultante < 0) throw new Error(`Stock insuficiente para uno de los productos (disponible: ${inventario.stockActual}).`);
      preparados.push({ inventarioId, cantidad: item.cantidad, precioUnitario: item.precioUnitario, costoUnitario: Number(inventario.costoUnitario ?? 0), stockResultante });
    }

    const total = preparados.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
    const ventaResult = await db.execute(
      `INSERT INTO ventas (numero, medio_pago, total, nota) VALUES ($1, $2, $3, $4)`,
      [numero, payload.medioPago, total, optionalText(payload.nota)],
    );
    const ventaId = Number(ventaResult.lastInsertId);
    if (!ventaId) throw new Error("No se pudo crear la venta.");

    for (const item of preparados) {
      const subtotal = item.cantidad * item.precioUnitario;
      await db.execute(
        `UPDATE inventario SET stock_actual = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`,
        [item.stockResultante, item.inventarioId],
      );
      await db.execute(
        `INSERT INTO venta_detalle (venta_id, inventario_id, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [ventaId, item.inventarioId, item.cantidad, item.precioUnitario, subtotal],
      );
      await db.execute(
        `INSERT INTO movimientos_stock (
          inventario_id, tipo_movimiento, concepto, cantidad, stock_resultante,
          motivo, referencia, precio_unitario, costo_unitario, importe_total, operacion_id
        ) VALUES ($1, 'SALIDA', 'VENTA', $2, $3, 'Venta multiple', $4, $5, $6, $7, $4)`,
        [item.inventarioId, item.cantidad, item.stockResultante, numero, item.precioUnitario, item.costoUnitario, subtotal],
      );
    }
    notifyMonthlySalesUpdate();
    return { id: ventaId, numero, medioPago: payload.medioPago, total, creadaEn: new Date().toISOString(), inventarioIds: preparados.map((item) => item.inventarioId) };
  } catch (error) {
    throw error;
  }
}

export async function getResumenVentasDia(fecha?: string): Promise<ResumenVentasDia> {
  const db = await getDatabase();
  const dia = fecha?.trim() || localDateKey();
  const detalles = await db.select<ResumenVentasDia["detalles"]>(
    `SELECT v.id AS ventaId, v.numero AS numero, v.creada_en AS fecha,
        'PROGRAMA' AS origen,
        p.nombre AS producto, p.marca AS marca, COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        vd.cantidad AS cantidad, vd.precio_unitario AS precioUnitario,
        vd.subtotal AS subtotal, v.medio_pago AS medioPago
       FROM venta_detalle vd
       INNER JOIN ventas v ON v.id = vd.venta_id
       INNER JOIN inventario i ON i.id = vd.inventario_id
       INNER JOIN productos p ON p.id = i.producto_id
       WHERE v.estado = 'CONFIRMADA'
        AND vd.anulada_en IS NULL
        AND DATE(v.creada_en, 'localtime') = DATE($1)
      UNION ALL
      SELECT -m.id AS ventaId,
        COALESCE(NULLIF(m.referencia, ''), 'MOV-' || m.id) AS numero,
        m.fecha_movimiento AS fecha,
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE'
          ELSE 'PROGRAMA'
        END AS origen,
        p.nombre AS producto,
        p.marca AS marca,
        COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        ABS(m.cantidad) AS cantidad,
        COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0) AS precioUnitario,
        CASE
          WHEN COALESCE(m.importe_total, 0) > 0 THEN m.importe_total
          ELSE ABS(m.cantidad) * COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0)
        END AS subtotal,
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE'
          ELSE 'MOVIMIENTO'
        END AS medioPago
      FROM movimientos_stock m
      INNER JOIN inventario i ON i.id = m.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      WHERE m.tipo_movimiento = 'SALIDA'
        AND m.concepto = 'VENTA'
        AND m.anulado_en IS NULL
        AND ${sqliteLocalDateExpression("m.fecha_movimiento")} = DATE($1)
        AND NOT EXISTS (
          SELECT 1 FROM ventas v2
          WHERE v2.numero = m.operacion_id AND v2.estado = 'CONFIRMADA'
        )
      ORDER BY fecha DESC, ventaId DESC`,
    [dia],
  );
  const normalized = detalles.map((item) => ({
    ...item,
    cantidad: Number(item.cantidad ?? 0),
    precioUnitario: Number(item.precioUnitario ?? 0),
    subtotal: Number(item.subtotal ?? 0),
  }));
  return {
    total: normalized.reduce((sum, item) => sum + item.subtotal, 0),
    unidades: normalized.reduce((sum, item) => sum + item.cantidad, 0),
    operaciones: new Set(normalized.map((item) => item.numero || String(item.ventaId))).size,
    efectivo: normalized.filter((item) => item.medioPago === "EFECTIVO").reduce((sum, item) => sum + item.subtotal, 0),
    transferencia: normalized.filter((item) => item.medioPago === "TRANSFERENCIA").reduce((sum, item) => sum + item.subtotal, 0),
    tarjeta: normalized.filter((item) => item.medioPago === "TARJETA").reduce((sum, item) => sum + item.subtotal, 0),
    otro: normalized.filter((item) => item.medioPago === "OTRO").reduce((sum, item) => sum + item.subtotal, 0),
    tiendanube: normalized.filter((item) => item.medioPago === "TIENDANUBE").reduce((sum, item) => sum + item.subtotal, 0),
    movimientos: normalized.filter((item) => item.medioPago === "MOVIMIENTO").reduce((sum, item) => sum + item.subtotal, 0),
    detalles: normalized,
  };
}

export async function getRegistroVentasMensual(mes: string): Promise<RegistroVentasMensual> {
  const db = await getDatabase();
  const selectedMonth = /^\d{4}-\d{2}$/.test(mes) ? mes : localMonthKey();
  const registros = await db.select<VentaRegistroItem[]>(
    `SELECT
        'PROGRAMA:' || vd.id AS registroKey,
        'PROGRAMA' AS origen,
        v.creada_en AS fecha,
        v.numero AS numero,
        p.nombre AS producto,
        p.marca AS marca,
        COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        vd.cantidad AS cantidad,
        vd.precio_unitario AS precioUnitario,
        vd.subtotal AS subtotal,
        v.medio_pago AS medioPago,
        COALESCE(NULLIF(v.nota, ''), 'Venta registrada en el programa') AS entradaVenta,
        COALESCE(c.comentario, '') AS comentario
      FROM venta_detalle vd
      INNER JOIN ventas v ON v.id = vd.venta_id
      INNER JOIN inventario i ON i.id = vd.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      LEFT JOIN venta_registro_comentarios c ON c.registro_key = 'PROGRAMA:' || vd.id
      WHERE v.estado = 'CONFIRMADA'
        AND vd.anulada_en IS NULL
        AND strftime('%Y-%m', v.creada_en, 'localtime') = $1
      UNION ALL
      SELECT
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE:' || m.id
          ELSE 'MOVIMIENTO:' || m.id
        END AS registroKey,
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE'
          ELSE 'PROGRAMA'
        END AS origen,
        m.fecha_movimiento AS fecha,
        COALESCE(NULLIF(m.referencia, ''), 'MOV-' || m.id) AS numero,
        p.nombre AS producto,
        p.marca AS marca,
        COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        ABS(m.cantidad) AS cantidad,
        COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0) AS precioUnitario,
        CASE
          WHEN COALESCE(m.importe_total, 0) > 0 THEN m.importe_total
          ELSE ABS(m.cantidad) * COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0)
        END AS subtotal,
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE'
          ELSE 'MOVIMIENTO'
        END AS medioPago,
        COALESCE(NULLIF(m.motivo, ''), 'Venta registrada desde movimiento de stock') AS entradaVenta,
        COALESCE(c.comentario, '') AS comentario
      FROM movimientos_stock m
      INNER JOIN inventario i ON i.id = m.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      LEFT JOIN venta_registro_comentarios c ON c.registro_key = CASE
        WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
          OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
          OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
        THEN 'TIENDANUBE:' || m.id
        ELSE 'MOVIMIENTO:' || m.id
      END
      WHERE m.tipo_movimiento = 'SALIDA'
        AND ${sqliteLocalMonthExpression("m.fecha_movimiento")} = $1
        AND m.concepto = 'VENTA'
        AND m.anulado_en IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ventas v2
          WHERE v2.numero = m.operacion_id AND v2.estado = 'CONFIRMADA'
        )
      ORDER BY fecha DESC, registroKey DESC`,
    [selectedMonth],
  );

  const normalized = registros.map((item) => ({
    ...item,
    cantidad: Number(item.cantidad ?? 0),
    precioUnitario: Number(item.precioUnitario ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    comentario: item.comentario ?? "",
  }));
  const totalPrograma = normalized.filter((item) => item.origen === "PROGRAMA").reduce((sum, item) => sum + item.subtotal, 0);
  const totalTiendanube = normalized.filter((item) => item.origen === "TIENDANUBE").reduce((sum, item) => sum + item.subtotal, 0);
  const totalNacional = normalized.filter((item) => isNationalBrand(item.marca)).reduce((sum, item) => sum + item.subtotal, 0);
  const totalArabes = normalized.filter((item) => !isNationalBrand(item.marca)).reduce((sum, item) => sum + item.subtotal, 0);
  const unidadesPrograma = normalized.filter((item) => item.origen === "PROGRAMA").reduce((sum, item) => sum + item.cantidad, 0);
  const unidadesTiendanube = normalized.filter((item) => item.origen === "TIENDANUBE").reduce((sum, item) => sum + item.cantidad, 0);
  const unidadesNacional = normalized.filter((item) => isNationalBrand(item.marca)).reduce((sum, item) => sum + item.cantidad, 0);
  const unidadesArabes = normalized.filter((item) => !isNationalBrand(item.marca)).reduce((sum, item) => sum + item.cantidad, 0);

  return {
    mes: selectedMonth,
    totalPrograma,
    totalTiendanube,
    totalGeneral: totalPrograma + totalTiendanube,
    totalNacional,
    totalArabes,
    unidadesPrograma,
    unidadesTiendanube,
    unidadesGeneral: unidadesPrograma + unidadesTiendanube,
    unidadesNacional,
    unidadesArabes,
    registros: normalized,
  };
}

export async function guardarComentarioRegistroVenta(registroKey: string, comentario: string): Promise<void> {
  const key = registroKey.trim();
  if (!key) throw new Error("No se pudo identificar el registro de venta.");
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO venta_registro_comentarios (registro_key, comentario, actualizado_en)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(registro_key) DO UPDATE SET comentario = excluded.comentario, actualizado_en = CURRENT_TIMESTAMP`,
    [key, comentario.trim()],
  );
}

export async function getVentasAnulablesMensual(mes: string): Promise<VentaAnulableItem[]> {
  const db = await getDatabase();
  const selectedMonth = /^\d{4}-\d{2}$/.test(mes) ? mes : localMonthKey();
  const registros = await db.select<VentaAnulableItem[]>(
    `SELECT
        'PROGRAMA:' || vd.id AS registroKey,
        'PROGRAMA' AS origen,
        i.id AS inventarioId,
        i.stock_actual AS stockActual,
        v.creada_en AS fecha,
        v.numero AS numero,
        p.nombre AS producto,
        p.marca AS marca,
        COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        vd.cantidad AS cantidad,
        vd.precio_unitario AS precioUnitario,
        vd.subtotal AS subtotal,
        v.medio_pago AS medioPago,
        COALESCE(NULLIF(v.nota, ''), 'Venta registrada en el programa') AS entradaVenta,
        COALESCE(c.comentario, '') AS comentario
      FROM venta_detalle vd
      INNER JOIN ventas v ON v.id = vd.venta_id
      INNER JOIN inventario i ON i.id = vd.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      LEFT JOIN venta_registro_comentarios c ON c.registro_key = 'PROGRAMA:' || vd.id
      WHERE v.estado = 'CONFIRMADA'
        AND vd.anulada_en IS NULL
        AND strftime('%Y-%m', v.creada_en, 'localtime') = $1
      UNION ALL
      SELECT
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE:' || m.id
          ELSE 'MOVIMIENTO:' || m.id
        END AS registroKey,
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE'
          ELSE 'PROGRAMA'
        END AS origen,
        i.id AS inventarioId,
        i.stock_actual AS stockActual,
        m.fecha_movimiento AS fecha,
        COALESCE(NULLIF(m.referencia, ''), 'MOV-' || m.id) AS numero,
        p.nombre AS producto,
        p.marca AS marca,
        COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        ABS(m.cantidad) AS cantidad,
        COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0) AS precioUnitario,
        CASE
          WHEN COALESCE(m.importe_total, 0) > 0 THEN m.importe_total
          ELSE ABS(m.cantidad) * COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0)
        END AS subtotal,
        CASE
          WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
            OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
          THEN 'TIENDANUBE'
          ELSE 'MOVIMIENTO'
        END AS medioPago,
        COALESCE(NULLIF(m.motivo, ''), 'Venta registrada desde movimiento de stock') AS entradaVenta,
        COALESCE(c.comentario, '') AS comentario
      FROM movimientos_stock m
      INNER JOIN inventario i ON i.id = m.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      LEFT JOIN venta_registro_comentarios c ON c.registro_key = CASE
        WHEN LOWER(COALESCE(m.motivo, '')) LIKE '%tiendanube%'
          OR LOWER(COALESCE(m.referencia, '')) LIKE 'tiendanube%'
          OR LOWER(COALESCE(m.referencia, '')) LIKE 'tn-%'
        THEN 'TIENDANUBE:' || m.id
        ELSE 'MOVIMIENTO:' || m.id
      END
      WHERE m.tipo_movimiento = 'SALIDA'
        AND ${sqliteLocalMonthExpression("m.fecha_movimiento")} = $1
        AND m.concepto = 'VENTA'
        AND m.anulado_en IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ventas v2
          WHERE v2.numero = m.operacion_id AND v2.estado = 'CONFIRMADA'
        )
      ORDER BY fecha DESC, registroKey DESC`,
    [selectedMonth],
  );

  return registros.map((item) => ({
    ...item,
    inventarioId: Number(item.inventarioId),
    stockActual: Number(item.stockActual ?? 0),
    cantidad: Number(item.cantidad ?? 0),
    precioUnitario: Number(item.precioUnitario ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    comentario: item.comentario ?? "",
  }));
}

function buildAnulacionMotivo(numero: string, motivo?: string) {
  const detalle = optionalText(motivo);
  return detalle ? `Anulacion de venta ${numero}: ${detalle}` : `Anulacion de venta ${numero}`;
}

export async function anularVentaRegistro(registroKey: string, motivo?: string): Promise<VentaAnuladaResultado> {
  const key = registroKey.trim();
  if (!key) throw new Error("No se pudo identificar la venta a anular.");
  const db = await getDatabase();
  const previous = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM movimientos_stock WHERE operacion_id = $1",
    [`ANULA:${key}`],
  );
  if (Number(previous[0]?.total ?? 0) > 0) throw new Error("Esta venta ya fue anulada.");

  if (key.startsWith("PROGRAMA:")) {
    const detalleId = Number(key.replace("PROGRAMA:", ""));
    if (!detalleId) throw new Error("No se pudo identificar el detalle de venta.");
    const rows = await db.select<Array<{
      detalleId: number;
      ventaId: number;
      numero: string;
      inventarioId: number;
      cantidad: number;
      precioUnitario: number;
      subtotal: number;
      stockActual: number;
      costoUnitario: number;
    }>>(
      `SELECT
          vd.id AS detalleId,
          v.id AS ventaId,
          v.numero AS numero,
          vd.inventario_id AS inventarioId,
          vd.cantidad AS cantidad,
          vd.precio_unitario AS precioUnitario,
          vd.subtotal AS subtotal,
          i.stock_actual AS stockActual,
          i.precio_compra AS costoUnitario
        FROM venta_detalle vd
        INNER JOIN ventas v ON v.id = vd.venta_id
        INNER JOIN inventario i ON i.id = vd.inventario_id
        WHERE vd.id = $1
          AND v.estado = 'CONFIRMADA'
          AND vd.anulada_en IS NULL`,
      [detalleId],
    );
    const item = rows[0];
    if (!item) throw new Error("La venta no existe o ya fue anulada.");
    const stockResultante = Number(item.stockActual ?? 0) + Number(item.cantidad ?? 0);
    const anulacionMotivo = buildAnulacionMotivo(item.numero, motivo);

    await db.execute("UPDATE inventario SET stock_actual = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2", [stockResultante, item.inventarioId]);
    await db.execute("UPDATE venta_detalle SET anulada_en = CURRENT_TIMESTAMP, anulacion_motivo = $1 WHERE id = $2", [anulacionMotivo, item.detalleId]);
    await db.execute(
      `INSERT INTO movimientos_stock (
          inventario_id, tipo_movimiento, concepto, cantidad, stock_resultante,
          motivo, referencia, precio_unitario, costo_unitario, importe_total, operacion_id
        ) VALUES ($1, 'ENTRADA', 'DEVOLUCION_CLIENTE', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [item.inventarioId, item.cantidad, stockResultante, anulacionMotivo, item.numero, item.precioUnitario, item.costoUnitario, item.subtotal, `ANULA:${key}`],
    );
    const pendientes = await db.select<{ total: number }[]>(
      "SELECT COUNT(*) AS total FROM venta_detalle WHERE venta_id = $1 AND anulada_en IS NULL",
      [item.ventaId],
    );
    if (Number(pendientes[0]?.total ?? 0) === 0) {
      await db.execute("UPDATE ventas SET estado = 'ANULADA' WHERE id = $1", [item.ventaId]);
    }
    notifyMonthlySalesUpdate();
    return { registroKey: key, inventarioId: item.inventarioId, stockResultante };
  }

  const movimientoPrefix = key.startsWith("TIENDANUBE:") ? "TIENDANUBE:" : key.startsWith("MOVIMIENTO:") ? "MOVIMIENTO:" : null;
  if (!movimientoPrefix) throw new Error("Tipo de venta no soportado para anulacion.");
  const movimientoId = Number(key.replace(movimientoPrefix, ""));
  if (!movimientoId) throw new Error("No se pudo identificar el movimiento de venta.");
  const rows = await db.select<Array<{
    movimientoId: number;
    numero: string | null;
    inventarioId: number;
    cantidad: number;
    precioUnitario: number;
    costoUnitario: number;
    subtotal: number;
    stockActual: number;
  }>>(
    `SELECT
        m.id AS movimientoId,
        COALESCE(NULLIF(m.referencia, ''), 'MOV-' || m.id) AS numero,
        m.inventario_id AS inventarioId,
        ABS(m.cantidad) AS cantidad,
        COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0) AS precioUnitario,
        COALESCE(NULLIF(m.costo_unitario, 0), i.precio_compra, 0) AS costoUnitario,
        CASE
          WHEN COALESCE(m.importe_total, 0) > 0 THEN m.importe_total
          ELSE ABS(m.cantidad) * COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0)
        END AS subtotal,
        i.stock_actual AS stockActual
      FROM movimientos_stock m
      INNER JOIN inventario i ON i.id = m.inventario_id
      WHERE m.id = $1
        AND m.tipo_movimiento = 'SALIDA'
        AND m.concepto = 'VENTA'
        AND m.anulado_en IS NULL`,
    [movimientoId],
  );
  const item = rows[0];
  if (!item) throw new Error("La venta no existe o ya fue anulada.");
  const numero = item.numero || `MOV-${item.movimientoId}`;
  const stockResultante = Number(item.stockActual ?? 0) + Number(item.cantidad ?? 0);
  const anulacionMotivo = buildAnulacionMotivo(numero, motivo);

  await db.execute("UPDATE inventario SET stock_actual = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2", [stockResultante, item.inventarioId]);
  await db.execute(
    `UPDATE movimientos_stock
     SET anulado_en = CURRENT_TIMESTAMP,
         anulacion_motivo = $1,
         anulacion_operacion_id = $2
     WHERE id = $3`,
    [anulacionMotivo, `ANULA:${key}`, item.movimientoId],
  );
  await db.execute(
    `INSERT INTO movimientos_stock (
        inventario_id, tipo_movimiento, concepto, cantidad, stock_resultante,
        motivo, referencia, precio_unitario, costo_unitario, importe_total, operacion_id
      ) VALUES ($1, 'ENTRADA', 'DEVOLUCION_CLIENTE', $2, $3, $4, $5, $6, $7, $8, $9)`,
    [item.inventarioId, item.cantidad, stockResultante, anulacionMotivo, numero, item.precioUnitario, item.costoUnitario, item.subtotal, `ANULA:${key}`],
  );
  notifyMonthlySalesUpdate();
  return { registroKey: key, inventarioId: item.inventarioId, stockResultante };
}
