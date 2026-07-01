import { invoke } from "@tauri-apps/api/core";
import { Boxes, ClipboardList, History, PackageSearch, ShoppingCart, TriangleAlert, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AlertaStockList } from "@/components/shared/AlertaStockList";
import { EscanerBluetoothPanel } from "@/components/shared/EscanerBluetoothPanel";
import { ResumenCard } from "@/components/shared/ResumenCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardOverview, getLowStockAlerts, getRecentMovimientos, MONTHLY_SALES_UPDATED_EVENT } from "@/database/queries";
import { TIENDANUBE_SYNCED_EVENT } from "@/hooks/useTiendanubeSync";
import { buildMovimientosRoute, buildRepeatMovimientoRoute, buildVentaRapidaRoute } from "@/lib/movimientos";
import type { DashboardStats, GastoRegistro, LicenseStatus, MovimientoListado, StockAlert } from "@/types";

const GASTOS_STORAGE_KEY = "soft_inventario_gastos";
const VENTAS_STORAGE_KEY = "soft_inventario_ventas_mensuales";

type MonthlyDashboardSummary = {
  mes: string;
  gastos: number;
  ventas: number;
  ganancia: number;
  registros: number;
};

const initialStats: DashboardStats = {
  totalProductos: 0,
  totalVariantes: 0,
  stockTotal: 0,
  variantesBajoStock: 0,
  movimientosHoy: 0,
  totalInvertido: 0,
  totalVentasSalidas: 0,
};

