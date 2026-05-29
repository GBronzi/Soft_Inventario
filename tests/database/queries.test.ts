import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/database/db";
import {
  deleteMovimientoTemplate,
  deleteInventarioSeguro,
  getCatalogoProductos,
  getInventarioMovimientoOptions,
  getMovimientoTemplatesByInventarioId,
  getMovimientos,
  getMovimientosByInventarioId,
  registrarMovimientoStock,
  saveMovimientoTemplate,
  updateEstadoInventario,
  updateProducto,
} from "@/database/queries";

vi.mock("@/database/db", () => ({
  getDatabase: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

describe("queries de inventario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReset();
    mockDb.execute.mockReset();
    vi.mocked(getDatabase).mockResolvedValue(mockDb as never);
  });

  it("registra una salida de stock en transacción", async () => {
    mockDb.select.mockResolvedValueOnce([{ inventarioId: 7, stockActual: 5 }]);
    mockDb.execute.mockResolvedValue(undefined);

    const result = await registrarMovimientoStock({
      inventarioId: 7,
      tipoMovimiento: "SALIDA",
      cantidad: 2,
      motivo: "Venta mostrador",
      referencia: "VENTA-1",
    });

    expect(result).toBe(3);
    expect(mockDb.execute).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE TRANSACTION");
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE inventario"),
      [3, 7],
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO movimientos_stock"),
      [7, "SALIDA", 2, 3, "Venta mostrador", "VENTA-1"],
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(4, "COMMIT");
  });

  it("impide movimientos que dejan stock negativo", async () => {
    mockDb.select.mockResolvedValueOnce([{ inventarioId: 9, stockActual: 1 }]);

    await expect(
      registrarMovimientoStock({
        inventarioId: 9,
        tipoMovimiento: "SALIDA",
        cantidad: 2,
      }),
    ).rejects.toThrow("La salida o ajuste dejaría el stock en negativo.");

    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("actualiza producto y variante dentro de una transacción", async () => {
    mockDb.select.mockResolvedValueOnce([{ productoId: 15 }]);
    mockDb.execute.mockResolvedValue(undefined);

    await updateProducto(8, {
      nombre: "Perfume Editado",
      categoria: "Importados",
      marca: "Marca X",
      variante: "Tester",
      capacidadMedida: "100ml",
      codigoBarras: "123",
      sku: "SKU-1",
      precioCompra: 10,
      precioVenta: 20,
      stockMinimo: 2,
      ubicacion: "Estante A",
      lote: "L-1",
      vencimiento: "2026-01-01",
      estado: "ACTIVO",
    });

    expect(mockDb.execute).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE TRANSACTION");
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE productos"),
      expect.arrayContaining(["Perfume Editado", 15]),
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE inventario"),
      expect.arrayContaining(["Tester", "100ml", 8]),
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(4, "COMMIT");
  });

  it("actualiza estado de inventario", async () => {
    mockDb.execute.mockResolvedValue(undefined);

    await updateEstadoInventario(4, "DISCONTINUADO");

    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE inventario"),
      ["DISCONTINUADO", 4],
    );
  });

  it("filtra catálogo por bajo stock", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    await getCatalogoProductos({
      estado: "ACTIVO",
      soloBajoStock: true,
    });

    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("WHERE i.estado = $1 AND COALESCE(i.stock_actual, 0) <= COALESCE(i.stock_minimo, 0)"),
      ["ACTIVO"],
    );
  });

  it("obtiene el kardex filtrado por variante", async () => {
    const movimientos = [
      {
        id: 1,
        inventarioId: 4,
        producto: "Perfume X",
        variante: "Tester",
        tipoMovimiento: "ENTRADA",
        cantidad: 3,
        stockResultante: 8,
        motivo: "Compra",
        referencia: "COMPRA-1",
        fechaMovimiento: "2026-03-11 10:00:00",
      },
    ];
    mockDb.select.mockResolvedValueOnce(movimientos);

    const result = await getMovimientosByInventarioId(4, 25);

    expect(result).toEqual(movimientos);
    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("m.inventario_id AS inventarioId"),
      [4, 25],
    );
  });

  it("lista plantillas persistentes por variante", async () => {
    const templates = [
      {
        id: 81,
        inventarioId: 7,
        nombre: "Reposición proveedor",
        tipoMovimiento: "ENTRADA",
        cantidad: 4,
        motivo: "Compra mayorista",
        referencia: "COMP-4",
        actualizadaEn: "2026-03-12 10:00:00",
      },
    ];
    mockDb.select.mockResolvedValueOnce(templates);

    const result = await getMovimientoTemplatesByInventarioId(7);

    expect(result).toEqual(templates);
    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("FROM plantillas_movimientos"),
      [7],
    );
  });

  it("guarda o actualiza una plantilla persistente", async () => {
    mockDb.select.mockResolvedValueOnce([{ inventarioId: 7 }]);
    mockDb.execute.mockResolvedValue(undefined);

    await saveMovimientoTemplate({
      inventarioId: 7,
      nombre: "  Reposición proveedor  ",
      tipoMovimiento: "ENTRADA",
      cantidad: 4,
      motivo: " Compra mayorista ",
      referencia: " COMP-4 ",
    });

    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("FROM inventario"), [7]);
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO plantillas_movimientos"),
      [7, "Reposición proveedor", "ENTRADA", 4, "Compra mayorista", "COMP-4"],
    );
  });

  it("elimina una plantilla persistente", async () => {
    mockDb.execute.mockResolvedValue(undefined);

    await deleteMovimientoTemplate(81);

    expect(mockDb.execute).toHaveBeenCalledWith("DELETE FROM plantillas_movimientos WHERE id = $1", [81]);
  });

  it("arma filtros de movimientos por variante, tipo y fechas", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    await getMovimientos({
      inventarioId: 12,
      tipoMovimiento: "SALIDA",
      fechaDesde: "2026-03-01",
      fechaHasta: "2026-03-31",
      limit: 100,
    });

    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("WHERE m.inventario_id = $1 AND m.tipo_movimiento = $2 AND DATE(m.fecha_movimiento) >= DATE($3) AND DATE(m.fecha_movimiento) <= DATE($4)"),
      [12, "SALIDA", "2026-03-01", "2026-03-31", 100],
    );
  });

  it("arma búsqueda textual en movimientos", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    await getMovimientos({
      search: "tester",
      limit: 50,
    });

    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("p.nombre LIKE $1 OR i.variante LIKE $1 OR i.sku LIKE $1 OR i.codigo_barras LIKE $1 OR m.motivo LIKE $1 OR m.referencia LIKE $1"),
      ["%tester%", 50],
    );
  });

  it("aplica paginación con limit y offset", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    await getMovimientos({
      inventarioId: 4,
      limit: 21,
      offset: 42,
    });

    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT $2 OFFSET $3"),
      [4, 21, 42],
    );
  });

  it("incluye stock mínimo en las opciones de movimiento", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    await getInventarioMovimientoOptions();

    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("i.stock_minimo AS stockMinimo"),
    );
  });

  it("no elimina una variante con historial", async () => {
    mockDb.select.mockResolvedValueOnce([
      { inventarioId: 4, productoId: 11, stockActual: 0, totalMovimientos: 1 },
    ]);

    await expect(deleteInventarioSeguro(4)).rejects.toThrow(
      "La variante tiene historial de movimientos. Usa baja lógica o estado DISCONTINUADO.",
    );

    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("elimina una variante segura y también el producto si queda vacío", async () => {
    mockDb.select
      .mockResolvedValueOnce([
        { inventarioId: 4, productoId: 11, stockActual: 0, totalMovimientos: 0 },
      ])
      .mockResolvedValueOnce([{ total: 0 }]);
    mockDb.execute.mockResolvedValue(undefined);

    const result = await deleteInventarioSeguro(4);

    expect(result).toEqual({ inventarioEliminado: true, productoEliminado: true });
    expect(mockDb.execute).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE TRANSACTION");
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("DELETE FROM inventario"),
      [4],
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("DELETE FROM productos"),
      [11],
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(4, "COMMIT");
  });
});