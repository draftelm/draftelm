import type { Bounds2, DrawingViewport, Rect } from "./types";
import { viewportPadding, viewportText } from "./layout";
import { modelToSheet, plotDimension } from "./dimensionPlot";
import { plotSectionMarkers } from "./sectionPlot";
import { primitiveBounds } from "./annotationGeometry";

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
  const placed = { ...view, scale, scaleLabel: scaleLabel(scale), origin: { x: center.x - (b.min.x + b.max.x) / 2 * scale, y: center.y + (b.min.y + b.max.y) / 2 * scale } };
  if (!view.dimensions.length && !view.sectionMarkers?.length) return placed;
  const ink = [
    ...view.entities.map(e => primitiveBounds({ kind: "line" as const, from: modelToSheet(placed, e.from), to: modelToSheet(placed, e.to), width: 0, role: "geometry" as const })),
    ...view.dimensions.flatMap(d => plotDimension(placed, d)).map(primitiveBounds),
    ...plotSectionMarkers(placed).map(primitiveBounds),
  ];
  if (!ink.length) return placed;
  const { heading, notes } = viewportText(placed);
  const region = { x: f.x + 2, y: f.y + 7 + (heading.length - 1) * 3.3, width: f.width - 4, height: f.height - 9 - (heading.length - 1) * 3.3 - (notes.length ? 7 + notes.length * 2.8 : 0) };
  const x = Math.min(...ink.map(r => r.x)), y = Math.min(...ink.map(r => r.y));
  const width = Math.max(...ink.map(r => r.x + r.width)) - x, height = Math.max(...ink.map(r => r.y + r.height)) - y;
  if (width > region.width + 1e-6 || height > region.height + 1e-6) {
    if (scale < 1e-12) throw new Error("Sheet viewport cannot fit readable annotations.");
    // Select the next conventional scale; lettering, arrows and offsets remain
    // paper-sized and are measured again at the new scale.
    const next = fitScale(b, { ...f, width: (b.max.x - b.min.x) * scale * 0.99 + p.left + p.right, height: (b.max.y - b.min.y) * scale * 0.99 + p.top + p.bottom }, p);
    return positionViewport(view, next);
  }
  const dx = Math.max(region.x - x, Math.min(0, region.x + region.width - x - width));
  const dy = Math.max(region.y - y, Math.min(0, region.y + region.height - y - height));
  return { ...placed, origin: { x: placed.origin.x + dx, y: placed.origin.y + dy } };
}
