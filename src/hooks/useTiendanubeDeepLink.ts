import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSearchParams } from "react-router-dom";
import { exchangeCode } from "@/api/tiendanube";

/**
 * Hook that captures Tiendanube deep‑link parameters (code, user_id, state) and
 * exchanges the code for an access token.
 * Works both in development (query string) and in production Tauri (tauri://protocol event).
 */
export function useTiendanubeDeepLink(onToken: (token: string) => void) {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Development: parameters are present in the URL query string.
    const code = searchParams.get("code");
    const userId = searchParams.get("user_id");
    if (code && userId) {
      void (async () => {
        const resp = await exchangeCode(code, userId);
        onToken(resp.access_token);
      })();
    }

    // Production: listen for the custom protocol event emitted by Tauri.
    const unlisten = listen<string>("tauri://protocol", async (event) => {
      const url = new URL(event.payload);
      const code = url.searchParams.get("code");
      const userId = url.searchParams.get("user_id");
      if (code && userId) {
        const resp = await exchangeCode(code, userId);
        onToken(resp.access_token);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [searchParams, onToken]);
}
