// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));

vi.mock("@/database/db", () => ({ getDatabase: vi.fn(async () => db) }));

const gasto = {
  id: "gasto-1",
  nombre: "Alquiler",
  fecha: "2026-10-01",
  descripcion: "Local",
  items: [{ id: "detalle-1", concepto: "Mensual", valor: 150000 }],
  total: 150000,
  creadoEn: "2026-10-01T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("gastos dentro del respaldo SQLite", () => {
  it("importa gastos anteriores una sola vez sin borrar el almacenamiento original", async () => {
    window.localStorage.setItem("soft_inventario_gastos", JSON.stringify([gasto]));
    let migrated = false;
    db.select.mockImplementation(async (query: string) => query.includes("gastos_migracion")
      ? (migrated ? [{ origen: window.location.origin }] : [])
      : [{ ...gasto, itemsJson: JSON.stringify(gasto.items) }]);
    db.execute.mockImplementation(async (query: string) => {
      if (query.includes("INSERT OR IGNORE INTO gastos_migracion")) migrated = true;
      return { rowsAffected: 1 };
    });

    const { getGastos } = await import("@/database/gastos");
    expect(await getGastos()).toEqual([gasto]);
    expect(await getGastos()).toEqual([gasto]);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO gastos ("), [
      gasto.id, gasto.nombre, gasto.fecha, gasto.descripcion, JSON.stringify(gasto.items), gasto.total, gasto.creadoEn,
    ]);
    expect(window.localStorage.getItem("soft_inventario_gastos")).toBe(JSON.stringify([gasto]));
    expect(db.execute).toHaveBeenCalledWith(
      "INSERT OR IGNORE INTO gastos_migracion (origen) VALUES ($1)",
      [window.location.origin],
    );
  });

  it("usa solo los gastos restaurados cuando la base ya tiene el marcador de migración", async () => {
    window.localStorage.setItem("soft_inventario_gastos", JSON.stringify([gasto]));
    db.select.mockImplementation(async (query: string) => query.includes("gastos_migracion")
      ? [{ origen: window.location.origin }]
      : [{ ...gasto, id: "restaurado-1", nombre: "Gasto del respaldo", itemsJson: JSON.stringify(gasto.items) }]);

    const { getGastos } = await import("@/database/gastos");
    expect(await getGastos()).toMatchObject([{ id: "restaurado-1", nombre: "Gasto del respaldo" }]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("no marca una migración vacía desde la app de desarrollo", async () => {
    db.select.mockResolvedValue([]);
    const { ensureLegacyGastosMigrated } = await import("@/database/gastos");

    await ensureLegacyGastosMigrated();

    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rechaza datos antiguos corruptos sin marcar la migración como completada", async () => {
    window.localStorage.setItem("soft_inventario_gastos", "{incompleto");
    db.select.mockResolvedValue([]);

    const { ensureLegacyGastosMigrated } = await import("@/database/gastos");
    await expect(ensureLegacyGastosMigrated()).rejects.toThrow("formato válido");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("guarda cambios y elimina filas en SQLite", async () => {
    db.select.mockResolvedValue([{ origen: window.location.origin }]);
    db.execute.mockResolvedValue({ rowsAffected: 1 });
    const { saveGasto, deleteGasto } = await import("@/database/gastos");

    await saveGasto(gasto);
    await deleteGasto(gasto.id);

    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT(id) DO UPDATE"), [
      gasto.id, gasto.nombre, gasto.fecha, gasto.descripcion, JSON.stringify(gasto.items), gasto.total, gasto.creadoEn,
    ]);
    expect(db.execute).toHaveBeenCalledWith("DELETE FROM gastos WHERE id = $1", [gasto.id]);
  });
});
