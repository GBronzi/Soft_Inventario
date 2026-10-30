import { getDatabase } from "@/database/db";
import { sqliteLocalDateExpression } from "@/database/queries";
import type { VentaRegistroOrigen } from "@/types";

export interface ReporteVenta {
  registroKey: string;
  origen: VentaRegistroOrigen;
  fecha: string;
  numero: string;
  producto: string;
  marca: string | null;
  variante: string | null;
  cantidad: number;
  subtotal: number;
}

export async function getReporteVentasPorAnios(desde: number, hasta: number): Promise<ReporteVenta[]> {
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 2000 || hasta > 2100 || desde > hasta) {
    throw new Error("El rango de años del reporte no es válido.");
  }

  const db = await getDatabase();
  const rows = await db.select<ReporteVenta[]>(
    `SELECT
        'PROGRAMA:' || vd.id AS registroKey,
        'PROGRAMA' AS origen,
        v.creada_en AS fecha,
        v.numero AS numero,
        p.nombre AS producto,
        p.marca AS marca,
        COALESCE(NULLIF(i.capacidad_medida, ''), NULLIF(i.variante, '')) AS variante,
        vd.cantidad AS cantidad,
        vd.subtotal AS subtotal
      FROM venta_detalle vd
      INNER JOIN ventas v ON v.id = vd.venta_id
      INNER JOIN inventario i ON i.id = vd.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      WHERE v.estado = 'CONFIRMADA'
        AND vd.anulada_en IS NULL
        AND DATE(v.creada_en, 'localtime') >= DATE($1)
        AND DATE(v.creada_en, 'localtime') < DATE($2)
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
        CASE
          WHEN COALESCE(m.importe_total, 0) > 0 THEN m.importe_total
          ELSE ABS(m.cantidad) * COALESCE(NULLIF(m.precio_unitario, 0), i.precio_venta, 0)
        END AS subtotal
      FROM movimientos_stock m
      INNER JOIN inventario i ON i.id = m.inventario_id
      INNER JOIN productos p ON p.id = i.producto_id
      WHERE m.tipo_movimiento = 'SALIDA'
        AND m.concepto = 'VENTA'
        AND m.anulado_en IS NULL
        AND ${sqliteLocalDateExpression("m.fecha_movimiento")} >= DATE($1)
        AND ${sqliteLocalDateExpression("m.fecha_movimiento")} < DATE($2)
        AND NOT EXISTS (
          SELECT 1 FROM ventas v2
          WHERE v2.numero = m.operacion_id AND v2.estado = 'CONFIRMADA'
        )
      ORDER BY fecha ASC, registroKey ASC`,
    [`${desde}-01-01`, `${hasta + 1}-01-01`],
  );

  return rows.map((row) => ({
    ...row,
    cantidad: Number(row.cantidad ?? 0),
    subtotal: Number(row.subtotal ?? 0),
  }));
}
