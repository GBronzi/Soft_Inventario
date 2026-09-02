import { invoke } from "@tauri-apps/api/core";
import { ArrowDownToLine, ArrowRightLeft, Boxes, ClipboardList, History, PackagePlus, PackageSearch, ReceiptText, RotateCcw, ShoppingCart, TriangleAlert, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AlertaStockList } from "@/components/shared/AlertaStockList";
import { AnularVentasPanel } from "@/components/shared/AnularVentasPanel";
import { EscanerBluetoothPanel } from "@/components/shared/EscanerBluetoothPanel";
import { RegistroVentasPanel } from "@/components/shared/RegistroVentasPanel";
import { ResumenCard } from "@/components/shared/ResumenCard";
import { VentasDiaCard } from "@/components/shared/VentasDiaCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardOverview, getLowStockAlerts, getRecentMovimientos, getResumenMensualMovimientos, MONTHLY_SALES_UPDATED_EVENT } from "@/database/queries";
import { TIENDANUBE_SYNCED_EVENT } from "@/hooks/useTiendanubeSync";
import { getResumenVentasDia } from "@/database/ventas";
import { localDateKey, localMonthKey } from "@/lib/datetime";
import { updateLiquidGlassPointer } from "@/lib/liquidGlass";
import { buildMovimientosRoute, buildRepeatMovimientoRoute, formatMovimientoQuantity, getMovimientoQuantityTone } from "@/lib/movimientos";
import type { DashboardStats, GastoRegistro, LicenseStatus, MovimientoListado, ResumenMensualMovimientos, ResumenVentasDia, StockAlert } from "@/types";

const GASTOS_STORAGE_KEY = "soft_inventario_gastos";

type MonthlyDashboardSummary = ResumenMensualMovimientos & {
  gastos: number;
  resultado: number;
  registros: number;
};

const initialStats: DashboardStats = {
  totalProductos: 0,
  totalVariantes: 0,
  stockTotal: 0,
  variantesBajoStock: 0,
  movimientosHoy: 0,
  totalInvertido: 0,
};

