import { useEffect, useMemo, useState } from "react";
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
  RefreshCw,
  SearchCheck,
  DownloadCloud,
  ShieldCheck,
} from "lucide-react";
import {
  acknowledgeTiendanubeWebhookEvents,
  aplicarCambiosSeleccionadosTiendanube,
  descartarCambiosSeleccionadosTiendanube,
  enviarDatosLocalesSeleccionadosATiendanube,
  clearTiendanubeCredentials,
  getPollConfig,
  getTiendanubeCredentials,
  getTiendanubeSyncStatus,
  ensureTiendanubeWebhooks,
  fetchTiendanubeWebhookEvents,
  revisarCambiosTiendanube,
  saveTiendanubeCredentials,
  setPollConfig,
  syncStockWithTiendanube,
  type TiendanubePollConfig,
  type TiendanubeSyncChange,
  type TiendanubeSyncPreview,
} from "@/api/tiendanube";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TiendanubeSyncStatus } from "@/types";
import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

const TIENDANUBE_AUTH_URL = "https://www.tiendanube.com/apps/28338/authorize?client_id=28338&response_type=code&redirect_uri=https%3A%2F%2Fvercel-bridge-5fpy4bubs-mauricios-projects-45a56444.vercel.app%2Fapi%2Fauth&scope=read_products%20write_products%20write_orders";
const SYNCED_EVENT = "tiendanube:synced";

function nowLog(message: string) {
  return `[${new Date().toLocaleTimeString()}] ${message}`;
}

function changeTypeLabel(type: TiendanubeSyncChange["type"]) {
  const labels: Record<TiendanubeSyncChange["type"], string> = {
    PRODUCTO_NUEVO: "Producto nuevo",
    VARIANTE_NUEVA: "Variante nueva",
    VENTA_TN: "Venta Tiendanube",
    STOCK: "Stock",
    PRECIO: "Precio",
    DATOS: "Datos",
    IMAGEN: "Imagen",
  };
  return labels[type];
}

function formatMoney(value: number | null) {
  if (value == null) return "-";
  return `$${Number(value).toLocaleString("es-AR")}`;
}

function formatStock(value: number | null) {
  if (value == null) return "-";
  return `${value} u.`;
}

function canPushLocalChange(cambio: TiendanubeSyncChange) {
  return cambio.type === "DATOS" || cambio.type === "STOCK" || cambio.type === "PRECIO";
}

