import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  History,
  Package,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";

import { pushInventarioIdATiendanube } from "@/api/tiendanube";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getInventarioMovimientoOptions,
  getMovimientos,
  getMovimientosByInventarioId,
  notifyMonthlySalesUpdate,
  registrarMovimientoStock,
} from "@/database/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatDatabaseDate, formatDatabaseTime } from "@/lib/datetime";
import { updateLiquidGlassPointer } from "@/lib/liquidGlass";
import { CONCEPTOS_POR_TIPO, getConceptoLabel } from "@/lib/movimientos";
import type { InventarioMovimientoOption, MovimientoConcepto, MovimientoListado, TipoMovimientoStock } from "@/types";

const TYPE_META: Record<TipoMovimientoStock, { label: string; short: string; icon: typeof ArrowDownToLine; tone: string; active: string }> = {
  ENTRADA: { label: "Entrada", short: "Suma mercadería", icon: ArrowDownToLine, tone: "text-emerald-600", active: "border-emerald-500 bg-emerald-500/10 text-emerald-700" },
  SALIDA: { label: "Salida", short: "Descuenta mercadería", icon: ArrowUpFromLine, tone: "text-rose-600", active: "border-rose-500 bg-rose-500/10 text-rose-700" },
  AJUSTE: { label: "Ajuste", short: "Corrige diferencias", icon: SlidersHorizontal, tone: "text-amber-600", active: "border-amber-500 bg-amber-500/10 text-amber-700" },
};

const selectClassName = "liquid-select h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";
const PAGE_SIZE = 25;
const COST_IMPACT_CONCEPTS: MovimientoConcepto[] = ["ROTURA", "FALLA", "VENCIMIENTO", "REGALO_SORTEO", "CAMBIO_GARANTIA", "PERDIDA_FALTANTE"];

function defaultConcept(tipo: TipoMovimientoStock) {
  return CONCEPTOS_POR_TIPO[tipo][0].value;
}

function inferConcept(movement: MovimientoListado): MovimientoConcepto {
  if (movement.concepto) return movement.concepto;
  if (movement.tipoMovimiento === "ENTRADA") return "ENTRADA_OTRA";
  if (movement.tipoMovimiento === "SALIDA") return movement.motivo?.toLowerCase().includes("venta") ? "VENTA" : "SALIDA_OTRA";
  return "CORRECCION_STOCK";
}

function calculateResult(stock: number, tipo: TipoMovimientoStock, quantity: number) {
  if (!Number.isFinite(quantity)) return stock;
  if (tipo === "ENTRADA") return stock + Math.abs(quantity);
  if (tipo === "SALIDA") return stock - Math.abs(quantity);
  return stock + quantity;
}

