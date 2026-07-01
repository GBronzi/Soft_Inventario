import { useEffect, useRef } from "react";

import {
  getPollConfig,
  getTiendanubeCredentials,
  runIncrementalSync,
} from "@/api/tiendanube";

export const TIENDANUBE_SYNCED_EVENT = "tiendanube:synced";

// Polling global: mientras la app está abierta y hay credenciales, baja los
// cambios recientes de Tiendanube cada N segundos y avisa al resto de la UI.
export function useTiendanubeSync() {
  const runningRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const config = getPollConfig();
      const creds = getTiendanubeCredentials();

      if (!cancelled && config.enabled && creds && !runningRef.current) {
        runningRef.current = true;
        try {
          const result = await runIncrementalSync(() => {});
          if (!cancelled && result.procesados > 0) {
            window.dispatchEvent(new CustomEvent(TIENDANUBE_SYNCED_EVENT, { detail: result }));
          }
        } catch (err) {
          console.warn("Polling Tiendanube falló:", err);
        } finally {
          runningRef.current = false;
        }
      }

      if (!cancelled) {
        const next = getPollConfig().intervalSec * 1000;
        timeoutRef.current = setTimeout(tick, next);
      }
    }

    // Primer ciclo tras un breve retraso para no chocar con la carga inicial.
    timeoutRef.current = setTimeout(tick, 5000);

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}
