// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localMonthKey } from "@/lib/datetime";
import { Reportes } from "@/pages/Reportes";

const mocks = vi.hoisted(() => ({
  getReporteVentasPorAnios: vi.fn(),
  getConfiguracionEmpresa: vi.fn(),
}));

vi.mock("@/database/reportes", () => ({ getReporteVentasPorAnios: mocks.getReporteVentasPorAnios }));
vi.mock("@/database/queries", () => ({
  getConfiguracionEmpresa: mocks.getConfiguracionEmpresa,
  MONTHLY_SALES_UPDATED_EVENT: "soft_inventario_ventas_actualizadas",
}));
vi.mock("@/hooks/useTiendanubeSync", () => ({ TIENDANUBE_SYNCED_EVENT: "soft_inventario_tiendanube_synced" }));

const month = localMonthKey();
const year = Number(month.slice(0, 4));
const previousMonth = `${year - 1}${month.slice(4)}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfiguracionEmpresa.mockResolvedValue({ moneda: "ARS" });
  mocks.getReporteVentasPorAnios.mockResolvedValue([
    { registroKey: "PROGRAMA:1", origen: "PROGRAMA", fecha: `${month}-10T12:00:00Z`, numero: "V-1", producto: "Yves Esencia", marca: "Yves D'Orgeval", variante: "100 ml", cantidad: 2, subtotal: 200 },
    { registroKey: "TIENDANUBE:2", origen: "TIENDANUBE", fecha: `${month}-11T12:00:00Z`, numero: "TN-2", producto: "Decant a elección", marca: "Decant", variante: "5 ml", cantidad: 3, subtotal: 300 },
    { registroKey: "TIENDANUBE:3", origen: "TIENDANUBE", fecha: `${month}-12T12:00:00Z`, numero: "TN-3", producto: "Perfume Lattafa", marca: "Lattafa", variante: "100 ml", cantidad: 1, subtotal: 100 },
    { registroKey: "PROGRAMA:4", origen: "PROGRAMA", fecha: `${previousMonth}-10T12:00:00Z`, numero: "V-4", producto: "Yves Esencia", marca: "Yves D'Orgeval", variante: "100 ml", cantidad: 1, subtotal: 100 },
  ]);
});

afterEach(() => cleanup());

describe("Reportes de ventas", () => {
  it("reconcilia total, orígenes y líneas sin contar dos veces Decant", async () => {
    render(<Reportes />);
    await waitFor(() => expect(mocks.getReporteVentasPorAnios).toHaveBeenCalledWith(year - 4, year));
    await waitFor(() => expect(screen.queryByText("Cargando reportes...")).toBeNull());

    const summary = within(screen.getByRole("region", { name: "Resumen del mes" }));
    expect(summary.getByText(/600/)).toBeTruthy();
    expect(summary.getByText("6")).toBeTruthy();

    const origin = within(screen.getByRole("region", { name: /Ventas por origen/ }));
    const programRow = within(origin.getByRole("row", { name: /Programa/ }));
    expect(programRow.getByText("2")).toBeTruthy();
    expect(programRow.getByText(/200,00/)).toBeTruthy();
    const tiendanubeRow = within(origin.getByRole("row", { name: /Tiendanube/ }));
    expect(tiendanubeRow.getByText("4")).toBeTruthy();
    expect(tiendanubeRow.getByText(/400,00/)).toBeTruthy();

    const category = within(screen.getByRole("region", { name: /Ventas por línea/ }));
    const yvesRow = within(category.getByRole("row", { name: /Yves d'Orgeval/ }));
    expect(yvesRow.getByText("2")).toBeTruthy();
    expect(yvesRow.getByText(/200,00/)).toBeTruthy();
    const arabesRow = within(category.getByRole("row", { name: /Árabes/ }));
    expect(arabesRow.getByText("1")).toBeTruthy();
    expect(arabesRow.getByText(/100,00/)).toBeTruthy();
    const decantRow = within(category.getByRole("row", { name: /Decant/ }));
    expect(decantRow.getByText("3")).toBeTruthy();
    expect(decantRow.getByText(/300,00/)).toBeTruthy();
    expect(within(category.getByRole("row", { name: /Total/ })).getByText("6")).toBeTruthy();

    const comparison = within(screen.getByRole("region", { name: /Comparativa/ }));
    expect(comparison.getAllByText(/\+500\s*%/)).toHaveLength(2);
  });

  it("cambia al mismo mes del año anterior sin mezclar ventas del año actual", async () => {
    render(<Reportes />);
    await waitFor(() => expect(screen.queryByText("Cargando reportes...")).toBeNull());

    fireEvent.change(screen.getByLabelText("Año del reporte"), { target: { value: String(year - 1) } });
    await waitFor(() => expect(mocks.getReporteVentasPorAnios).toHaveBeenCalledWith(year - 5, year - 1));
    await waitFor(() => expect(screen.queryByText("Cargando reportes...")).toBeNull());

    const summary = within(screen.getByRole("region", { name: "Resumen del mes" }));
    expect(summary.getByText(/100,00/)).toBeTruthy();
    expect(summary.getByText("1")).toBeTruthy();
  });

  it("separa marcas con el mismo nombre en el ranking y reconoce Yves con espacios", async () => {
    mocks.getReporteVentasPorAnios.mockResolvedValueOnce([
      { registroKey: "PROGRAMA:10", origen: "PROGRAMA", fecha: `${month}-10T12:00:00Z`, numero: "V-10", producto: "Esencia", marca: "Yves D' Orgeval", variante: null, cantidad: 2, subtotal: 200 },
      { registroKey: "PROGRAMA:11", origen: "PROGRAMA", fecha: `${month}-11T12:00:00Z`, numero: "V-11", producto: "Esencia", marca: "Otra marca", variante: null, cantidad: 1, subtotal: 100 },
    ]);

    render(<Reportes />);
    await waitFor(() => expect(screen.queryByText("Cargando reportes...")).toBeNull());

    const top = within(screen.getByRole("region", { name: /Productos más vendidos/ }));
    expect(top.getAllByRole("row")).toHaveLength(3);
    expect(top.getByText("Yves D' Orgeval")).toBeTruthy();
    expect(top.getByText("Otra marca")).toBeTruthy();

    const categories = within(screen.getByRole("region", { name: /Ventas por línea/ }));
    expect(within(categories.getByRole("row", { name: /Yves d'Orgeval/ })).getByText("2")).toBeTruthy();
  });
});
