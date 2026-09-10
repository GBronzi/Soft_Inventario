// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCatalogo, mockRegistrarVenta, mockPush } = vi.hoisted(() => ({
  mockGetCatalogo: vi.fn(),
  mockRegistrarVenta: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("@/database/queries", () => ({ getCatalogoProductos: mockGetCatalogo }));
vi.mock("@/database/ventas", () => ({ registrarVenta: mockRegistrarVenta }));
vi.mock("@/api/tiendanube", () => ({ pushInventarioIdATiendanube: mockPush }));

import { Ventas } from "@/pages/Ventas";

beforeEach(() => {
  mockGetCatalogo.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume Uno", capacidadMedida: "100 ml", variante: null, sku: "PER-1", codigoBarras: "123", stockActual: 5, precioVenta: 100, precioCompra: 40, estado: "ACTIVO" }]);
  mockRegistrarVenta.mockResolvedValue({ id: 1, numero: "V-1", medioPago: "EFECTIVO", total: 200, creadaEn: "2026-07-06", inventarioIds: [7] });
  mockPush.mockResolvedValue({ categoryAssigned: true });
});

afterEach(cleanup);

describe("Nueva venta", () => {
  it("busca, agrega, cambia cantidad y confirma la venta", async () => {
    render(<Ventas />);

    fireEvent.change(screen.getByPlaceholderText(/Buscar perfume/), { target: { value: "PER-1" } });
    fireEvent.click(await screen.findByText("Perfume Uno"));
    fireEvent.click(screen.getByRole("button", { name: /increment/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar venta" }));

    await waitFor(() => expect(mockRegistrarVenta).toHaveBeenCalledWith(expect.objectContaining({
      medioPago: "EFECTIVO",
      items: [{ inventarioId: 7, cantidad: 2, precioUnitario: 100 }],
    })));
    expect(await screen.findByText(/Venta V-1 registrada/)).toBeTruthy();
  });
});
