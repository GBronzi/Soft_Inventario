import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StockAlert } from "@/types";

interface AlertaStockListProps {
  alerts: StockAlert[];
  onOpenDetail?: (inventarioId: number) => void;
  onOpenAjuste?: (inventarioId: number) => void;
  onOpenEntrada?: (inventarioId: number) => void;
  onOpenMovimientos?: (inventarioId: number) => void;
}

export function AlertaStockList({ alerts, onOpenDetail, onOpenAjuste, onOpenEntrada, onOpenMovimientos }: AlertaStockListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="size-4 text-amber-500" />
          Alertas de stock
        </CardTitle>
        <CardDescription>Productos en o por debajo del stock mínimo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay alertas activas en este momento.</p>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.inventarioId}
              className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{alert.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  {[alert.marca, alert.variante, alert.capacidadMedida].filter(Boolean).join(" · ") || "Sin detalle de variante"}
                </p>
                <p className="text-xs text-muted-foreground">
                  SKU: {alert.sku || "sin definir"} · Código: {alert.codigoBarras || "sin definir"}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 md:items-end">
                <Badge variant={alert.stockActual <= 0 ? "destructive" : "secondary"}>
                  {alert.stockActual} / mínimo {alert.stockMinimo}
                </Badge>
                {(onOpenDetail || onOpenAjuste || onOpenEntrada || onOpenMovimientos) && (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {onOpenDetail && (
                      <Button onClick={() => onOpenDetail(alert.inventarioId)} size="xs" type="button" variant="outline">
                        Ver detalle
                      </Button>
                    )}
                    {onOpenAjuste && (
                      <Button onClick={() => onOpenAjuste(alert.inventarioId)} size="xs" type="button" variant="outline">
                        Ajuste rápido
                      </Button>
                    )}
                    {onOpenEntrada && (
                      <Button onClick={() => onOpenEntrada(alert.inventarioId)} size="xs" type="button" variant="secondary">
                        Registrar entrada
                      </Button>
                    )}
                    {onOpenMovimientos && (
                      <Button onClick={() => onOpenMovimientos(alert.inventarioId)} size="xs" type="button">
                        Movimientos
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}