import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDashboardOverview } from "@/database/queries";

import { getDatabase } from "@/database/db";
import {
  deleteMovimientoTemplate,
  createContacto,
  deleteContacto,
  deleteInventarioSeguro,
  getCatalogoProductos,
  getInventarioMovimientoOptions,
  getMovimientoTemplatesByInventarioId,
  getMovimientos,
  getMovimientosByInventarioId,
  getProductoByCodigoBarras,
  getContactos,
  getContactosPage,
  registrarMovimientoStock,
  saveMovimientoTemplate,
  updateEstadoInventario,
  updateContacto,
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
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("UPDATE inventario"),
      [3, 7],
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO movimientos_stock"),
      [7, "SALIDA", 2, 3, "Venta mostrador", "VENTA-1"],
    );
  });

  it("cuenta como variantes solo los productos que realmente tienen variantes", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ total: 8 }])
      .mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValueOnce([{ total: 24 }])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([{ total: 1250 }])
      .mockResolvedValueOnce([{ total: 5000 }]);

    const result = await getDashboardOverview();

    expect(result.totalVariantes).toBe(3);
    expect(result.totalVentasSalidas).toBe(5000);
    expect(mockDb.select).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("productos_con_variantes"),
    );
    expect(mockDb.select).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining("WHERE m.tipo_movimiento = 'SALIDA'"),
    );
  });

  it("registra ventas del mes al hacer una salida", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue(null), setItem });

    mockDb.select.mockResolvedValueOnce([{ inventarioId: 7, stockActual: 5, precioVenta: 100 }]);
    mockDb.execute.mockResolvedValue(undefined);

    await registrarMovimientoStock({
      inventarioId: 7,
      tipoMovimiento: "SALIDA",
      cantidad: 2,
      motivo: "Venta mostrador",
      referencia: "VENTA-1",
    });

    expect(setItem).toHaveBeenCalledWith(
      "soft_inventario_ventas_mensuales",
      expect.stringContaining("\"2026-06\":200"),
    );
  });

  it("impide movimientos que dejan stock negativo", async () => {
    mockDb.select.mockResolvedValueOnce([{ inventarioId: 9, stockActual: 1 }]);

    await expect(
      registrarMovimientoStock({
        inventarioId: 9,
        tipoMovimiento: "SALIDA",
        cantidad: 2,
      }),
    ).rejects.toThrow("La salida o ajuste de 2 dejaría el stock en negativo");

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

    expect(mockDb.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("UPDATE productos"),
      expect.arrayContaining(["Perfume Editado", 15]),
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE inventario"),
      expect.arrayContaining(["Tester", "100ml", 8]),
    );
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

  it("busca un producto por código de barras exacto", async () => {
    const producto = { inventarioId: 7, productoId: 2, nombre: "Perfume", codigoBarras: "7791234567890" };
    mockDb.select.mockResolvedValueOnce([producto]);

    const result = await getProductoByCodigoBarras(" 7791234567890 ");

    expect(result).toEqual(producto);
    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("WHERE TRIM(i.codigo_barras) = $1"),
      ["7791234567890"],
    );
  });

  it("crea, lista, actualiza y elimina contactos locales", async () => {
    mockDb.execute.mockResolvedValue({ lastInsertId: 12, rowsAffected: 1 });
    mockDb.select.mockResolvedValueOnce([]);
    const draft = { nombre: "Ana", apellidos: "Pérez", email: "ana@example.com", telefono: "+56912345678" };

    expect(await createContacto(draft)).toBe(12);
    await getContactos("Ana");
    await updateContacto(12, { ...draft, empresa: "Perfumes Sur" });
    await deleteContacto(12);

    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("FROM contactos WHERE"), ["%Ana%"]);
    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE contactos SET"), expect.arrayContaining(["Ana", 12]));
    expect(mockDb.execute).toHaveBeenLastCalledWith("DELETE FROM contactos WHERE id = $1", [12]);
  });

  it("pagina contactos desde SQLite y devuelve el total", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ id: 101, nombre: "Contacto 101" }])
      .mockResolvedValueOnce([{ total: 60000 }]);

    const result = await getContactosPage("Ana", 100, 200);

    expect(result).toEqual({ items: [{ id: 101, nombre: "Contacto 101" }], total: 60000 });
    expect(mockDb.select).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("LIMIT $2 OFFSET $3"),
      ["%Ana%", 100, 200],
    );
    expect(mockDb.select).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SELECT COUNT(*) AS total FROM contactos WHERE"),
      ["%Ana%"],
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
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      3,
      "DELETE FROM inventario WHERE id = $1",
      [4],
    );
    expect(mockDb.execute).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("DELETE FROM productos"),
      [11],
    );
  });
});
