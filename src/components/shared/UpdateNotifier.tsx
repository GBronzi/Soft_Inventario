import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, CheckCircle2, Clock3, Download, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkForUpdate, type AvailableUpdate } from "@/lib/updater";
import { getReleaseNotesForVersion, parseReleaseBody } from "@/lib/releaseNotes";

export function UpdateNotifier() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
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

  const notes = useMemo(() => {
    if (!update) return [];
    const fromBody = parseReleaseBody(update.notes);
    return fromBody.length ? fromBody : getReleaseNotesForVersion(update.version);
  }, [update]);

  if (!update || dismissedVersion === update.version) return null;

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <section className="liquid-surface relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-background shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-emerald-500 to-sky-500" />
        <div className="flex items-start gap-4 border-b bg-muted/30 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
            <Sparkles className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-normal text-primary">Nueva actualizacion disponible</p>
            <h2 id="update-title" className="text-2xl font-black leading-tight">Version {update.version}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tienes instalada la version {update.currentVersion}. Antes de instalar se crea un respaldo automatico de la base de datos.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Recordar mas tarde" title="Recordar mas tarde" onClick={() => setDismissedVersion(update.version)} disabled={installing}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="liquid-surface rounded-lg border bg-card p-3">
              <ArrowDownToLine className="mb-2 size-4 text-primary" />
              <p className="text-xs font-bold text-muted-foreground">Instalacion</p>
              <p className="text-sm font-black">Descarga firmada</p>
            </div>
            <div className="liquid-surface rounded-lg border bg-card p-3">
              <ShieldCheck className="mb-2 size-4 text-emerald-600" />
              <p className="text-xs font-bold text-muted-foreground">Seguridad</p>
              <p className="text-sm font-black">Respaldo previo</p>
            </div>
            <div className="liquid-surface rounded-lg border bg-card p-3">
              <Clock3 className="mb-2 size-4 text-sky-600" />
              <p className="text-xs font-bold text-muted-foreground">Proceso</p>
              <p className="text-sm font-black">Puede tardar minutos</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {notes.length ? notes.map((section) => (
              <div key={section.title} className="liquid-surface rounded-xl border bg-card/70 p-4">
                <h3 className="text-sm font-black">{section.title}</h3>
                <ul className="mt-3 space-y-2">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )) : (
              <div className="liquid-surface rounded-xl border bg-card/70 p-4 text-sm text-muted-foreground">Esta version incluye mejoras y correcciones generales.</div>
            )}
          </div>

          {installing && <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
          {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-medium text-rose-700">No se pudo instalar: {error}</p>}
        </div>

        <div className="flex flex-col gap-3 border-t bg-muted/20 p-5 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={() => setDismissedVersion(update.version)} disabled={installing}>Recordar mas tarde</Button>
          <Button type="button" className="gap-2" onClick={() => void install()} disabled={installing}>
            {installing ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
            {installing ? `Instalando ${progress}%` : "Instalar actualizacion"}
          </Button>
        </div>
      </section>
    </div>
  );
}
