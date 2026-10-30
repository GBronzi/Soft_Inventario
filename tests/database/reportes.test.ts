import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/database/db";
import { getReporteVentasPorAnios } from "@/database/reportes";

vi.mock("@/database/db", () => ({ getDatabase: vi.fn() }));

const db = { select: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockResolvedValue(db as never);
});

describe("reportes de ventas", () => {
  it("usa las mismas exclusiones de ventas anuladas, movimientos no comerciales y duplicados", async () => {
    db.select.mockResolvedValueOnce([
      { registroKey: "PROGRAMA:1", origen: "PROGRAMA", cantidad: "2", subtotal: "200" },
      { registroKey: "TIENDANUBE:9", origen: "TIENDANUBE", cantidad: 1, subtotal: 300 },
    ]);

    const rows = await getReporteVentasPorAnios(2023, 2026);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cantidad: 2, subtotal: 200 });
    expect(db.select).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/v\.estado = 'CONFIRMADA'[\s\S]*vd\.anulada_en IS NULL[\s\S]*UNION ALL[\s\S]*m\.concepto = 'VENTA'[\s\S]*m\.anulado_en IS NULL[\s\S]*NOT EXISTS/),
      ["2023-01-01", "2027-01-01"],
    );
    const sql = db.select.mock.calls[0][0] as string;
    expect(sql).toContain("DATE(v.creada_en, 'localtime')");
    expect(sql).toContain("m.fecha_movimiento");
    expect(sql).toContain("WHEN COALESCE(m.importe_total, 0) > 0 THEN m.importe_total");
  });

  it("rechaza rangos de año inválidos sin consultar la base", async () => {
    await expect(getReporteVentasPorAnios(2027, 2026)).rejects.toThrow("rango de años");
    await expect(getReporteVentasPorAnios(2026.5, 2026)).rejects.toThrow("rango de años");
    expect(db.select).not.toHaveBeenCalled();
  });
});
