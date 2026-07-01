// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetProductoByCodigoBarras } = vi.hoisted(() => ({
  mockGetProductoByCodigoBarras: vi.fn(),
}));

vi.mock("@/database/queries", () => ({
  getProductoByCodigoBarras: mockGetProductoByCodigoBarras,
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
}));

import { EscanerBluetoothPanel } from "@/components/shared/EscanerBluetoothPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Escáner Bluetooth", () => {
  it("busca el código y abre una venta rápida para la variante encontrada", async () => {
    mockGetProductoByCodigoBarras.mockResolvedValue({
      inventarioId: 7,
      productoId: 2,
      nombre: "Perfume Ámbar",
      marca: "Maison",
      variante: "Tester",
      capacidadMedida: "100 ml",
      codigoBarras: "7791234567890",
      stockActual: 4,
      stockMinimo: 1,
      precioVenta: 25000,
      precioCompra: 10000,
      imagenPathLocal: null,
      imagenUrl: null,
      estado: "ACTIVO",
    });

    const router = createMemoryRouter(
      [
        { path: "/dashboard", element: <EscanerBluetoothPanel /> },
        { path: "/movimientos", element: <div>Venta</div> },
        { path: "/producto/:inventarioId", element: <div>Producto</div> },
      ],
      { initialEntries: ["/dashboard"] },
    );
    render(<RouterProvider router={router} />);

    const input = screen.getByRole("textbox", { name: "Código de barras" });
    fireEvent.change(input, { target: { value: "7791234567890" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText("Perfume Ámbar")).toBeTruthy();
    expect(mockGetProductoByCodigoBarras).toHaveBeenCalledWith("7791234567890");

    fireEvent.click(screen.getByRole("button", { name: "Venta rápida" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimientos");
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get("inventarioId")).toBe("7");
      expect(params.get("presetTipoMovimiento")).toBe("SALIDA");
      expect(params.get("presetMotivo")).toBe("Venta rápida local");
    });
  });
});
