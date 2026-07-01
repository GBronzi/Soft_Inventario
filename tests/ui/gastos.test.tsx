// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/queries", () => ({
  MONTHLY_SALES_UPDATED_EVENT: "soft_inventario_ventas_actualizadas",
}));

import { Gastos } from "@/pages/Gastos";

const gastoRegistrado = {
  id: "gasto-1",
  nombre: "Alquiler",
  fecha: "2026-06-10",
  descripcion: "Local principal",
  items: [{ id: "detalle-1", concepto: "Alquiler mensual", valor: 150000 }],
  total: 150000,
  creadoEn: "2026-06-10T10:00:00.000Z",
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("soft_inventario_gastos", JSON.stringify([gastoRegistrado]));
  window.localStorage.setItem("soft_inventario_ventas_mensuales", JSON.stringify({ "2026-06": 300000 }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Gastos", () => {
  it("lista, modifica y elimina gastos, y muestra las ventas automaticas", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Gastos />);

    expect(await screen.findByText("Alquiler mensual")).toBeTruthy();
    expect(screen.getByText("$ 300.000,00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Modificar Alquiler" }));
    fireEvent.change(screen.getByDisplayValue("Alquiler"), { target: { value: "Alquiler actualizado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("soft_inventario_gastos") ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].nombre).toBe("Alquiler actualizado");
    });

    const row = screen.getByText("Alquiler actualizado").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole("button", { name: "Eliminar Alquiler actualizado" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(JSON.parse(window.localStorage.getItem("soft_inventario_gastos") ?? "[]")).toEqual([]);
    expect(screen.getByText("No hay gastos registrados.")).toBeTruthy();
  });

  it("filtra la tabla por mes sin eliminar el historial", async () => {
    const gastoJulio = {
      ...gastoRegistrado,
      id: "gasto-2",
      nombre: "Publicidad",
      fecha: "2026-07-05",
      items: [{ id: "detalle-2", concepto: "Campana julio", valor: 50000 }],
      total: 50000,
    };
    window.localStorage.setItem("soft_inventario_gastos", JSON.stringify([gastoRegistrado, gastoJulio]));
    render(<Gastos />);

    expect(await screen.findByText("Alquiler mensual")).toBeTruthy();
    expect(screen.getByText("Campana julio")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filtrar por mes"), { target: { value: "2026-07" } });
    expect(screen.queryByText("Alquiler mensual")).toBeNull();
    expect(screen.getByText("Campana julio")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Todos los meses" }));
    expect(screen.getByText("Alquiler mensual")).toBeTruthy();
    expect(screen.getByText("Campana julio")).toBeTruthy();
  });
});
