import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "grey";
export type UiScale = "xs" | "compact" | "standard" | "comfortable" | "large" | "xl";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  uiScale: UiScale;
  setUiScale: (scale: UiScale) => void;
}

export const UI_SCALE_OPTIONS: Array<{ id: UiScale; label: string; description: string }> = [
  { id: "xs", label: "Netbook", description: "1024x600 / 1280x720 - máxima cantidad de contenido visible" },
  { id: "compact", label: "HD", description: "1366x768 - compacto para notebooks pequeñas" },
  { id: "standard", label: "HD+", description: "1440x900 - tamaño normal recomendado" },
  { id: "comfortable", label: "1600x900", description: "Más aire visual sin agrandar demasiado los paneles" },
  { id: "large", label: "Full HD", description: "1920x1080 - texto y controles más grandes" },
  { id: "xl", label: "2K / 4K", description: "Pantallas grandes o con escalado bajo de Windows" },
];

function readStoredUiScale(): UiScale {
  const value = localStorage.getItem("ui_scale");
  if (UI_SCALE_OPTIONS.some((option) => option.id === value)) return value as UiScale;
  return "standard";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "light",
  );
  const [uiScale, setUiScale] = useState<UiScale>(
    readStoredUiScale,
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark", "grey");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("ui-scale-xs", "ui-scale-compact", "ui-scale-standard", "ui-scale-comfortable", "ui-scale-large", "ui-scale-xl");
    root.classList.add(`ui-scale-${uiScale}`);
    localStorage.setItem("ui_scale", uiScale);
  }, [uiScale]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, uiScale, setUiScale }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
