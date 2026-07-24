import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "grey";
export type UiScale = "compact" | "standard" | "large";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  uiScale: UiScale;
  setUiScale: (scale: UiScale) => void;
}

export const UI_SCALE_OPTIONS: Array<{ id: UiScale; label: string; description: string }> = [
  { id: "compact", label: "Pantalla chica", description: "1024x640 / 1366x768 - más contenido visible" },
  { id: "standard", label: "Estándar", description: "1440x900 - tamaño normal recomendado" },
  { id: "large", label: "Pantalla grande", description: "Full HD o superior - texto y controles más grandes" },
];

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "light",
  );
  const [uiScale, setUiScale] = useState<UiScale>(
    () => (localStorage.getItem("ui_scale") as UiScale) || "standard",
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark", "grey");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("ui-scale-compact", "ui-scale-standard", "ui-scale-large");
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