// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContactosPage: vi.fn(),
  getContactos: vi.fn(),
  createContacto: vi.fn(),
  updateContacto: vi.fn(),
  deleteContacto: vi.fn(),
}));

vi.mock("@/database/queries", () => mocks);

import { Contactos } from "@/pages/Contactos";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Paginación de contactos", () => {
  it("consulta páginas desde SQLite y reinicia al buscar", async () => {
    mocks.getContactosPage.mockImplementation(async (search: string, limit: number, offset: number) => ({
      items: [{
        id: offset + 1, nombre: search || `Contacto ${offset + 1}`, apellidos: null, empresa: null, cargo: null,
        email: null, emailAlternativo: null, telefono: null, telefonoAlternativo: null, direccion: null,
        ciudad: null, provincia: null, codigoPostal: null, pais: null, sitioWeb: null, fechaNacimiento: null,
        notas: null, creadoEn: "2026-01-01", actualizadoEn: "2026-01-01",
      }],
      total: search ? 1 : 250,
      limit,
    }));

    render(<Contactos />);
    expect(await screen.findByText("Página 1 de 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(mocks.getContactosPage).toHaveBeenCalledWith("", 100, 100));
    expect(await screen.findByText("Página 2 de 3")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar contacto" }), { target: { value: "Ana" } });
    await waitFor(() => expect(mocks.getContactosPage).toHaveBeenCalledWith("Ana", 100, 0));
    expect(await screen.findByText("Página 1 de 1")).toBeTruthy();
  });
});
