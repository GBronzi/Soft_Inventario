// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDashboardOverview, mockGetLowStockAlerts, mockGetRecentMovimientos, mockGetResumenMensualMovimientos, mockInvoke } = vi.hoisted(() => ({
  mockGetDashboardOverview: vi.fn(),
  mockGetLowStockAlerts: vi.fn(),
  mockGetRecentMovimientos: vi.fn(),
  mockGetResumenMensualMovimientos: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock("@/database/queries", () => ({
  getDashboardOverview: mockGetDashboardOverview,
  getLowStockAlerts: mockGetLowStockAlerts,
  getRecentMovimientos: mockGetRecentMovimientos,
  getResumenMensualMovimientos: mockGetResumenMensualMovimientos,
  getProductoByCodigoBarras: vi.fn(),
  MONTHLY_SALES_UPDATED_EVENT: "soft_inventario_ventas_actualizadas",
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/database/ventas", () => ({
  getResumenVentasDia: vi.fn().mockResolvedValue({ total: 0, unidades: 0, operaciones: 0, efectivo: 0, transferencia: 0, tarjeta: 0, otro: 0, detalles: [] }),
  getRegistroVentasMensual: vi.fn().mockResolvedValue({ mes: "2026-07", totalPrograma: 0, totalTiendanube: 0, totalGeneral: 0, unidadesPrograma: 0, unidadesTiendanube: 0, unidadesGeneral: 0, registros: [] }),
  guardarComentarioRegistroVenta: vi.fn(),
}));

import { Dashboard } from "@/pages/Dashboard";

function renderDashboard() {
  const router = createMemoryRouter(
    [
      { path: "/", element: <Dashboard /> },
      { path: "/catalogo", element: <div>Catálogo</div> },
      { path: "/movimientos", element: <div>Movimientos</div> },
      { path: "/producto/nuevo", element: <div>Nuevo producto</div> },
      { path: "/producto/:inventarioId", element: <div>Detalle producto</div> },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mockGetDashboardOverview.mockResolvedValue({
    totalProductos: 10,
    totalVariantes: 18,
    stockTotal: 120,
    variantesBajoStock: 3,
    movimientosHoy: 7,
    totalInvertido: 150000,
    totalVentasSalidas: 50000,
  });
  mockGetLowStockAlerts.mockResolvedValue([
    {
      inventarioId: 7,
      productoId: 1,
      nombre: "Ámbar Oud",
      marca: "Maison",
      variante: "50 ml",
      capacidadMedida: "50 ml",
      sku: "AMB-50",
      codigoBarras: "123",
      stockActual: 2,
      stockMinimo: 5,
    },
  ]);
  mockGetRecentMovimientos.mockResolvedValue([
    {
      id: 10,
      inventarioId: 7,
      producto: "Ámbar Oud",
      variante: "50 ml",
      tipoMovimiento: "SALIDA",
      concepto: "VENTA",
      cantidad: 1,
      stockResultante: 2,
      motivo: "Venta",
      referencia: "PED-1",
      precioUnitario: 50000,
      costoUnitario: 25000,
      importeTotal: 50000,
      operacionId: null,
      fechaMovimiento: "2026-03-11 10:00:00",
    },
  ]);
  mockGetResumenMensualMovimientos.mockResolvedValue({ mes: "2026-07", ventasBrutas: 50000, devoluciones: 0, ventasNetas: 50000, unidadesVendidas: 1, comprasUnidades: 0, cambiosEntradas: 0, cambiosSalidas: 0, roturasFallasCosto: 0, vencimientosCosto: 0, regalosCosto: 0, perdidasCosto: 0, ajustesPositivos: 0, ajustesNegativos: 0 });
  mockInvoke.mockResolvedValue({
    isValid: true,
    holder: "Demo",
    expiresAt: null,
    mode: "offline",
    message: "Licencia válida",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Dashboard UI", () => {
  it("muestra la licencia aunque falle otra consulta del panel", async () => {
    mockGetDashboardOverview.mockRejectedValueOnce(new Error("Base no disponible"));

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Licencia válida")).toBeTruthy());
    expect(screen.getByText("Demo")).toBeTruthy();
  });

  it("navega desde el KPI de bajo stock al catálogo filtrado", async () => {
    const router = renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /Bajo stock/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/catalogo");
      expect(router.state.location.search).toBe("?bajoStock=1");
    });
  });

  it("no muestra el antiguo KPI de ventas", async () => {
    renderDashboard();
    expect(screen.queryByRole("button", { name: /Historial de ventas/ })).toBeNull();
  });

  it("navega desde la acción rápida a una salida preconfigurada", async () => {
    const router = renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Registrar salida" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(router.state.location.search).toBe("?presetTipoMovimiento=SALIDA");
    });
  });

  it("no muestra la acción rápida de venta rápida local", () => {
    renderDashboard();

    expect(screen.queryByRole("button", { name: "Venta rápida local" })).toBeNull();
  });

  it("navega desde alertas de stock al historial filtrado de la variante", async () => {
    const router = renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Movimientos" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(router.state.location.search).toBe("?inventarioId=7");
    });
  });

  it("navega desde alertas de stock a una entrada contextual", async () => {
    const router = renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Registrar entrada" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(router.state.location.search).toBe("?inventarioId=7&presetTipoMovimiento=ENTRADA");
    });
  });

  it("navega desde alertas de stock a un ajuste contextual", async () => {
    const router = renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Ajuste rápido" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(router.state.location.search).toBe("?inventarioId=7&presetTipoMovimiento=AJUSTE");
    });
  });

  it("navega desde últimos movimientos para repetir un movimiento", async () => {
    const router = renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Repetir" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");

      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("presetTipoMovimiento")).toBe("SALIDA");
      expect(params.get("presetCantidad")).toBe("1");
      expect(params.get("presetMotivo")).toBe("Venta");
      expect(params.get("presetReferencia")).toBe("PED-1");
    });
  });

  it("navega desde últimos movimientos hacia una nueva salida contextual", async () => {
    const router = renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Nueva salida" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      expect(router.state.location.search).toBe("?inventarioId=7&presetTipoMovimiento=SALIDA");
    });
  });
});
