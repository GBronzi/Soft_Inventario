import { Calculator, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRegistroVentasMensual } from "@/database/ventas";
import { localMonthKey } from "@/lib/datetime";

const FACTURACION_STORAGE_KEY = "soft_inventario_facturacion";

interface FacturacionRow {
  id: string;
  tarjeta: string;
  transferencia: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  formatCurrency: (value: number) => string;
}

function currentMonth() {
  return localMonthKey();
}

function createRow(): FacturacionRow {
  return {
    id: `fac-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tarjeta: "",
    transferencia: "",
  };
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function readRows(month: string): FacturacionRow[] {
  if (typeof window === "undefined" || !window.localStorage) return [createRow()];
  try {
    const raw = window.localStorage.getItem(`${FACTURACION_STORAGE_KEY}:${month}`);
    if (!raw) return [createRow()];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createRow()];
    return parsed.map((row) => ({
      id: String(row.id || createRow().id),
      tarjeta: String(row.tarjeta ?? ""),
      transferencia: String(row.transferencia ?? ""),
    }));
  } catch {
    return [createRow()];
  }
}

function saveRows(month: string, rows: FacturacionRow[]) {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(`${FACTURACION_STORAGE_KEY}:${month}`, JSON.stringify(rows));
}

export function FacturacionPanel({ open, onClose, formatCurrency }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<FacturacionRow[]>(() => readRows(currentMonth()));
  const [tiendanubeTotal, setTiendanubeTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(readRows(month));
  }, [month, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setStatus(null);
    void getRegistroVentasMensual(month)
      .then((summary) => {
        if (!cancelled) setTiendanubeTotal(summary.totalTiendanube);
      })
      .catch((error) => {
        if (!cancelled) {
          setTiendanubeTotal(0);
          setStatus(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, open]);

  useEffect(() => {
    if (!open) return;
    saveRows(month, rows);
  }, [month, open, rows]);

  const totals = useMemo(() => {
    const tarjeta = rows.reduce((sum, row) => sum + parseMoney(row.tarjeta), 0);
    const transferencia = rows.reduce((sum, row) => sum + parseMoney(row.transferencia), 0);
    return {
      tarjeta,
      transferencia,
      tiendanube: tiendanubeTotal,
      general: tarjeta + transferencia + tiendanubeTotal,
    };
  }, [rows, tiendanubeTotal]);

  function updateRow(id: string, field: "tarjeta" | "transferencia", value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  function removeRow(id: string) {
    setRows((current) => current.length <= 1 ? [{ ...current[0], tarjeta: "", transferencia: "" }] : current.filter((row) => row.id !== id));
  }

  if (!open) return null;

  return (
    <Card className="overflow-hidden border-primary/10 bg-card/80 shadow-xl backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 border-b bg-muted/20 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700"><Calculator className="size-4" /></span>
            Facturación
          </CardTitle>
          <CardDescription>Control mensual de cobros manuales y ventas confirmadas de Tiendanube.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} className="h-10 w-40" />
          <Button type="button" variant="outline" onClick={() => setRows((current) => [...current, createRow()])}>
            <Plus className="mr-2 size-4" />Agregar fila
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar facturación"><X className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Tarjeta</p><p className="mt-1 text-lg font-black">{formatCurrency(totals.tarjeta)}</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Transferencia</p><p className="mt-1 text-lg font-black">{formatCurrency(totals.transferencia)}</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Tiendanube</p><p className="mt-1 text-lg font-black text-sky-700">{loading ? "Cargando..." : formatCurrency(totals.tiendanube)}</p></div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3"><p className="text-[10px] font-bold uppercase text-emerald-700">Total general</p><p className="mt-1 text-lg font-black text-emerald-700">{formatCurrency(totals.general)}</p></div>
        </div>

        {status && <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{status}</div>}

        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[760px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[72px]">Fila</TableHead>
                <TableHead>Tarjeta</TableHead>
                <TableHead>Transferencia</TableHead>
                <TableHead>Tiendanube</TableHead>
                <TableHead className="w-[88px] text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="font-bold text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <Input inputMode="decimal" value={row.tarjeta} onChange={(event) => updateRow(row.id, "tarjeta", event.target.value)} placeholder="Monto tarjeta" />
                  </TableCell>
                  <TableCell>
                    <Input inputMode="decimal" value={row.transferencia} onChange={(event) => updateRow(row.id, "transferencia", event.target.value)} placeholder="Monto transferencia" />
                  </TableCell>
                  <TableCell className="font-black text-sky-700">
                    {index === 0 ? (loading ? "Cargando..." : formatCurrency(tiendanubeTotal)) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="icon" className="text-rose-500 hover:text-rose-600" onClick={() => removeRow(row.id)} aria-label={`Eliminar fila ${index + 1}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-black">Totales</TableCell>
                <TableCell className="font-black">{formatCurrency(totals.tarjeta)}</TableCell>
                <TableCell className="font-black">{formatCurrency(totals.transferencia)}</TableCell>
                <TableCell className="font-black text-sky-700">{formatCurrency(totals.tiendanube)}</TableCell>
                <TableCell className="text-right font-black text-emerald-700">{formatCurrency(totals.general)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
