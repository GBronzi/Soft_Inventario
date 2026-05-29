// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDeleteMovimientoTemplate,
  mockDeleteInventarioSeguro,
  mockGetCatalogoFilterOptions,
  mockGetCatalogoProductos,
  mockGetInventarioMovimientoOptions,
  mockGetMovimientoTemplatesByInventarioId,
  mockGetMovimientos,
  mockGetMovimientosByInventarioId,
  mockGetProductoByInventarioId,
  mockRegistrarMovimientoStock,
  mockSaveMovimientoTemplate,
  mockUpdateEstadoInventario,
} = vi.hoisted(() => ({
  mockDeleteMovimientoTemplate: vi.fn(),
  mockDeleteInventarioSeguro: vi.fn(),
  mockGetCatalogoFilterOptions: vi.fn(),
  mockGetCatalogoProductos: vi.fn(),
  mockGetInventarioMovimientoOptions: vi.fn(),
  mockGetMovimientoTemplatesByInventarioId: vi.fn(),
  mockGetMovimientos: vi.fn(),
  mockGetMovimientosByInventarioId: vi.fn(),
  mockGetProductoByInventarioId: vi.fn(),
  mockRegistrarMovimientoStock: vi.fn(),
  mockSaveMovimientoTemplate: vi.fn(),
  mockUpdateEstadoInventario: vi.fn(),
}));

vi.mock("@/database/queries", () => ({
  deleteMovimientoTemplate: mockDeleteMovimientoTemplate,
  deleteInventarioSeguro: mockDeleteInventarioSeguro,
  getCatalogoFilterOptions: mockGetCatalogoFilterOptions,
  getCatalogoProductos: mockGetCatalogoProductos,
  getInventarioMovimientoOptions: mockGetInventarioMovimientoOptions,
  getMovimientoTemplatesByInventarioId: mockGetMovimientoTemplatesByInventarioId,
  getMovimientos: mockGetMovimientos,
  getMovimientosByInventarioId: mockGetMovimientosByInventarioId,
  getProductoByInventarioId: mockGetProductoByInventarioId,
  registrarMovimientoStock: mockRegistrarMovimientoStock,
  saveMovimientoTemplate: mockSaveMovimientoTemplate,
  updateEstadoInventario: mockUpdateEstadoInventario,
}));

import { Catalogo } from "@/pages/Catalogo";
import { Movimientos } from "@/pages/Movimientos";
import { ProductoDetalle } from "@/pages/ProductoDetalle";

