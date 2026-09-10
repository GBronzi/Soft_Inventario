// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/ParticleField", () => ({ ParticleField: () => <div data-testid="particles" /> }));

import { Login } from "@/pages/Login";

afterEach(cleanup);

describe("Login", () => {
  it("crea el primer acceso solo cuando las contraseñas coinciden", async () => {
    const onSetup = vi.fn().mockResolvedValue("ABCDE-23456-FGHIJ-7890K");
    render(<Login status={{ configured: false, username: null }} onLogin={vi.fn()} onSetup={onSetup} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Usuario" }), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "segura123" } });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "distinta123" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear acceso" }));
    expect(screen.getByRole("alert").textContent).toContain("no coinciden");
    expect(onSetup).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "segura123" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear acceso" }));
    await waitFor(() => expect(onSetup).toHaveBeenCalledWith("admin", "segura123"));
    expect(screen.getByText("ABCDE-23456-FGHIJ-7890K")).toBeTruthy();
  });

  it("muestra un error cuando las credenciales son incorrectas", async () => {
    const onLogin = vi.fn().mockResolvedValue(false);
    render(<Login status={{ configured: true, username: "admin" }} onLogin={onLogin} onSetup={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "incorrecta" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Usuario o contraseña incorrectos");
  });
});
