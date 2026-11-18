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

/** Smallest translation along a panel's physical thickness axis which clears
 * the already placed convex box silhouettes. SAT gives forbidden intervals;
 * jumping to interval ends avoids expanding every part for one difficult pair. */
function clearDistance(poly: Point2[], direction: Point2, obstacles: Point2[][], gap: number) {
  const intervals: [number, number][] = [];
  for (const other of obstacles) {
    let enter = -Infinity, leave = Infinity;
    for (const shape of [poly, other]) for (let i = 0; i < shape.length; i++) {
      const p = shape[i], q = shape[(i + 1) % shape.length], length = Math.hypot(q.x - p.x, q.y - p.y);
      if (length < 1e-9) continue;
      const n = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length };
      const a = poly.map(v => v.x * n.x + v.y * n.y), b = other.map(v => v.x * n.x + v.y * n.y);
      const speed = direction.x * n.x + direction.y * n.y;
      const lo = Math.min(...b) - gap - Math.max(...a), hi = Math.max(...b) + gap - Math.min(...a);
      if (Math.abs(speed) < 1e-9) { if (lo >= 0 || hi <= 0) { enter = Infinity; leave = -Infinity; } }
      else { enter = Math.max(enter, Math.min(lo / speed, hi / speed)); leave = Math.min(leave, Math.max(lo / speed, hi / speed)); }
    }
    if (enter < leave) intervals.push([enter, leave]);
  }
  let distance = 0;
  for (const [enter, leave] of intervals.sort((a, b) => a[0] - b[0])) if (distance > enter - 1e-7 && distance < leave) distance = leave + 1e-6;
  return distance;
}

/** Compare deterministic physical-axis packings using actual projected boxes.
 * Every panel keeps its orientation and moves only outward on its thickness
 * axis. Offsets are presentation data, never disassembly/process instructions. */
export function explodeDrawingPanels(panels: PanelComponent[]): { offsets: Record<string, Vector3>; unresolvedPairs: string[][] } {
  const bounds = bounds3(panels), ordered = [...panels].sort((a, b) => a.id.localeCompare(b.id));
  const directions: Record<string, Vector3> = {};
  for (const panel of ordered) {
    const axis = panel.thicknessAxis, center = panel.position[axis] + panel.dimensions[axis] / 2;
    directions[panel.id] = { ...zero(), [axis]: center < (bounds.min[axis] + bounds.max[axis]) / 2 ? -1 : 1 };
  }
  let best: { offsets: Record<string, Vector3>; score: number } | undefined;
  for (const order of ["xyz", "xzy", "yxz", "yzx", "zxy", "zyx"]) for (const reverse of [false, true]) {
    const sequence = [...ordered].sort((a, b) => order.indexOf(a.thicknessAxis) - order.indexOf(b.thicknessAxis) || (reverse ? -1 : 1) * (a.position[a.thicknessAxis] - b.position[b.thicknessAxis]) || a.id.localeCompare(b.id));
    const offsets: Record<string, Vector3> = {}, obstacles: Point2[][] = [];
    for (const panel of sequence) {
      const direction = directions[panel.id], projected = projectPoint(direction, "isometric");
      const initial = Math.max(40, (bounds.max[panel.thicknessAxis] - bounds.min[panel.thicknessAxis]) * 0.06);
      const start = Object.fromEntries(axes.map(a => [a, direction[a] * initial])) as unknown as Vector3;
      const poly = silhouette(translateDrawingPanels([panel], { [panel.id]: start })[0]);
      const distance = initial + clearDistance(poly, projected, obstacles, 25);
      offsets[panel.id] = Object.fromEntries(axes.map(a => [a, direction[a] * distance])) as unknown as Vector3;
      obstacles.push(silhouette(translateDrawingPanels([panel], offsets)[0]));
    }
    const box = projectedBounds(translateDrawingPanels(ordered, offsets)), w = box.max.x - box.min.x, h = box.max.y - box.min.y;
    const score = w * h + 0.15 * Math.max(w, h) ** 2;
    if (!best || score < best.score) best = { offsets, score };
  }
  const offsets = best!.offsets;
  return { offsets, unresolvedPairs: projectedPanelOverlaps(translateDrawingPanels(ordered, offsets), 25 - 1e-5) };
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
