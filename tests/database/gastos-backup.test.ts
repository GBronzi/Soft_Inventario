// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: mocks.load } }));
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(async () => "C:/datos"),
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.load.mockResolvedValue({ select: mocks.select, execute: mocks.execute });
  mocks.select.mockResolvedValue([]);
  mocks.execute.mockResolvedValue({ rowsAffected: 1 });
});

describe("respaldo con gastos antiguos", () => {
  it("migra gastos antes de ejecutar VACUUM INTO", async () => {
    window.localStorage.setItem("soft_inventario_gastos", JSON.stringify([{
      id: "gasto-1", nombre: "Alquiler", fecha: "2026-10-01", descripcion: "Local",
      items: [{ id: "i1", concepto: "Mensual", valor: 100 }], total: 100,
      creadoEn: "2026-10-01T10:00:00Z",
    }]));
    const { createPreUpdateBackup } = await import("@/database/db");

    const path = await createPreUpdateBackup("1.2.12");

    const executed = mocks.execute.mock.calls.map(([sql]: [string]) => sql);
    const expenseIndex = executed.findIndex((sql: string) => sql.includes("INSERT OR IGNORE INTO gastos ("));
    const markerIndex = executed.findIndex((sql: string) => sql.includes("INSERT OR IGNORE INTO gastos_migracion"));
    const backupIndex = executed.findIndex((sql: string) => sql.startsWith("VACUUM INTO"));
    expect(expenseIndex).toBeGreaterThanOrEqual(0);
    expect(markerIndex).toBeGreaterThan(expenseIndex);
    expect(backupIndex).toBeGreaterThan(markerIndex);
    expect(path).toContain("inventario_backup_antes_v1.2.12_");
  });

  it("no crea un respaldo incompleto si la importación antigua falla", async () => {
    window.localStorage.setItem("soft_inventario_gastos", "{corrupto");
    const { createPreUpdateBackup } = await import("@/database/db");

    await expect(createPreUpdateBackup("1.2.12")).rejects.toThrow("formato válido");
    expect(mocks.execute.mock.calls.some(([sql]: [string]) => sql.startsWith("VACUUM INTO"))).toBe(false);
  });
});
