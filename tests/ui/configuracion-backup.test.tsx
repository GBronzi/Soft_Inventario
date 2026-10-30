// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreatePreUpdateBackup = vi.hoisted(() => vi.fn());

vi.mock("@/database/db", () => ({
  DATABASE_URL: "sqlite:inventario_v4.db",
  createPreUpdateBackup: mockCreatePreUpdateBackup,
  pingDatabase: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/database/queries", () => ({
  getConfiguracionEmpresa: vi.fn().mockResolvedValue({ nombreEmpresa: "Demo", logoPathLocal: "", moneda: "ARS" }),
  saveConfiguracionEmpresa: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/updater", () => ({
  checkForUpdate: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("1.1.8"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
  invoke: vi.fn().mockResolvedValue({
    isValid: true,
    holder: "Demo",
    expiresAt: null,
    mode: "development",
    message: "Licencia válida",
    username: "admin",
    recoveryConfigured: true,
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { Configuracion } from "@/pages/Configuracion";

beforeEach(() => {
  localStorage.clear();
  mockCreatePreUpdateBackup.mockResolvedValue("C:\\Users\\demo\\AppData\\Roaming\\com.softinventario.app\\inventario_backup.db");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Configuración backup local", () => {
  it("crea un backup manual y muestra la ruta en la tarjeta de backup", async () => {
    render(
      <ThemeProvider>
        <Configuracion />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Crear Backup (.db)" }));

    await waitFor(() => expect(mockCreatePreUpdateBackup).toHaveBeenCalledWith("1.1.8"));
    expect(await screen.findByText(/Respaldo creado en:/)).toBeTruthy();
    expect(screen.getByText(/inventario_backup\.db/)).toBeTruthy();
  });
});
