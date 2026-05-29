import type { MovimientoListado, TipoMovimientoStock } from "@/types";

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