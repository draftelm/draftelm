import type { PanelComponent, Vector3 } from "../../furniture";
import type { Point2 } from "../types";
import { bounds2, bounds3, projectPoint } from "../projections";
import { translateDrawingPanels } from "./assemblies";

const axes = ["x", "y", "z"] as const;
const zero = (): Vector3 => ({ x: 0, y: 0, z: 0 });
function projectedCorners(panels: PanelComponent[]) {
  return panels.flatMap(p => Array.from({ length: 8 }, (_, i) => projectPoint({
    x: p.position.x + (i & 1 ? p.dimensions.x : 0), y: p.position.y + (i & 2 ? p.dimensions.y : 0), z: p.position.z + (i & 4 ? p.dimensions.z : 0),
  }, "isometric")));
}
const projectedBounds = (panels: PanelComponent[]) => bounds2(projectedCorners(panels));

/** Convex projected box silhouettes avoid the large false overlaps of AABBs. */
function silhouette(panel: PanelComponent): Point2[] {
  const points = projectedCorners([panel]).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (ordered: Point2[]) => {
    const hull: Point2[] = [];
    for (const p of ordered) { while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop(); hull.push(p); }
    return hull.slice(0, -1);
  };
  return [...half(points), ...half([...points].reverse())];
}
function separated(a: Point2[], b: Point2[], gap: number): boolean {
  return [a, b].some(poly => poly.some((p, i) => {
    const q = poly[(i + 1) % poly.length], length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length < 1e-9) return false;
    const normal = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length };
    const aa = a.map(v => v.x * normal.x + v.y * normal.y), bb = b.map(v => v.x * normal.x + v.y * normal.y);
    return Math.max(...aa) + gap <= Math.min(...bb) || Math.max(...bb) + gap <= Math.min(...aa);
  }));
}

export function projectedPanelOverlaps(panels: PanelComponent[], gap = 0): string[][] {
  const polygons = panels.map(silhouette);
  return panels.flatMap((p, i) => panels.slice(i + 1).flatMap((q, j) => separated(polygons[i], polygons[i + j + 1], gap) ? [] : [[p.id, q.id]]));
}

/** Fan rectangular panels along their actual thickness axes. Uniformly expand
 * spacing until projected panel silhouettes separate, or report residual pairs.
 * This is a display relationship, never a disassembly direction/instruction. */
export function explodeDrawingPanels(panels: PanelComponent[]): { offsets: Record<string, Vector3>; unresolvedPairs: string[][] } {
  const bounds = bounds3(panels), ordered = [...panels].sort((a, b) => a.id.localeCompare(b.id));
  const directions: Record<string, Vector3> = {};
  for (const axis of axes) {
    const members = ordered.filter(p => p.thicknessAxis === axis).sort((a, b) => a.position[axis] - b.position[axis] || a.id.localeCompare(b.id));
    members.forEach((panel, index) => {
      const center = panel.position[axis] + panel.dimensions[axis] / 2, mid = (bounds.min[axis] + bounds.max[axis]) / 2;
      const sign = center < mid ? -1 : 1;
      const rank = sign < 0 ? members.length - index : index + 1;
      directions[panel.id] = { ...zero(), [axis]: sign * rank * Math.max(bounds.max[axis] - bounds.min[axis], 100) * 0.18 };
    });
  }
  let offsets: Record<string, Vector3> = {}, unresolvedPairs: string[][] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const factor = 1.4 ** attempt;
    offsets = Object.fromEntries(ordered.map(p => [p.id, Object.fromEntries(axes.map(axis => [axis, directions[p.id][axis] * factor])) as unknown as Vector3]));
    const moved = translateDrawingPanels(ordered, offsets);
    unresolvedPairs = projectedPanelOverlaps(moved, 25);
    if (!unresolvedPairs.length) break;
  }
  return { offsets, unresolvedPairs };
}

/** Root view: exploded carcass on the right and rigid drawer groups on the left.
 * Vertical order follows physical Y, keeping the bottom-to-top relationships.
 * Screen-space packing is converted to a pure global translation in mm. */
export function explodeDrawingAssembly(carcass: PanelComponent[], groups: PanelComponent[][]) {
  const exploded = explodeDrawingPanels(carcass), offsets = { ...exploded.offsets };
  const body = projectedBounds(translateDrawingPanels(carcass, offsets));
  const sorted = [...groups].sort((a, b) => bounds3(a).min.y - bounds3(b).min.y || a[0].assemblyId.localeCompare(b[0].assemblyId));
  const boxes = sorted.map(projectedBounds), gap = 100;
  const height = boxes.reduce((sum, box) => sum + box.max.y - box.min.y, 0) + Math.max(0, boxes.length - 1) * gap;
  let bottom = (body.min.y + body.max.y - height) / 2;
  for (const [i, panels] of sorted.entries()) {
    const box = boxes[i], dx = body.min.x - gap - box.max.x, dy = bottom - box.min.y;
    // x=z produces a horizontal screen translation, y supplies the vertical one.
    const shift = { x: dx / Math.sqrt(2), y: dy * Math.sqrt(6) / 2, z: dx / Math.sqrt(2) };
    panels.forEach(p => { offsets[p.id] = { ...shift }; });
    bottom += box.max.y - box.min.y + gap;
  }
  return { offsets, unresolvedPairs: exploded.unresolvedPairs };
}
