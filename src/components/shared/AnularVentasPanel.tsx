import { RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { pushInventarioIdATiendanube } from "@/api/tiendanube";
import { anularVentaRegistro, getVentasAnulablesMensual } from "@/database/ventas";
import { formatDatabaseDate, formatDatabaseTime, localMonthKey } from "@/lib/datetime";
import type { VentaAnulableItem } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCancelled?: () => void;
  formatCurrency: (value: number) => string;
}

function currentMonth() {
  return localMonthKey();
}

export function AnularVentasPanel({ open, onClose, onCancelled, formatCurrency }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<VentaAnulableItem[]>([]);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [cancellingKey, setCancellingKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setStatus(null);
    try {
      const data = await getVentasAnulablesMensual(month);
      setItems(data);
      setMotivos((current) => {
        const next = { ...current };
        data.forEach((item) => {
          if (!(item.registroKey in next)) next[item.registroKey] = "";
        });
        return next;
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
  }, [month, open]);

  const totals = useMemo(() => ({
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    unidades: items.reduce((sum, item) => sum + item.cantidad, 0),
  }), [items]);

  async function cancelItem(item: VentaAnulableItem) {
    const confirmacion = window.confirm(`Anular venta de ${item.producto} (${item.cantidad} u.)?\n\nEsto devuelve el stock y registra la anulacion en movimientos.`);
    if (!confirmacion) return;
    setCancellingKey(item.registroKey);
    setStatus(null);
    try {
      const result = await anularVentaRegistro(item.registroKey, motivos[item.registroKey]);
      try {
        await pushInventarioIdATiendanube(result.inventarioId);
        setStatus(`Venta anulada. Stock local: ${result.stockResultante} u. Tiendanube actualizado.`);
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : String(syncError);
        setStatus(`Venta anulada. Stock local: ${result.stockResultante} u. Aviso: no se pudo subir el stock a Tiendanube (${message}).`);
      }
      await load();
      onCancelled?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setCancellingKey(null);
    }
  }

  if (!open) return null;

  return (
    <Card className="overflow-hidden border-rose-500/10 bg-card/80 shadow-xl backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 border-b bg-muted/20 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700"><RotateCcw className="size-4" /></span>
            Anular ventas
          </CardTitle>
          <CardDescription>Lista solo ventas confirmadas; al anular devuelve stock y registra la devolucion en Kardex.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} className="h-10 w-40" />
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>Actualizar</Button>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar anular ventas"><X className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Ventas anulables</p><p className="mt-1 text-lg font-black">{items.length}</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Unidades</p><p className="mt-1 font-black">{totals.unidades} u.</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Total visible</p><p className="mt-1 font-black">{formatCurrency(totals.total)}</p></div>
        </div>

        {status && <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{status}</div>}

        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[1160px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Stock actual</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Motivo de anulacion</TableHead>
                <TableHead className="w-[110px] text-right">Accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">Cargando ventas...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No hay ventas anulables para este mes.</TableCell></TableRow>
              ) : items.map((item) => (
                <TableRow key={item.registroKey} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs"><p className="font-semibold">{formatDatabaseDate(item.fecha)}</p><p className="text-muted-foreground">{formatDatabaseTime(item.fecha)}</p></TableCell>
                  <TableCell><Badge variant="outline" className={item.origen === "PROGRAMA" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-sky-500/30 bg-sky-500/10 text-sky-700"}>{item.origen === "PROGRAMA" ? "Programa" : "Tiendanube"}</Badge><p className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={item.entradaVenta}>{item.entradaVenta}</p></TableCell>
                  <TableCell><p className="font-semibold">{item.producto}</p><p className="text-xs text-muted-foreground">{item.variante || "Presentacion principal"} · {item.numero}</p></TableCell>
                  <TableCell className="text-right font-bold">{item.cantidad} u.</TableCell>
                  <TableCell className="text-right font-bold">{item.stockActual} u.</TableCell>
                  <TableCell className="text-right font-black">{formatCurrency(item.subtotal)}</TableCell>
                  <TableCell><Textarea value={motivos[item.registroKey] ?? ""} onChange={(event) => setMotivos((current) => ({ ...current, [item.registroKey]: event.target.value }))} placeholder="Ej: cliente devolvio, error de carga, venta cancelada" className="min-h-16 resize-none" /></TableCell>
                  <TableCell className="text-right"><Button type="button" variant="destructive" size="sm" onClick={() => void cancelItem(item)} disabled={cancellingKey === item.registroKey}>{cancellingKey === item.registroKey ? "Anulando" : "Anular"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
