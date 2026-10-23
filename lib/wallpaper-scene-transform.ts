import type { BrowserScene } from "./wallpaper-scene-types";

export function sceneLayerOrigin(
  scene: Pick<BrowserScene, "width" | "height" | "cameraEffects">,
  origin: number[],
  depth: number[],
  parallaxOrigin: number[] = origin,
): number[] {
  if (!scene.cameraEffects.parallax) return [...origin];
  const amount = scene.cameraEffects.amount;
  // Expand the owning layer's anchor while preserving inherited child offsets.
  // This offset also applies with zero mouse influence.
  return [
    origin[0] + (parallaxOrigin[0] - scene.width / 2) * depth[0] * amount,
    origin[1] + (parallaxOrigin[1] - scene.height / 2) * depth[1] * amount,
    origin[2] ?? 0,
  ];
}