function waitForDebounce() {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

function renderCatalogo(entry: string) {
  const router = createMemoryRouter(
    [
      { path: "/catalogo", element: <Catalogo /> },
      { path: "/movimientos", element: <div>Movimientos</div> },
    ],
    {
      initialEntries: [entry],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

function renderMovimientos(entry: string) {
  const router = createMemoryRouter([{ path: "/movimientos", element: <Movimientos /> }], {
    initialEntries: [entry],
  });

  render(<RouterProvider router={router} />);
  return router;
}

function renderProductoDetalle(entry: string) {
  const router = createMemoryRouter(
    [
      { path: "/producto/:inventarioId", element: <ProductoDetalle /> },
      { path: "/producto/:inventarioId/editar", element: <div>Editar producto</div> },
      { path: "/movimientos", element: <div>Movimientos</div> },
      { path: "/catalogo", element: <div>Catálogo</div> },
    ],
    { initialEntries: [entry] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mockDeleteMovimientoTemplate.mockResolvedValue(undefined);
  mockDeleteInventarioSeguro.mockResolvedValue({ productoEliminado: false });
  mockUpdateEstadoInventario.mockResolvedValue(undefined);
  mockRegistrarMovimientoStock.mockResolvedValue(5);
  mockSaveMovimientoTemplate.mockResolvedValue(undefined);
  mockGetCatalogoFilterOptions.mockResolvedValue({
    categorias: ["Perfumes"],
    marcas: ["Maison"],
  });
  mockGetCatalogoProductos.mockResolvedValue([
    {
      inventarioId: 7,
      productoId: 1,
      nombre: "Ámbar Oud",
      descripcion: null,
      categoria: "Perfumes",
      marca: "Maison",
      notas: null,
      imagenPathLocal: null,
      variante: "50 ml",
      capacidadMedida: "50 ml",
      sku: "AMB-50",
      codigoBarras: "123",
      stockActual: 2,
      stockMinimo: 5,
      precioCompra: 100,
      precioVenta: 200,
      ubicacion: null,
      lote: null,
      vencimiento: null,
      estado: "ACTIVO",
    },
  ]);
  mockGetInventarioMovimientoOptions.mockResolvedValue([
    {
      inventarioId: 7,
      producto: "Ámbar Oud",
      variante: "50 ml",
      capacidadMedida: "50 ml",
      sku: "AMB-50",
      stockActual: 2,
      stockMinimo: 5,
      estado: "ACTIVO",
    },
  ]);
  mockGetMovimientoTemplatesByInventarioId.mockResolvedValue([]);
  mockGetMovimientos.mockResolvedValue([]);
  mockGetProductoByInventarioId.mockResolvedValue({
    inventarioId: 7,
    productoId: 1,
    nombre: "Ámbar Oud",
    descripcion: null,
    categoria: "Perfumes",
    marca: "Maison",
    notas: null,
    imagenPathLocal: null,
    variante: "50 ml",
    capacidadMedida: "50 ml",
    sku: "AMB-50",
    codigoBarras: "123",
    stockActual: 2,
    stockMinimo: 5,
    precioCompra: 100,
    precioVenta: 200,
    ubicacion: null,
    lote: null,
    vencimiento: null,
    estado: "ACTIVO",
  });
  mockGetMovimientosByInventarioId.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Filtros UI sincronizados con URL", () => {
  it("hidrata y sincroniza Catálogo con debounce y limpieza", async () => {
    const router = renderCatalogo("/catalogo?search=Ambar&estado=ACTIVO&bajoStock=1");

    await screen.findByText("Catálogo de productos");

    const searchInput = screen.getByPlaceholderText("Buscar por nombre, marca, SKU o código") as HTMLInputElement;
    expect(searchInput.value).toBe("Ambar");
    expect(new URLSearchParams(router.state.location.search).get("estado")).toBe("ACTIVO");
    expect(screen.getByRole("button", { name: "Bajo stock activo" })).toBeTruthy();
    expect(router.state.location.search).toContain("search=Ambar");

    fireEvent.change(searchInput, { target: { value: "Ambar Noir" } });

    expect(screen.getByText("Aplicando búsqueda...")).toBeTruthy();
    expect(router.state.location.search).toContain("search=Ambar");

    await waitForDebounce();

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("search")).toBe("Ambar Noir");
      expect(params.get("estado")).toBe("ACTIVO");
      expect(params.get("bajoStock")).toBe("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => {
      expect(searchInput.value).toBe("");
      expect(router.state.location.search).toBe("");
    });
  });

  it("hidrata y sincroniza Movimientos con debounce y limpieza", async () => {
    const router = renderMovimientos(
      "/movimientos?inventarioId=7&tipoMovimiento=SALIDA&search=cliente+vip&fechaDesde=2026-03-01&fechaHasta=2026-03-10",
    );

    await screen.findByText("Historial de movimientos");

    const searchInput = screen.getByPlaceholderText(
      "Buscar por producto, variante, SKU, motivo o referencia",
    ) as HTMLInputElement;

    expect(searchInput.value).toBe("cliente vip");
    expect(screen.getByDisplayValue("Salida")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-03-01")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-03-10")).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "cliente mayorista" } });

    expect(screen.getByText("Aplicando búsqueda...")).toBeTruthy();
    expect(new URLSearchParams(router.state.location.search).get("search")).toBe("cliente vip");

    await waitForDebounce();

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("tipoMovimiento")).toBe("SALIDA");
      expect(params.get("search")).toBe("cliente mayorista");
      expect(params.get("fechaDesde")).toBe("2026-03-01");
      expect(params.get("fechaHasta")).toBe("2026-03-10");
    });

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => {
      expect(searchInput.value).toBe("");
      expect(router.state.location.search).toBe("");
    });
  });

  it("consume el preset del formulario de Movimientos y deja la URL limpia", async () => {
    const router = renderMovimientos("/movimientos?inventarioId=7&presetTipoMovimiento=AJUSTE");

    await screen.findByLabelText("Tipo de movimiento");

    const inventarioSelect = screen.getByLabelText("Variante del movimiento") as HTMLSelectElement;
    const tipoSelect = screen.getByLabelText("Tipo de movimiento") as HTMLSelectElement;
    const cantidadInput = screen.getByLabelText("Cantidad del movimiento") as HTMLInputElement;

    await waitFor(() => {
      expect(inventarioSelect.value).toBe("7");
      expect(tipoSelect.value).toBe("AJUSTE");
      expect(cantidadInput.value).toBe("0");
      expect(router.state.location.search).toBe("?inventarioId=7");
    });
  });

  it("hidrata motivo y referencia preconfigurados para una venta rápida local", async () => {
    const router = renderMovimientos(
      "/movimientos?inventarioId=7&presetTipoMovimiento=SALIDA&presetMotivo=Venta+r%C3%A1pida+local&presetReferencia=VENTA_RAPIDA_LOCAL",
    );

    await screen.findByText("Preset operativo aplicado");

    const tipoSelect = screen.getByLabelText("Tipo de movimiento") as HTMLSelectElement;
    const referenciaInput = screen.getByLabelText("Referencia del movimiento") as HTMLInputElement;
    const motivoInput = screen.getByLabelText("Motivo del movimiento") as HTMLTextAreaElement;

    await waitFor(() => {
      expect(tipoSelect.value).toBe("SALIDA");
      expect(referenciaInput.value).toBe("VENTA_RAPIDA_LOCAL");
      expect(motivoInput.value).toBe("Venta rápida local");
      expect(router.state.location.search).toBe("?inventarioId=7");
    });
  });

  it("aplica un atajo rápido de salida en el formulario de Movimientos", async () => {
    renderMovimientos("/movimientos?inventarioId=7");

    const tipoSelect = await screen.findByLabelText("Tipo de movimiento");
    fireEvent.change(tipoSelect, { target: { value: "SALIDA" } });
    fireEvent.click(screen.getByRole("button", { name: "Venta mostrador" }));

    const referenciaInput = screen.getByLabelText("Referencia del movimiento") as HTMLInputElement;
    const motivoInput = screen.getByLabelText("Motivo del movimiento") as HTMLTextAreaElement;

    await waitFor(() => {
      expect(referenciaInput.value).toBe("VENTA_MOSTRADOR");
      expect(motivoInput.value).toBe("Venta mostrador");
      expect(screen.getByText(/Atajo operativo aplicado/i)).toBeTruthy();
    });
  });

  it("cambia los atajos según el tipo y permite aplicar un preset de ajuste", async () => {
    renderMovimientos("/movimientos?inventarioId=7");

    const tipoSelect = await screen.findByLabelText("Tipo de movimiento");
    fireEvent.change(tipoSelect, { target: { value: "AJUSTE" } });
    fireEvent.click(screen.getByRole("button", { name: "Merma / rotura" }));

    const referenciaInput = screen.getByLabelText("Referencia del movimiento") as HTMLInputElement;
    const motivoInput = screen.getByLabelText("Motivo del movimiento") as HTMLTextAreaElement;
    const cantidadInput = screen.getByLabelText("Cantidad del movimiento") as HTMLInputElement;

    await waitFor(() => {
      expect(cantidadInput.value).toBe("0");
      expect(referenciaInput.value).toBe("AJUSTE_MERMA");
      expect(motivoInput.value).toBe("Merma o rotura");
    });
  });

  it("aplica una sugerencia reciente de la variante seleccionada dentro de Movimientos", async () => {
    mockGetMovimientosByInventarioId.mockResolvedValueOnce([
      {
        id: 21,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "SALIDA",
        cantidad: 2,
        stockResultante: 4,
        motivo: "Cliente VIP",
        referencia: "VIP-2",
        fechaMovimiento: "2026-03-11 15:00:00",
      },
    ]);

    renderMovimientos("/movimientos?inventarioId=7");

    await screen.findByRole("button", { name: "Cliente VIP · -2 · VIP-2" });
    fireEvent.click(screen.getByRole("button", { name: "Cliente VIP · -2 · VIP-2" }));

    const tipoSelect = screen.getByLabelText("Tipo de movimiento") as HTMLSelectElement;
    const cantidadInput = screen.getByLabelText("Cantidad del movimiento") as HTMLInputElement;
    const referenciaInput = screen.getByLabelText("Referencia del movimiento") as HTMLInputElement;
    const motivoInput = screen.getByLabelText("Motivo del movimiento") as HTMLTextAreaElement;

    await waitFor(() => {
      expect(tipoSelect.value).toBe("SALIDA");
      expect(cantidadInput.value).toBe("2");
      expect(referenciaInput.value).toBe("VIP-2");
      expect(motivoInput.value).toBe("Cliente VIP");
      expect(screen.getByText("Preset operativo aplicado")).toBeTruthy();
    });
  });

  it("prioriza las sugerencias recientes según el tipo activo en Movimientos", async () => {
    mockGetMovimientosByInventarioId.mockResolvedValueOnce([
      {
        id: 31,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "SALIDA",
        cantidad: 2,
        stockResultante: 3,
        motivo: "Venta rápida",
        referencia: "SAL-2",
        fechaMovimiento: "2026-03-11 16:00:00",
      },
      {
        id: 32,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "ENTRADA",
        cantidad: 4,
        stockResultante: 7,
        motivo: "Reposición urgente",
        referencia: "ENT-4",
        fechaMovimiento: "2026-03-11 15:30:00",
      },
      {
        id: 33,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "AJUSTE",
        cantidad: -1,
        stockResultante: 6,
        motivo: "Rotura",
        referencia: "AJ-1",
        fechaMovimiento: "2026-03-11 15:00:00",
      },
    ]);

    renderMovimientos("/movimientos?inventarioId=7");

    await screen.findByRole("button", { name: "Reposición urgente · +4 · ENT-4" });
    expect(screen.getByText(/Primero se muestran las sugerencias de entrada/i)).toBeTruthy();

    const suggestionSection = screen.getByText("Sugerencias recientes de esta variante").closest("div");
    expect(suggestionSection).toBeTruthy();

    await waitFor(() => {
      expect(within(suggestionSection as HTMLElement).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Reposición urgente · +4 · ENT-4",
        "Venta rápida · -2 · SAL-2",
        "Rotura · -1 · AJ-1",
      ]);
    });

    fireEvent.change(screen.getByLabelText("Tipo de movimiento"), { target: { value: "SALIDA" } });

    await waitFor(() => {
      expect(screen.getByText(/Primero se muestran las sugerencias de salida/i)).toBeTruthy();
      expect(within(suggestionSection as HTMLElement).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Venta rápida · -2 · SAL-2",
        "Reposición urgente · +4 · ENT-4",
        "Rotura · -1 · AJ-1",
      ]);
    });
  });

  it("aplica una plantilla guardada de la variante seleccionada", async () => {
    mockGetMovimientoTemplatesByInventarioId.mockResolvedValueOnce([
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
    ]);

    renderMovimientos("/movimientos?inventarioId=7");

    await screen.findByRole("button", { name: "Reposición proveedor" });
    fireEvent.click(screen.getByRole("button", { name: "Reposición proveedor" }));

    const tipoSelect = screen.getByLabelText("Tipo de movimiento") as HTMLSelectElement;
    const cantidadInput = screen.getByLabelText("Cantidad del movimiento") as HTMLInputElement;
    const referenciaInput = screen.getByLabelText("Referencia del movimiento") as HTMLInputElement;
    const motivoInput = screen.getByLabelText("Motivo del movimiento") as HTMLTextAreaElement;
    const templateNameInput = screen.getByLabelText("Nombre de la plantilla") as HTMLInputElement;

    await waitFor(() => {
      expect(tipoSelect.value).toBe("ENTRADA");
      expect(cantidadInput.value).toBe("4");
      expect(referenciaInput.value).toBe("COMP-4");
      expect(motivoInput.value).toBe("Compra mayorista");
      expect(templateNameInput.value).toBe("Reposición proveedor");
      expect(screen.getByText("Preset operativo aplicado")).toBeTruthy();
    });
  });

  it("guarda y elimina una plantilla persistente desde Movimientos", async () => {
    mockGetMovimientoTemplatesByInventarioId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 81,
          inventarioId: 7,
          nombre: "Reposición rápida",
          tipoMovimiento: "ENTRADA",
          cantidad: 1,
          motivo: null,
          referencia: null,
          actualizadaEn: "2026-03-12 10:30:00",
        },
      ])
      .mockResolvedValueOnce([]);

    renderMovimientos("/movimientos?inventarioId=7");

    await waitFor(() => {
      expect((screen.getByLabelText("Variante del movimiento") as HTMLSelectElement).value).toBe("7");
    });

    const templateNameInput = await screen.findByLabelText("Nombre de la plantilla");
    fireEvent.change(templateNameInput, { target: { value: "Reposición rápida" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar plantilla" }));

    await waitFor(() => {
      expect(mockSaveMovimientoTemplate).toHaveBeenCalledWith({
        inventarioId: 7,
        nombre: "Reposición rápida",
        tipoMovimiento: "ENTRADA",
        cantidad: 1,
        motivo: "",
        referencia: "",
      });
    });

    await screen.findByRole("button", { name: "Reposición rápida" });
    fireEvent.click(screen.getByRole("button", { name: "Eliminar plantilla Reposición rápida" }));

    await waitFor(() => {
      expect(mockDeleteMovimientoTemplate).toHaveBeenCalledWith(81);
      expect(screen.queryByRole("button", { name: "Reposición rápida" })).toBeNull();
    });
  });

  it("navega desde Catálogo hacia una venta rápida preconfigurada", async () => {
    const router = renderCatalogo("/catalogo");

    await screen.findByText("Catálogo de productos");
    expect(screen.getByRole("button", { name: "Entrada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Venta rápida" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");

      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("presetTipoMovimiento")).toBe("SALIDA");
      expect(params.get("presetMotivo")).toBe("Venta rápida local");
      expect(params.get("presetReferencia")).toBe("VENTA_RAPIDA_LOCAL");
    });
  });

  it("navega desde una fila del historial de Movimientos hacia una nueva entrada contextual", async () => {
    mockGetMovimientos.mockResolvedValueOnce([
      {
        id: 10,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "SALIDA",
        cantidad: 1,
        stockResultante: 2,
        motivo: "Venta mostrador",
        referencia: "VENTA-1",
        fechaMovimiento: "2026-03-11 10:00:00",
      },
    ]);

    const router = renderMovimientos("/movimientos");

    await screen.findByText("Venta mostrador");
    fireEvent.click(screen.getByRole("button", { name: "Nueva entrada" }));

    const tipoSelect = screen.getByLabelText("Tipo de movimiento") as HTMLSelectElement;

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(tipoSelect.value).toBe("ENTRADA");
      expect(router.state.location.search).toBe("?inventarioId=7");
    });
  });

  it("repite un movimiento desde el historial con cantidad, motivo y referencia prellenados", async () => {
    mockGetMovimientos.mockResolvedValueOnce([
      {
        id: 12,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "SALIDA",
        cantidad: 3,
        stockResultante: 4,
        motivo: "Venta mayorista",
        referencia: "PED-99",
        fechaMovimiento: "2026-03-11 12:00:00",
      },
    ]);

    const router = renderMovimientos("/movimientos");

    await screen.findByText("Venta mayorista");
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));

    const tipoSelect = screen.getByLabelText("Tipo de movimiento") as HTMLSelectElement;
    const cantidadInput = screen.getByLabelText("Cantidad del movimiento") as HTMLInputElement;
    const referenciaInput = screen.getByLabelText("Referencia del movimiento") as HTMLInputElement;
    const motivoInput = screen.getByLabelText("Motivo del movimiento") as HTMLTextAreaElement;

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(tipoSelect.value).toBe("SALIDA");
      expect(cantidadInput.value).toBe("3");
      expect(referenciaInput.value).toBe("PED-99");
      expect(motivoInput.value).toBe("Venta mayorista");
      expect(router.state.location.search).toBe("?inventarioId=7");
    });
  });

  it("navega desde ProductoDetalle hacia una salida preconfigurada", async () => {
    const router = renderProductoDetalle("/producto/7");

    await screen.findByText("Acciones rápidas");
    fireEvent.click(screen.getByRole("button", { name: "Registrar salida" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(router.state.location.search).toBe("?inventarioId=7&presetTipoMovimiento=SALIDA");
    });
  });

  it("navega desde ProductoDetalle hacia una venta rápida local preconfigurada", async () => {
    const router = renderProductoDetalle("/producto/7");

    await screen.findByText("Acciones rápidas");
    fireEvent.click(screen.getByRole("button", { name: "Venta rápida local" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");

      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("presetTipoMovimiento")).toBe("SALIDA");
      expect(params.get("presetMotivo")).toBe("Venta rápida local");
      expect(params.get("presetReferencia")).toBe("VENTA_RAPIDA_LOCAL");
    });
  });

  it("navega desde una fila del kardex hacia una nueva venta rápida contextual", async () => {
    mockGetMovimientosByInventarioId.mockResolvedValueOnce([
      {
        id: 11,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "SALIDA",
        cantidad: 1,
        stockResultante: 1,
        motivo: "Cliente habitual",
        referencia: "VENTA-2",
        fechaMovimiento: "2026-03-11 11:00:00",
      },
    ]);

    const router = renderProductoDetalle("/producto/7");

    await screen.findByText("Cliente habitual");
    fireEvent.click(screen.getByRole("button", { name: "Venta rápida" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");

      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("presetTipoMovimiento")).toBe("SALIDA");
      expect(params.get("presetMotivo")).toBe("Venta rápida local");
      expect(params.get("presetReferencia")).toBe("VENTA_RAPIDA_LOCAL");
    });
  });

  it("navega desde una fila del kardex para repetir el movimiento original", async () => {
    mockGetMovimientosByInventarioId.mockResolvedValueOnce([
      {
        id: 13,
        inventarioId: 7,
        producto: "Ámbar Oud",
        variante: "50 ml",
        tipoMovimiento: "AJUSTE",
        cantidad: -2,
        stockResultante: 3,
        motivo: "Rotura en depósito",
        referencia: "AJ-2",
        fechaMovimiento: "2026-03-11 12:30:00",
      },
    ]);

    const router = renderProductoDetalle("/producto/7");

    await screen.findByText("Rotura en depósito");
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");

      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("presetTipoMovimiento")).toBe("AJUSTE");
      expect(params.get("presetCantidad")).toBe("-2");
      expect(params.get("presetMotivo")).toBe("Rotura en depósito");
      expect(params.get("presetReferencia")).toBe("AJ-2");
    });
  });
});