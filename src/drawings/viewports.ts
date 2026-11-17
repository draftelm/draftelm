import type { Bounds2, DrawingViewport, Rect } from "./types";
import { viewportPadding } from "./layout";

export const VIEW_PADDING = { left: 25, right: 8, top: 7, bottom: 13 };

/** Largest conventional reduction that fits; no stretching and no rounding of model data. */
export function fitScale(bounds: Bounds2, frame: Rect, padding = VIEW_PADDING): number {
  const max = Math.min(1, (frame.width - padding.left - padding.right) / (bounds.max.x - bounds.min.x), (frame.height - padding.top - padding.bottom) / (bounds.max.y - bounds.min.y));
  if (!(max > 0) || !Number.isFinite(max)) throw new Error("Sheet viewport cannot fit geometry.");
  for (let decade = 1; decade <= 1e15; decade *= 10) for (const factor of [1, 2, 2.5, 5]) {
    const scale = 1 / (decade * factor); if (scale <= max + 1e-12) return scale;
  }
  throw new Error("Model is too large for supported drawing scales.");
}
export function scaleLabel(scale: number) { return `1:${Number((1 / scale).toFixed(6))}`; }
export function positionViewport(view: DrawingViewport, scale = fitScale(view.bounds, view.frame, viewportPadding(view))): DrawingViewport {
  // Recheck the actual scale label as it can wrap onto another heading line.
  const labelled = { ...view, scaleLabel: scaleLabel(scale) };
  const fittedScale = Math.min(scale, fitScale(view.bounds, view.frame, viewportPadding(labelled)));
  if (fittedScale !== scale) return positionViewport(view, fittedScale);
  const f = view.frame, b = view.bounds, p = viewportPadding(labelled);
  const center = { x: f.x + p.left + (f.width - p.left - p.right) / 2, y: f.y + p.top + (f.height - p.top - p.bottom) / 2 };
  return { ...view, scale, scaleLabel: scaleLabel(scale), origin: { x: center.x - (b.min.x + b.max.x) / 2 * scale, y: center.y + (b.min.y + b.max.y) / 2 * scale } };
}
