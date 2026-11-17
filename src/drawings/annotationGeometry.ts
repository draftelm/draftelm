import type { PanelComponent, Vector3 } from "../furniture";
import type { DrawingViewport, PlotEntity, Point2, Projection, Rect } from "./types";
import { projectPoint } from "./projections";
import { modelToSheet } from "./dimensionPlot";
import { panelEdges, pointIsVisible } from "./edgeVisibility";
export { panelEdges } from "./edgeVisibility";

export const BALLOON_STYLE = { radius: 3.5, textSize: 3, strokeWidth: 0.25, anchorRadius: 0.5, clearance: 0.7 };
export const overlaps = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
export const containsRect = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
export const balloonBounds = (center: Point2): Rect => ({ x: center.x - BALLOON_STYLE.radius, y: center.y - BALLOON_STYLE.radius, width: BALLOON_STYLE.radius * 2, height: BALLOON_STYLE.radius * 2 });
export function primitiveBounds(entity: PlotEntity): Rect {
  if (entity.kind === "circle") return { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius, width: entity.radius * 2, height: entity.radius * 2 };
  if (entity.kind === "text") {
    const advance = Array.from(entity.text).length * entity.size;
    return entity.rotation === -90 ? { x: entity.at.x - entity.size, y: entity.at.y - advance / 2, width: entity.size * 1.2, height: advance }
      : { x: entity.at.x - (entity.align === "middle" ? advance / 2 : 0), y: entity.at.y - entity.size, width: advance, height: entity.size * 1.2 };
  }
  const points = entity.kind === "line" ? [entity.from, entity.to] : entity.points;
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
export function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const cross = (p: Point2, q: Point2, r: Point2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const within = (p: Point2, q: Point2, r: Point2) => r.x >= Math.min(p.x, q.x) - 1e-8 && r.x <= Math.max(p.x, q.x) + 1e-8 && r.y >= Math.min(p.y, q.y) - 1e-8 && r.y <= Math.max(p.y, q.y) + 1e-8;
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  if (x * y < 0 && z * w < 0) return true;
  return (Math.abs(x) < 1e-8 && within(a, b, c)) || (Math.abs(y) < 1e-8 && within(a, b, d)) || (Math.abs(z) < 1e-8 && within(c, d, a)) || (Math.abs(w) < 1e-8 && within(c, d, b));
}
export function segmentHitsRect(a: Point2, b: Point2, rect: Rect, padding = 0.5): boolean {
  const min = { x: rect.x - padding, y: rect.y - padding }, max = { x: rect.x + rect.width + padding, y: rect.y + rect.height + padding };
  const inside = (p: Point2) => p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
  const corners = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
  return inside(a) || inside(b) || corners.some((p, i) => segmentsIntersect(a, b, p, corners[(i + 1) % 4]));
}

/** Ray toward the projection's camera. Open AABB interiors avoid treating face contact
 * as penetration. The epsilon is computational only, never a manufacturing allowance. */
export function anchorIsVisible(point: Vector3, projection: Projection, panels: PanelComponent[]): boolean {
  return pointIsVisible(point, projection, panels);
}

export function pointOnSegment(p: Point2, a: Point2, b: Point2, tolerance = 1e-6) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length > 0 && Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length < tolerance &&
    p.x >= Math.min(a.x, b.x) - tolerance && p.x <= Math.max(a.x, b.x) + tolerance && p.y >= Math.min(a.y, b.y) - tolerance && p.y <= Math.max(a.y, b.y) + tolerance;
}
export function visibleAnchorCandidates(panel: PanelComponent, view: DrawingViewport, panels: PanelComponent[]) {
  if (view.projection === "panel-face") return [];
  const projection = view.projection;
  const lines = view.entities.filter(e => e.references.some(r => r.componentId === panel.id));
  if (!lines.length) return [];
  return panelEdges(panel).flatMap(edge => {
    const a = modelToSheet(view, projectPoint(edge.from, projection)), b = modelToSheet(view, projectPoint(edge.to, projection));
    if (Math.hypot(b.x - a.x, b.y - a.y) < 3) return [];
    return [0.5, 0.25, 0.75].flatMap(t => {
      const point = { x: edge.from.x + (edge.to.x - edge.from.x) * t, y: edge.from.y + (edge.to.y - edge.from.y) * t, z: edge.from.z + (edge.to.z - edge.from.z) * t };
      const projected = projectPoint(point, projection), line = lines.find(e => pointOnSegment(projected, e.from, e.to));
      // Check a small interval as well, to reject isolated visibility at contacts.
      if (!line || Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y) * view.scale < 3 || ![-0.01, 0, 0.01].every(delta => anchorIsVisible({ x: point.x + (edge.to.x - edge.from.x) * delta, y: point.y + (edge.to.y - edge.from.y) * delta, z: point.z + (edge.to.z - edge.from.z) * delta }, projection, panels))) return [];
      return [{ point, edge, sourceLineId: line.id, paper: modelToSheet(view, projected) }];
    });
  });
}