function getTodayDateParam() {
  return localDateKey();
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

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(initialStats);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoListado[]>([]);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyDashboardSummary | null>(null);
  const [todaySales, setTodaySales] = useState<ResumenVentasDia | null>(null);
  const [showTodaySales, setShowTodaySales] = useState(false);
  const [showSalesRegistry, setShowSalesRegistry] = useState(false);
  const [showCancelSales, setShowCancelSales] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const todayDateParam = getTodayDateParam();

  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });

  useEffect(() => {
    void getResumenVentasDia(todayDateParam).then(setTodaySales).catch(console.error);
  }, [refreshKey, todayDateParam]);

  useEffect(() => {
    async function load() {
      const currentMonth = localMonthKey();
      const [dashboard, lowStock, recentMovements, movementSummary] = await Promise.all([
        getDashboardOverview(),
        getLowStockAlerts(),
        getRecentMovimientos(5),
        getResumenMensualMovimientos(currentMonth),
      ]);

      const gastos = readStoredGastos();
      const monthMap = new Map<string, { mes: string; gastos: number; registros: number }>();

      gastos.forEach((gasto) => {
        const mes = gasto.fecha.slice(0, 7);
        const entry = monthMap.get(mes) ?? { mes, gastos: 0, registros: 0 };
        entry.gastos += gasto.total;
        entry.registros += 1;
        monthMap.set(mes, entry);
      });

      const currentEntry = monthMap.get(currentMonth);
      const gastosMes = currentEntry?.gastos ?? 0;
      const costosNoComerciales = movementSummary.roturasFallasCosto + movementSummary.vencimientosCosto + movementSummary.regalosCosto + movementSummary.perdidasCosto + movementSummary.cambiosGarantiaCosto;
      const currentSummary = {
        ...movementSummary,
        gastos: gastosMes,
        resultado: movementSummary.ventasNetas - gastosMes - costosNoComerciales,
        registros: currentEntry?.registros ?? 0,
      };

      setStats(dashboard);
      setAlerts(lowStock);
      setMovimientos(recentMovements);
      setMonthlySummary(currentSummary);
    }

    void load().catch(console.error);
  }, [refreshKey]);

  useEffect(() => {
    void invoke<LicenseStatus>("get_license_status")
      .then(setLicense)
      .catch((error) => {
        console.error(error);
        setLicense({
          isValid: false,
          holder: null,
          expiresAt: null,
          mode: "error",
          message: "No se pudo consultar el estado local de la licencia.",
        });
      });
  }, []);

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <ResumenCard className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Abrir catálogo" description="Productos activos" icon={<Boxes className="size-5 text-blue-500" />} onClick={() => navigate("/catalogo")} title="Productos" value={stats.totalProductos} />
          <ResumenCard className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Ver productos con variantes" description="Productos con 2 o más presentaciones" icon={<Boxes className="size-5 text-purple-500" />} onClick={() => navigate("/catalogo?conVariantes=1")} title="Productos con variantes" value={stats.totalVariantes} />
          <ResumenCard className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Revisar stock" description="Unidades totales" icon={<PackageSearch className="size-5 text-emerald-500" />} onClick={() => navigate("/catalogo?estado=ACTIVO")} title="Stock total" value={stats.stockTotal} />
          <ResumenCard className="border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Ver bajo stock" description="Reponer urgente" icon={<TriangleAlert className="size-5 text-rose-500" />} onClick={() => navigate("/catalogo?bajoStock=1")} title="Bajo stock" value={stats.variantesBajoStock} />
          <ResumenCard className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow" actionLabel="Ver hoy" description="Movimientos" icon={<ClipboardList className="size-5 text-amber-500" />} onClick={() => navigate(`/movimientos?fechaDesde=${todayDateParam}&fechaHasta=${todayDateParam}`)} title="Hoy" value={stats.movimientosHoy} />
        </div>
      </section>

      <Card className="liquid-actions-card">
        <CardHeader>
          <CardTitle className="text-lg">Acciones rápidas</CardTitle>
          <CardDescription>Atajos operativos optimizados.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pb-6">
          <Button variant="ghost" className="liquid-action-button liquid-action-primary px-5" onPointerMove={updateLiquidGlassPointer} onClick={() => navigate("/producto/nuevo")} type="button"><PackagePlus className="mr-2 size-4" />Nuevo producto</Button>
          <Button variant="ghost" className="liquid-action-button px-5" onPointerMove={updateLiquidGlassPointer} onClick={() => navigate("/ventas")} type="button"><ShoppingCart className="mr-2 size-4" />Nueva venta</Button>
          <Button variant="ghost" className="liquid-action-button px-5" onPointerMove={updateLiquidGlassPointer} onClick={() => navigate(buildMovimientosRoute())} type="button"><ArrowRightLeft className="mr-2 size-4" />Registrar movimiento</Button>
          <Button variant="ghost" className="liquid-action-button px-5" onPointerMove={updateLiquidGlassPointer} onClick={() => navigate(buildMovimientosRoute({ presetTipoMovimiento: "SALIDA" }))} type="button"><ArrowDownToLine className="mr-2 size-4" />Registrar salida</Button>
          <Button variant="ghost" className="liquid-action-button px-5" onPointerMove={updateLiquidGlassPointer} onClick={() => setShowSalesRegistry((current) => !current)} type="button"><ReceiptText className="mr-2 size-4" />Registro de ventas</Button>
          <Button variant="ghost" className="liquid-action-button px-5" onPointerMove={updateLiquidGlassPointer} onClick={() => setShowCancelSales((current) => !current)} type="button"><RotateCcw className="mr-2 size-4" />Anular venta</Button>
        </CardContent>
      </Card>

      <VentasDiaCard
        summary={todaySales}
        open={showTodaySales}
        onToggle={() => setShowTodaySales((current) => !current)}
        formatCurrency={(value) => currencyFormatter.format(value)}
      />

      <RegistroVentasPanel
        open={showSalesRegistry}
        onClose={() => setShowSalesRegistry(false)}
        formatCurrency={(value) => currencyFormatter.format(value)}
      />

      <AnularVentasPanel
        open={showCancelSales}
        onClose={() => setShowCancelSales(false)}
        onCancelled={() => setRefreshKey((key) => key + 1)}
        formatCurrency={(value) => currencyFormatter.format(value)}
      />

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
              <CardDescription>Ventas reales, bajas, cambios y correcciones del mes actual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{monthlySummary?.mes ?? "—"}</p>
                    <p className="text-lg font-black">{currencyFormatter.format(monthlySummary?.ventasNetas ?? 0)}</p>
                  </div>
                  <div className="rounded-full bg-amber-500/10 p-2 text-amber-600">
                    <Wallet className="size-4" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-emerald-500/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">Ventas / unidades</p>
                    <p className="mt-1 font-black text-emerald-700">{currencyFormatter.format(monthlySummary?.ventasBrutas ?? 0)} · {monthlySummary?.unidadesVendidas ?? 0} u.</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-primary">Resultado operativo</p>
                    <p className="mt-1 font-black text-primary">{currencyFormatter.format(monthlySummary?.resultado ?? 0)}</p>
                  </div>
                  <div className="rounded-xl bg-rose-500/10 p-3 text-xs">
                    <p className="font-bold text-rose-700">Devoluciones: {currencyFormatter.format(monthlySummary?.devoluciones ?? 0)}</p>
                    <p className="mt-1 text-muted-foreground">Roturas/fallas: {currencyFormatter.format(monthlySummary?.roturasFallasCosto ?? 0)} · {monthlySummary?.roturasFallasUnidades ?? 0} u.</p>
                    <p className="mt-1 text-muted-foreground">Vencidos: {currencyFormatter.format(monthlySummary?.vencimientosCosto ?? 0)} · {monthlySummary?.vencimientosUnidades ?? 0} u.</p>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 p-3 text-xs">
                    <p className="font-bold text-amber-700">Cambios: +{monthlySummary?.cambiosEntradas ?? 0} / -{monthlySummary?.cambiosSalidas ?? 0} u.</p>
                    <p className="mt-1 text-muted-foreground">Garantías: {currencyFormatter.format(monthlySummary?.cambiosGarantiaCosto ?? 0)} · {monthlySummary?.cambiosGarantiaUnidades ?? 0} u.</p>
                    <p className="mt-1 text-muted-foreground">Regalos: {currencyFormatter.format(monthlySummary?.regalosCosto ?? 0)} · Faltantes: {currencyFormatter.format(monthlySummary?.perdidasCosto ?? 0)}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Ajustes de stock: +{monthlySummary?.ajustesPositivos ?? 0} / -{monthlySummary?.ajustesNegativos ?? 0} u. · Compras: {monthlySummary?.comprasUnidades ?? 0} u. · Gastos: {currencyFormatter.format(monthlySummary?.gastos ?? 0)}</p>
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
              {movimientos.map((movimiento) => {
                const quantityTone = getMovimientoQuantityTone(movimiento);
                return (
                <div key={movimiento.id} className="group flex items-center justify-between rounded-2xl border border-border/50 bg-background/40 p-4 transition-all hover:bg-muted/30">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground">{movimiento.producto}</span>
                    <span className="text-xs text-muted-foreground uppercase font-medium tracking-wider">
                      {movimiento.variante || "Presentación base"} • {movimiento.tipoMovimiento}
                    </span>
                    <p className="mt-1 text-sm italic opacity-80">{movimiento.motivo || "Sin observaciones"}</p>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-lg font-black tabular-nums ${quantityTone.className}`}>
                      {formatMovimientoQuantity(movimiento)}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <Button onClick={() => navigate(`/producto/${movimiento.inventarioId}`)} size="xs" variant="ghost">Ver</Button>
                       <Button onClick={() => navigate(buildMovimientosRoute({ inventarioId: movimiento.inventarioId, presetTipoMovimiento: "SALIDA" }))} size="xs" variant="ghost">Nueva salida</Button>
                       <Button aria-label="Repetir" onClick={() => navigate(buildRepeatMovimientoRoute(movimiento))} size="xs" className="h-7 w-7 p-0 rounded-full" variant="secondary">↻</Button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
