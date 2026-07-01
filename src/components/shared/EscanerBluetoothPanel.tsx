import { convertFileSrc } from "@tauri-apps/api/core";
import { AlertTriangle, Box, LoaderCircle, PackageOpen, ScanBarcode, ShoppingCart } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getProductoByCodigoBarras } from "@/database/queries";
import { buildVentaRapidaRoute } from "@/lib/movimientos";
import type { ProductoDetalle } from "@/types";

type ScannerStatus = "idle" | "loading" | "found" | "not-found" | "error";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export function EscanerBluetoothPanel() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState("");
  const [ultimoCodigo, setUltimoCodigo] = useState("");
  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");

  async function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const codigoNormalizado = codigo.trim();
    if (!codigoNormalizado || status === "loading") return;

    setCodigo("");
    setUltimoCodigo(codigoNormalizado);
    setProducto(null);
    setStatus("loading");

    try {
      const encontrado = await getProductoByCodigoBarras(codigoNormalizado);
      setProducto(encontrado);
      setStatus(encontrado ? "found" : "not-found");
    } catch (error) {
      console.error("No se pudo buscar el código escaneado:", error);
      setStatus("error");
    } finally {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const imageSrc = producto?.imagenPathLocal
    ? convertFileSrc(producto.imagenPathLocal)
    : producto?.imagenUrl ?? null;

  return (
    <Card className="border-l-4 border-l-primary shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanBarcode className="size-5 text-primary" /> Escáner Bluetooth
        </CardTitle>
        <CardDescription>Búsqueda exacta por código de barras.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleScan} className="flex flex-col gap-3 sm:flex-row">
          <Input
            ref={inputRef}
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Escanear o escribir código"
            aria-label="Código de barras"
            className="h-11 font-mono text-base tabular-nums"
          />
          <Button type="submit" className="h-11 px-5" disabled={!codigo.trim() || status === "loading"}>
            {status === "loading" ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <ScanBarcode className="mr-2 size-4" />}
            Buscar
          </Button>
        </form>

        {status === "found" && producto && (
          <div className="grid gap-4 rounded-lg border border-border/50 bg-muted/20 p-4 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
              {imageSrc ? <img src={imageSrc} alt={producto.nombre} className="h-full w-full object-cover" /> : <PackageOpen className="size-7 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant={producto.stockActual > 0 ? "secondary" : "destructive"}>Stock: {producto.stockActual}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{producto.codigoBarras}</span>
              </div>
              <p className="break-words font-black">{producto.nombre}</p>
              <p className="text-sm text-muted-foreground">{[producto.marca, producto.variante, producto.capacidadMedida].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 font-black tabular-nums">{currencyFormatter.format(producto.precioVenta)}</p>
            </div>
            <div className="flex flex-wrap gap-2 md:flex-col">
              <Button type="button" size="sm" onClick={() => navigate(buildVentaRapidaRoute(producto.inventarioId))} disabled={producto.stockActual <= 0}>
                <ShoppingCart className="mr-2 size-4" /> Venta rápida
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/producto/${producto.inventarioId}`)}>
                <Box className="mr-2 size-4" /> Abrir producto
              </Button>
            </div>
          </div>
        )}

        {status === "not-found" && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 p-4">
            <AlertTriangle className="size-5 shrink-0 text-amber-500" />
            <p className="text-sm"><span className="font-semibold">Producto no encontrado:</span> <span className="font-mono">{ultimoCodigo}</span></p>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/40 p-4 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <p className="text-sm font-semibold">No se pudo consultar el inventario.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
