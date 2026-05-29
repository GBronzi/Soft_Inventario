import { Moon, Sun, Palette } from "lucide-react";
import { useTheme, Theme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes: { id: Theme; icon: any; label: string }[] = [
    { id: "light", icon: Sun, label: "Claro" },
    { id: "dark", icon: Moon, label: "Noche" },
    { id: "grey", icon: Palette, label: "Gris" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
      {themes.map((t) => {
        const Icon = t.icon;
        const isActive = theme === t.id;
        
        return (
          <Button
            key={t.id}
            variant="ghost"
            size="sm"
            onClick={() => setTheme(t.id)}
            className={`h-8 w-8 rounded-lg p-0 transition-all ${
              isActive 
                ? "bg-primary text-primary-foreground shadow-sm scale-105" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title={`Modo ${t.label}`}
          >
            <Icon className="size-4" />
          </Button>
        );
      })}
    </div>
  );
}
