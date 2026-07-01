import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowRightLeft, 
  History, 
  RefreshCw, 
  Download, 
  Search, 
  ChevronRight, 
  Package
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getInventarioMovimientoOptions,
  getMovimientos,
  getMovimientosByInventarioId,
  notifyMonthlySalesUpdate,
  registrarMovimientoStock,
} from "@/database/queries";
import { pushInventarioIdATiendanube } from "@/api/tiendanube";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  buildRepeatMovimientoRoute,
} from "@/lib/movimientos";
import type {
  InventarioMovimientoOption,
  MovimientoListado,
  TipoMovimientoStock,
} from "@/types";

const initialForm = {
  inventarioId: "",
  tipoMovimiento: "ENTRADA" as TipoMovimientoStock,
  cantidad: "1",
  motivo: "",
  referencia: "",
};

const initialHistoryFilters = {
  inventarioId: "",
  tipoMovimiento: "TODOS" as TipoMovimientoStock | "TODOS",
  search: "",
  fechaDesde: "",
  fechaHasta: "",
};

const selectClassName =
  "h-10 w-full rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-sm text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20 appearance-none";
const HISTORY_PAGE_SIZE = 25;
const HISTORY_QUERY_LIMIT = HISTORY_PAGE_SIZE + 1;
const SUGGESTED_MOVIMIENTOS_LIMIT = 4;

