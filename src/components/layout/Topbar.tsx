import { Link, useLocation } from "react-router-dom";
import { getActiveNavigationItem } from "@/components/layout/navigation";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function Topbar() {
  const location = useLocation();
  const activeItem = getActiveNavigationItem(location.pathname);

  return (
    <header className="border-b border-border bg-background/80 px-5 py-4 backdrop-blur-md sticky top-0 z-50">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/80">
            Control de Inventario
          </p>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {activeItem?.label ?? "Panel"}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="h-6 w-px bg-border mx-1" />
          <div className="flex gap-2">
            <Link
              to="/onboarding"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted hover:shadow-sm active:scale-95"
            >
              Ayuda
            </Link>
            <Link
              to="/producto/nuevo"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-md transition-all hover:opacity-90 hover:shadow-primary/20 active:scale-95"
            >
              Nuevo producto
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}