import type { PanelComponent, Vector3 } from "../furniture";
import type { Projection } from "./types";

/** Model mm, computational only: never a manufacturing gap/tolerance. */
export const VISIBILITY_EPSILON_MM = 1e-6;
export const EDGE_VISIBILITY_VERSION = "solid-panel-edge-intervals-1";
export function cameraDirection(projection: Projection): Vector3 {
  return projection === "isometric" ? { x: 1, y: 1, z: -1 } : projection === "front" ? { x: 0, y: 0, z: -1 }
    : projection === "top" ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
}
const AXES = ["x", "y", "z"] as const;
type Interval = [number, number];
type Linear = { constant: number; slope: number };
export function panelEdges(panel: PanelComponent): { from: Vector3; to: Vector3; axis: typeof AXES[number] }[] {
  const corners = Array.from({ length: 8 }, (_, i) => ({ x: panel.position.x + (i & 1 ? panel.dimensions.x : 0), y: panel.position.y + (i & 2 ? panel.dimensions.y : 0), z: panel.position.z + (i & 4 ? panel.dimensions.z : 0) }));
  return corners.flatMap((from, i) => [1, 2, 4].flatMap((bit, axis) => i & bit ? [] : [{ from, to: corners[i | bit], axis: AXES[axis] }]));
}

/** Projection of the convex ray/box intersection region onto edge parameter t.
 * p(t) + s*camera lies in the open box for s > epsilon. All inequalities are
 * linear in (t,s); eliminate s by requiring every lower bound < every upper.
 * This clips entire intervals, rather than estimating visibility from samples. */
function occludedInterval(from: Vector3, to: Vector3, panel: PanelComponent, camera: Vector3): Interval | null {
  let lo = 0, hi = 1;
  const positive = (constant: number, slope: number) => {
    if (slope === 0) return constant > 0;
    const crossing = -constant / slope;
    if (slope > 0) lo = Math.max(lo, crossing); else hi = Math.min(hi, crossing);
    return hi > lo;
  };
  const lower: Linear[] = [{ constant: VISIBILITY_EPSILON_MM, slope: 0 }], upper: Linear[] = [];
  for (const axis of AXES) {
    const min = panel.position[axis] + VISIBILITY_EPSILON_MM, max = panel.position[axis] + panel.dimensions[axis] - VISIBILITY_EPSILON_MM;
    if (max <= min) return null;
    const delta = to[axis] - from[axis], d = camera[axis];
    if (d === 0) {
      if (!positive(from[axis] - min, delta) || !positive(max - from[axis], -delta)) return null;
    } else {
      lower.push({ constant: ((d > 0 ? min : max) - from[axis]) / d, slope: -delta / d });
      upper.push({ constant: ((d > 0 ? max : min) - from[axis]) / d, slope: -delta / d });
    }
  }
  for (const l of lower) for (const u of upper) if (!positive(u.constant - l.constant, u.slope - l.slope)) return null;
  return hi > lo ? [lo, hi] : null;
}

export function pointIsVisible(point: Vector3, projection: Projection, panels: PanelComponent[]): boolean {
  const camera = cameraDirection(projection);
  return !panels.some(panel => occludedInterval(point, point, panel, camera));
}

export interface VisiblePanelEdge { from: Vector3; to: Vector3; panel: PanelComponent; axis: typeof AXES[number] }
export function visibleIsometricEdges(panels: PanelComponent[]): VisiblePanelEdge[] {
  const ordered = [...panels].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // x+z and y+z are invariant along the isometric camera ray. Their box bounds
  // provide a conservative broad phase; the analytic test makes the decision.
  const boxes = ordered.map(panel => ({ panel, minU: panel.position.x + panel.position.z, minV: panel.position.y + panel.position.z,
    maxU: panel.position.x + panel.position.z + panel.dimensions.x + panel.dimensions.z,
    maxV: panel.position.y + panel.position.z + panel.dimensions.y + panel.dimensions.z }));
  const camera = cameraDirection("isometric"), result: VisiblePanelEdge[] = [];
  for (const panel of ordered) for (const edge of panelEdges(panel)) {
    const u = [edge.from.x + edge.from.z, edge.to.x + edge.to.z], v = [edge.from.y + edge.from.z, edge.to.y + edge.to.z];
    let visible: Interval[] = [[0, 1]];
    for (const box of boxes) {
      if (Math.max(...u) < box.minU || Math.min(...u) > box.maxU || Math.max(...v) < box.minV || Math.min(...v) > box.maxV) continue;
      const hidden = occludedInterval(edge.from, edge.to, box.panel, camera);
      if (!hidden) continue;
      visible = visible.flatMap(([a, b]): Interval[] => hidden[1] <= a || hidden[0] >= b ? [[a, b]] : [
        ...(hidden[0] > a ? [[a, hidden[0]] as Interval] : []), ...(hidden[1] < b ? [[hidden[1], b] as Interval] : []),
      ]);
      if (!visible.length) break;
    }
    const length = edge.to[edge.axis] - edge.from[edge.axis];
    const at = (t: number): Vector3 => ({ x: edge.from.x + (edge.to.x - edge.from.x) * t, y: edge.from.y + (edge.to.y - edge.from.y) * t, z: edge.from.z + (edge.to.z - edge.from.z) * t });
    for (const [a, b] of visible) if ((b - a) * length > 4 * VISIBILITY_EPSILON_MM) result.push({ from: at(a), to: at(b), panel, axis: edge.axis });
  }
  return result;
}
