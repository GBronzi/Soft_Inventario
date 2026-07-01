import { useEffect, useState } from "react";
import {
  ShoppingBag,
  CloudSync,
  Unlink,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Zap,
  ExternalLink,
  Loader2,
  DownloadCloud,
  RefreshCw
} from "lucide-react";
import {
  getTiendanubeSyncStatus,
  getTiendanubeCredentials,
  saveTiendanubeCredentials,
  clearTiendanubeCredentials,
  syncStockWithTiendanube,
  importarDesdeTiendanube,
  getPollConfig,
  setPollConfig,
  type TiendanubePollConfig
} from "@/api/tiendanube";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TiendanubeSyncStatus } from "@/types";
import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

// URL de autorización de Tiendanube. El redirect_uri apunta directamente al bridge
// de Vercel, que canjea el code por el token y reenvía a la app vía deep link
// (soft-inventario://auth?token=...&user_id=...).
const TIENDANUBE_AUTH_URL = "https://www.tiendanube.com/apps/28338/authorize?client_id=28338&response_type=code&redirect_uri=https%3A%2F%2Fvercel-bridge-5fpy4bubs-mauricios-projects-45a56444.vercel.app%2Fapi%2Fauth&scope=read_products%20write_products";

export function Tiendanube() {
  const [status, setStatus] = useState<TiendanubeSyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [pollConfig, setPollConfigState] = useState<TiendanubePollConfig>(() => getPollConfig());

  async function loadStatus() {
    const s = await getTiendanubeSyncStatus();
    setStatus(s);
  }

  useEffect(() => {
    void loadStatus();

    // Escuchar el deep link cuando Tiendanube redirige de vuelta a la app
    const unlisten = onOpenUrl(async (urls) => {
      for (const url of urls) {
        try {
          const parsed = new URL(url);
          if (parsed.hostname === "auth") {
            // El bridge ya canjeó el code y nos reenvía el token y el user_id
            // (ID de la tienda) directamente en el deep link.
            const token = parsed.searchParams.get("token") ?? parsed.searchParams.get("access_token");
            const userId = parsed.searchParams.get("user_id");
            if (token && userId) {
              saveTiendanubeCredentials({ accessToken: token, userId });
              void loadStatus();
              setIsLinking(false);
              setSyncLogs([`[${new Date().toLocaleTimeString()}] ✅ Tienda vinculada exitosamente (ID: ${userId})`]);
            } else {
              setIsLinking(false);
              setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: el deep link no incluyó token o user_id.`]);
            }
          }
        } catch { /* URL inválida, ignorar */ }
      }
    });

    return () => { void unlisten.then(fn => fn()); };
  }, []);

  async function handleConnect() {
    setIsLinking(true);
    setSyncLogs([`[${new Date().toLocaleTimeString()}] Abriendo Tiendanube para autorización...`]);
    try {
      await openUrl(TIENDANUBE_AUTH_URL);
    } catch {
      setIsLinking(false);
      setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Error al abrir el navegador.`]);
    }
  }

  function handleDisconnect() {
    clearTiendanubeCredentials();
    setSyncLogs([]);
    setIsLinking(false);
    void loadStatus();
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncLogs([`[${new Date().toLocaleTimeString()}] Iniciando sincronización...`]);
    try {
      await syncStockWithTiendanube((msg) => {
        setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
      });
      void loadStatus();
    } catch (error) {
      setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleImport() {
    setIsImporting(true);
    setSyncLogs([`[${new Date().toLocaleTimeString()}] Importando desde Tiendanube (no se elimina nada de tu tienda)...`]);
    try {
      await importarDesdeTiendanube((msg) => {
        setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
      });
      void loadStatus();
    } catch (error) {
      setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setIsImporting(false);
    }
  }

  function handlePollToggle(enabled: boolean) {
    setPollConfig({ enabled });
    setPollConfigState(getPollConfig());
  }

  function handleIntervalChange(intervalSec: number) {
    setPollConfig({ intervalSec });
    setPollConfigState(getPollConfig());
  }

const [creds, setCreds] = useState<any>(null);

  useEffect(() => {
    if (status?.connected) {
      (async () => {
        const c = await getTiendanubeCredentials();
        setCreds(c);
      })();
    } else {
      setCreds(null);
    }
  }, [status?.connected]);

  if (!status) return (
    <div className="p-20 text-center animate-pulse text-muted-foreground uppercase tracking-widest font-black">
      Cargando E-commerce Bridge...
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col gap-6 lg:flex-row">

        {/* Panel de conexión */}
        <section className="w-full lg:w-[400px] shrink-0 space-y-6">
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md overflow-hidden">
            <CardHeader className="bg-[#002D45] text-white pb-8 relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-10">
                <ShoppingBag className="size-32" />
              </div>
              <div className="relative z-10 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center">
                    <ShoppingBag className="size-5" />
                  </div>
                  <CardTitle className="text-xl">Tiendanube</CardTitle>
                </div>
                <CardDescription className="text-white/60">Sincronización de Stock Omnicanal</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">

              {status.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-700/60">Tienda Conectada</p>
                      <p className="text-sm font-bold text-emerald-700">ID: {creds?.userId ?? "—"}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={isSyncing}
                    className="w-full h-12 rounded-2xl border-rose-500/20 text-rose-500 hover:bg-rose-500/5 font-black gap-2"
                  >
                    <Unlink className="size-4" /> Desvincular Tienda
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Vincula tu tienda con un solo clic. Se abrirá el navegador para que autorices el acceso, y tu tienda quedará conectada automáticamente. El propietario de la tienda sólo necesita iniciar sesión en Tiendanube; no se requiere crear una cuenta de Partners.
                  </p>
                  <Button
                    onClick={handleConnect}
                    disabled={isLinking}
                    className="w-full h-14 rounded-2xl bg-[#002D45] text-white hover:bg-[#002D45]/90 font-black shadow-xl gap-2 text-base"
                  >
                    {isLinking
                      ? <><Loader2 className="size-5 animate-spin" /> Esperando autorización...</>
                      : <><ExternalLink className="size-5" /> Vincular con Tiendanube</>
                    }
                  </Button>
                  {isLinking && (
                    <p className="text-xs text-center text-muted-foreground">
                      Autoriza en el navegador y la app se conectará automáticamente.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-card/40 backdrop-blur-sm">
            <CardContent className="p-6 text-[10px] text-muted-foreground space-y-2 leading-relaxed italic text-center">
              La sincronización cruza por el <strong>ID interno</strong> de cada producto/variante de Tiendanube, así funciona aunque el SKU esté vacío (se generan automáticamente al importar).
            </CardContent>
          </Card>
        </section>

        {/* Panel de control y logs */}
        <section className="flex-1 space-y-6">
          <Card className={`border-none shadow-xl transition-all ${status.connected ? 'bg-card/60' : 'bg-muted/10 opacity-60'} backdrop-blur-md overflow-hidden`}>
            <CardHeader className="pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${status.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {status.connected ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                  </div>
                  <div>
                    <CardTitle className="text-xl">Estado del Bridge</CardTitle>
                    <CardDescription>{status.connected ? 'Canales vinculados y listos' : 'Vínculo pendiente'}</CardDescription>
                  </div>
                </div>
                {status.lastSync && (
                  <Badge variant="outline" className="rounded-lg gap-1.5 py-1 px-3">
                    <Clock className="size-3" /> Último pulso: {status.lastSync}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-8 space-y-6">
              {status.connected ? (
                <div className="space-y-6">
                  <div className="p-6 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between flex-wrap gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-emerald-600/60 tracking-widest">Estado</p>
                      <p className="text-emerald-700 font-bold leading-tight">{status.message}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={handleImport}
                        disabled={isImporting || isSyncing}
                        className="rounded-2xl h-14 px-6 bg-[#002D45] text-white font-black hover:bg-[#002D45]/90 shadow-xl gap-3 border-none"
                      >
                        {isImporting ? <Loader2 className="size-5 animate-spin" /> : <DownloadCloud className="size-5" />}
                        {isImporting ? "Importando..." : "Importar desde Tiendanube"}
                      </Button>
                      <Button
                        onClick={handleSync}
                        disabled={isSyncing || isImporting}
                        className="rounded-2xl h-14 px-8 bg-emerald-500 text-white font-black hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 gap-3 border-none"
                      >
                        {isSyncing ? <CloudSync className="size-5 animate-spin" /> : <Zap className="size-5" />}
                        {isSyncing ? "Sincronizando..." : "Subir Stock"}
                      </Button>
                    </div>
                  </div>

                  <div className="p-6 rounded-[2rem] bg-card/40 border border-border/40 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-50">
                      <RefreshCw className="size-3" /> Sincronización automática (Tiendanube → Programa)
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={pollConfig.enabled}
                          onChange={(e) => handlePollToggle(e.target.checked)}
                          className="size-5 accent-emerald-500"
                        />
                        <span className="text-sm font-bold">{pollConfig.enabled ? "Activada" : "Desactivada"}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-muted-foreground">Cada</span>
                        <select
                          value={pollConfig.intervalSec}
                          onChange={(e) => handleIntervalChange(Number(e.target.value))}
                          className="h-10 rounded-xl border border-border/50 bg-background/50 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value={60}>60 segundos</option>
                          <option value={120}>120 segundos</option>
                          <option value={300}>5 minutos</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                      Baja automáticamente los cambios hechos en Tiendanube (stock, precio, descripción, etc.) y los aplica en el programa. Nunca elimina productos.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-40 ml-1">
                      <Terminal className="size-3" /> Flujo de Operaciones
                    </div>
                    <div className="bg-[#050510] border border-white/5 rounded-[2rem] p-6 font-mono text-[11px] min-h-[160px] max-h-[300px] overflow-y-auto">
                      {syncLogs.length === 0 ? (
                        <p className="text-white/20 italic select-none">Esperando comando de ejecución...</p>
                      ) : (
                        <div className="space-y-1.5">
                          {syncLogs.map((log, i) => (
                            <div key={i} className="flex gap-3 animate-in slide-in-from-left-2 duration-300">
                              <span className="text-emerald-500/50 shrink-0">::</span>
                              <span className={log.includes('ERROR') ? 'text-rose-400 font-bold' : log.includes('✅') ? 'text-emerald-400' : 'text-emerald-500'}>
                                {log}
                              </span>
                            </div>
                          ))}
                          {(isSyncing || isImporting) && <div className="animate-pulse text-emerald-500">&gt; Procesando...</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center space-y-4">
                  <div className="size-16 rounded-full bg-rose-500/5 border border-rose-500/20 mx-auto flex items-center justify-center text-rose-500">
                    <AlertCircle className="size-8" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">Puente Inactivo</p>
                    <p className="text-sm text-muted-foreground">Vincula tu tienda Tiendanube para comenzar a sincronizar el stock automáticamente.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}