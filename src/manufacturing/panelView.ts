import type { Vector3 } from "../furniture";
import type { EdgeKey, FaceKey, PanelTopology, SignedAxis } from "./types";

export const PANEL_SIDES = ["top", "bottom", "left", "right"] as const;
export type PanelSide = typeof PANEL_SIDES[number];
export type PanelViewRotation = 0 | 90 | 180 | 270;
const vector = (a: SignedAxis): Vector3 => ({ x: 0, y: 0, z: 0, [a.axis]: a.sign });
const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector3, b: Vector3): Vector3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const negative = (v: Vector3): Vector3 => ({ x: -v.x, y: -v.y, z: -v.z });

/** Orthographic face diagram in the established X-right/Y-up/Z-rear convention.
 * Prefer model +Y up, or +Z for horizontal panels. Opposite faces mirror left/right.
 * Rotation changes only this presentation basis, never topology or saved properties. */
export function panelFaceView(topology: PanelTopology, face: FaceKey, rotation: PanelViewRotation = 0) {
  if (!["a", "b"].includes(face) || ![0, 90, 180, 270].includes(rotation)) throw new Error("Unsupported panel face/view rotation.");
  const physicalFace = topology.faces.find(f => f.key === face)!;
  let up: Vector3 = topology.frame.orientation.normal.axis === "y" ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  let right = cross(physicalFace.outwardNormal, up);
  for (let turn = 0; turn < rotation / 90; turn++) [right, up] = [up, negative(right)];
  const sides = Object.fromEntries(topology.edges.map(edge => {
    const x = dot(edge.outwardNormal, right), y = dot(edge.outwardNormal, up);
    const side: PanelSide = x ? x > 0 ? "right" : "left" : y > 0 ? "top" : "bottom";
    return [side, { key: edge.key, id: edge.id, lengthMm: edge.lengthMm, outwardNormal: edge.outwardNormal }];
  })) as Record<PanelSide, { key: EdgeKey; id: string; lengthMm: number; outwardNormal: Vector3 }>;
  const { orientation: o, size } = topology.frame;
  const span = (axis: Vector3) => Math.abs(dot(vector(o.u), axis)) * size.u + Math.abs(dot(vector(o.v), axis)) * size.v;
  return { face, faceId: physicalFace.id, rotation, right, up, widthMm: span(right), heightMm: span(up), sides,
    localU: { x: dot(vector(o.u), right), y: dot(vector(o.u), up) }, localV: { x: dot(vector(o.v), right), y: dot(vector(o.v), up) } };
}
