import { Banknote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDatabaseTime } from "@/lib/datetime";
import type { ResumenVentasDia } from "@/types";

interface Props {
  summary: ResumenVentasDia | null;
  open: boolean;
  onToggle: () => void;
  formatCurrency: (value: number) => string;
}

export function VentasDiaCard({ summary, open, onToggle, formatCurrency }: Props) {
  return (
    <Card className="overflow-hidden border-border/50 bg-card/60 shadow-xl backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 border-b border-border/50 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Banknote className="size-4" /></span>Ventas del día</CardTitle>
          <CardDescription>{summary?.operaciones ?? 0} operaciones · {summary?.unidades ?? 0} unidades</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <strong className="text-xl text-foreground">{formatCurrency(summary?.total ?? 0)}</strong>
          <Button type="button" variant="outline" onClick={onToggle}>{open ? "Ocultar tabla" : "Ver tabla"}</Button>
        </div>
      </CardHeader>
      {open && <CardContent className="p-0">
        {!summary?.detalles.length ? <div className="p-8 text-center text-sm text-muted-foreground">Todavía no hay ventas registradas hoy.</div> : <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3">Hora</th><th className="px-3 py-3">Perfume</th><th className="px-3 py-3">Cantidad</th><th className="px-3 py-3">Pago</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y">{summary.detalles.map((item, index) => <tr key={`${item.ventaId}-${index}`}><td className="px-5 py-3 text-muted-foreground">{formatDatabaseTime(item.fecha)}</td><td className="px-3 py-3"><p className="font-bold">{item.producto}</p><p className="text-xs text-muted-foreground">{item.variante || "Presentación principal"}</p></td><td className="px-3 py-3">{item.cantidad} u.</td><td className="px-3 py-3"><span className="rounded bg-muted px-2 py-1 text-[10px] font-bold">{item.medioPago}</span></td><td className="px-5 py-3 text-right font-black">{formatCurrency(item.subtotal)}</td></tr>)}</tbody>
            <tfoot className="border-t-2 border-border bg-muted/20"><tr><td colSpan={2} className="px-5 py-4 font-bold">Total del día</td><td className="px-3 py-4 font-bold">{summary.unidades} u.</td><td className="px-3 py-4 text-xs text-muted-foreground">Efectivo {formatCurrency(summary.efectivo)} · Transferencia {formatCurrency(summary.transferencia)} · Tarjeta {formatCurrency(summary.tarjeta)} · Otro {formatCurrency(summary.otro)} · Tiendanube {formatCurrency(summary.tiendanube)} · Movimientos {formatCurrency(summary.movimientos)}</td><td className="px-5 py-4 text-right text-lg font-black text-emerald-700">{formatCurrency(summary.total)}</td></tr></tfoot>
          </table>
        </div>}
      </CardContent>}
    </Card>
  );
}
