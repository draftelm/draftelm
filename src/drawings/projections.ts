import type { PanelComponent, Vector3 } from "../furniture";
import type { Bounds2, Bounds3, ComponentReference, DrawingLine, Point2, Projection } from "./types";

export function bounds3(panels: PanelComponent[]): Bounds3 {
  if (!panels.length) throw new Error("Drawing requires physical panels.");
  const axes = ["x", "y", "z"] as const;
  for (const p of panels) for (const a of axes) {
    if (!Number.isFinite(p.position[a]) || !Number.isFinite(p.dimensions[a]) || p.dimensions[a] <= 0) throw new Error(`Invalid panel bounds: ${p.id}`);
  }
  return {
    min: Object.fromEntries(axes.map(a => [a, Math.min(...panels.map(p => p.position[a]))])) as unknown as Vector3,
    max: Object.fromEntries(axes.map(a => [a, Math.max(...panels.map(p => p.position[a] + p.dimensions[a]))])) as unknown as Vector3,
  };
}
/** Explicit drawing basis for the application's X-right/Y-up/Z-rearward convention.
 * Top: rear up; right side: rear right. Convention changes placement, not named views.
 * Isometric uses orthonormal image axes: all model axes have equal foreshortening.
 */
export function projectPoint(p: Vector3, projection: Projection): Point2 {
  if (projection === "front") return { x: p.x, y: p.y };
  if (projection === "top") return { x: p.x, y: p.z };
  if (projection === "right") return { x: p.z, y: p.y };
  return { x: (p.x + p.z) / Math.sqrt(2), y: (-p.x + 2 * p.y + p.z) / Math.sqrt(6) };
}
export function bounds2(points: Point2[]): Bounds2 {
  if (!points.length) throw new Error("Drawing viewport has no geometry.");
  return { min: { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)) }, max: { x: Math.max(...points.map(p => p.x)), y: Math.max(...points.map(p => p.y)) } };
}
export function panelReference(p: PanelComponent, bomId?: string): ComponentReference {
  return { componentId: p.id, assemblyId: p.assemblyId, ...(bomId ? { bomId } : {}) };
}
const EPS = 1e-7;
/** Exact interval clipping for axis-aligned projected box-face edges. Hidden edges
 * are omitted, not drawn as visible wireframe. No machining or internal features.
 */
export function orthographicLines(panels: PanelComponent[], projection: Exclude<Projection, "isometric">): DrawingLine[] {
  const rects = panels.map(panel => {
    const a = projectPoint(panel.position, projection);
    const b = projectPoint({ x: panel.position.x + panel.dimensions.x, y: panel.position.y + panel.dimensions.y, z: panel.position.z + panel.dimensions.z }, projection);
    const depth = projection === "front" ? panel.position.z : projection === "top" ? -(panel.position.y + panel.dimensions.y) : -(panel.position.x + panel.dimensions.x);
    return { panel, depth, min: a, max: b };
  });
  const lines: DrawingLine[] = [];
  for (const r of rects) {
    const corners = [r.min, { x: r.max.x, y: r.min.y }, r.max, { x: r.min.x, y: r.max.y }];
    for (let edge = 0; edge < 4; edge++) {
      const from = corners[edge], to = corners[(edge + 1) % 4];
      const axis = Math.abs(from.x - to.x) > EPS ? "x" : "y", cross = axis === "x" ? "y" : "x";
      const start = Math.min(from[axis], to[axis]), end = Math.max(from[axis], to[axis]);
      const occluders = rects.filter(o => o !== r && o.depth < r.depth - EPS && from[cross] >= o.min[cross] - EPS && from[cross] <= o.max[cross] + EPS);
      const cuts = [...new Set([start, end, ...occluders.flatMap(o => [Math.max(start, Math.min(end, o.min[axis])), Math.max(start, Math.min(end, o.max[axis]))])])].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const lo = cuts[i], hi = cuts[i + 1], middle = (lo + hi) / 2;
        if (hi - lo <= EPS || occluders.some(o => middle > o.min[axis] - EPS && middle < o.max[axis] + EPS)) continue;
        const p = { ...from, [axis]: lo }, q = { ...from, [axis]: hi };
        lines.push({ kind: "line", id: `${projection}:${r.panel.id}:${edge}:${i}`, from: p, to: q, references: [panelReference(r.panel)] });
      }
    }
  }
  // Merge coincident fragments while retaining every source component reference.
  const unique = new Map<string, DrawingLine>();
  for (const l of lines) {
    const key = JSON.stringify([l.from, l.to]); const existing = unique.get(key);
    if (existing) existing.references.push(...l.references.filter(r => !existing.references.some(e => e.componentId === r.componentId)));
    else unique.set(key, l);
  }
  return [...unique.values()];
}
export function isometricLines(panels: PanelComponent[]): DrawingLine[] {
  return panels.flatMap(panel => {
    const corners = Array.from({ length: 8 }, (_, i) => projectPoint({ x: panel.position.x + (i & 1 ? panel.dimensions.x : 0), y: panel.position.y + (i & 2 ? panel.dimensions.y : 0), z: panel.position.z + (i & 4 ? panel.dimensions.z : 0) }, "isometric"));
    return corners.flatMap((p, i) => [1, 2, 4].filter(bit => !(i & bit)).map(bit => ({ kind: "line" as const, id: `iso:${panel.id}:${i}:${bit}`, from: p, to: corners[i | bit], references: [panelReference(panel)] })));
  });
}