function getTodayDateParam() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function readStoredGastos(): GastoRegistro[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(GASTOS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    try {
      const raw = globalThis.localStorage.getItem(GASTOS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function readStoredVentas(): Record<string, number> {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(VENTAS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    try {
      const raw = globalThis.localStorage.getItem(VENTAS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(initialStats);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoListado[]>([]);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyDashboardSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const todayDateParam = getTodayDateParam();

  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });

  useEffect(() => {
    async function load() {
      const [dashboard, lowStock, recentMovements, licenseStatus] = await Promise.all([
        getDashboardOverview(),
        getLowStockAlerts(),
        getRecentMovimientos(5),
        invoke<LicenseStatus>("get_license_status"),
      ]);

      const gastos = readStoredGastos();
      const ventasMensuales = readStoredVentas();
      const monthMap = new Map<string, { mes: string; gastos: number; registros: number }>();

      gastos.forEach((gasto) => {
        const mes = gasto.fecha.slice(0, 7);
        const entry = monthMap.get(mes) ?? { mes, gastos: 0, registros: 0 };
        entry.gastos += gasto.total;
        entry.registros += 1;
        monthMap.set(mes, entry);
      });

      const currentMonth = new Date().toISOString().slice(0, 7);
      const currentEntry = monthMap.get(currentMonth);
      const currentSummary = currentEntry ? {
        mes: currentMonth,
        gastos: currentEntry.gastos,
        ventas: ventasMensuales[currentMonth] ?? 0,
        ganancia: (ventasMensuales[currentMonth] ?? 0) - currentEntry.gastos,
        registros: currentEntry.registros,
      } : {
        mes: currentMonth,
        gastos: 0,
        ventas: ventasMensuales[currentMonth] ?? 0,
        ganancia: (ventasMensuales[currentMonth] ?? 0),
        registros: 0,
      };

      setStats(dashboard);
      setAlerts(lowStock);
      setMovimientos(recentMovements);
      setLicense(licenseStatus);
      setMonthlySummary(currentSummary);
    }

    void load();
  }, [refreshKey]);

  useEffect(() => {
    const onSynced = () => {
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener(TIENDANUBE_SYNCED_EVENT, onSynced);
    window.addEventListener(MONTHLY_SALES_UPDATED_EVENT, onSynced);
    return () => {
      window.removeEventListener(TIENDANUBE_SYNCED_EVENT, onSynced);
      window.removeEventListener(MONTHLY_SALES_UPDATED_EVENT, onSynced);
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <EscanerBluetoothPanel />
      <section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <ResumenCard className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Abrir catálogo" description="Productos activos" icon={<Boxes className="size-5 text-blue-500" />} onClick={() => navigate("/catalogo")} title="Productos" value={stats.totalProductos} />
          <ResumenCard className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Ver productos con variantes" description="Presentaciones" icon={<Boxes className="size-5 text-purple-500" />} onClick={() => navigate("/catalogo")} title="Con variantes" value={stats.totalVariantes} />
          <ResumenCard className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Revisar stock" description="Unidades totales" icon={<PackageSearch className="size-5 text-emerald-500" />} onClick={() => navigate("/catalogo?estado=ACTIVO")} title="Stock total" value={stats.stockTotal} />
          <ResumenCard className="border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Ver bajo stock" description="Reponer urgente" icon={<TriangleAlert className="size-5 text-rose-500" />} onClick={() => navigate("/catalogo?bajoStock=1")} title="Bajo stock" value={stats.variantesBajoStock} />
          <ResumenCard className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Ver hoy" description="Movimientos" icon={<ClipboardList className="size-5 text-amber-500" />} onClick={() => navigate(`/movimientos?fechaDesde=${todayDateParam}&fechaHasta=${todayDateParam}`)} title="Hoy" value={stats.movimientosHoy} />
          <ResumenCard className="border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-shadow" valueClassName="break-words text-2xl leading-tight tabular-nums" actionLabel="Historial de salidas" description="Ventas por movimientos de salida" icon={<ShoppingCart className="size-5 text-indigo-500" />} onClick={() => navigate("/movimientos?tipoMovimiento=SALIDA")} title="Ventas" value={currencyFormatter.format(stats.totalVentasSalidas).replace("ARS", "$")} />
        </div>
      </section>

      <Card className="overflow-hidden border-none bg-gradient-to-br from-primary/10 via-transparent to-transparent shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Acciones rápidas</CardTitle>
          <CardDescription>Atajos operativos optimizados.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pb-6">
          <Button className="h-11 px-6 rounded-xl shadow-lg shadow-primary/20" onClick={() => navigate("/producto/nuevo")} type="button">Nuevo producto</Button>
          <Button variant="secondary" className="h-11 px-6 rounded-xl" onClick={() => navigate(buildMovimientosRoute())} type="button">Registrar movimiento</Button>
          <Button variant="destructive" className="h-11 px-6 rounded-xl shadow-lg shadow-destructive/20" onClick={() => navigate(buildMovimientosRoute({ presetTipoMovimiento: "SALIDA" }))} type="button">Registrar salida</Button>
          <Button variant="outline" className="h-11 px-6 rounded-xl border-dashed border-2" onClick={() => navigate(buildVentaRapidaRoute())} type="button">Venta rápida local</Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AlertaStockList
          alerts={alerts}
          onOpenDetail={(inventarioId) => navigate(`/producto/${inventarioId}`)}
          onOpenAjuste={(inventarioId) =>
            navigate(buildMovimientosRoute({ inventarioId, presetTipoMovimiento: "AJUSTE" }))
          }
          onOpenEntrada={(inventarioId) =>
            navigate(buildMovimientosRoute({ inventarioId, presetTipoMovimiento: "ENTRADA" }))
          }
          onOpenMovimientos={(inventarioId) => navigate(buildMovimientosRoute({ inventarioId }))}
        />

        <div className="space-y-6">
          <Card className="overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-primary" />
                Historial por mes
              </CardTitle>
              <CardDescription>Resumen rápido de gastos, ventas y ganancia del mes actual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{monthlySummary?.mes ?? "—"}</p>
                    <p className="text-lg font-black">{currencyFormatter.format(monthlySummary?.gastos ?? 0)}</p>
                  </div>
                  <div className="rounded-full bg-amber-500/10 p-2 text-amber-600">
                    <Wallet className="size-4" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-emerald-500/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">Ventas</p>
                    <p className="mt-1 font-black text-emerald-700">{currencyFormatter.format(monthlySummary?.ventas ?? 0)}</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-primary">Ganancia</p>
                    <p className="mt-1 font-black text-primary">{currencyFormatter.format(monthlySummary?.ganancia ?? 0)}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {monthlySummary && monthlySummary.registros > 0
                    ? `${monthlySummary.registros} ${monthlySummary.registros === 1 ? "gasto registrado" : "gastos registrados"}`
                    : "Sin gastos cargados todavía"}
                </p>
              </div>
              <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate("/gastos")} type="button">Abrir gastos</Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Licencia offline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Modo</span>
                <span className="font-semibold px-2 py-0.5 rounded bg-muted uppercase text-[10px]">{license?.mode ?? "cargando..."}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Titular</span>
                <span className="font-medium">{license?.holder ?? "Sin registrar"}</span>
              </div>
              <p className="text-xs italic text-muted-foreground pt-2">
                {license?.message ?? "Validando licencia..."}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-none shadow-xl bg-primary text-primary-foreground">
             <CardHeader>
               <CardTitle className="text-base text-primary-foreground">Soporte y Ayuda</CardTitle>
             </CardHeader>
             <CardContent>
               <p className="text-sm opacity-90 mb-4">¿Necesitas ayuda con el sistema o tienes algún problema?</p>
               <Button variant="secondary" className="w-full rounded-xl font-bold text-primary" onClick={() => navigate("/onboarding")}>Guía de Inicio</Button>
             </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-none shadow-2xl bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Últimos movimientos</CardTitle>
            <CardDescription>Historial reciente de auditoría.</CardDescription>
          </div>
          <Button variant="ghost" className="text-xs" onClick={() => navigate("/movimientos")}>Ver todo</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {movimientos.length === 0 ? (
            <div className="py-10 text-center">
              <ClipboardList className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay actividad reciente.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-1">
              {movimientos.map((movimiento) => (
                <div key={movimiento.id} className="group flex items-center justify-between rounded-2xl border border-border/50 bg-background/40 p-4 transition-all hover:bg-muted/30">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground">{movimiento.producto}</span>
                    <span className="text-xs text-muted-foreground uppercase font-medium tracking-wider">
                      {movimiento.variante || "Presentación base"} • {movimiento.tipoMovimiento}
                    </span>
                    <p className="mt-1 text-sm italic opacity-80">{movimiento.motivo || "Sin observaciones"}</p>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-lg font-black ${movimiento.tipoMovimiento === "ENTRADA" ? "text-emerald-500" : "text-rose-500"}`}>
                      {movimiento.tipoMovimiento === "ENTRADA" ? "+" : "-"}{movimiento.cantidad}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <Button onClick={() => navigate(`/producto/${movimiento.inventarioId}`)} size="xs" variant="ghost">Ver</Button>
                       <Button onClick={() => navigate(buildMovimientosRoute({ inventarioId: movimiento.inventarioId, presetTipoMovimiento: "SALIDA" }))} size="xs" variant="ghost">Nueva salida</Button>
                       <Button aria-label="Repetir" onClick={() => navigate(buildRepeatMovimientoRoute(movimiento))} size="xs" className="h-7 w-7 p-0 rounded-full" variant="secondary">↻</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
