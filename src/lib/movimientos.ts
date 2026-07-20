import type { MovimientoConcepto, MovimientoListado, TipoMovimientoStock } from "@/types";

export const CONCEPTOS_POR_TIPO: Record<TipoMovimientoStock, Array<{ value: MovimientoConcepto; label: string }>> = {
  ENTRADA: [
    { value: "COMPRA_REPOSICION", label: "Compra / reposición" },
    { value: "DEVOLUCION_CLIENTE", label: "Devolución de cliente" },
    { value: "CAMBIO_ENTRADA", label: "Producto recibido por cambio" },
    { value: "ENTRADA_OTRA", label: "Otra entrada" },
  ],
  SALIDA: [
    { value: "VENTA", label: "Venta" },
    { value: "CAMBIO_SALIDA", label: "Producto entregado por cambio" },
    { value: "CAMBIO_GARANTIA", label: "Reemplazo por garantía / falla" },
    { value: "ROTURA", label: "Rotura" },
    { value: "FALLA", label: "Falla" },
    { value: "VENCIMIENTO", label: "Vencimiento" },
    { value: "REGALO_SORTEO", label: "Sorteo / regalo / muestra" },
    { value: "DEVOLUCION_PROVEEDOR", label: "Devolución a proveedor" },
    { value: "PERDIDA_FALTANTE", label: "Pérdida / faltante" },
    { value: "SALIDA_OTRA", label: "Otra salida" },
  ],
  AJUSTE: [
    { value: "CORRECCION_STOCK", label: "Corrección por conteo físico" },
    { value: "SINCRONIZACION_TN", label: "Ajuste por Tiendanube" },
  ],
};

export function getConceptoLabel(concepto: MovimientoConcepto) {
  return Object.values(CONCEPTOS_POR_TIPO).flat().find((option) => option.value === concepto)?.label ?? concepto;
}

export const VENTA_RAPIDA_LOCAL_MOTIVO = "Venta rápida local";
export const VENTA_RAPIDA_LOCAL_REFERENCIA = "VENTA_RAPIDA_LOCAL";

export interface MovimientoQuickPreset {
  label: string;
  motivo: string;
  referencia: string;
}

export const MOVIMIENTO_QUICK_PRESETS: Record<TipoMovimientoStock, MovimientoQuickPreset[]> = {
  ENTRADA: [
    { label: "Reposición", motivo: "Reposición de stock", referencia: "REPOSICION_RAPIDA" },
    { label: "Compra proveedor", motivo: "Compra a proveedor", referencia: "COMPRA_PROVEEDOR" },
  ],
  SALIDA: [
    { label: "Venta mostrador", motivo: "Venta mostrador", referencia: "VENTA_MOSTRADOR" },
    { label: "Consumo interno", motivo: "Consumo interno", referencia: "CONSUMO_INTERNO" },
  ],
  AJUSTE: [
    { label: "Conteo físico", motivo: "Ajuste por conteo físico", referencia: "AJUSTE_CONTEO" },
    { label: "Merma / rotura", motivo: "Merma o rotura", referencia: "AJUSTE_MERMA" },
  ],
};

interface BuildMovimientosRouteOptions {
  inventarioId?: number | string | null;
  historyTipoMovimiento?: TipoMovimientoStock | "TODOS" | null;
  presetTipoMovimiento?: TipoMovimientoStock | null;
  presetCantidad?: number | string | null;
  presetMotivo?: string | null;
  presetReferencia?: string | null;
}

function setTrimmedSearchParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (!value?.trim()) {
    return;
  }

  params.set(key, value.trim());
}

function setOptionalSearchParam(params: URLSearchParams, key: string, value: number | string | null | undefined) {
  if (value === undefined || value === null) {
    return;
  }

  const normalizedValue = String(value).trim();

  if (!normalizedValue) {
    return;
  }

  params.set(key, normalizedValue);
}

export function buildMovimientosRoute(options: BuildMovimientosRouteOptions = {}) {
  const params = new URLSearchParams();

  if (options.inventarioId !== undefined && options.inventarioId !== null && String(options.inventarioId).trim()) {
    params.set("inventarioId", String(options.inventarioId));
  }

  if (options.historyTipoMovimiento && options.historyTipoMovimiento !== "TODOS") {
    params.set("tipoMovimiento", options.historyTipoMovimiento);
  }

  if (options.presetTipoMovimiento) {
    params.set("presetTipoMovimiento", options.presetTipoMovimiento);
  }

  setOptionalSearchParam(params, "presetCantidad", options.presetCantidad);
  setTrimmedSearchParam(params, "presetMotivo", options.presetMotivo);
  setTrimmedSearchParam(params, "presetReferencia", options.presetReferencia);

  const query = params.toString();
  return query ? `/movimientos?${query}` : "/movimientos";
}

export function buildVentaRapidaRoute(inventarioId?: number | string | null) {
  return buildMovimientosRoute({
    inventarioId,
    presetTipoMovimiento: "SALIDA",
    presetMotivo: VENTA_RAPIDA_LOCAL_MOTIVO,
    presetReferencia: VENTA_RAPIDA_LOCAL_REFERENCIA,
  });
}

export function buildRepeatMovimientoRoute(
  movimiento: Pick<MovimientoListado, "inventarioId" | "tipoMovimiento" | "cantidad" | "motivo" | "referencia">,
) {
  const presetTipoMovimiento =
    movimiento.tipoMovimiento === "ENTRADA" || movimiento.tipoMovimiento === "SALIDA" || movimiento.tipoMovimiento === "AJUSTE"
      ? movimiento.tipoMovimiento
      : null;

  return buildMovimientosRoute({
    inventarioId: movimiento.inventarioId,
    presetTipoMovimiento,
    presetCantidad: movimiento.cantidad,
    presetMotivo: movimiento.motivo,
    presetReferencia: movimiento.referencia,
  });
}
