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
  Loader2
} from "lucide-react";
import { 
  getTiendanubeSyncStatus, 
  getTiendanubeCredentials, 
  saveTiendanubeCredentials, 
  clearTiendanubeCredentials, 
  syncStockWithTiendanube 
} from "@/api/tiendanube";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TiendanubeSyncStatus } from "@/types";
import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

// URL de autorización de Tiendanube — reemplaza con la URL real de tu bridge Vercel si la tienes
const TIENDANUBE_AUTH_URL = "https://www.tiendanube.com/apps/28338/authorize?client_id=28338&response_type=code&redirect_uri=https%3A%2F%2FGBronzi.github.io%2FSoft_Inventario%2Ftiendanube_redirect.html&scope=read_products%20write_products";
// URL del bridge Vercel para intercambiar el código por token de acceso
const BRIDGE_URL = "https://vercel-bridge-5fpy4bubs-mauricios-projects-45a56444.vercel.app/api/auth";

export function Tiendanube() {
  const [status, setStatus] = useState<TiendanubeSyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

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
            const code = parsed.searchParams.get("code");
            const userId = parsed.searchParams.get("user_id");
            if (code && userId) {
              // Intercambiar código por token usando el bridge Vercel
              const resp = await fetch(BRIDGE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: "28338", code })
              });
              if (!resp.ok) {
                throw new Error(`Bridge error: ${resp.status}`);
              }
              const data = await resp.json();
              const token = data.access_token ?? data.token;
              if (token) {
                saveTiendanubeCredentials({ accessToken: token, userId });
                void loadStatus();
                setIsLinking(false);
                setSyncLogs([`[${new Date().toLocaleTimeString()}] ✅ Tienda vinculada exitosamente (ID: ${userId})`]);
              }
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

  // Recuperar userId para mostrar
  const creds = status?.connected ? getTiendanubeCredentials() : null;

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
              El sistema sincroniza stock usando el <strong>SKU</strong>. Asegúrate de que los SKUs coincidan en ambas plataformas.
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
                    <Button
                      onClick={handleSync}
                      disabled={isSyncing}
                      className="rounded-2xl h-14 px-8 bg-emerald-500 text-white font-black hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 gap-3 border-none"
                    >
                      {isSyncing ? <CloudSync className="size-5 animate-spin" /> : <Zap className="size-5" />}
                      {isSyncing ? "Sincronizando..." : "Sincronizar Stock"}
                    </Button>
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
                          {isSyncing && <div className="animate-pulse text-emerald-500">&gt; Procesando...</div>}
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