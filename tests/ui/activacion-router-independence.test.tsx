// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { Activacion } from "@/pages/Activacion";

const invalidStatus = {
  isValid: false,
  holder: null,
  expiresAt: null,
  mode: "inactive",
  message: "Licencia requerida",
};

beforeEach(() => {
  invokeMock.mockReset();
  window.history.replaceState({}, "", "/");
});

afterEach(cleanup);

describe("Activacion independiente del router", () => {
  it("se monta antes de RouterProvider sin usar contexto de navegación", () => {
    render(<Activacion initialStatus={invalidStatus} onActivated={vi.fn()} />);

    expect(screen.getByText("Activación de Licencia")).toBeTruthy();
    expect(screen.queryByText("Algo salió mal")).toBeNull();
  });

  it("activa con el código recibido en la URL", async () => {
    window.history.replaceState({}, "", "/?code=licencia-firmada");
    invokeMock.mockResolvedValue({ ...invalidStatus, isValid: true, message: "" });
    const onActivated = vi.fn();

    render(<Activacion initialStatus={invalidStatus} onActivated={onActivated} />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("activate_license", {
      licenseKey: "licencia-firmada",
    }));
    await waitFor(() => expect(onActivated).toHaveBeenCalledOnce());
  });
});
