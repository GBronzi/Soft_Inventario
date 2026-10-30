// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetResumenMensualMovimientos = vi.hoisted(() => vi.fn());
const mockSaveDialog = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());
const gastosDb = vi.hoisted(() => ({
  getGastos: vi.fn(),
  saveGasto: vi.fn(),
  deleteGasto: vi.fn(),
}));

vi.mock("@/database/gastos", () => gastosDb);
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: mockSaveDialog }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

vi.mock("@/database/queries", () => ({
  MONTHLY_SALES_UPDATED_EVENT: "soft_inventario_ventas_actualizadas",
  getResumenMensualMovimientos: mockGetResumenMensualMovimientos,
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
  vi.clearAllMocks();
  window.localStorage.clear();
  gastosDb.getGastos.mockResolvedValue([gastoRegistrado]);
  gastosDb.saveGasto.mockResolvedValue(undefined);
  gastosDb.deleteGasto.mockResolvedValue(undefined);
  mockSaveDialog.mockResolvedValue("C:\\Users\\giuse\\Downloads\\gastos.csv");
  mockInvoke.mockResolvedValue(undefined);
  mockGetResumenMensualMovimientos.mockImplementation(async (mes: string) => ({ mes, ventasNetas: mes === "2026-06" ? 300000 : 0 }));
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
    await waitFor(() => expect(mockGetResumenMensualMovimientos).toHaveBeenCalledWith("2026-06"));
    expect(await screen.findByText(/300\.000,00/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Modificar Alquiler" }));
    fireEvent.change(screen.getByDisplayValue("Alquiler"), { target: { value: "Alquiler actualizado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(gastosDb.saveGasto).toHaveBeenCalledWith(expect.objectContaining({ nombre: "Alquiler actualizado" })));

    const row = screen.getByText("Alquiler actualizado").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole("button", { name: "Eliminar Alquiler actualizado" }));

    expect(confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(gastosDb.deleteGasto).toHaveBeenCalledWith("gasto-1"));
    await waitFor(() => expect(screen.getByText("No hay gastos registrados.")).toBeTruthy());
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
    gastosDb.getGastos.mockResolvedValue([gastoRegistrado, gastoJulio]);
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

  it("conserva el formulario si SQLite rechaza el guardado", async () => {
    gastosDb.saveGasto.mockRejectedValueOnce(new Error("disco lleno"));
    render(<Gastos />);
    await screen.findByText("Alquiler mensual");

    fireEvent.change(screen.getByPlaceholderText("Luz, alquiler, publicidad..."), { target: { value: "Internet" } });
    fireEvent.change(screen.getByPlaceholderText("Ej: Luz del mes"), { target: { value: "Conexión" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("disco lleno"));
    expect(screen.getByDisplayValue("Internet")).toBeTruthy();
  });

  it("exporta todos los gastos con el dialogo y confirma el archivo guardado", async () => {
    render(<Gastos />);
    await screen.findByText("Alquiler mensual");

    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("save_text_file", expect.objectContaining({
      path: "C:\\Users\\giuse\\Downloads\\gastos.csv",
      contents: expect.stringContaining('"Alquiler"'),
    })));
    expect(mockSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ name: "Excel CSV", extensions: ["csv"] }] }));
    expect(await screen.findByText("Archivo CSV guardado correctamente.")).toBeTruthy();
  });

  it("informa errores de guardado y no informa exito al cancelar", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("disco lleno"));
    render(<Gastos />);
    await screen.findByText("Alquiler mensual");

    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("disco lleno"));

    mockSaveDialog.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(mockSaveDialog).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Archivo CSV guardado correctamente.")).toBeNull();
  });
});
