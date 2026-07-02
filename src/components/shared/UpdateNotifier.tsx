import { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkForUpdate, type AvailableUpdate } from "@/lib/updater";

export function UpdateNotifier() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkForUpdate().then(setUpdate).catch((reason) => {
        console.error("No se pudo comprobar actualizaciones", reason);
      });
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!update || dismissed) return null;

  async function install() {
    if (!update) return;
    setInstalling(true);
    setError(null);
    try {
      await update.install(setProgress);
    } catch (reason) {
      setError(String(reason));
      setInstalling(false);
    }
  }

  return (
    <aside className="sticky top-0 z-40 border-b border-primary/20 bg-background/95 px-5 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary"><RefreshCw className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Actualización {update.version} disponible</p>
          <p className="truncate text-xs text-muted-foreground">Versión instalada: {update.currentVersion}. Se creará un respaldo antes de instalar.</p>
          {installing && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
          {error && <p className="mt-1 text-xs text-rose-500">No se pudo instalar: {error}</p>}
        </div>
        <Button size="sm" onClick={() => void install()} disabled={installing} className="gap-2">
          {installing ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
          {installing ? `${progress}%` : "Actualizar"}
        </Button>
        <ShieldCheck className="hidden size-4 text-emerald-600 sm:block" aria-label="Paquete firmado" />
        <Button variant="ghost" size="icon" aria-label="Recordar más tarde" title="Recordar más tarde" onClick={() => setDismissed(true)} disabled={installing}><X className="size-4" /></Button>
      </div>
    </aside>
  );
}
