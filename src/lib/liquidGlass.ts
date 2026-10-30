import type { PointerEvent } from "react";

export function updateLiquidGlassPointer(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  event.currentTarget.style.setProperty("--glass-x", `${x.toFixed(2)}%`);
  event.currentTarget.style.setProperty("--glass-y", `${y.toFixed(2)}%`);
}
