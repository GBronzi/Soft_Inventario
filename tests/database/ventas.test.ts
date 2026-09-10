import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/database/db";
import { anularVentaRegistro, getRegistroVentasMensual, getResumenVentasDia, getVentasAnulablesMensual, guardarComentarioRegistroVenta, registrarVenta } from "@/database/ventas";

vi.mock("@/database/db", () => ({ getDatabase: vi.fn() }));
vi.mock("@/database/queries", () => ({ notifyMonthlySalesUpdate: vi.fn() }));

const mockDb = { select: vi.fn(), execute: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockResolvedValue(mockDb as never);
  mockDb.select.mockReset();
  mockDb.execute.mockReset();
  mockDb.execute.mockImplementation((query: string) => Promise.resolve(query.includes("INSERT INTO ventas") ? { lastInsertId: 44, rowsAffected: 1 } : { rowsAffected: 1 }));
});

describe("ventas múltiples", () => {
  it("registra cabecera, detalles, movimientos y stock sin transaccion manual", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ stockActual: 5, costoUnitario: 40 }])
      .mockResolvedValueOnce([{ stockActual: 3, costoUnitario: 60 }]);

    const result = await registrarVenta({
      medioPago: "TRANSFERENCIA",
      items: [
        { inventarioId: 7, cantidad: 2, precioUnitario: 100 },
        { inventarioId: 8, cantidad: 1, precioUnitario: 250 },
      ],
    });

    expect(result.id).toBe(44);
    expect(result.total).toBe(450);
    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO venta_detalle"), [44, 7, 2, 100, 200]);
    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE inventario"), [3, 7]);
    expect(mockDb.execute).not.toHaveBeenCalledWith("BEGIN");
    expect(mockDb.execute).not.toHaveBeenCalledWith("COMMIT");
  });

  it("no registra la venta cuando falta stock", async () => {
    mockDb.select.mockResolvedValueOnce([{ stockActual: 1, costoUnitario: 40 }]);

    await expect(registrarVenta({
      medioPago: "EFECTIVO",
      items: [{ inventarioId: 7, cantidad: 2, precioUnitario: 100 }],
    })).rejects.toThrow("Stock insuficiente");

    expect(mockDb.execute).not.toHaveBeenCalled();
  });


  it("devuelve el registro mensual unificado de programa y Tiendanube", async () => {
    mockDb.select.mockResolvedValueOnce([
      { registroKey: "PROGRAMA:1", origen: "PROGRAMA", fecha: "2026-07-06 10:30:00", numero: "V-1", producto: "Perfume", marca: "Yves d'Orgeval", variante: "100 ml", cantidad: 2, precioUnitario: 100, subtotal: 200, medioPago: "EFECTIVO", entradaVenta: "Mostrador", comentario: "Cliente frecuente" },
      { registroKey: "TIENDANUBE:9", origen: "TIENDANUBE", fecha: "2026-07-07 11:00:00", numero: "TN-P1-V2", producto: "Perfume TN", marca: "Lattafa", variante: "50 ml", cantidad: 1, precioUnitario: 300, subtotal: 300, medioPago: "TIENDANUBE", entradaVenta: "Venta detectada desde Tiendanube", comentario: "" },
    ]);

    const result = await getRegistroVentasMensual("2026-07");

    expect(result.totalPrograma).toBe(200);
    expect(result.totalTiendanube).toBe(300);
    expect(result.totalGeneral).toBe(500);
    expect(result.totalNacional).toBe(200);
    expect(result.totalArabes).toBe(300);
    expect(result.unidadesGeneral).toBe(3);
    expect(result.unidadesNacional).toBe(2);
    expect(result.unidadesArabes).toBe(1);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("UNION ALL"), ["2026-07"]);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("m.tipo_movimiento = 'SALIDA'"), ["2026-07"]);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("m.concepto = 'VENTA'"), ["2026-07"]);
  });

  it("guarda comentario por clave de registro de venta", async () => {
    await guardarComentarioRegistroVenta("PROGRAMA:1", "Entregado con bolsa");

    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("venta_registro_comentarios"), ["PROGRAMA:1", "Entregado con bolsa"]);
  });

  it("devuelve ventas anulables del mes sin incluir anuladas", async () => {
    mockDb.select.mockResolvedValueOnce([
      { registroKey: "PROGRAMA:1", origen: "PROGRAMA", inventarioId: 7, stockActual: 3, fecha: "2026-07-06 10:30:00", numero: "V-1", producto: "Perfume", variante: "100 ml", cantidad: 2, precioUnitario: 100, subtotal: 200, medioPago: "EFECTIVO", entradaVenta: "Mostrador", comentario: "" },
    ]);

    const result = await getVentasAnulablesMensual("2026-07");

    expect(result[0]).toMatchObject({ registroKey: "PROGRAMA:1", inventarioId: 7, stockActual: 3, cantidad: 2 });
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("vd.anulada_en IS NULL"), ["2026-07"]);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("m.anulado_en IS NULL"), ["2026-07"]);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("m.concepto = 'VENTA'"), ["2026-07"]);
  });

  it("anula una venta del programa, devuelve stock y registra devolucion", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ detalleId: 1, ventaId: 44, numero: "V-1", inventarioId: 7, cantidad: 2, precioUnitario: 100, subtotal: 200, stockActual: 3, costoUnitario: 40 }])
      .mockResolvedValueOnce([{ total: 0 }]);

    const result = await anularVentaRegistro("PROGRAMA:1", "Cliente devolvio");

    expect(result).toEqual({ registroKey: "PROGRAMA:1", inventarioId: 7, stockResultante: 5 });
    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE inventario"), [5, 7]);
    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE venta_detalle"), [expect.stringContaining("Cliente devolvio"), 1]);
    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("'DEVOLUCION_CLIENTE'"), [7, 2, 5, expect.stringContaining("Anulacion de venta V-1"), "V-1", 100, 40, 200, "ANULA:PROGRAMA:1"]);
    expect(mockDb.execute).toHaveBeenCalledWith("UPDATE ventas SET estado = 'ANULADA' WHERE id = $1", [44]);
  });

  it("no permite anular dos veces la misma venta", async () => {
    mockDb.select.mockResolvedValueOnce([{ total: 1 }]);

    await expect(anularVentaRegistro("TIENDANUBE:9")).rejects.toThrow("ya fue anulada");
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("devuelve el resumen y detalle del día por medio de pago", async () => {
    mockDb.select.mockResolvedValueOnce([
      { ventaId: 44, numero: "V-1", fecha: "2026-07-06 10:30:00", origen: "PROGRAMA", producto: "Perfume", variante: "100 ml", cantidad: 1, precioUnitario: 250, subtotal: 250, medioPago: "TRANSFERENCIA" },
      { ventaId: -9, numero: "Tiendanube #101", fecha: "2026-07-06 11:00:00", origen: "TIENDANUBE", producto: "Perfume TN", variante: "50 ml", cantidad: 2, precioUnitario: 100, subtotal: 200, medioPago: "TIENDANUBE" },
    ]);

    const result = await getResumenVentasDia("2026-07-06");

    expect(result.total).toBe(450);
    expect(result.transferencia).toBe(250);
    expect(result.tiendanube).toBe(200);
    expect(result.detalles).toHaveLength(2);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("movimientos_stock"), ["2026-07-06"]);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("m.tipo_movimiento = 'SALIDA'"), ["2026-07-06"]);
    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("m.concepto = 'VENTA'"), ["2026-07-06"]);
  });
});
