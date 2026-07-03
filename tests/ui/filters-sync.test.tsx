// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCatalogoFilterOptions: vi.fn(),
  getCatalogoProductos: vi.fn(),
  getInventarioMovimientoOptions: vi.fn(),
  getMovimientos: vi.fn(),
  getMovimientosByInventarioId: vi.fn(),
  getProductoByInventarioId: vi.fn(),
  getProductoCategorias: vi.fn(),
  getVariantesByProductoId: vi.fn(),
  registrarMovimientoStock: vi.fn(),
  notifyMonthlySalesUpdate: vi.fn(),
  pushInventarioIdATiendanube: vi.fn(),
}));

vi.mock("@/database/queries", () => ({
  getCatalogoFilterOptions: mocks.getCatalogoFilterOptions,
  getCatalogoProductos: mocks.getCatalogoProductos,
  getInventarioMovimientoOptions: mocks.getInventarioMovimientoOptions,
  getMovimientos: mocks.getMovimientos,
  getMovimientosByInventarioId: mocks.getMovimientosByInventarioId,
  getProductoByInventarioId: mocks.getProductoByInventarioId,
  getProductoCategorias: mocks.getProductoCategorias,
  getVariantesByProductoId: mocks.getVariantesByProductoId,
  registrarMovimientoStock: mocks.registrarMovimientoStock,
  notifyMonthlySalesUpdate: mocks.notifyMonthlySalesUpdate,
}));
vi.mock("@/api/tiendanube", () => ({ pushInventarioIdATiendanube: mocks.pushInventarioIdATiendanube }));
vi.mock("@/hooks/useTiendanubeSync", () => ({ TIENDANUBE_SYNCED_EVENT: "tiendanube-synced" }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));

import { Catalogo } from "@/pages/Catalogo";
import { Movimientos } from "@/pages/Movimientos";
import { ProductoDetalle } from "@/pages/ProductoDetalle";

const inventoryOption = {
  inventarioId: 7,
  producto: "Ámbar Oud",
  variante: "50 ml",
  capacidadMedida: "50 ml",
  sku: "AMB-50",
  stockActual: 5,
  stockMinimo: 2,
  precioCompra: 10000,
  precioVenta: 25000,
  estado: "ACTIVO",
};

const productDetail = {
  ...inventoryOption,
  productoId: 1,
  nombre: inventoryOption.producto,
  descripcion: null,
  categoria: "Perfumes",
  marca: "Maison",
  notas: null,
  imagenPathLocal: null,
  imagenUrl: null,
  seoTitulo: null,
  seoDescripcion: null,
  tags: null,
  publicado: 1,
  tnProductId: null,
  tnVariantId: null,
  codigoBarras: "123",
  ubicacion: null,
  lote: null,
  vencimiento: null,
  tnCategoryIds: [],
};

function renderRoute(path: string, element: React.ReactNode) {
  const router = createMemoryRouter([
    { path: "/catalogo", element: path.startsWith("/catalogo") ? element : <div>Catálogo</div> },
    { path: "/movimientos", element: path.startsWith("/movimientos") ? element : <div>Movimientos</div> },
    { path: "/producto/:inventarioId", element: path.startsWith("/producto/") ? element : <div>Detalle</div> },
    { path: "/producto/:inventarioId/editar", element: <div>Editar</div> },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCatalogoFilterOptions.mockResolvedValue({ categorias: ["Perfumes"], marcas: ["Maison"] });
  mocks.getCatalogoProductos.mockResolvedValue([]);
  mocks.getInventarioMovimientoOptions.mockResolvedValue([inventoryOption]);
  mocks.getMovimientos.mockResolvedValue([]);
  mocks.getMovimientosByInventarioId.mockResolvedValue([]);
  mocks.registrarMovimientoStock.mockResolvedValue(4);
  mocks.pushInventarioIdATiendanube.mockResolvedValue({});
  mocks.getProductoByInventarioId.mockResolvedValue(productDetail);
  mocks.getProductoCategorias.mockResolvedValue([]);
  mocks.getVariantesByProductoId.mockResolvedValue([productDetail]);
});

afterEach(cleanup);

describe("Filtros y navegación sincronizados", () => {
  it("hidrata los filtros del catálogo desde la URL", async () => {
    renderRoute("/catalogo?search=oud&categoria=Perfumes&marca=Maison&estado=ACTIVO&bajoStock=1&conVariantes=1", <Catalogo />);
    await waitFor(() => expect(mocks.getCatalogoProductos).toHaveBeenCalledWith({
      search: "oud", categoria: "Perfumes", marca: "Maison", estado: "ACTIVO", soloBajoStock: true, soloConVariantes: true,
    }));
    expect((screen.getByPlaceholderText("Nombre, SKU...") as HTMLInputElement).value).toBe("oud");
  });

  it("sincroniza la búsqueda del catálogo con debounce", async () => {
    const router = renderRoute("/catalogo", <Catalogo />);
    fireEvent.change(screen.getByPlaceholderText("Nombre, SKU..."), { target: { value: "tester" } });
    await waitFor(() => expect(router.state.location.search).toBe("?search=tester"), { timeout: 1500 });
    await waitFor(() => expect(mocks.getCatalogoProductos).toHaveBeenCalledWith(expect.objectContaining({ search: "tester" })));
  });

  it("hidrata los filtros del historial de movimientos", async () => {
    renderRoute("/movimientos?tipoMovimiento=SALIDA&search=cliente&fechaDesde=2026-07-01&fechaHasta=2026-07-31", <Movimientos />);
    await waitFor(() => expect(mocks.getMovimientos).toHaveBeenCalledWith({
      tipoMovimiento: "SALIDA", search: "cliente", fechaDesde: "2026-07-01", fechaHasta: "2026-07-31", limit: 26,
    }));
  });

  it("aplica un preset de salida a la variante indicada", async () => {
    renderRoute("/movimientos?inventarioId=7&presetTipoMovimiento=SALIDA&presetCantidad=2&presetMotivo=Rotura", <Movimientos />);
    await screen.findByText("Stock resultante");
    expect((screen.getByLabelText("Cantidad del movimiento") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Motivo del movimiento") as HTMLTextAreaElement).value).toBe("Rotura");
  });

  it("registra el concepto y la variante seleccionados", async () => {
    renderRoute("/movimientos?inventarioId=7&presetTipoMovimiento=SALIDA", <Movimientos />);
    await screen.findByText("Stock resultante");
    fireEvent.change(screen.getByLabelText("Concepto del movimiento"), { target: { value: "FALLA" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar salida" }));
    await waitFor(() => expect(mocks.registrarMovimientoStock).toHaveBeenCalledWith(expect.objectContaining({
      inventarioId: 7, tipoMovimiento: "SALIDA", concepto: "FALLA", cantidad: 1,
    })));
  });

  it("abre una salida para la variante mostrada en el detalle", async () => {
    const router = renderRoute("/producto/7", <ProductoDetalle />);
    fireEvent.click(await screen.findByRole("button", { name: "Salida" }));
    await waitFor(() => expect(router.state.location.search).toBe("?inventarioId=7&presetTipoMovimiento=SALIDA"));
  });

  it("abre una venta rápida para una variante del detalle", async () => {
    const router = renderRoute("/producto/7", <ProductoDetalle />);
    fireEvent.click(await screen.findByRole("button", { name: "Vender 50 ml" }));
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("presetTipoMovimiento")).toBe("SALIDA");
      expect(params.get("presetMotivo")).toBe("Venta rápida local");
    });
  });
});
