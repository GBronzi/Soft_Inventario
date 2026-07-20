// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/ParticleField", () => ({ ParticleField: () => <div /> }));
vi.mock("@/components/shared/UpdateNotifier", () => ({ UpdateNotifier: () => null }));
vi.mock("@/hooks/useTiendanubeSync", () => ({ useTiendanubeSync: () => undefined, TIENDANUBE_SYNCED_EVENT: "tiendanube-synced", TIENDANUBE_PENDING_CHANGES_EVENT: "tiendanube-pending", TIENDANUBE_CONNECTION_EVENT: "tiendanube-connection" }));
vi.mock("@/database/queries", () => ({
  getConfiguracionEmpresa: vi.fn().mockResolvedValue({ nombreEmpresa: null, logoPathLocal: null, moneda: "ARS" }),
  getDashboardOverview: vi.fn().mockResolvedValue({ totalProductos: 0, totalVariantes: 0, stockTotal: 0, variantesBajoStock: 0, movimientosHoy: 0, totalInvertido: 0 }),
  getLowStockAlerts: vi.fn().mockResolvedValue([]),
  getRecentMovimientos: vi.fn().mockResolvedValue([]),
  getResumenMensualMovimientos: vi.fn().mockResolvedValue({ mes: "2026-07", ventasBrutas: 0, devoluciones: 0, ventasNetas: 0, unidadesVendidas: 0, comprasUnidades: 0, cambiosEntradas: 0, cambiosSalidas: 0, cambiosGarantiaCosto: 0, roturasFallasCosto: 0, vencimientosCosto: 0, regalosCosto: 0, perdidasCosto: 0, ajustesPositivos: 0, ajustesNegativos: 0 }),
  getProductoByCodigoBarras: vi.fn(),
  MONTHLY_SALES_UPDATED_EVENT: "soft_inventario_ventas_actualizadas",
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("1.0.5") }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path, invoke: vi.fn().mockResolvedValue({ isValid: true, holder: "Demo", expiresAt: null, mode: "development", message: "Licencia válida" }) }));

vi.mock("@/database/ventas", () => ({
  getResumenVentasDia: vi.fn().mockResolvedValue({ total: 0, unidades: 0, operaciones: 0, efectivo: 0, transferencia: 0, tarjeta: 0, otro: 0, detalles: [] }),
}));

import App from "@/App";

afterEach(cleanup);

describe("primer inicio", () => {
  it("entra a la aplicación después de crear la cuenta y guardar el código", async () => {
    render(<App />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Usuario" }), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "segura123" } });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "segura123" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear acceso" }));

    await screen.findByText("ABCDE-23456-FGHIJ-7890K");
    fireEvent.click(screen.getByRole("button", { name: "Ya guardé el código e ingresar" }));

    await waitFor(() => expect(screen.getAllByText("Vista general").length).toBeGreaterThan(0));
    expect(screen.queryByText("Algo salió mal")).toBeNull();
  });
});
