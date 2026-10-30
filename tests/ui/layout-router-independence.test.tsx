// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/queries", () => ({
  getConfiguracionEmpresa: vi.fn().mockResolvedValue({ nombreEmpresa: null, logoPathLocal: null, moneda: "ARS" }),
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("1.0.7") }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ThemeProvider } from "@/components/shared/ThemeProvider";

afterEach(cleanup);

describe("estructura independiente del router", () => {
  it("puede montar la navegación durante una transición de arranque", () => {
    window.location.hash = "#/dashboard";
    render(<ThemeProvider><AppSidebar /><Topbar /></ThemeProvider>);

    expect(screen.getByRole("link", { name: /Vista general/ }).getAttribute("href")).toBe("#/dashboard");
    expect(screen.getByRole("link", { name: "Ayuda" }).getAttribute("href")).toBe("#/onboarding");
    expect(screen.queryByText("Algo salió mal")).toBeNull();
  });
});
