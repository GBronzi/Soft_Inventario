import { describe, expect, it } from "vitest";

import { getReleaseNotesForVersion, parseReleaseBody } from "@/lib/releaseNotes";

describe("release notes", () => {
  it("parsea secciones markdown con bullets", () => {
    expect(parseReleaseBody("## Ventas\n- Nueva caja\n- Medios de pago\n\n## Parches\n- Respaldo automatico")).toEqual([
      { title: "Ventas", items: ["Nueva caja", "Medios de pago"] },
      { title: "Parches", items: ["Respaldo automatico"] },
    ]);
  });

  it("usa notas locales para una version conocida", () => {
    const notes = getReleaseNotesForVersion("v1.0.11");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].items[0]).toContain("Nueva ventana de venta");
  });

  it("incluye notas locales para la sincronizacion de Tiendanube", () => {
    const notes = getReleaseNotesForVersion("v1.1.0");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].items.join(" ")).toContain("Sincronizacion");
    expect(notes[1].items.join(" ")).toContain("token");
  });
});
