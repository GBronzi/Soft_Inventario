import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChartColumn, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getConfiguracionEmpresa, MONTHLY_SALES_UPDATED_EVENT } from "@/database/queries";
import { getReporteVentasPorAnios, type ReporteVenta } from "@/database/reportes";
import { TIENDANUBE_SYNCED_EVENT } from "@/hooks/useTiendanubeSync";
import { localDateKey, localMonthKey, parseDatabaseDate } from "@/lib/datetime";

type Totals = { importe: number; unidades: number };
type Period = Totals & { label: string; key: string };
type Metric = keyof Totals;

const EMPTY: Totals = { importe: 0, unidades: 0 };
const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Date(2024, index, 1).toLocaleDateString("es-AR", { month: "long" }),
);
const SELECT_CLASS = "liquid-select h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function addTotals(target: Totals, sale: ReporteVenta) {
  target.importe += sale.subtotal;
  target.unidades += sale.cantidad;
}

function sumSales(sales: ReporteVenta[]): Totals {
  return sales.reduce<Totals>((total, sale) => {
    addTotals(total, sale);
    return total;
  }, { ...EMPTY });
}

function saleDateKey(sale: ReporteVenta) {
  const date = parseDatabaseDate(sale.fecha);
  return date && Number.isFinite(date.getTime()) ? localDateKey(date) : "";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘`´]/g, "'").toLowerCase().replace(/\s+/g, " ").replace(/\s*'\s*/g, "'").trim();
}

function categoryOf(sale: ReporteVenta): "yves" | "arabes" | "decant" {
  const brand = normalize(sale.marca);
  const product = normalize(sale.producto);
  if (brand === "decant" || product.startsWith("decant")) return "decant";
  if (brand.includes("yves d'orgeval") || product.includes("yves d'orgeval")) return "yves";
  return "arabes";
}

function comparison(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Sin ventas en ambos períodos" : "Sin base en el año anterior";
  const percentage = ((current - previous) / previous) * 100;
  return `${percentage >= 0 ? "+" : ""}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(percentage)} %`;
}

function PeriodChart({ rows, metric, color, formatValue }: {
  rows: Period[];
  metric: Metric;
  color: string;
  formatValue: (value: number) => string;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row[metric]));
  const showEvery = rows.length > 20 ? 5 : 1;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex h-44 min-w-[560px] items-end gap-1 border-b border-border px-1 pt-3" role="img" aria-label={`Gráfico de ${metric === "importe" ? "importe" : "unidades"} por período`}>
        {rows.map((row, index) => (
          <div key={row.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${row.label}: ${formatValue(row[metric])}`}>
            <div className="flex w-full flex-1 items-end justify-center">
              <div className={`w-full max-w-10 rounded-t-sm transition-opacity group-hover:opacity-75 ${color}`} style={{ height: row[metric] > 0 ? `${Math.max(3, (row[metric] / maximum) * 100)}%` : "2px" }} />
            </div>
            <span className="h-4 text-center text-[10px] tabular-nums text-muted-foreground">
              {index % showEvery === 0 || index === rows.length - 1 ? row.label : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportTable({ rows, money, firstColumn }: { rows: Period[]; money: (value: number) => string; firstColumn: string }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>{firstColumn}</TableHead><TableHead className="text-right">Ventas</TableHead><TableHead className="text-right">Unidades</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="font-medium capitalize">{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.importe)}</TableCell>
            <TableCell className="text-right tabular-nums">{row.unidades.toLocaleString("es-AR")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Reportes() {
  const todayMonth = localMonthKey();
  const currentYear = Number(todayMonth.slice(0, 4));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(Number(todayMonth.slice(5, 7)));
  const [metric, setMetric] = useState<Metric>("importe");
  const [sales, setSales] = useState<ReporteVenta[]>([]);
  const [currency, setCurrency] = useState("ARS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const onUpdate = () => setRefresh((value) => value + 1);
    window.addEventListener(MONTHLY_SALES_UPDATED_EVENT, onUpdate);
    window.addEventListener(TIENDANUBE_SYNCED_EVENT, onUpdate);
    return () => {
      window.removeEventListener(MONTHLY_SALES_UPDATED_EVENT, onUpdate);
      window.removeEventListener(TIENDANUBE_SYNCED_EVENT, onUpdate);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([getReporteVentasPorAnios(selectedYear - 4, selectedYear), getConfiguracionEmpresa()])
      .then(([records, config]) => {
        if (!active) return;
        setSales(records);
        setCurrency(config.moneda || "ARS");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedYear, refresh]);

  const money = useMemo(() => {
    try {
      const formatter = new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 });
      return (value: number) => formatter.format(value);
    } catch {
      return (value: number) => `$ ${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
    }
  }, [currency]);

  const report = useMemo(() => {
    const selectedKey = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    const priorKey = `${selectedYear - 1}-${String(selectedMonth).padStart(2, "0")}`;
    const dated = sales.map((sale) => ({ sale, dateKey: saleDateKey(sale) })).filter((item) => item.dateKey);
    const monthlySales = dated.filter((item) => item.dateKey.startsWith(selectedKey));
    const priorSales = dated.filter((item) => item.dateKey.startsWith(priorKey));
    const monthTotals = sumSales(monthlySales.map((item) => item.sale));
    const priorTotals = sumSales(priorSales.map((item) => item.sale));
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const daily: Period[] = Array.from({ length: daysInMonth }, (_, index) => ({
      key: `${selectedKey}-${String(index + 1).padStart(2, "0")}`, label: String(index + 1), ...EMPTY,
    }));
    monthlySales.forEach(({ sale, dateKey }) => addTotals(daily[Number(dateKey.slice(-2)) - 1], sale));

    const monthly: Period[] = MONTHS.map((label, index) => ({
      key: `${selectedYear}-${String(index + 1).padStart(2, "0")}`, label: label.slice(0, 3), ...EMPTY,
    }));
    const annual: Period[] = Array.from({ length: 5 }, (_, index) => ({
      key: String(selectedYear - 4 + index), label: String(selectedYear - 4 + index), ...EMPTY,
    }));
    dated.forEach(({ sale, dateKey }) => {
      const year = Number(dateKey.slice(0, 4));
      if (year === selectedYear) addTotals(monthly[Number(dateKey.slice(5, 7)) - 1], sale);
      if (year >= selectedYear - 4 && year <= selectedYear) addTotals(annual[year - selectedYear + 4], sale);
    });

    const origins: Record<ReporteVenta["origen"], Totals> = { PROGRAMA: { ...EMPTY }, TIENDANUBE: { ...EMPTY } };
    const categories = { yves: { ...EMPTY }, arabes: { ...EMPTY }, decant: { ...EMPTY } };
    const products = new Map<string, { name: string; brand: string | null; totals: Totals }>();
    monthlySales.forEach(({ sale }) => {
      addTotals(origins[sale.origen], sale);
      addTotals(categories[categoryOf(sale)], sale);
      const key = `${normalize(sale.marca)}\u0000${normalize(sale.producto)}`;
      const product = products.get(key) ?? { name: sale.producto, brand: sale.marca, totals: { ...EMPTY } };
      addTotals(product.totals, sale);
      products.set(key, product);
    });
    const top = Array.from(products.values()).sort((a, b) => b.totals.unidades - a.totals.unidades || b.totals.importe - a.totals.importe).slice(0, 10);
    return { selectedKey, monthTotals, priorTotals, daily, monthly, annual, origins, categories, top };
  }, [sales, selectedMonth, selectedYear]);

  const metricFormat = metric === "importe" ? money : (value: number) => value.toLocaleString("es-AR");
  const yearOptions = Array.from({ length: 11 }, (_, index) => currentYear - index);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><ChartColumn className="size-5 text-primary" /><h1 className="text-xl font-semibold text-foreground">Reportes de ventas</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Ventas confirmadas del programa y Tiendanube.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Mes
            <select aria-label="Mes del reporte" className={SELECT_CLASS} value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Año
            <select aria-label="Año del reporte" className={SELECT_CLASS} value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Actualizar reportes" title="Actualizar reportes" onClick={() => setRefresh((value) => value + 1)}><RefreshCw className="size-4" /></Button>
        </div>
      </header>

      {loading ? <div role="status" className="py-12 text-center text-sm text-muted-foreground">Cargando reportes...</div> : error ? (
        <div role="alert" className="flex items-center gap-3 border-l-2 border-rose-500 bg-rose-500/10 p-4 text-sm text-foreground"><TriangleAlert className="size-5 shrink-0 text-rose-600" /><span>No se pudo cargar el reporte: {error}</span></div>
      ) : (
        <>
          <section aria-label="Resumen del mes" className="grid gap-4 border-b border-border pb-5 sm:grid-cols-3">
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Ventas · {MONTHS[selectedMonth - 1]} {selectedYear}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{money(report.monthTotals.importe)}</p></div>
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Unidades vendidas</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{report.monthTotals.unidades.toLocaleString("es-AR")}</p></div>
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Origen</p><p className="mt-2 text-sm text-foreground"><span className="font-semibold text-emerald-700 dark:text-emerald-400">Programa</span> {report.origins.PROGRAMA.unidades} u. <span className="mx-1 text-muted-foreground">·</span> <span className="font-semibold text-sky-700 dark:text-sky-400">Tiendanube</span> {report.origins.TIENDANUBE.unidades} u.</p></div>
          </section>

          {report.monthTotals.unidades === 0 && <p role="status" className="border-l-2 border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">No hay ventas confirmadas en {MONTHS[selectedMonth - 1]} de {selectedYear}. Puedes elegir otro período.</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-foreground">Evolución de ventas</h2>
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Métrica de gráficos">
              {(["importe", "unidades"] as const).map((option) => <button key={option} type="button" aria-pressed={metric === option} onClick={() => setMetric(option)} className={`rounded px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${metric === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{option === "importe" ? "Importe" : "Unidades"}</button>)}
            </div>
          </div>

          <section aria-labelledby="daily-heading" className="min-w-0 border-b border-border pb-6">
            <h2 id="daily-heading" className="text-base font-semibold text-foreground">Ventas diarias <span className="font-normal text-muted-foreground">· {MONTHS[selectedMonth - 1]} {selectedYear}</span></h2>
            <PeriodChart rows={report.daily} metric={metric} color="bg-emerald-600 dark:bg-emerald-400" formatValue={metricFormat} />
            <div className="mt-3 max-h-64 overflow-y-auto border-t border-border"><ReportTable rows={report.daily} money={money} firstColumn="Día" /></div>
          </section>

          <section aria-labelledby="monthly-heading" className="min-w-0 border-b border-border pb-6">
            <h2 id="monthly-heading" className="text-base font-semibold text-foreground">Ventas mensuales <span className="font-normal text-muted-foreground">· {selectedYear}</span></h2>
            <PeriodChart rows={report.monthly} metric={metric} color="bg-sky-600 dark:bg-sky-400" formatValue={metricFormat} />
            <div className="mt-3 max-h-64 overflow-y-auto border-t border-border"><ReportTable rows={report.monthly} money={money} firstColumn="Mes" /></div>
          </section>

          <section aria-labelledby="annual-heading" className="min-w-0 border-b border-border pb-6">
            <h2 id="annual-heading" className="text-base font-semibold text-foreground">Ventas anuales</h2>
            <PeriodChart rows={report.annual} metric={metric} color="bg-amber-600 dark:bg-amber-400" formatValue={metricFormat} />
            <div className="mt-3"><ReportTable rows={report.annual} money={money} firstColumn="Año" /></div>
          </section>

          <section aria-labelledby="comparison-heading" className="border-b border-border pb-6">
            <h2 id="comparison-heading" className="text-base font-semibold text-foreground">Comparativa · {MONTHS[selectedMonth - 1]}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {(["importe", "unidades"] as const).map((key) => {
                const current = report.monthTotals[key];
                const previous = report.priorTotals[key];
                const delta = comparison(current, previous);
                const growing = previous > 0 && current >= previous;
                return <div key={key} className="border-l-2 border-border pl-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{key === "importe" ? "Ventas" : "Unidades"}</p>
                  <p className="mt-1 text-sm tabular-nums text-foreground">{selectedYear}: <strong>{key === "importe" ? money(current) : current.toLocaleString("es-AR")}</strong> <span className="text-muted-foreground">· {selectedYear - 1}: {key === "importe" ? money(previous) : previous.toLocaleString("es-AR")}</span></p>
                  <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${previous > 0 ? growing ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}>{previous > 0 && (growing ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />)}{delta}</p>
                </div>;
              })}
            </div>
          </section>

          <section aria-labelledby="top-heading" className="min-w-0 border-b border-border pb-6">
            <h2 id="top-heading" className="text-base font-semibold text-foreground">Productos más vendidos <span className="font-normal text-muted-foreground">· {MONTHS[selectedMonth - 1]}</span></h2>
            {report.top.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Sin productos vendidos en este mes.</p> : <div className="mt-3"><Table><TableHeader><TableRow><TableHead className="w-9">#</TableHead><TableHead>Producto</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Ventas</TableHead></TableRow></TableHeader><TableBody>{report.top.map((product, index) => <TableRow key={`${normalize(product.brand)}\u0000${normalize(product.name)}`}><TableCell className="text-muted-foreground">{index + 1}</TableCell><TableCell className="min-w-48 whitespace-normal font-medium">{product.name}{product.brand && <span className="block text-xs font-normal text-muted-foreground">{product.brand}</span>}</TableCell><TableCell className="text-right tabular-nums">{product.totals.unidades.toLocaleString("es-AR")}</TableCell><TableCell className="text-right tabular-nums">{money(product.totals.importe)}</TableCell></TableRow>)}</TableBody></Table></div>}
          </section>

          <section aria-labelledby="origin-heading" className="min-w-0 border-b border-border pb-6">
            <h2 id="origin-heading" className="text-base font-semibold text-foreground">Ventas por origen <span className="font-normal text-muted-foreground">· {MONTHS[selectedMonth - 1]}</span></h2>
            <div className="mt-3"><Table><TableHeader><TableRow><TableHead>Origen</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Ventas</TableHead></TableRow></TableHeader><TableBody>{(["PROGRAMA", "TIENDANUBE"] as const).map((origin) => <TableRow key={origin}><TableCell className={`font-semibold ${origin === "PROGRAMA" ? "text-emerald-700 dark:text-emerald-400" : "text-sky-700 dark:text-sky-400"}`}>{origin === "PROGRAMA" ? "Programa" : "Tiendanube"}</TableCell><TableCell className="text-right tabular-nums">{report.origins[origin].unidades.toLocaleString("es-AR")}</TableCell><TableCell className="text-right tabular-nums">{money(report.origins[origin].importe)}</TableCell></TableRow>)}<TableRow className="font-semibold"><TableCell>Total</TableCell><TableCell className="text-right tabular-nums">{report.monthTotals.unidades.toLocaleString("es-AR")}</TableCell><TableCell className="text-right tabular-nums">{money(report.monthTotals.importe)}</TableCell></TableRow></TableBody></Table></div>
          </section>

          <section aria-labelledby="category-heading" className="min-w-0">
            <h2 id="category-heading" className="text-base font-semibold text-foreground">Ventas por línea <span className="font-normal text-muted-foreground">· {MONTHS[selectedMonth - 1]}</span></h2>
            <div className="mt-3"><Table><TableHeader><TableRow><TableHead>Línea</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Ventas</TableHead></TableRow></TableHeader><TableBody>{([
              { key: "yves", label: "Yves d'Orgeval", tone: "text-amber-700 dark:text-amber-400" },
              { key: "arabes", label: "Árabes / demás marcas", tone: "text-slate-700 dark:text-slate-300" },
              { key: "decant", label: "Decant", tone: "text-teal-700 dark:text-teal-400" },
            ] as const).map((category) => <TableRow key={category.key}><TableCell className={`font-semibold ${category.tone}`}>{category.label}</TableCell><TableCell className="text-right tabular-nums">{report.categories[category.key].unidades.toLocaleString("es-AR")}</TableCell><TableCell className="text-right tabular-nums">{money(report.categories[category.key].importe)}</TableCell></TableRow>)}<TableRow className="font-semibold"><TableCell>Total</TableCell><TableCell className="text-right tabular-nums">{report.monthTotals.unidades.toLocaleString("es-AR")}</TableCell><TableCell className="text-right tabular-nums">{money(report.monthTotals.importe)}</TableCell></TableRow></TableBody></Table></div>
          </section>
        </>
      )}
    </div>
  );
}
