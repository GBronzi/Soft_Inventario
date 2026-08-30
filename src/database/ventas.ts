import { getDatabase } from "@/database/db";
import { notifyMonthlySalesUpdate } from "@/database/queries";
import { localDateKey, localMonthKey } from "@/lib/datetime";
import type { RegistroVentasMensual, ResumenVentasDia, VentaDraft, VentaRegistroItem, VentaRegistrada } from "@/types";

function optionalText(value?: string) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
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
        p.nombre AS producto, COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        vd.cantidad AS cantidad, vd.precio_unitario AS precioUnitario,
        vd.subtotal AS subtotal, v.medio_pago AS medioPago
       FROM venta_detalle vd
       INNER JOIN ventas v ON v.id = vd.venta_id
       INNER JOIN inventario i ON i.id = vd.inventario_id
       INNER JOIN productos p ON p.id = i.producto_id
       WHERE v.estado = 'CONFIRMADA' AND DATE(v.creada_en, 'localtime') = DATE($1)
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
      WHERE m.cantidad < 0
        AND m.concepto = 'VENTA'
        AND DATE(m.fecha_movimiento, 'localtime') = DATE($1)
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
      WHERE v.estado = 'CONFIRMADA' AND strftime('%Y-%m', v.creada_en, 'localtime') = $1
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
      WHERE m.cantidad < 0
        AND strftime('%Y-%m', m.fecha_movimiento, 'localtime') = $1
        AND m.concepto = 'VENTA'
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
  const unidadesPrograma = normalized.filter((item) => item.origen === "PROGRAMA").reduce((sum, item) => sum + item.cantidad, 0);
  const unidadesTiendanube = normalized.filter((item) => item.origen === "TIENDANUBE").reduce((sum, item) => sum + item.cantidad, 0);

  return {
    mes: selectedMonth,
    totalPrograma,
    totalTiendanube,
    totalGeneral: totalPrograma + totalTiendanube,
    unidadesPrograma,
    unidadesTiendanube,
    unidadesGeneral: unidadesPrograma + unidadesTiendanube,
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
