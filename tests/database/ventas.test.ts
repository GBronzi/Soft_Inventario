import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/database/db";
import { getResumenVentasDia, registrarVenta } from "@/database/ventas";

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

  it("devuelve el resumen y detalle del día por medio de pago", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ total: 450, unidades: 3, operaciones: 2, efectivo: 200, transferencia: 250, tarjeta: 0, otro: 0 }])
      .mockResolvedValueOnce([{ ventaId: 44, numero: "V-1", fecha: "2026-07-06 10:30:00", producto: "Perfume", variante: "100 ml", cantidad: 1, precioUnitario: 250, subtotal: 250, medioPago: "TRANSFERENCIA" }]);

    const result = await getResumenVentasDia("2026-07-06");

    expect(result.total).toBe(450);
    expect(result.transferencia).toBe(250);
    expect(result.detalles).toHaveLength(1);
  });
});
