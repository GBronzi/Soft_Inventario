import { createPreUpdateBackup } from "@/database/db";

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  install(onProgress: (percentage: number) => void): Promise<string>;
}

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!("__TAURI_INTERNALS__" in window)) return null;

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: 30_000 });
  if (!update) return null;

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? null,
    async install(onProgress) {
      const backupPath = await createPreUpdateBackup(update.version);
      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (total > 0) onProgress(Math.min(100, Math.round((downloaded / total) * 100)));
        if (event.event === "Finished") onProgress(100);
      });

      return backupPath;
    },
  };
}
