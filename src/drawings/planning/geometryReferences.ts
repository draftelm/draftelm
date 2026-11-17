import type { FurnitureResult, PanelComponent, Vector3 } from "../../furniture";
import type { Projection } from "../types";
import type { FaceSide, FunctionalDimension, FunctionalReferencePolicy, GeometricEdgeReference, GeometricFaceReference, ModelAxis } from "./functionalTypes";
import { cameraDirection, VISIBILITY_EPSILON_MM as EPS } from "../edgeVisibility";
import { panelReference } from "../projections";

const axes: ModelAxis[] = ["x", "y", "z"];
export const DEFAULT_FUNCTIONAL_REFERENCE_POLICY: Readonly<FunctionalReferencePolicy> = Object.freeze({
  id: "parallel-panel-faces-1", station: "overlap-midpoint", projections: Object.freeze({ x: "front", y: "front", z: "right" }),
});
export function panelFaceReference(result: FurnitureResult, panel: PanelComponent, axis: ModelAxis, side: FaceSide): GeometricFaceReference {
  const coordinateMm = panel.position[axis] + (side === "max" ? panel.dimensions[axis] : 0);
  return { kind: "panel-face", id: `face:${encodeURIComponent(panel.id)}:${axis}:${side}`,
    reference: panelReference(panel, result.bom.find(b => b.kind === "panel" && b.componentIds.includes(panel.id))?.id), axis, side, coordinateMm,
    normal: { x: 0, y: 0, z: 0, [axis]: side === "min" ? -1 : 1 },
    bounds: { min: { ...panel.position, [axis]: coordinateMm }, max: { x: panel.position.x + panel.dimensions.x, y: panel.position.y + panel.dimensions.y, z: panel.position.z + panel.dimensions.z, [axis]: coordinateMm } }, formalDatum: "not-assessed" };
}
function witnessEdge(face: GeometricFaceReference, projection: Exclude<Projection, "isometric">): GeometricEdgeReference {
  const camera = cameraDirection(projection), depth = axes.find(axis => camera[axis] !== 0)!;
  if (depth === face.axis) throw new Error("Reference face separation is normal to this view; a different projection is required.");
  const axis = axes.find(a => a !== depth && a !== face.axis)!;
  const depthSide = camera[depth] > 0 ? "max" : "min";
  const fixedSides = { [face.axis]: face.side, [depth]: depthSide };
  const from = { ...face.bounds.min, [depth]: face.bounds[depthSide][depth] };
  const to = { ...from, [axis]: face.bounds.max[axis] };
  const fixed = axes.filter(a => a !== axis).map(a => `${a}-${fixedSides[a]}`).join(":");
  return { kind: "panel-edge", id: `edge:${encodeURIComponent(face.reference.componentId)}:${axis}:${fixed}`, faceIds: [face.id],
    reference: face.reference, axis, fixedSides, from, to };
}

/** True distance along the shared normal, at a real overlapping edge station.
 * Different view-depth coordinates are retained, never projected into fake 3D contacts. */
export function measureParallelFaces(from: GeometricFaceReference, to: GeometricFaceReference, projection: Exclude<Projection, "isometric">,
  station: FunctionalReferencePolicy["station"] = "overlap-midpoint"): { dimension: FunctionalDimension; edges: GeometricEdgeReference[] } {
  if (from.axis !== to.axis) throw new Error("Functional distance requires parallel source faces.");
  const a = witnessEdge(from, projection), b = witnessEdge(to, projection);
  const low = Math.max(a.from[a.axis], b.from[b.axis]), high = Math.min(a.to[a.axis], b.to[b.axis]);
  if (high - low <= EPS) throw new Error("Reference faces have no continuous common projected edge station; relationship unsupported.");
  const value = to.coordinateMm - from.coordinateMm;
  if (!Number.isFinite(value) || value < -EPS) throw new Error("Negative separation/interference is not a supported clearance or reveal.");
  const coordinate = station === "overlap-min" ? low : (low + high) / 2;
  const point = (edge: GeometricEdgeReference): Vector3 => ({ ...edge.from, [edge.axis]: coordinate });
  return { dimension: { id: `functional-dimension:${from.id}:${to.id}`, unit: "mm", valueMm: Math.abs(value) <= EPS ? 0 : value,
    basis: "measured-geometry", projection, references: [...new Map([from.reference, to.reference].map(ref => [ref.componentId, ref])).values()],
    measurement: { kind: "parallel-face-distance", axis: from.axis, fromFaceId: from.id, toFaceId: to.id, fromEdgeId: a.id, toEdgeId: b.id, from: point(a), to: point(b) },
    tolerance: "unspecified", manufacturingDatum: "not-assessed" }, edges: [a, b] };
}
