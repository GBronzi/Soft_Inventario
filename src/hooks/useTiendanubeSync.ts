import { useEffect, useRef } from "react";

import {
  getPollConfig,
  getTiendanubeCredentials,
  runIncrementalSync,
} from "@/api/tiendanube";

export const TIENDANUBE_SYNCED_EVENT = "tiendanube:synced";
export const TIENDANUBE_PENDING_CHANGES_EVENT = "tiendanube:pending-changes";
export const TIENDANUBE_CONNECTION_EVENT = "tiendanube:connection";

export interface TiendanubePendingChangesDetail {
  procesados: number;
  errores: number;
  signature: string;
}

export interface TiendanubeConnectionEventDetail {
  level: "auth" | "network" | "api" | "recovered";
  message: string;
  attempts?: number;
}

function classifyConnectionError(error: unknown): TiendanubeConnectionEventDetail["level"] {
  const message = error instanceof Error ? error.message : String(error);
  if (/autorizaci[oó]n|vuelve a vincular|401|403/i.test(message)) return "auth";
  if (/network|fetch|Failed to fetch|conexi[oó]n|internet|timeout|ENOTFOUND|ECONN/i.test(message)) return "network";
  return "api";
}

// Polling global: mientras la app está abierta y hay credenciales, detecta
// cambios recientes de Tiendanube sin aplicarlos y avisa al resto de la UI.
export function useTiendanubeSync() {
  const runningRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPendingSignatureRef = useRef<string | null>(null);
  const consecutiveFailureCountRef = useRef(0);
  const lastConnectionIssueKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function emitConnectionIssue(detail: TiendanubeConnectionEventDetail) {
      const key = `${detail.level}:${detail.message}:${detail.attempts ?? 0}`;
      if (lastConnectionIssueKeyRef.current === key) return;
      lastConnectionIssueKeyRef.current = key;
      window.dispatchEvent(new CustomEvent(TIENDANUBE_CONNECTION_EVENT, { detail }));
    }

    async function tick() {
      const config = getPollConfig();
      const creds = getTiendanubeCredentials();

      if (!cancelled && config.enabled && creds && !runningRef.current) {
        runningRef.current = true;
        try {
          const result = await runIncrementalSync(() => {}) as TiendanubePendingChangesDetail;
          consecutiveFailureCountRef.current = 0;
          if (lastConnectionIssueKeyRef.current) {
            lastConnectionIssueKeyRef.current = null;
            window.dispatchEvent(new CustomEvent(TIENDANUBE_CONNECTION_EVENT, { detail: { level: "recovered", message: "Conexión con Tiendanube recuperada." } }));
          }

          if (!cancelled && result.procesados > 0 && result.signature && result.signature !== lastPendingSignatureRef.current) {
            lastPendingSignatureRef.current = result.signature;
            window.dispatchEvent(new CustomEvent(TIENDANUBE_PENDING_CHANGES_EVENT, { detail: result }));
          }
          if (!cancelled && result.procesados === 0) {
            lastPendingSignatureRef.current = null;
          }
        } catch (err) {
          console.warn("Polling Tiendanube falló:", err);
          consecutiveFailureCountRef.current += 1;
          const level = classifyConnectionError(err);
          const message = err instanceof Error ? err.message : String(err);

          if (level === "auth") {
            emitConnectionIssue({ level, message: "Tiendanube necesita volver a vincularse. La autorización actual fue rechazada.", attempts: consecutiveFailureCountRef.current });
          } else if (consecutiveFailureCountRef.current >= 3) {
            emitConnectionIssue({
              level,
              message: level === "network"
                ? "No se pudo comprobar Tiendanube después de varios intentos. Puede ser internet o el servidor temporalmente inaccesible."
                : message,
              attempts: consecutiveFailureCountRef.current,
            });
          }
        } finally {
          runningRef.current = false;
        }
      }

      if (!cancelled) {
        const next = getPollConfig().intervalSec * 1000;
        timeoutRef.current = setTimeout(tick, next);
      }
    }

    timeoutRef.current = setTimeout(tick, 5000);

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}