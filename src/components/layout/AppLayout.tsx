import { useEffect, useState } from "react";
import { AlertTriangle, WifiOff, X } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Topbar } from "@/components/layout/Topbar";
import { UpdateNotifier } from "@/components/shared/UpdateNotifier";
import {
  TIENDANUBE_CONNECTION_EVENT,
  TIENDANUBE_PENDING_CHANGES_EVENT,
  useTiendanubeSync,
  type TiendanubeConnectionEventDetail,
  type TiendanubePendingChangesDetail,
} from "@/hooks/useTiendanubeSync";

export function AppLayout() {
  useTiendanubeSync();
  const navigate = useNavigate();
  const [pendingTiendanubeChanges, setPendingTiendanubeChanges] = useState<number | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<TiendanubeConnectionEventDetail | null>(null);

  useEffect(() => {
    function onPending(event: Event) {
      const detail = (event as CustomEvent<TiendanubePendingChangesDetail>).detail;
      const count = Number(detail?.procesados ?? 0);
      if (count > 0) setPendingTiendanubeChanges(count);
    }

    function onConnection(event: Event) {
      const detail = (event as CustomEvent<TiendanubeConnectionEventDetail>).detail;
      if (detail?.level === "recovered") {
        setConnectionIssue(null);
        return;
      }
      if (detail?.level) setConnectionIssue(detail);
    }

    window.addEventListener(TIENDANUBE_PENDING_CHANGES_EVENT, onPending);
    window.addEventListener(TIENDANUBE_CONNECTION_EVENT, onConnection);
    return () => {
      window.removeEventListener(TIENDANUBE_PENDING_CHANGES_EVENT, onPending);
      window.removeEventListener(TIENDANUBE_CONNECTION_EVENT, onConnection);
    };
  }, []);

  return (
    <div className="app-shell min-h-screen bg-background text-foreground lg:flex">
      <AppSidebar />

      <div className="app-content flex min-h-screen min-w-0 flex-1 flex-col">
        <UpdateNotifier />
        {connectionIssue && (
          <div className={`mx-4 mt-4 rounded-2xl border px-4 py-3 shadow-sm md:mx-6 ${connectionIssue.level === "auth" ? "border-rose-500/30 bg-rose-500/10 text-rose-900" : "border-amber-500/30 bg-amber-500/10 text-amber-900"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <WifiOff className="size-5 shrink-0" />
                <p className="text-sm font-bold">{connectionIssue.message}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setConnectionIssue(null); navigate("/tiendanube"); }}
                  className={`h-9 rounded-xl px-4 text-xs font-black uppercase tracking-wide text-white ${connectionIssue.level === "auth" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}
                >
                  {connectionIssue.level === "auth" ? "Revincular" : "Revisar"}
                </button>
                <button
                  type="button"
                  aria-label="Cerrar aviso de conexión Tiendanube"
                  onClick={() => setConnectionIssue(null)}
                  className="flex size-9 items-center justify-center rounded-xl border border-current/20 hover:bg-white/20"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        {pendingTiendanubeChanges != null && (
          <div className="mx-4 mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-900 shadow-sm md:mx-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="size-5 shrink-0" />
                <p className="text-sm font-bold">
                  Tiendanube detectó {pendingTiendanubeChanges} cambio/s pendiente/s. Revisa antes de aplicar stock, precio o productos nuevos.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setPendingTiendanubeChanges(null); navigate("/tiendanube"); }}
                  className="h-9 rounded-xl bg-amber-600 px-4 text-xs font-black uppercase tracking-wide text-white hover:bg-amber-700"
                >
                  Abrir sincronización
                </button>
                <button
                  type="button"
                  aria-label="Cerrar aviso de Tiendanube"
                  onClick={() => setPendingTiendanubeChanges(null)}
                  className="flex size-9 items-center justify-center rounded-xl border border-amber-500/30 hover:bg-amber-500/10"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        <Topbar />
        <main className="app-main flex-1 p-5 md:p-6">
          <div className="app-page mx-auto flex w-full max-w-7xl flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}