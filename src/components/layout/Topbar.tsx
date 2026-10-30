import { useSyncExternalStore } from "react";
import { getActiveNavigationItem } from "@/components/layout/navigation";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { updateLiquidGlassPointer } from "@/lib/liquidGlass";

export function Topbar() {
  const pathname = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("hashchange", onStoreChange);
      window.addEventListener("popstate", onStoreChange);
      return () => {
        window.removeEventListener("hashchange", onStoreChange);
        window.removeEventListener("popstate", onStoreChange);
      };
    },
    () => {
      const hashPath = window.location.hash.replace(/^#/, "").split("?")[0];
      return hashPath || "/dashboard";
    },
    () => "/dashboard",
  );
  const activeItem = getActiveNavigationItem(pathname);
  const { logout } = useAuth();

  return (
    <header className="app-topbar border-b border-border bg-background/80 px-5 py-4 backdrop-blur-md sticky top-0 z-50">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/80">
            Control de Inventario
          </p>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {activeItem?.label ?? "Panel"}
          </h2>
        </div>

        <div className="app-topbar-actions flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <Button type="button" variant="ghost" size="icon" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="size-9 text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" />
          </Button>
          <div className="h-6 w-px bg-border mx-1" />
          <div className="flex gap-2">
            <a
              href="#/onboarding"
              data-slot="link-button"
              onPointerMove={updateLiquidGlassPointer}
              className="liquid-control inline-flex h-9 items-center justify-center rounded-full border px-3 py-2 text-sm font-medium text-foreground transition-all"
            >
              <span className="relative z-10">Ayuda</span>
            </a>
            <a
              href="#/producto/nuevo"
              data-slot="link-button"
              onPointerMove={updateLiquidGlassPointer}
              className="liquid-control inline-flex h-9 items-center justify-center rounded-full border px-3 py-2 text-sm font-bold text-foreground transition-all"
            >
              <span className="relative z-10">Nuevo producto</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