export function Movimientos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = (searchParams.get("presetTipoMovimiento") as TipoMovimientoStock | null) ?? "ENTRADA";
  const [inventarioOptions, setInventarioOptions] = useState<InventarioMovimientoOption[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoListado[]>([]);
  const [recentSuggestions, setRecentSuggestions] = useState<MovimientoListado[]>([]);
  const [form, setForm] = useState({
    inventarioId: searchParams.get("inventarioId") ?? "",
    tipoMovimiento: initialType,
    concepto: defaultConcept(initialType),
    cantidad: searchParams.get("presetCantidad") ?? "1",
    importeTotal: "",
    costoUnitario: "",
    referencia: searchParams.get("presetReferencia") ?? "",
    motivo: searchParams.get("presetMotivo") ?? "",
  });
  const [filters, setFilters] = useState<{ tipoMovimiento: TipoMovimientoStock | "TODOS"; fechaDesde: string; fechaHasta: string }>({
    tipoMovimiento: (searchParams.get("tipoMovimiento") as TipoMovimientoStock | null) ?? "TODOS",
    fechaDesde: searchParams.get("fechaDesde") ?? "",
    fechaHasta: searchParams.get("fechaHasta") ?? "",
  });
  const [historySearch, setHistorySearch] = useState(searchParams.get("search") ?? "");
  const debouncedHistorySearch = useDebouncedValue(historySearch);
  const [productSearch, setProductSearch] = useState("");
  const [productListOpen, setProductListOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const selectedInventory = useMemo(
    () => inventarioOptions.find((option) => option.inventarioId === Number(form.inventarioId)),
    [form.inventarioId, inventarioOptions],
  );
  const productResults = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return [];
    return inventarioOptions.filter((option) => [option.producto, option.variante, option.sku].some((value) => value?.toLowerCase().includes(term))).slice(0, 8);
  }, [inventarioOptions, productSearch]);
  const quantity = Number(form.cantidad);
  const resultingStock = selectedInventory ? calculateResult(selectedInventory.stockActual, form.tipoMovimiento, quantity) : null;
  const isExchange = form.concepto === "CAMBIO_ENTRADA" || form.concepto === "CAMBIO_SALIDA";
  const isCommercial = form.concepto === "VENTA" || form.concepto === "DEVOLUCION_CLIENTE";
  const hasCostImpact = COST_IMPACT_CONCEPTS.includes(form.concepto);
  const effectiveUnitCost = form.costoUnitario === "" ? Number(selectedInventory?.precioCompra ?? 0) : Number(form.costoUnitario);

  useEffect(() => {
    void getInventarioMovimientoOptions().then(setInventarioOptions);
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.tipoMovimiento !== "TODOS") next.set("tipoMovimiento", filters.tipoMovimiento);
    if (debouncedHistorySearch.trim()) next.set("search", debouncedHistorySearch.trim());
    if (filters.fechaDesde) next.set("fechaDesde", filters.fechaDesde);
    if (filters.fechaHasta) next.set("fechaHasta", filters.fechaHasta);
    setSearchParams(next, { replace: true });
  }, [debouncedHistorySearch, filters, setSearchParams]);

  useEffect(() => {
    void getMovimientos({
      tipoMovimiento: filters.tipoMovimiento === "TODOS" ? undefined : filters.tipoMovimiento,
      search: debouncedHistorySearch || undefined,
      fechaDesde: filters.fechaDesde || undefined,
      fechaHasta: filters.fechaHasta || undefined,
      limit: PAGE_SIZE + 1,
    }).then((rows) => {
      setMovimientos(rows.slice(0, PAGE_SIZE));
      setHasMore(rows.length > PAGE_SIZE);
    });
  }, [debouncedHistorySearch, filters, status]);

  useEffect(() => {
    if (!form.inventarioId) {
      setRecentSuggestions([]);
      return;
    }
    void getMovimientosByInventarioId(Number(form.inventarioId), 4).then(setRecentSuggestions);
  }, [form.inventarioId, status]);

  function selectType(tipoMovimiento: TipoMovimientoStock) {
    setForm((current) => ({ ...current, tipoMovimiento, concepto: defaultConcept(tipoMovimiento), importeTotal: "" }));
  }

  function selectProduct(option: InventarioMovimientoOption) {
    setForm((current) => ({ ...current, inventarioId: String(option.inventarioId) }));
    setProductSearch(`${option.producto} · ${option.variante || "Principal"}`);
    setProductListOpen(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await registrarMovimientoStock({
        inventarioId: Number(form.inventarioId),
        tipoMovimiento: form.tipoMovimiento,
        concepto: form.concepto,
        cantidad: Number(form.cantidad),
        importeTotal: form.importeTotal ? Number(form.importeTotal) : undefined,
        costoUnitario: hasCostImpact ? effectiveUnitCost : undefined,
        referencia: form.referencia,
        motivo: form.motivo,
      });
      try {
        await pushInventarioIdATiendanube(Number(form.inventarioId));
      } catch (error) {
        console.warn("No se pudo sincronizar el stock con Tiendanube:", error);
      }
      setForm((current) => ({ ...current, cantidad: "1", importeTotal: "", costoUnitario: "", referencia: "", motivo: "" }));
      setStatus("Movimiento registrado y stock actualizado.");
      notifyMonthlySalesUpdate();
      void getInventarioMovimientoOptions().then(setInventarioOptions);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function applySuggestion(movement: MovimientoListado) {
    const tipoMovimiento = movement.tipoMovimiento as TipoMovimientoStock;
    setForm((current) => ({
      ...current,
      tipoMovimiento,
      concepto: inferConcept(movement),
      cantidad: String(movement.cantidad),
      importeTotal: movement.importeTotal ? String(movement.importeTotal) : "",
      referencia: movement.referencia ?? "",
      motivo: movement.motivo ?? "",
    }));
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 animate-in fade-in duration-300">
      <header className="flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Inventario operativo</p>
          <h1 className="mt-1 text-2xl font-black">Movimientos de stock</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cada registro modifica existencias y queda clasificado para el resumen mensual.</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border bg-card">
          {(Object.keys(TYPE_META) as TipoMovimientoStock[]).map((type) => {
            const meta = TYPE_META[type];
            const Icon = meta.icon;
            return <div key={type} className="flex min-w-36 items-center gap-2 border-r border-border px-3 py-2 last:border-r-0"><Icon className={`size-4 ${meta.tone}`} /><div><p className="text-xs font-bold">{meta.label}</p><p className="text-[10px] text-muted-foreground">{meta.short}</p></div></div>;
          })}
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card className="overflow-hidden rounded-md shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-base"><ArrowRightLeft className="size-4 text-primary" /> Registrar movimiento</CardTitle>
              <CardDescription>Completa los datos en orden y revisa el resultado antes de guardar.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleSubmit} className="space-y-5">
                <section className="space-y-2">
                  <p className="text-xs font-bold uppercase text-muted-foreground">1. Producto y presentación</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input aria-label="Buscar producto para movimiento" value={productSearch} onFocus={() => setProductListOpen(true)} onChange={(event) => { setProductSearch(event.target.value); setProductListOpen(true); }} placeholder="Nombre, variante o SKU" className="h-11 pl-9" />
                    {productListOpen && productSearch && (
                      <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-xl">
                        {productResults.length ? productResults.map((option) => <button type="button" key={option.inventarioId} onPointerMove={updateLiquidGlassPointer} onClick={() => selectProduct(option)} className="liquid-choice flex w-full items-center justify-between border-b border-border/60 px-3 py-2.5 text-left last:border-0"><span><span className="block text-sm font-semibold">{option.producto}</span><span className="text-xs text-muted-foreground">{option.variante || "Principal"} · {option.sku || "Sin SKU"}</span></span><Badge variant="outline">{option.stockActual} u.</Badge></button>) : <p className="p-4 text-center text-sm text-muted-foreground">Sin coincidencias</p>}
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">2. Operación</p>
                  <div className="grid grid-cols-3 gap-2" aria-label="Tipo de movimiento">
                    {(Object.keys(TYPE_META) as TipoMovimientoStock[]).map((type) => {
                      const meta = TYPE_META[type];
                      const Icon = meta.icon;
                      return <button key={type} type="button" onPointerMove={updateLiquidGlassPointer} onClick={() => selectType(type)} className={`liquid-choice flex h-16 flex-col items-center justify-center rounded-md border text-xs font-bold transition-colors ${form.tipoMovimiento === type ? `${meta.active} ring-1 ring-current/15` : "border-border text-muted-foreground"}`}><Icon className="mb-1 size-4" />{meta.label}</button>;
                    })}
                  </div>
                  <label className="block space-y-1.5 text-sm font-semibold"><span>Concepto</span><select aria-label="Concepto del movimiento" className={selectClassName} value={form.concepto} onChange={(event) => setForm({ ...form, concepto: event.target.value as MovimientoConcepto, importeTotal: "" })}>{CONCEPTOS_POR_TIPO[form.tipoMovimiento].map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                </section>

                <section className="space-y-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">3. Cantidad e impacto</p>
                  <div className={`grid gap-3 ${isCommercial ? "grid-cols-2" : "grid-cols-1"}`}>
                    <label className="space-y-1.5 text-sm font-semibold"><span>{form.tipoMovimiento === "AJUSTE" ? "Diferencia (+/-)" : "Cantidad"}</span><Input aria-label="Cantidad del movimiento" type="number" step="1" value={form.cantidad} onChange={(event) => setForm({ ...form, cantidad: event.target.value })} /></label>
                    {isCommercial && <label className="space-y-1.5 text-sm font-semibold"><span>Importe total</span><Input aria-label="Importe total histórico" type="number" min="0" step="0.01" value={form.importeTotal} onChange={(event) => setForm({ ...form, importeTotal: event.target.value })} placeholder={selectedInventory ? String(selectedInventory.precioVenta * Math.abs(quantity || 0)) : "0"} /></label>}
                    {hasCostImpact && <label className="space-y-1.5 text-sm font-semibold"><span>Costo unitario de la pérdida</span><Input aria-label="Costo unitario del movimiento" type="number" min="0" step="0.01" value={form.costoUnitario} onChange={(event) => setForm({ ...form, costoUnitario: event.target.value })} placeholder={selectedInventory ? String(selectedInventory.precioCompra) : "0"} /></label>}
                  </div>
                  {hasCostImpact && selectedInventory && effectiveUnitCost <= 0 && <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><p>Este producto no tiene costo de compra. El movimiento contará sus unidades, pero el impacto monetario será $0 hasta que indique un costo unitario.</p></div>}
                  {hasCostImpact && selectedInventory && effectiveUnitCost > 0 && <p className="text-xs text-muted-foreground">Impacto estimado al costo: <span className="font-bold">{new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(effectiveUnitCost * Math.abs(quantity || 0))}</span></p>}
                  <div className={`rounded-md border p-3 ${resultingStock !== null && resultingStock < 0 ? "border-rose-500/40 bg-rose-500/10" : "border-border bg-muted/30"}`}>
                    {selectedInventory ? <div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Stock resultante</p><p className="text-sm font-semibold">{selectedInventory.stockActual} u. <ChevronRight className="mx-1 inline size-3" /> {resultingStock} u.</p></div><Package className="size-5 text-muted-foreground" /></div> : <p className="text-xs text-muted-foreground">Selecciona un producto para calcular el stock resultante.</p>}
                  </div>
                </section>

                {isExchange && <div className="flex gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-800"><ArrowRightLeft className="mt-0.5 size-4 shrink-0" /><p>Usa el mismo código en la entrada del producto recibido y en la salida del producto entregado.</p></div>}
                {form.concepto === "CAMBIO_GARANTIA" && <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><p>El artículo defectuoso no vuelve al stock vendible. Esta salida registra el costo del reemplazo.</p></div>}

                <section className="space-y-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">4. Comprobante y detalle</p>
                  <label className="block space-y-1.5 text-sm font-semibold"><span>{isExchange ? "Código del cambio" : "Referencia"}</span><Input aria-label="Referencia del movimiento" required={isExchange} value={form.referencia} onChange={(event) => setForm({ ...form, referencia: event.target.value })} placeholder={isExchange ? "CAMBIO-1042" : "Factura, pedido o comprobante"} /></label>
                  <label className="block space-y-1.5 text-sm font-semibold"><span>Notas</span><Textarea aria-label="Motivo del movimiento" value={form.motivo} onChange={(event) => setForm({ ...form, motivo: event.target.value })} placeholder="Estado, proveedor, cliente u observación" className="min-h-20" /></label>
                </section>

                {status && <p role="status" className={`rounded-md border px-3 py-2 text-sm font-semibold ${status.startsWith("Error") ? "border-rose-500/30 bg-rose-500/10 text-rose-700" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"}`}>{status}</p>}
                <Button disabled={saving || !selectedInventory || resultingStock === null || resultingStock < 0} className="h-11 w-full" type="submit">{saving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <ClipboardList className="mr-2 size-4" />}{saving ? "Guardando..." : `Registrar ${TYPE_META[form.tipoMovimiento].label.toLowerCase()}`}</Button>
              </form>
            </CardContent>
          </Card>

          {recentSuggestions.length > 0 && <div className="border-t border-border pt-3"><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Últimos usos de este producto</p><div className="space-y-1">{recentSuggestions.map((movement) => <button type="button" key={movement.id} onPointerMove={updateLiquidGlassPointer} onClick={() => applySuggestion(movement)} className="liquid-choice flex w-full items-center justify-between rounded-md px-2 py-2 text-left"><span><span className="block text-xs font-semibold">{getConceptoLabel(inferConcept(movement))}</span><span className="text-[11px] text-muted-foreground">{movement.referencia || "Sin referencia"}</span></span><RefreshCw className="size-3 text-muted-foreground" /></button>)}</div></div>}
        </aside>

        <section className="min-w-0 space-y-3">
          <Card className="rounded-md shadow-sm">
            <CardHeader className="border-b border-border">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div><CardTitle className="flex items-center gap-2 text-base"><History className="size-4 text-primary" /> Historial operativo</CardTitle><CardDescription>Detalle cronológico y económico de todos los movimientos.</CardDescription></div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="size-4" /> Los importes corresponden al valor guardado en la fecha del registro.</div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-2">
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar por producto, variante, SKU, motivo o referencia" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Producto, SKU, concepto o referencia" className="pl-9" /></div>
                <select aria-label="Filtrar tipo de movimiento" className={selectClassName} value={filters.tipoMovimiento} onChange={(event) => setFilters({ ...filters, tipoMovimiento: event.target.value as TipoMovimientoStock | "TODOS" })}><option value="TODOS">Todos los tipos</option><option value="ENTRADA">Entradas</option><option value="SALIDA">Salidas</option><option value="AJUSTE">Ajustes</option></select>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Desde</span><Input aria-label="Fecha desde" type="date" value={filters.fechaDesde} onChange={(event) => setFilters({ ...filters, fechaDesde: event.target.value })} /></label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Hasta</span><Input aria-label="Fecha hasta" type="date" value={filters.fechaHasta} onChange={(event) => setFilters({ ...filters, fechaHasta: event.target.value })} /></label>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="pl-4">Fecha</TableHead><TableHead>Producto</TableHead><TableHead>Operación</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Stock después</TableHead><TableHead className="text-right">Importe / costo</TableHead><TableHead>Referencia / notas</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {movimientos.length === 0 ? <TableRow><TableCell colSpan={7} className="h-48 text-center text-muted-foreground">No hay movimientos para los filtros seleccionados.</TableCell></TableRow> : movimientos.map((movement) => {
                      const type = movement.tipoMovimiento as TipoMovimientoStock;
                      const concept = inferConcept(movement);
                      const positive = type === "ENTRADA" || (type === "AJUSTE" && movement.cantidad > 0);
                      return <TableRow key={movement.id} className="align-top">
                        <TableCell className="pl-4 text-xs whitespace-nowrap"><p className="font-semibold">{formatDatabaseDate(movement.fechaMovimiento)}</p><p className="text-muted-foreground">{formatDatabaseTime(movement.fechaMovimiento)}</p></TableCell>
                        <TableCell><p className="text-sm font-semibold">{movement.producto}</p><p className="text-xs text-muted-foreground">{movement.variante || "Presentación principal"}</p></TableCell>
                        <TableCell><Badge variant="outline" className={TYPE_META[type]?.tone}>{TYPE_META[type]?.label || type}</Badge><p className="mt-1 max-w-44 text-xs font-medium">{getConceptoLabel(concept)}</p></TableCell>
                        <TableCell className={`text-right font-black ${positive ? "text-emerald-600" : "text-rose-600"}`}>{positive ? "+" : "-"}{Math.abs(movement.cantidad)}</TableCell>
                        <TableCell className="text-right font-semibold">{movement.stockResultante ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{movement.importeTotal ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(movement.importeTotal) : COST_IMPACT_CONCEPTS.includes(concept) ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Math.abs(movement.cantidad) * Number(movement.costoUnitario ?? 0)) : "—"}</TableCell>
                        <TableCell><p className="text-xs font-semibold">{movement.referencia || "Sin referencia"}</p><p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{movement.motivo || "Sin notas"}</p></TableCell>
                      </TableRow>;
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>{movimientos.length} movimientos mostrados</span>{hasMore && <span>Hay más resultados; utiliza los filtros para acotar la búsqueda.</span>}</div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