export function Tiendanube() {
  const [status, setStatus] = useState<TiendanubeSyncStatus | null>(null);
  const [creds, setCreds] = useState<ReturnType<typeof getTiendanubeCredentials>>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isRegisteringWebhooks, setIsRegisteringWebhooks] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [preview, setPreview] = useState<TiendanubeSyncPreview | null>(null);
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [pollConfig, setPollConfigState] = useState<TiendanubePollConfig>(() => getPollConfig());

  const selectedCount = selectedChanges.length;
  const selectedLocalCount = useMemo(() => preview?.cambios.filter((cambio) => selectedChanges.includes(cambio.id) && canPushLocalChange(cambio)).length ?? 0, [preview, selectedChanges]);
  const hasCredentials = Boolean(creds);

  const groupedCounts = useMemo(() => {
    const counts: Record<TiendanubeSyncChange["type"], number> = { PRODUCTO_NUEVO: 0, VARIANTE_NUEVA: 0, VENTA_TN: 0, STOCK: 0, PRECIO: 0, DATOS: 0, IMAGEN: 0 };
    for (const cambio of preview?.cambios ?? []) counts[cambio.type]++;
    return counts;
  }, [preview]);

  async function loadStatus() {
    setIsCheckingStatus(true);
    try {
      const s = await getTiendanubeSyncStatus();
      setStatus(s);
      setCreds(getTiendanubeCredentials());
    } finally {
      setIsCheckingStatus(false);
    }
  }

  useEffect(() => {
    void loadStatus();

    const unlisten = onOpenUrl(async (urls) => {
      for (const url of urls) {
        try {
          const parsed = new URL(url);
          if (parsed.hostname === "auth") {
            const token = parsed.searchParams.get("token") ?? parsed.searchParams.get("access_token");
            const userId = parsed.searchParams.get("user_id");
            const bridgeToken = parsed.searchParams.get("bridge_token");
            if (token && userId) {
              saveTiendanubeCredentials({ accessToken: token, userId, bridgeToken });
              setIsLinking(false);
              setPreview(null);
              setSelectedChanges([]);
              setSyncLogs([nowLog(`Tienda vinculada exitosamente (ID: ${userId}). Validando conexión...`)]);
              void (async () => {
                try {
                  const result = await ensureTiendanubeWebhooks((msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]));
                  if (result.errors > 0) {
                    setSyncLogs((prev) => [...prev, nowLog(`Avisos automaticos parciales: ${result.created} creado/s, ${result.existing} existente/s, ${result.errors} bloqueado/s. El programa seguira revisando por API.`)]);
                  } else {
                    setSyncLogs((prev) => [...prev, nowLog("Webhooks de Tiendanube listos para recibir avisos automaticos.")]);
                  }
                } catch (error) {
                  setSyncLogs((prev) => [...prev, nowLog(`Aviso: no se pudieron registrar webhooks (${error instanceof Error ? error.message : String(error)}).`)]);
                } finally {
                  void loadStatus();
                }
              })();
            } else {
              setIsLinking(false);
              setSyncLogs((prev) => [...prev, nowLog("ERROR: el enlace no incluyó token o user_id.")]);
            }
          }
        } catch {
          // URL inválida, ignorar.
        }
      }
    });

    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  async function handleConnect() {
    setIsLinking(true);
    setSyncLogs([nowLog("Abriendo Tiendanube para autorización...")]);
    try {
      await openUrl(TIENDANUBE_AUTH_URL);
    } catch {
      setIsLinking(false);
      setSyncLogs((prev) => [...prev, nowLog("ERROR: no se pudo abrir el navegador.")]);
    }
  }

  function handleDisconnect() {
    clearTiendanubeCredentials();
    setSyncLogs([]);
    setPreview(null);
    setSelectedChanges([]);
    setIsLinking(false);
    void loadStatus();
  }

  async function handleEnsureWebhooks() {
    setIsRegisteringWebhooks(true);
    setSyncLogs((prev) => [...prev, nowLog("Registrando o verificando webhooks de Tiendanube...")]);
    try {
      const result = await ensureTiendanubeWebhooks((msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]));
      if (result.errors > 0) {
        setSyncLogs((prev) => [...prev, nowLog(`Avisos automaticos parciales: ${result.created} creado/s, ${result.existing} existente/s, ${result.errors} bloqueado/s. Se usara revision por API para cubrir esos cambios.`)]);
      } else {
        setSyncLogs((prev) => [...prev, nowLog(`Webhooks listos: ${result.created} creado/s, ${result.existing} existente/s, 0 error/es.`)]);
      }
      void loadStatus();
    } catch (error) {
      setSyncLogs((prev) => [...prev, nowLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`)]);
    } finally {
      setIsRegisteringWebhooks(false);
    }
  }
  async function handleUploadLocalStock() {
    setIsSyncing(true);
    setSyncLogs([nowLog("Subiendo stock local hacia Tiendanube...")]);
    try {
      await syncStockWithTiendanube((msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]));
      window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
      void loadStatus();
    } catch (error) {
      setSyncLogs((prev) => [...prev, nowLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`)]);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleReview() {
    setIsReviewing(true);
    setPreview(null);
    setSelectedChanges([]);
    setSyncLogs([nowLog("Buscando cambios de Tiendanube sin aplicar nada...")]);
    try {
      const bridge = await fetchTiendanubeWebhookEvents((msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]));
      const result = await revisarCambiosTiendanube((msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]), { webhookEvents: bridge.ok ? bridge.events : undefined });
      setPreview(result);
      setSyncLogs((prev) => [...prev, nowLog(`Sincronización preparada: ${result.cambios.length} cambio/s pendiente/s.`)]);
      void loadStatus();
    } catch (error) {
      setSyncLogs((prev) => [...prev, nowLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`)]);
      void loadStatus();
    } finally {
      setIsReviewing(false);
    }
  }

  function removeResolvedChanges(ids: string[]) {
    const resolved = new Set(ids);
    setPreview((current) => current ? { ...current, cambios: current.cambios.filter((cambio) => !resolved.has(cambio.id)) } : current);
    setSelectedChanges((current) => current.filter((id) => !resolved.has(id)));
  }

  async function handleApplySelected(ids = selectedChanges) {
    if (!preview) return;
    if (ids.length === 0) return;
    setIsApplying(true);
    setSyncLogs((prev) => [...prev, nowLog(`Tomando ${ids.length} cambio/s desde Tiendanube...`)]);
    try {
      await aplicarCambiosSeleccionadosTiendanube(preview, ids, (msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]));
      await acknowledgeTiendanubeWebhookEvents(preview.webhookEventKeys);
      window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
      removeResolvedChanges(ids);
      void loadStatus();
    } catch (error) {
      setSyncLogs((prev) => [...prev, nowLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`)]);
    } finally {
      setIsApplying(false);
    }
  }

  async function handlePushLocalDataSelected(ids = selectedChanges) {
    if (!preview) return;
    const localIds = ids.filter((id) => {
      const cambio = preview.cambios.find((item) => item.id === id);
      return cambio ? canPushLocalChange(cambio) : false;
    });
    if (localIds.length === 0) return;
    setIsApplying(true);
    setSyncLogs((prev) => [...prev, nowLog(`Enviando ${localIds.length} cambio/s con valores locales hacia Tiendanube...`)]);
    try {
      await enviarDatosLocalesSeleccionadosATiendanube(preview, localIds, (msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]));
      await acknowledgeTiendanubeWebhookEvents(preview.webhookEventKeys);
      window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
      removeResolvedChanges(localIds);
      void loadStatus();
    } catch (error) {
      setSyncLogs((prev) => [...prev, nowLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`)]);
    } finally {
      setIsApplying(false);
    }
  }

  async function handleDiscardSelected(ids = selectedChanges) {
    if (!preview) return;
    if (ids.length === 0) return;
    setIsApplying(true);
    setSyncLogs((prev) => [...prev, nowLog(`Descartando ${ids.length} cambio/s pendiente/s...`)]);
    try {
      await descartarCambiosSeleccionadosTiendanube(preview, ids, (msg) => setSyncLogs((prev) => [...prev, nowLog(msg)]));
      await acknowledgeTiendanubeWebhookEvents(preview.webhookEventKeys);
      removeResolvedChanges(ids);
      void loadStatus();
    } catch (error) {
      setSyncLogs((prev) => [...prev, nowLog(`ERROR: ${error instanceof Error ? error.message : String(error)}`)]);
    } finally {
      setIsApplying(false);
    }
  }

  function toggleChange(id: string, checked: boolean) {
    setSelectedChanges((current) => checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id));
  }

  function handlePollToggle(enabled: boolean) {
    setPollConfig({ enabled });
    setPollConfigState(getPollConfig());
  }

  function handleIntervalChange(intervalSec: number) {
    setPollConfig({ intervalSec });
    setPollConfigState(getPollConfig());
  }

  if (!status) return (
    <div className="p-20 text-center animate-pulse text-muted-foreground uppercase tracking-widest font-black">
      Cargando sincronización...
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <section className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:max-w-[860px]">
        <Card className="w-full lg:w-[380px] shrink-0 border-none shadow-xl bg-card/60 backdrop-blur-md overflow-hidden">
            <CardHeader className="bg-[#002D45] text-white pb-8 relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-10"><ShoppingBag className="size-32" /></div>
              <div className="relative z-10 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center"><CloudSync className="size-5" /></div>
                  <CardTitle className="text-xl">Sincronización</CardTitle>
                </div>
                <CardDescription className="text-white/65">Tiendanube y stock local</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {status.connected ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-700/60">Conexión verificada</p>
                      <p className="text-sm font-bold text-emerald-700">Tienda ID: {creds?.userId ?? "-"}</p>
                      <p className="mt-1 text-xs text-emerald-700/80">{status.message}</p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={loadStatus} disabled={isCheckingStatus} className="w-full h-11 rounded-2xl font-black gap-2">
                    {isCheckingStatus ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Probar conexión
                  </Button>
                  <Button variant="outline" onClick={handleEnsureWebhooks} disabled={isRegisteringWebhooks || isSyncing || isReviewing || isApplying} className="w-full h-11 rounded-2xl font-black gap-2">
                    {isRegisteringWebhooks ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Reparar avisos automaticos
                  </Button>
                  <Button variant="outline" onClick={handleDisconnect} disabled={isSyncing || isReviewing || isApplying} className="w-full h-11 rounded-2xl border-rose-500/20 text-rose-500 hover:bg-rose-500/5 font-black gap-2">
                    <Unlink className="size-4" /> Desvincular tienda
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {hasCredentials && (
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800">
                      <AlertCircle className="mt-0.5 size-5 shrink-0" />
                      <p className="text-sm font-semibold leading-relaxed">{status.message}</p>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Vincula la tienda para revisar cambios, importar productos nuevos o subir stock local a Tiendanube.
                  </p>
                  <Button onClick={handleConnect} disabled={isLinking} className="tiendanube-primary-button w-full h-14 rounded-2xl bg-[#002D45] text-white hover:bg-[#002D45]/90 font-black shadow-xl gap-2 text-base">
                    {isLinking ? <><Loader2 className="size-5 animate-spin" /> Esperando autorización...</> : <><ExternalLink className="size-5" /> {hasCredentials ? "Volver a vincular" : "Vincular con Tiendanube"}</>}
                  </Button>
                  {hasCredentials && <Button variant="ghost" onClick={handleDisconnect} className="w-full text-rose-500 font-bold">Limpiar credenciales locales</Button>}
                </div>
              )}
            </CardContent>
        </Card>

        <Card className="w-full lg:w-[420px] border-none shadow-xl bg-card/40 backdrop-blur-sm">
          <CardContent className="p-6 text-xs text-muted-foreground space-y-3 leading-relaxed">
            <p className="font-bold text-foreground">Direcciones separadas</p>
            <p><strong>Tiendanube al programa:</strong> primero muestra cambios y sólo aplica los seleccionados.</p>
            <p><strong>Programa a Tiendanube:</strong> sube el valor local actual de productos vinculados.</p>
            <div className="pt-2 space-y-1.5 border-t border-border/40">
              <p><strong>Botón Enviar a programa:</strong> toma el cambio de Tiendanube y lo guarda en el programa.</p>
              <p><strong>Botón Enviar a Tiendanube:</strong> envía el valor del programa hacia Tiendanube.</p>
              <p><strong>Botón Descartar:</strong> limpia el aviso sin modificar stock ni productos.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <Card className={`border-none shadow-xl transition-all ${status.connected ? "bg-card/60" : "bg-muted/10 opacity-75"} backdrop-blur-md overflow-hidden`}>
            <CardHeader className="pb-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${status.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                    {status.connected ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                  </div>
                  <div>
                    <CardTitle className="text-xl">Panel de sincronización</CardTitle>
                    <CardDescription>{status.connected ? "Revisa antes de aplicar cambios" : "Vínculo pendiente o inválido"}</CardDescription>
                  </div>
                </div>
                {status.lastSync && <Badge variant="outline" className="rounded-lg gap-1.5 py-1 px-3"><Clock className="size-3" /> Última aplicación: {status.lastSync}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-8 space-y-6">
              {status.connected ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Button onClick={handleReview} disabled={isReviewing || isApplying || isSyncing} className="tiendanube-primary-button h-14 rounded-2xl bg-[#002D45] text-white font-black hover:bg-[#002D45]/90 shadow-xl gap-3 border-none">
                      {isReviewing ? <Loader2 className="size-5 animate-spin" /> : <SearchCheck className="size-5" />}
                      {isReviewing ? "Buscando cambios..." : "Buscar cambios de Tiendanube"}
                    </Button>
                    <Button onClick={handleUploadLocalStock} disabled={isSyncing || isReviewing || isApplying} className="h-14 rounded-2xl bg-emerald-500 text-white font-black hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 gap-3 border-none">
                      {isSyncing ? <CloudSync className="size-5 animate-spin" /> : <Zap className="size-5" />}
                      {isSyncing ? "Subiendo..." : "Subir stock local a Tiendanube"}
                    </Button>
                  </div>

                  <div className="p-5 rounded-2xl bg-card/40 border border-border/40 space-y-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-60"><RefreshCw className="size-3" /> Detección automática</div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-bold">
                          <input type="checkbox" checked={pollConfig.enabled} onChange={(e) => handlePollToggle(e.target.checked)} className="size-5 accent-emerald-500" />
                          {pollConfig.enabled ? "Activada" : "Desactivada"}
                        </label>
                        <select value={pollConfig.intervalSec} onChange={(e) => handleIntervalChange(Number(e.target.value))} className="liquid-select h-10 rounded-xl border border-border/50 bg-background/50 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20">
                          <option value={60}>60 segundos</option>
                          <option value={120}>120 segundos</option>
                          <option value={300}>5 minutos</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                      Compara Tiendanube contra el programa mientras está abierto y avisa si encuentra diferencias. No modifica el stock local hasta que se revise y aplique desde esta pantalla.
                    </p>
                  </div>

                  {preview && (
                    <div className="rounded-2xl border border-border/60 bg-background/70 overflow-hidden">
                      <div className="flex items-center justify-between gap-4 flex-wrap border-b bg-muted/30 p-4">
                        <div>
                          <p className="text-sm font-black uppercase tracking-widest">Cambios encontrados</p>
                          <p className="text-xs text-muted-foreground">Puedes resolver cada fila tomando Tiendanube, usando el programa como valor correcto o descartando el aviso.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Productos {groupedCounts.PRODUCTO_NUEVO}</Badge>
                          <Badge variant="outline">Variantes {groupedCounts.VARIANTE_NUEVA}</Badge>
                          <Badge variant="outline">Ventas TN {groupedCounts.VENTA_TN}</Badge>
                          <Badge variant="outline">Stock {groupedCounts.STOCK}</Badge>
                          <Badge variant="outline">Precio {groupedCounts.PRECIO}</Badge>
                          <Badge variant="outline">Datos {groupedCounts.DATOS}</Badge>
                        </div>
                      </div>

                      {preview.cambios.length === 0 ? (
                        <div className="p-10 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-3 size-9 text-emerald-500" />No hay cambios pendientes para aplicar.</div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-3 p-4 border-b bg-card/40">
                            <div className="text-sm font-bold">Seleccionados: {selectedCount} de {preview.cambios.length}</div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedChanges(preview.cambios.map((cambio) => cambio.id))}>Marcar todos</Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedChanges([])}>Limpiar</Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void handlePushLocalDataSelected()} disabled={isApplying || selectedLocalCount === 0} className="gap-2">
                                {isApplying ? <Loader2 className="size-4 animate-spin" /> : <CloudSync className="size-4" />} Enviar a Tiendanube
                              </Button>
                              <Button type="button" size="sm" onClick={() => void handleApplySelected()} disabled={isApplying || selectedCount === 0} className="gap-2">
                                {isApplying ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />} Enviar a programa
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void handleDiscardSelected()} disabled={isApplying || selectedCount === 0} className="gap-2 text-rose-600">
                                Descartar
                              </Button>
                            </div>
                          </div>
                          <div className="liquid-table-container overflow-x-auto">
                            <table className="operational-table w-full table-fixed text-sm">
                              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                                <tr>
                                  <th className="w-12 px-4 py-3">Sel.</th>
                                  <th className="w-[160px] px-3 py-3">Tipo</th>
                                  <th className="w-[20%] px-3 py-3">Producto / Variante</th>
                                  <th className="w-[105px] px-3 py-3">Local</th>
                                  <th className="w-[115px] px-3 py-3">Tiendanube</th>
                                  <th className="px-3 py-3">Detalle</th>
                                  <th className="w-[13%] px-3 py-3">Acción</th>
                                  <th className="w-[178px] px-3 py-3 text-right">Resolver</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {preview.cambios.map((cambio) => (
                                  <tr key={cambio.id} className="align-top hover:bg-muted/20">
                                    <td className="px-4 py-4"><input type="checkbox" checked={selectedChanges.includes(cambio.id)} onChange={(e) => toggleChange(cambio.id, e.target.checked)} className="size-4 accent-primary" /></td>
                                    <td className="px-3 py-4"><Badge variant="outline" className="whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] leading-tight">{changeTypeLabel(cambio.type)}</Badge></td>
                                    <td className="px-3 py-4"><p className="font-bold break-words leading-snug">{cambio.producto}</p><p className="text-xs text-muted-foreground break-words">{cambio.variante || "Producto completo"}</p></td>
                                    <td className="px-3 py-4 text-xs"><p>Stock: {formatStock(cambio.localStock)}</p><p>Precio: {formatMoney(cambio.localPrice)}</p></td>
                                    <td className="px-3 py-4 text-xs"><p>Stock: {formatStock(cambio.remoteStock)}</p><p>Precio: {formatMoney(cambio.remotePrice)}</p></td>
                                    <td className="px-3 py-4 whitespace-normal break-words text-xs text-muted-foreground">{cambio.detalle}</td>
                                    <td className="px-3 py-4 whitespace-normal break-words text-xs font-semibold">{cambio.accion}</td>
                                    <td className="px-3 py-4">
                                      <div className="flex flex-col items-stretch gap-1.5">
                                        <Button type="button" size="xs" onClick={() => void handleApplySelected([cambio.id])} disabled={isApplying} className="h-7 justify-center gap-1.5 px-2 text-[10px] leading-none whitespace-nowrap">
                                          <DownloadCloud className="size-3" /> Enviar a programa
                                        </Button>
                                        <Button type="button" variant="outline" size="xs" onClick={() => void handlePushLocalDataSelected([cambio.id])} disabled={isApplying || !canPushLocalChange(cambio)} className="h-7 justify-center gap-1.5 px-2 text-[10px] leading-none whitespace-nowrap">
                                          <CloudSync className="size-3" /> Enviar a Tiendanube
                                        </Button>
                                        <Button type="button" variant="ghost" size="xs" onClick={() => void handleDiscardSelected([cambio.id])} disabled={isApplying} className="h-7 justify-center px-2 text-[10px] leading-none text-rose-600 hover:text-rose-700">
                                          Descartar
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-40 ml-1"><Terminal className="size-3" /> Registro de operaciones</div>
                    <div className="bg-[#050510] border border-white/5 rounded-2xl p-5 font-mono text-[11px] min-h-[160px] max-h-[300px] overflow-y-auto">
                      {syncLogs.length === 0 ? <p className="text-white/20 italic select-none">Esperando comando...</p> : (
                        <div className="space-y-1.5">
                          {syncLogs.map((log, i) => <div key={i} className="flex gap-3"><span className="text-emerald-500/50 shrink-0">::</span><span className={log.includes("ERROR") ? "text-rose-400 font-bold" : "text-emerald-500"}>{log}</span></div>)}
                          {(isSyncing || isReviewing || isApplying) && <div className="animate-pulse text-emerald-500">&gt; Procesando...</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center space-y-4">
                  <div className="size-16 rounded-full bg-rose-500/5 border border-rose-500/20 mx-auto flex items-center justify-center text-rose-500"><AlertCircle className="size-8" /></div>
                  <div>
                    <p className="text-lg font-bold">Sincronización inactiva</p>
                    <p className="text-sm text-muted-foreground">{status.message}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
      </section>
    </div>
  );
}
