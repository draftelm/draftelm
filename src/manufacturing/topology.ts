import type { PanelComponent, Vector3 } from "../furniture";
import type { EdgeKey, FaceKey, LocalPoint, PanelEdgeId, PanelFaceId, PanelOrientation, PanelTopology, SignedAxis, GrainSpecification } from "./types";

export const FACE_KEYS: readonly FaceKey[] = ["a", "b"];
export const EDGE_KEYS: readonly EdgeKey[] = ["u-min", "u-max", "v-min", "v-max"];
const axes = ["x", "y", "z"] as const;
export const panelFaceId = (componentId: string, key: FaceKey): PanelFaceId => `panel-face:${encodeURIComponent(componentId)}:${key}`;
export const panelEdgeId = (componentId: string, key: EdgeKey): PanelEdgeId => `panel-edge:${encodeURIComponent(componentId)}:${key}`;
export function defaultPanelOrientation(panel: PanelComponent): PanelOrientation {
  const face = axes.filter(a => a !== panel.thicknessAxis);
  return { u: { axis: face[0], sign: 1 }, v: { axis: face[1], sign: 1 }, normal: { axis: panel.thicknessAxis, sign: 1 } };
}
export function validatePanelOrientation(orientation: PanelOrientation, panel: PanelComponent): void {
  const values = [orientation?.u, orientation?.v, orientation?.normal];
  if (values.some(a => !a || !axes.includes(a.axis) || ![1, -1].includes(a.sign)) || new Set(values.map(a => a.axis)).size !== 3 || orientation.normal.axis !== panel.thicknessAxis) throw new Error("Panel orientation must map distinct signed model axes, with the normal on the physical thickness axis.");
}
export function axisVector(a: SignedAxis, sign = 1): Vector3 { return { x: 0, y: 0, z: 0, [a.axis]: a.sign * sign }; }
export function panelLocalToWorld(frame: PanelTopology["frame"], p: LocalPoint): Vector3 {
  if (![p.u, p.v, p.t].every(Number.isFinite)) throw new Error("Panel coordinates must be finite millimetres.");
  const world = { ...frame.origin };
  for (const [key, axis] of [["u", frame.orientation.u], ["v", frame.orientation.v], ["t", frame.orientation.normal]] as const) world[axis.axis] += axis.sign * p[key];
  return world;
}
export function panelWorldToLocal(frame: PanelTopology["frame"], p: Vector3): LocalPoint {
  if (![p.x, p.y, p.z].every(Number.isFinite)) throw new Error("Panel coordinates must be finite millimetres.");
  const coordinate = (a: SignedAxis) => { const value = (p[a.axis] - frame.origin[a.axis]) * a.sign; return value === 0 ? 0 : value; };
  return { u: coordinate(frame.orientation.u), v: coordinate(frame.orientation.v), t: coordinate(frame.orientation.normal) };
}
export function createPanelTopology(panel: PanelComponent, orientation = defaultPanelOrientation(panel)): PanelTopology {
  validatePanelOrientation(orientation, panel);
  if (!axes.every(a => Number.isFinite(panel.position[a]) && Number.isFinite(panel.dimensions[a]) && panel.dimensions[a] > 0) || panel.dimensions[panel.thicknessAxis] !== panel.thickness) throw new Error("Panel topology requires finite rectangular panel geometry and its actual stock thickness.");
  const origin = { ...panel.position };
  for (const a of [orientation.u, orientation.v, orientation.normal]) if (a.sign < 0) origin[a.axis] += panel.dimensions[a.axis];
  const size = { u: panel.dimensions[orientation.u.axis], v: panel.dimensions[orientation.v.axis], t: panel.thickness };
  const frame = { orientation: structuredClone(orientation), origin, size };
  const corners = (t: number): LocalPoint[] => [{ u: 0, v: 0, t }, { u: size.u, v: 0, t }, { u: size.u, v: size.v, t }, { u: 0, v: size.v, t }];
  const faces = FACE_KEYS.map((key, i) => { const localCorners = corners(i * size.t); return { id: panelFaceId(panel.id, key), key, localCorners, worldCorners: localCorners.map(p => panelLocalToWorld(frame, p)), outwardNormal: axisVector(orientation.normal, i === 0 ? -1 : 1) }; });
  const edges = EDGE_KEYS.map(key => {
    const alongU = key.startsWith("v"), axis = alongU ? "v" : "u", end = key.endsWith("max") ? size[axis] : 0;
    const from: LocalPoint = { u: 0, v: 0, t: 0, [axis]: end }, to: LocalPoint = { ...from, [alongU ? "u" : "v"]: size[alongU ? "u" : "v"] };
    const localCorners = [from, to, { ...to, t: size.t }, { ...from, t: size.t }];
    return { id: panelEdgeId(panel.id, key), key, lengthMm: size[alongU ? "u" : "v"], localCorners, worldCorners: localCorners.map(p => panelLocalToWorld(frame, p)), outwardNormal: axisVector(orientation[axis], key.endsWith("max") ? 1 : -1), adjacentFaceIds: faces.map(f => f.id) };
  });
  return { version: "rectangular-panel-topology-1", componentId: panel.id, assemblyId: panel.assemblyId, frame, faces, edges };
}
/** An explicit grain requirement, not an assembly-visibility or matching claim. */
export function grainWorldDirection(topology: PanelTopology, grain: GrainSpecification): Vector3 | null {
  return grain.direction === "non-directional" ? null : axisVector(topology.frame.orientation[grain.direction === "longitudinal" ? "u" : "v"], grain.sense === "negative" ? -1 : 1);
}
