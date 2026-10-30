import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, Save, ShoppingBag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getRegistroVentasMensual, guardarComentarioRegistroVenta } from "@/database/ventas";
import { formatDatabaseDate, formatDatabaseTime, localMonthKey } from "@/lib/datetime";
import type { RegistroVentasMensual, VentaRegistroItem } from "@/types";

function currentMonth() {
  return localMonthKey();
}

function csvValue(value: string | number | null | undefined) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function normalizeBrand(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getSalesClassification(marca: string | null | undefined) {
  return normalizeBrand(marca) === "yves d'orgeval" ? "Yves d'Orgeval" : "Arabes / demas marcas";
}

function buildExcelCsv(summary: RegistroVentasMensual) {
  const headers = ["Fecha", "Origen", "Entrada", "Producto", "Marca", "Clasificacion", "Variante", "Cantidad", "Precio unitario", "Subtotal", "Medio de pago", "Comentario"];
  const rows = summary.registros.map((item) => [
    item.fecha,
    item.origen === "PROGRAMA" ? "Programa" : "Tiendanube",
    item.entradaVenta,
    item.producto,
    item.marca ?? "",
    getSalesClassification(item.marca),
    item.variante ?? "",
    item.cantidad,
    item.precioUnitario,
    item.subtotal,
    item.medioPago,
    item.comentario,
  ]);
  rows.push(["", "", "", "", "", "", "TOTAL GENERAL", summary.unidadesGeneral, "", summary.totalGeneral, "", ""]);
  rows.push(["", "", "", "", "", "", "YVES D'ORGEVAL", summary.unidadesNacional, "", summary.totalNacional, "", ""]);
  rows.push(["", "", "", "", "", "", "ARABES / DEMAS MARCAS", summary.unidadesArabes, "", summary.totalArabes, "", ""]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n")}`;
}

async function saveCsv(content: string, filename: string) {
  const selectedPath = await save({
    defaultPath: filename,
    filters: [{ name: "Excel CSV", extensions: ["csv"] }],
  });

  if (!selectedPath) return false;

  await invoke("save_text_file", { path: selectedPath, contents: content });
  return true;
}

interface Props {
  open: boolean;
  onClose: () => void;
  formatCurrency: (value: number) => string;
}

export function RegistroVentasPanel({ open, onClose, formatCurrency }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<RegistroVentasMensual | null>(null);
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setStatus(null);
    void getRegistroVentasMensual(month)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setDraftComments(Object.fromEntries(data.registros.map((item) => [item.registroKey, item.comentario ?? ""])));
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, open]);

  const registros = summary?.registros ?? [];
  const totals = useMemo(() => ({
    general: summary?.totalGeneral ?? 0,
    programa: summary?.totalPrograma ?? 0,
    tiendanube: summary?.totalTiendanube ?? 0,
    unidades: summary?.unidadesGeneral ?? 0,
    nacional: summary?.totalNacional ?? 0,
    arabes: summary?.totalArabes ?? 0,
    unidadesNacional: summary?.unidadesNacional ?? 0,
    unidadesArabes: summary?.unidadesArabes ?? 0,
  }), [summary]);

  async function saveComment(item: VentaRegistroItem) {
    const nextComment = draftComments[item.registroKey] ?? "";
    setSavingKey(item.registroKey);
    setStatus(null);
    try {
      await guardarComentarioRegistroVenta(item.registroKey, nextComment);
      setSummary((current) => current ? {
        ...current,
        registros: current.registros.map((row) => row.registroKey === item.registroKey ? { ...row, comentario: nextComment.trim() } : row),
      } : current);
      setStatus("Comentario guardado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingKey(null);
    }
  }

  async function exportExcel() {
    if (!summary) return;
    setStatus(null);
    try {
      const saved = await saveCsv(buildExcelCsv(summary), `registro-ventas-${summary.mes}.csv`);
      if (saved) setStatus("Archivo Excel guardado correctamente.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  if (!open) return null;

  return (
    <Card className="overflow-hidden border-primary/10 bg-card/80 shadow-xl backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 border-b bg-muted/20 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700"><ShoppingBag className="size-4" /></span>
            Registro de ventas
          </CardTitle>
          <CardDescription>Ventas registradas por el programa y ventas confirmadas desde Tiendanube.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} className="h-10 w-40" />
          <Button type="button" variant="outline" onClick={() => void exportExcel()} disabled={!registros.length || loading}><Download className="mr-2 size-4" />Excel</Button>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar registro de ventas"><X className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Total general</p><p className="mt-1 text-lg font-black">{formatCurrency(totals.general)}</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Programa</p><p className="mt-1 font-black text-emerald-700">{formatCurrency(totals.programa)}</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Tiendanube</p><p className="mt-1 font-black text-sky-700">{formatCurrency(totals.tiendanube)}</p></div>
          <div className="rounded-xl border bg-background/70 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Unidades</p><p className="mt-1 font-black">{totals.unidades} u.</p></div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
            <p className="text-[10px] font-bold uppercase text-amber-700">Yves d&apos;Orgeval / nacional</p>
            <p className="mt-1 text-lg font-black">{formatCurrency(totals.nacional)}</p>
            <p className="text-xs text-muted-foreground">{totals.unidadesNacional} unidades vendidas</p>
          </div>
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3">
            <p className="text-[10px] font-bold uppercase text-indigo-700">Arabes / demas marcas</p>
            <p className="mt-1 text-lg font-black">{formatCurrency(totals.arabes)}</p>
            <p className="text-xs text-muted-foreground">{totals.unidadesArabes} unidades vendidas</p>
          </div>
        </div>

        {status && <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{status}</div>}

        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[1320px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="min-w-[260px]">Entrada</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Comentario</TableHead>
                <TableHead className="w-[92px] text-right">Guardar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Cargando ventas...</TableCell></TableRow> : registros.length === 0 ? <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No hay ventas registradas para este mes.</TableCell></TableRow> : registros.map((item) => (
                <TableRow key={item.registroKey} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs"><p className="font-semibold">{formatDatabaseDate(item.fecha)}</p><p className="text-muted-foreground">{formatDatabaseTime(item.fecha)}</p></TableCell>
                  <TableCell className="min-w-[260px]"><Badge variant="outline" className={item.origen === "PROGRAMA" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-sky-500/30 bg-sky-500/10 text-sky-700"}>{item.origen === "PROGRAMA" ? "Programa" : "Tiendanube"}</Badge><p className="mt-1 max-w-[260px] truncate whitespace-nowrap text-xs text-muted-foreground" title={item.entradaVenta}>{item.entradaVenta}</p></TableCell>
                  <TableCell><p className="font-semibold">{item.producto}</p><p className="text-xs text-muted-foreground">{item.variante || "Presentación principal"} · {item.marca || "Sin marca"} · {item.numero}</p></TableCell>
                  <TableCell className="text-right font-bold">{item.cantidad} u.</TableCell>
                  <TableCell className="text-right font-black">{formatCurrency(item.subtotal)}</TableCell>
                  <TableCell><Textarea value={draftComments[item.registroKey] ?? ""} onChange={(event) => setDraftComments((current) => ({ ...current, [item.registroKey]: event.target.value }))} placeholder="Agregar comentario" className="min-h-16 resize-none" /></TableCell>
                  <TableCell className="text-right"><Button type="button" size="icon" variant="outline" onClick={() => void saveComment(item)} disabled={savingKey === item.registroKey} aria-label={`Guardar comentario de ${item.producto}`}><Save className="size-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
