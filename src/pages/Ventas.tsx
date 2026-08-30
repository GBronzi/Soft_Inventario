import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Barcode, CreditCard, Minus, Plus, Search, ShoppingCart, Trash2, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCatalogoProductos } from "@/database/queries";
import { registrarVenta } from "@/database/ventas";
import { pushInventarioIdATiendanube } from "@/api/tiendanube";
import { updateLiquidGlassPointer } from "@/lib/liquidGlass";
import type { CatalogoItem, MedioPago } from "@/types";

type LineaVenta = CatalogoItem & { cantidad: number; precioAplicado: number };

const PAYMENT_OPTIONS: Array<{ value: MedioPago; label: string; icon: typeof Banknote }> = [
  { value: "EFECTIVO", label: "Efectivo", icon: Banknote },
  { value: "TRANSFERENCIA", label: "Transferencia", icon: WalletCards },
  { value: "TARJETA", label: "Tarjeta", icon: CreditCard },
  { value: "OTRO", label: "Otro", icon: ShoppingCart },
];

function variantLabel(item: CatalogoItem) {
  return item.capacidadMedida || item.variante || "Presentación principal";
}

export function Ventas() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogoItem[]>([]);
  const [cart, setCart] = useState<LineaVenta[]>([]);
  const [medioPago, setMedioPago] = useState<MedioPago>("EFECTIVO");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!search.trim()) {
        setResults([]);
        return;
      }
      void getCatalogoProductos({ search, estado: "ACTIVO" }).then((items) => setResults(items.slice(0, 8)));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.cantidad * item.precioAplicado, 0), [cart]);
  const unidades = useMemo(() => cart.reduce((sum, item) => sum + item.cantidad, 0), [cart]);

  function addItem(item: CatalogoItem) {
    setStatus(null);
    setCart((current) => {
      const existing = current.find((line) => line.inventarioId === item.inventarioId);
      if (existing) {
        if (existing.cantidad >= item.stockActual) return current;
        return current.map((line) => line.inventarioId === item.inventarioId ? { ...line, cantidad: line.cantidad + 1 } : line);
      }
      if (item.stockActual <= 0) return current;
      return [...current, { ...item, cantidad: 1, precioAplicado: item.precioVenta }];
    });
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateQuantity(inventarioId: number, cantidad: number) {
    setCart((current) => current.map((line) => line.inventarioId === inventarioId
      ? { ...line, cantidad: Math.max(1, Math.min(line.stockActual, Math.trunc(cantidad) || 1)) }
      : line));
  }

  async function confirmSale() {
    if (!cart.length || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const sale = await registrarVenta({
        medioPago,
        nota,
        items: cart.map((item) => ({ inventarioId: item.inventarioId, cantidad: item.cantidad, precioUnitario: item.precioAplicado })),
      });
      const syncErrors: string[] = [];
      for (const inventarioId of sale.inventarioIds) {
        try {
          await pushInventarioIdATiendanube(inventarioId);
        } catch {
          syncErrors.push(String(inventarioId));
        }
      }
      setCart([]);
      setNota("");
      setMedioPago("EFECTIVO");
      setStatus({
        tone: syncErrors.length ? "info" : "success",
        message: syncErrors.length
          ? `Venta ${sale.numero} guardada. Algunos stocks no pudieron enviarse a Tiendanube y se reintentarán.`
          : `Venta ${sale.numero} registrada correctamente.`,
      });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
      searchRef.current?.focus();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-primary">Operación de caja</p>
          <h1 className="text-2xl font-black">Nueva venta</h1>
          <p className="text-sm text-muted-foreground">Agrega varios productos y confirma una sola salida de stock.</p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <ShoppingCart className="size-5 text-primary" />
          <div><p className="text-xs text-muted-foreground">Carrito actual</p><p className="text-sm font-bold">{unidades} unidades · {cart.length} productos</p></div>
        </div>
      </div>

      {status && <div role="status" className={`rounded-lg border p-3 text-sm font-medium ${status.tone === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-700" : status.tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-amber-500/30 bg-amber-500/10 text-amber-700"}`}>{status.message}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Buscar o escanear producto</CardTitle><CardDescription>Nombre, SKU o código de barras. El lector Bluetooth escribe aquí automáticamente.</CardDescription></CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input ref={searchRef} autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results.length) addItem(results[0]); }} placeholder="Buscar perfume, SKU o escanear código" className="h-12 pl-10 pr-10" />
                <Barcode className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-primary" />
              </div>
              {results.length > 0 && <div className="mt-2 divide-y overflow-hidden rounded-lg border">{results.map((item) => <button key={item.inventarioId} type="button" onPointerMove={updateLiquidGlassPointer} onClick={() => addItem(item)} className="liquid-choice flex w-full items-center justify-between gap-4 px-4 py-3 text-left disabled:opacity-50" disabled={item.stockActual <= 0}><span className="min-w-0"><span className="block truncate text-sm font-bold">{item.nombre}</span><span className="block truncate text-xs text-muted-foreground">{variantLabel(item)} · SKU {item.sku || "sin SKU"} · Stock {item.stockActual}</span></span><span className="shrink-0 text-sm font-black">${item.precioVenta.toLocaleString("es-AR")}</span></button>)}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Productos de la venta</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!cart.length ? <div className="px-6 py-14 text-center text-sm text-muted-foreground"><ShoppingCart className="mx-auto mb-3 size-9 opacity-30" />Todavía no agregaste productos.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-y bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3">Producto</th><th className="px-3 py-3">Stock</th><th className="px-3 py-3">Cantidad</th><th className="px-3 py-3">Precio</th><th className="px-3 py-3 text-right">Subtotal</th><th className="w-12" /></tr></thead><tbody className="divide-y">{cart.map((item) => <tr key={item.inventarioId}><td className="px-5 py-4"><p className="font-bold">{item.nombre}</p><p className="text-xs text-muted-foreground">{variantLabel(item)} · {item.sku || "Sin SKU"}</p></td><td className="px-3 py-4">{item.stockActual} u.</td><td className="px-3 py-4"><div className="flex h-9 w-32 items-center rounded-md border"><Button type="button" variant="ghost" size="icon-sm" aria-label={`Disminuir ${item.nombre}`} disabled={item.cantidad <= 1} onClick={() => updateQuantity(item.inventarioId, item.cantidad - 1)}><Minus className="size-3" /></Button><Input aria-label={`Cantidad ${item.nombre}`} value={item.cantidad} onChange={(event) => updateQuantity(item.inventarioId, Number(event.target.value))} className="h-8 border-0 p-0 text-center shadow-none" /><Button type="button" variant="ghost" size="icon-sm" aria-label={`Incrementar ${item.nombre}`} disabled={item.cantidad >= item.stockActual} onClick={() => updateQuantity(item.inventarioId, item.cantidad + 1)}><Plus className="size-3" /></Button></div></td><td className="px-3 py-4"><Input aria-label={`Precio ${item.nombre}`} type="number" min="0" value={item.precioAplicado} onChange={(event) => setCart((current) => current.map((line) => line.inventarioId === item.inventarioId ? { ...line, precioAplicado: Math.max(0, Number(event.target.value)) } : line))} className="w-28" /></td><td className="px-3 py-4 text-right font-black">${(item.cantidad * item.precioAplicado).toLocaleString("es-AR")}</td><td className="pr-3"><Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${item.nombre}`} onClick={() => setCart((current) => current.filter((line) => line.inventarioId !== item.inventarioId))} className="text-destructive"><Trash2 className="size-4" /></Button></td></tr>)}</tbody></table></div>}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader><CardTitle className="text-base">Cobro y confirmación</CardTitle><CardDescription>La venta descontará el stock de todos los productos.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-2">{PAYMENT_OPTIONS.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" onPointerMove={updateLiquidGlassPointer} onClick={() => setMedioPago(option.value)} className={`liquid-choice flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-xs font-bold ${medioPago === option.value ? "border-primary text-primary ring-1 ring-primary/20" : "text-muted-foreground"}`}><Icon className="size-4" />{option.label}</button>; })}</div>
            <div><label className="mb-1 block text-xs font-bold text-muted-foreground">Nota opcional</label><Input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Cliente o referencia" /></div>
            <div className="space-y-2 border-y py-4"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Unidades</span><strong>{unidades}</strong></div><div className="flex items-end justify-between"><span className="font-bold">Total</span><strong className="text-2xl">${total.toLocaleString("es-AR")}</strong></div></div>
            <Button type="button" className="h-12 w-full" disabled={!cart.length || saving} onClick={() => void confirmSale()}><ShoppingCart className="mr-2 size-4" />{saving ? "Registrando venta..." : "Confirmar venta"}</Button>
            {cart.length > 0 && <Button type="button" variant="ghost" className="w-full text-muted-foreground" disabled={saving} onClick={() => setCart([])}>Vaciar venta</Button>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
