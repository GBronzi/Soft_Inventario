import { Medusae } from "@vibe-rational/medusae";
import "@vibe-rational/medusae/style.css";

const medusaeConfig = {
  background: { color: "#070b10" },
  cursor: {
    radius: 0.075,
    strength: 3,
    dragFactor: 0.015,
  },
  halo: {
    radiusBase: 2.4,
    radiusAmplitude: 0.5,
    shapeAmplitude: 0.75,
    rimWidth: 1.8,
    scaleX: 1.3,
    scaleY: 1,
  },
  particles: {
    baseSize: 0.016,
    activeSize: 0.044,
    blobScaleX: 1,
    blobScaleY: 0.6,
    cursorFollowStrength: 1,
    oscillationFactor: 1,
    colorBase: "#0891b2",
    colorOne: "#06b6d4",
    colorTwo: "#3b82f6",
    colorThree: "#f59e0b",
  },
};

export function ParticleField() {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: -1 }} aria-hidden="true">
      <Medusae className="size-full" config={medusaeConfig} />
    </div>
  );
}
