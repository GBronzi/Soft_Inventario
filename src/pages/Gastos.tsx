import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, Pencil, Plus, Receipt, Trash2, Wallet, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getResumenMensualMovimientos, MONTHLY_SALES_UPDATED_EVENT } from "@/database/queries";
import { localDateKey, localMonthKey } from "@/lib/datetime";
import type { GastoDetalle, GastoRegistro } from "@/types";

const STORAGE_KEY = "soft_inventario_gastos";

function getTodayDate() {
  return localDateKey();
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStoredGastos(): GastoRegistro[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    try {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildCsvContent(gastos: GastoRegistro[], ventasMensuales: Record<string, number>) {
  const rows = gastos.flatMap((gasto) =>
    gasto.items.map((item: { concepto: string; valor: number }) => ({
      tipo: "detalle",
      nombre: gasto.nombre,
      fecha: gasto.fecha,
      descripcion: gasto.descripcion ?? "",
      concepto: item.concepto,
      valor: item.valor,
      total: gasto.total,
    })),
  );

  const summaryRows = Object.entries(
    gastos.reduce<Record<string, { gastos: number; registros: number }>>((acc, gasto) => {
      const month = gasto.fecha.slice(0, 7);
      if (!acc[month]) {
        acc[month] = { gastos: 0, registros: 0 };
      }
      acc[month].gastos += gasto.total;
      acc[month].registros += 1;
      return acc;
    }, {}),
  ).map(([mes, value]) => ({
    tipo: "resumen",
    mes,
    gastos: value.gastos,
    ventas: ventasMensuales[mes] ?? 0,
    ganancia: (ventasMensuales[mes] ?? 0) - value.gastos,
  }));

  const allRows = [...rows, ...summaryRows];
  const headers = ["tipo", "nombre", "fecha", "descripcion", "concepto", "valor", "total", "mes", "ventas", "ganancia"];
  const csv = [headers.join(",")]
    .concat(
      allRows.map((row) =>
        headers
          .map((header) => {
            const value = row[header as keyof typeof row];
            const stringValue = String(value ?? "").replace(/"/g, '""');
            return `"${stringValue}"`;
          })
          .join(","),
      ),
    )
    .join("\n");

  return csv;
}

export function Gastos() {
  const [gastos, setGastos] = useState<GastoRegistro[]>([]);
  const [ventasMensuales, setVentasMensuales] = useState<Record<string, number>>({});
  const [salesRefresh, setSalesRefresh] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => localMonthKey());
  const [form, setForm] = useState({ nombre: "", fecha: getTodayDate(), descripcion: "" });
  const [items, setItems] = useState<GastoDetalle[]>([{ id: createId(), concepto: "", valor: 0 }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tableMonth, setTableMonth] = useState("");

  useEffect(() => {
    const storedGastos = readStoredGastos();
    setGastos(storedGastos);

    function refreshVentas() {
      setSalesRefresh((value) => value + 1);
    }

    window.addEventListener(MONTHLY_SALES_UPDATED_EVENT, refreshVentas);
    window.addEventListener("storage", refreshVentas);
    return () => {
      window.removeEventListener(MONTHLY_SALES_UPDATED_EVENT, refreshVentas);
      window.removeEventListener("storage", refreshVentas);
    };
  }, []);

  useEffect(() => {
    const months = Array.from(new Set([selectedMonth, ...gastos.map((gasto) => gasto.fecha.slice(0, 7))]));
    void Promise.all(months.map((mes) => getResumenMensualMovimientos(mes))).then((summaries) => {
      setVentasMensuales(Object.fromEntries(summaries.map((summary) => [summary.mes, summary.ventasNetas])));
    });
  }, [gastos, selectedMonth, salesRefresh]);

  const summaries = useMemo(() => {
    const monthMap = new Map<string, { mes: string; gastos: number; registros: number }>();
    gastos.forEach((gasto) => {
      const mes = gasto.fecha.slice(0, 7);
      const entry = monthMap.get(mes) ?? { mes, gastos: 0, registros: 0 };
      entry.gastos += gasto.total;
      entry.registros += 1;
      monthMap.set(mes, entry);
    });

    return Array.from(monthMap.values())
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .map((entry) => ({
        ...entry,
        ventas: ventasMensuales[entry.mes] ?? 0,
        ganancia: (ventasMensuales[entry.mes] ?? 0) - entry.gastos,
      }));
  }, [gastos, ventasMensuales]);

  const selectedSummary = summaries.find((entry) => entry.mes === selectedMonth) ?? {
    mes: selectedMonth,
    gastos: 0,
    registros: 0,
    ventas: ventasMensuales[selectedMonth] ?? 0,
    ganancia: ventasMensuales[selectedMonth] ?? 0,
  };

  const filteredGastos = useMemo(
    () => gastos.filter((gasto) => !tableMonth || gasto.fecha.startsWith(tableMonth)),
    [gastos, tableMonth],
  );

  function persistGastos(nextGastos: GastoRegistro[]) {
    setGastos(nextGastos);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGastos));
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm({ nombre: "", fecha: getTodayDate(), descripcion: "" });
    setItems([{ id: createId(), concepto: "", valor: 0 }]);
  }

  function handleAddItem() {
    setItems((current) => [...current, { id: createId(), concepto: "", valor: 0 }]);
  }

  function handleRemoveItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  function handleItemChange(itemId: string, field: keyof GastoDetalle, value: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        if (field === "valor") {
          return { ...item, valor: Number(value) || 0 };
        }
        return { ...item, concepto: value };
      }),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedItems = items.filter((item) => item.concepto.trim() || item.valor > 0);
    if (!form.nombre.trim() || cleanedItems.length === 0) return;

    const gastoExistente = editingId ? gastos.find((gasto) => gasto.id === editingId) : undefined;
    const gastoGuardado: GastoRegistro = {
      id: gastoExistente?.id ?? createId(),
      nombre: form.nombre.trim(),
      fecha: form.fecha,
      descripcion: form.descripcion.trim() || undefined,
      items: cleanedItems.map((item) => ({
        id: createId(),
        concepto: item.concepto.trim(),
        valor: Number(item.valor) || 0,
      })),
      total: cleanedItems.reduce((sum, item) => sum + (Number(item.valor) || 0), 0),
      creadoEn: gastoExistente?.creadoEn ?? new Date().toISOString(),
    };

    const nextGastos = editingId
      ? gastos.map((gasto) => (gasto.id === editingId ? gastoGuardado : gasto))
      : [gastoGuardado, ...gastos];
    persistGastos(nextGastos);
    resetForm();
  }

  function handleEdit(gasto: GastoRegistro) {
    setEditingId(gasto.id);
    setForm({
      nombre: gasto.nombre,
      fecha: gasto.fecha,
      descripcion: gasto.descripcion ?? "",
    });
    setItems(gasto.items.map((item) => ({ ...item })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDelete(gasto: GastoRegistro) {
    if (!window.confirm(`¿Eliminar el gasto "${gasto.nombre}"? Esta acción no se puede deshacer.`)) return;
    persistGastos(gastos.filter((item) => item.id !== gasto.id));
    if (editingId === gasto.id) resetForm();
  }

  function handleExportCsv() {
    const csvContent = buildCsvContent(gastos, ventasMensuales);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Gastos del local</h1>
          <p className="text-sm text-muted-foreground">Controlá los egresos por mes, cargá ventas y calculá la ganancia real.</p>
        </div>
        <Button onClick={handleExportCsv} type="button" variant="outline" className="rounded-xl">
          <Download className="mr-2 size-4" /> Exportar CSV
        </Button>
      </div>

      <Card className="border-none bg-gradient-to-br from-amber-500/10 via-transparent to-transparent shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-amber-500" /> {editingId ? "Modificar gasto" : "Añadir gasto"}
          </CardTitle>
          <CardDescription>Podés cargar varios conceptos en un mismo gasto y sumar el total automáticamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Nombre del gasto</label>
                <Input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} placeholder="Luz, alquiler, publicidad..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Fecha de pago</label>
                <Input type="date" value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Detalle</label>
              <Textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} placeholder="Observaciones del gasto" />
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={item.id} className="grid gap-3 rounded-2xl border border-border/50 bg-background/50 p-4 md:grid-cols-[1.3fr_0.8fr_auto]">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Concepto {index + 1}</label>
                    <Input value={item.concepto} onChange={(event) => handleItemChange(item.id, "concepto", event.target.value)} placeholder="Ej: Luz del mes" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Valor</label>
                    <Input type="number" min="0" step="0.01" value={item.valor} onChange={(event) => handleItemChange(item.id, "valor", event.target.value)} placeholder="0" />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)} disabled={items.length === 1}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" onClick={handleAddItem} className="rounded-xl">
                <Plus className="mr-2 size-4" /> Añadir otro valor
              </Button>
              <div className="flex gap-2">
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm} className="rounded-xl">
                    <X className="mr-2 size-4" /> Cancelar
                  </Button>
                )}
                <Button type="submit" className="rounded-xl">
                  <Receipt className="mr-2 size-4" /> {editingId ? "Guardar cambios" : "Guardar gasto"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Resumen mensual</CardTitle>
            <CardDescription>Controlá ventas e ingresos para calcular ganancias por mes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Mes</label>
              <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total de gastos</span>
                <span className="font-black">{formatCurrency(selectedSummary.gastos)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ventas del mes</span>
                <span className="font-black text-emerald-600">{formatCurrency(selectedSummary.ventas)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-sm text-muted-foreground">Ganancia</span>
                <span className={`font-black ${selectedSummary.ganancia >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(selectedSummary.ganancia)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Historial por mes</CardTitle>
            <CardDescription>Se suman todos los gastos cargados y se restan con las ventas del mes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
                Todavía no hay gastos cargados. Podés empezar por el formulario de arriba.
              </div>
            ) : (
              summaries.map((summary) => (
                <div key={summary.mes} className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black">{summary.mes}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.registros} {summary.registros === 1 ? "gasto registrado" : "gastos registrados"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">Gastos: {formatCurrency(summary.gastos)}</p>
                      <p className="text-sm font-semibold">Ventas: {formatCurrency(summary.ventas)}</p>
                      <p className={`text-sm font-black ${summary.ganancia >= 0 ? "text-emerald-600" : "text-rose-600"}`}>Ganancia: {formatCurrency(summary.ganancia)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-lg">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Gastos registrados</CardTitle>
              <CardDescription>Detalle de cada gasto con opciones para modificarlo o eliminarlo.</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1">
                <label htmlFor="filtro-mes-gastos" className="text-xs font-semibold text-muted-foreground">Filtrar por mes</label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="filtro-mes-gastos"
                    type="month"
                    value={tableMonth}
                    onChange={(event) => setTableMonth(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => setTableMonth("")} disabled={!tableMonth}>
                Todos los meses
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Gasto</TableHead>
                  <TableHead>Conceptos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[104px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGastos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                      {tableMonth ? "No hay gastos registrados en el mes seleccionado." : "No hay gastos registrados."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGastos.map((gasto) => (
                    <TableRow key={gasto.id}>
                      <TableCell className="whitespace-nowrap">{gasto.fecha}</TableCell>
                      <TableCell>
                        <p className="font-semibold">{gasto.nombre}</p>
                        {gasto.descripcion && <p className="max-w-[320px] truncate text-xs text-muted-foreground">{gasto.descripcion}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {gasto.items.map((item) => item.concepto).filter(Boolean).join(", ") || "Sin detalle"}
                      </TableCell>
                      <TableCell className="text-right font-black">{formatCurrency(gasto.total)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(gasto)} aria-label={`Modificar ${gasto.nombre}`} title="Modificar">
                            <Pencil className="size-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(gasto)} aria-label={`Eliminar ${gasto.nombre}`} title="Eliminar" className="text-destructive hover:text-destructive">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