export function Movimientos() {
  const navigate = useNavigate();
  const [movimientos, setMovimientos] = useState<MovimientoListado[]>([]);
  const [inventarioOptions, setInventarioOptions] = useState<InventarioMovimientoOption[]>([]);
  const [form, setForm] = useState(initialForm);
  
  const [historyFilters, setHistoryFilters] = useState(initialHistoryFilters);
  const [searchInput, setSearchInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [recentSuggestions, setRecentSuggestions] = useState<MovimientoListado[]>([]);
  const [recentSuggestionsLoading, setRecentSuggestionsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [showProductSearch, setShowProductSearch] = useState(false);
  const debouncedSearch = useDebouncedValue(searchInput);

  // Carga inicial de opciones
  useEffect(() => {
    void getInventarioMovimientoOptions().then(setInventarioOptions);
  }, []);

  // Carga de historial basado en filtros
  useEffect(() => {
    async function load() {
      const filters = {
        ...historyFilters,
        search: debouncedSearch || undefined,
        limit: HISTORY_QUERY_LIMIT,
        offset: 0,
        inventarioId: historyFilters.inventarioId ? Number(historyFilters.inventarioId) : undefined,
        tipoMovimiento: historyFilters.tipoMovimiento === "TODOS" ? undefined : historyFilters.tipoMovimiento,
      };
      const rows = await getMovimientos(filters as any);
      setMovimientos(rows.slice(0, HISTORY_PAGE_SIZE));
    }
    void load();
  }, [historyFilters, debouncedSearch]);

  // Carga de sugerencias y plantillas al cambiar variante seleccionada
  useEffect(() => {
    if (!form.inventarioId) return;
    setRecentSuggestionsLoading(true);
    
    getMovimientosByInventarioId(Number(form.inventarioId), SUGGESTED_MOVIMIENTOS_LIMIT)
      .then((movs) => {
        setRecentSuggestions(movs);
      })
      .finally(() => {
        setRecentSuggestionsLoading(false);
      });
  }, [form.inventarioId]);

  const selectedInventario = useMemo(
    () => inventarioOptions.find(o => o.inventarioId === Number(form.inventarioId)),
    [form.inventarioId, inventarioOptions]
  );

  const filteredOptions = useMemo(() => {
    if (!productSearch.trim()) return [];
    const term = productSearch.toLowerCase();
    return inventarioOptions.filter(o => 
      o.producto.toLowerCase().includes(term) || 
      (o.variante || "").toLowerCase().includes(term) ||
      (o.sku || "").toLowerCase().includes(term)
    ).slice(0, 10);
  }, [productSearch, inventarioOptions]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await registrarMovimientoStock({
        inventarioId: Number(form.inventarioId),
        tipoMovimiento: form.tipoMovimiento,
        cantidad: parseInt(String(form.cantidad), 10),
        motivo: form.motivo,
        referencia: form.referencia,
      });
      try {
        await pushInventarioIdATiendanube(Number(form.inventarioId));
      } catch (syncErr) {
        console.warn("No se pudo sincronizar el stock con Tiendanube:", syncErr);
      }
      setForm(prev => ({ ...prev, cantidad: "1", motivo: "", referencia: "" }));
      setProductSearch("");
      setStatus("Movimiento registrado con éxito");
      // Recargar historial y notificar al dashboard para refrescar ventas
      setHistoryFilters(prev => ({ ...prev }));
      notifyMonthlySalesUpdate();
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      setStatus(`Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleApplySuggestion = (m: MovimientoListado) => {
    setForm(prev => ({
      ...prev,
      tipoMovimiento: m.tipoMovimiento as any,
      cantidad: String(m.cantidad),
      motivo: m.motivo || "",
      referencia: m.referencia || ""
    }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Registro de Movimiento */}
        <section className="w-full lg:w-[450px] space-y-6 shrink-0">
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md overflow-hidden">
            <CardHeader className="bg-primary/5 pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <ArrowRightLeft className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">Nuevo Registro</CardTitle>
                  <CardDescription>Entradas, Salidas y Ajustes</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Variante / Producto</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input 
                      placeholder="Escriba para buscar producto..." 
                      className="pl-10 rounded-xl h-10 bg-background/50"
                      value={productSearch}
                      onChange={e => {
                        setProductSearch(e.target.value);
                        setShowProductSearch(true);
                      }}
                      onFocus={() => setShowProductSearch(true)}
                    />
                  </div>

                  {showProductSearch && filteredOptions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {filteredOptions.map(o => (
                          <button
                            key={o.inventarioId}
                            type="button"
                            className="w-full px-4 py-3 text-left hover:bg-primary/5 transition-colors border-b border-border/10 last:border-0 flex flex-col gap-0.5"
                            onClick={() => {
                              setForm({ ...form, inventarioId: String(o.inventarioId) });
                              setProductSearch(`${o.producto} - ${o.variante || "Principal"}`);
                              setShowProductSearch(false);
                            }}
                          >
                            <span className="text-xs font-bold text-foreground">{o.producto}</span>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-black">
                              <span>{o.variante || "Principal"}</span>
                              <Badge variant="outline" className="text-[9px] h-4 py-0 px-1 border-none bg-muted/50">{o.stockActual} u.</Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {showProductSearch && productSearch && filteredOptions.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 p-4 bg-card border border-border/50 rounded-xl shadow-2xl text-center text-xs text-muted-foreground italic animate-in fade-in duration-200">
                      No se encontraron productos coincidentes
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Tipo</label>
                    <select 
                      className={selectClassName}
                      value={form.tipoMovimiento}
                      onChange={e => setForm({...form, tipoMovimiento: e.target.value as any})}
                    >
                      <option value="ENTRADA">Entrada (+)</option>
                      <option value="SALIDA">Salida (-)</option>
                      <option value="AJUSTE">Ajuste (!)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Cantidad</label>
                    <Input 
                      type="number" 
                      className="rounded-xl h-10 bg-background/50" 
                      value={form.cantidad}
                      onChange={e => setForm({...form, cantidad: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Referencia</label>
                  <Input 
                    className="rounded-xl h-10 bg-background/50" 
                    placeholder="Ej: FAC-001, Venta Mostrador..."
                    value={form.referencia}
                    onChange={e => setForm({...form, referencia: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Motivo / Notas</label>
                  <Textarea 
                    className="rounded-xl bg-background/50 min-h-[80px]" 
                    placeholder="Detalles del movimiento..."
                    value={form.motivo}
                    onChange={e => setForm({...form, motivo: e.target.value})}
                  />
                </div>

                {selectedInventario && (
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-background flex items-center justify-center border border-border/50">
                        <Package className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Stock Actual</p>
                        <p className="text-xl font-black">{selectedInventario.stockActual} <span className="text-xs opacity-50">u.</span></p>
                      </div>
                    </div>
                    {selectedInventario.stockActual <= selectedInventario.stockMinimo && (
                      <Badge variant="destructive" className="animate-pulse">REPOSICIÓN</Badge>
                    )}
                  </div>
                )}

                <Button 
                  disabled={saving || !form.inventarioId} 
                  type="submit" 
                  className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black shadow-xl hover:shadow-primary/20 transition-all"
                >
                  {saving ? "Registrando..." : "Guardar Movimiento"}
                </Button>
              </form>

              {status && (
                <div className={`p-3 rounded-xl border text-xs font-bold text-center ${status.includes("Error") ? "bg-rose-500/10 border-rose-500/50 text-rose-500" : "bg-emerald-500/10 border-emerald-500/50 text-emerald-500"}`}>
                  {status}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sugerencias Recientes */}
          {form.inventarioId && (
            <Card className="border-none shadow-xl bg-card/40 backdrop-blur-sm">
                <CardHeader className="pb-3 px-6 pt-6">
                    <CardTitle className="text-xs font-bold uppercase tracking-[0.2em] opacity-50 flex items-center gap-2">
                        <RefreshCw className="size-3" /> Sugerencias Recientes
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-0 space-y-2">
                    {recentSuggestionsLoading ? (
                        <div className="h-20 animate-pulse bg-muted/20 rounded-xl" />
                    ) : recentSuggestions.length > 0 ? (
                        recentSuggestions.map(m => (
                          <div 
                            key={m.id} 
                            onClick={() => handleApplySuggestion(m)}
                            className="p-3 rounded-xl border border-border/50 bg-background/30 hover:bg-background/80 transition-all cursor-pointer group flex items-center justify-between"
                          >
                             <div className="flex items-center gap-3">
                                <Badge variant={m.tipoMovimiento === 'ENTRADA' ? 'secondary' : 'destructive'} className="text-[9px] h-5">
                                    {m.tipoMovimiento === 'ENTRADA' ? '+' : '-'} {m.cantidad}
                                </Badge>
                                <div>
                                    <p className="text-xs font-bold line-clamp-1">{m.motivo || "Sin motivo"}</p>
                                    <p className="text-[10px] opacity-50">{m.referencia || "Sin ref."}</p>
                                </div>
                             </div>
                             <ChevronRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))
                    ) : (
                        <p className="text-xs text-muted-foreground italic text-center py-4">Sin movimientos previos</p>
                    )}
                </CardContent>
            </Card>
          )}
        </section>

        {/* Historial de Movimientos */}
        <section className="flex-1 space-y-6">
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <History className="size-5" />
                    </div>
                    <div>
                        <CardTitle className="text-xl">Historial Operativo</CardTitle>
                        <CardDescription>Kardex completo de movimientos</CardDescription>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="rounded-xl h-9">
                        <Download className="size-4 mr-2" /> Exportar
                    </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
               {/* Filtros Historial */}
               <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar en historial..." 
                        className="pl-9 rounded-xl bg-background/40 border-border/50"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                  </div>
                  <select 
                    className={selectClassName}
                    value={historyFilters.tipoMovimiento}
                    onChange={e => setHistoryFilters({...historyFilters, tipoMovimiento: e.target.value as any})}
                  >
                    <option value="TODOS">Todos los tipos</option>
                    <option value="ENTRADA">Entradas</option>
                    <option value="SALIDA">Salidas</option>
                    <option value="AJUSTE">Ajustes</option>
                  </select>
                  <div className="flex gap-2">
                    <Input 
                      type="date" 
                      className="rounded-xl bg-background/40 border-border/50 text-xs" 
                      value={historyFilters.fechaDesde}
                      onChange={e => setHistoryFilters({...historyFilters, fechaDesde: e.target.value})}
                    />
                    <Input 
                      type="date" 
                      className="rounded-xl bg-background/40 border-border/50 text-xs" 
                      value={historyFilters.fechaHasta}
                      onChange={e => setHistoryFilters({...historyFilters, fechaHasta: e.target.value})}
                    />
                  </div>
               </div>

               <div className="rounded-t-3xl bg-background/20 backdrop-blur-sm border-t border-border/50 overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/10">
                        <TableRow className="border-border/50">
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest pl-6">Variante</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest">Tipo</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest">Cant.</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest">Referencia</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest">Fecha</TableHead>
                            <TableHead className="text-right pr-6"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {movimientos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-64 text-center text-muted-foreground italic">
                                    No se encontraron registros
                                </TableCell>
                            </TableRow>
                        ) : (
                            movimientos.map(m => (
                                <TableRow key={m.id} className="border-border/30 hover:bg-primary/5 transition-colors group">
                                    <TableCell className="pl-6">
                                        <div>
                                            <p className="text-xs font-bold">{m.producto}</p>
                                            <p className="text-[10px] opacity-60 uppercase">{m.variante || "Principal"}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={m.tipoMovimiento === 'ENTRADA' ? 'secondary' : m.tipoMovimiento === 'SALIDA' ? 'destructive' : 'outline'} className="text-[9px] h-5 border-none">
                                            {m.tipoMovimiento}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <p className={`text-sm font-black ${m.tipoMovimiento === 'ENTRADA' ? 'text-emerald-500' : m.tipoMovimiento === 'SALIDA' ? 'text-rose-500' : 'text-primary'}`}>
                                            {m.tipoMovimiento === 'ENTRADA' ? '+' : m.tipoMovimiento === 'SALIDA' ? '-' : ''}{m.cantidad}
                                        </p>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="text-xs font-medium line-clamp-1">{m.motivo || "-"}</p>
                                            <p className="text-[9px] opacity-40 uppercase tracking-tighter">{m.referencia || "S/Ref"}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <p className="text-[10px] font-medium opacity-60">
                                            {new Date(m.fechaMovimiento).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                                        </p>
                                        <p className="text-[9px] opacity-40">
                                            {new Date(m.fechaMovimiento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </TableCell>
                                    <TableCell className="pr-6 text-right">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg group-hover:bg-background shadow-sm" onClick={() => navigate(buildRepeatMovimientoRoute(m))}>
                                            <RefreshCw className="size-3 text-primary" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
               </div>
            </CardContent>
          </Card>

        </section>
      </div>
    </div>
  );
}