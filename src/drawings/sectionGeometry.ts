import type { PanelComponent, Vector3 } from "../furniture";
import type { Bounds2, ComponentReference, DrawingLine } from "./types";
import type { SectionCutFace, SectionDefinition, SectionGeometry } from "./planning/sectionTypes";
import { bounds2, bounds3, orthographicLines, panelReference, projectPoint } from "./projections";
import { cameraDirection, VISIBILITY_EPSILON_MM as EPS } from "./edgeVisibility";

const axes = ["x", "y", "z"] as const;
/** Split collinear projected spans at all endpoints, retaining source and cut /
 * projected ownership at seams. No crop boundary is turned into physical geometry. */
function mergeEdges(lines: DrawingLine[], cutIds: Set<string>, sectionId: string): DrawingLine[] {
  const groups = new Map<string, { axis: "x" | "y"; cross: "x" | "y"; coordinate: number; lines: DrawingLine[] }>();
  for (const line of lines) {
    const axis = Math.abs(line.to.x - line.from.x) > EPS ? "x" : "y", cross = axis === "x" ? "y" : "x";
    const key = `${axis}:${line.from[cross].toFixed(6)}`;
    let group = groups.get(key); if (!group) { group = { axis, cross, coordinate: line.from[cross], lines: [] }; groups.set(key, group); }
    group.lines.push(line);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, group]) => {
    const { axis, cross, coordinate } = group;
    const cuts = [...new Set(group.lines.flatMap(l => [l.from[axis], l.to[axis]]))].sort((a, b) => a - b);
    return cuts.slice(0, -1).flatMap((lo, i) => {
      const hi = cuts[i + 1], mid = (lo + hi) / 2;
      if (hi - lo <= EPS) return [];
      const members = group.lines.filter(l => mid >= Math.min(l.from[axis], l.to[axis]) && mid <= Math.max(l.from[axis], l.to[axis]));
      const refs = [...new Map(members.flatMap(l => l.references).map(r => [r.componentId, r])).values()].sort((a, b) => a.componentId.localeCompare(b.componentId));
      return refs.length ? [{ kind: "line" as const, id: `${sectionId}:edge:${key}:${i}`, from: { x: 0, y: 0, [axis]: lo, [cross]: coordinate }, to: { x: 0, y: 0, [axis]: hi, [cross]: coordinate },
        references: refs, sectionRole: refs.some(r => cutIds.has(r.componentId)) ? "cut" as const : "projected" as const }] : [];
    });
  });
}

export function generateSectionGeometry(panels: PanelComponent[], definition: SectionDefinition, references: ComponentReference[] = []): SectionGeometry {
  bounds3(panels);
  const { axis, coordinateMm: plane } = definition.plane, camera = cameraDirection(definition.projection);
  if (!Number.isFinite(plane) || Math.abs(camera[axis]) !== 1 || axes.some(a => definition.cuttingDirection[a] !== -camera[a])) throw new Error("Section plane and cutting/view direction do not define a supported orthographic half-space.");
  if (new Set(definition.componentIds).size !== definition.componentIds.length || definition.componentIds.some(id => !panels.some(p => p.id === id))) throw new Error("Section references missing or duplicated source panels.");
  const selected = panels.filter(p => definition.componentIds.includes(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  const cutFaces: SectionCutFace[] = [], states: SectionGeometry["states"] = [], retained: PanelComponent[] = [];
  const lower = camera[axis] > 0;
  for (const p of selected) {
    const min = p.position[axis], max = min + p.dimensions[axis], ref = references.find(r => r.componentId === p.id) ?? panelReference(p);
    const strictCut = plane > min + EPS && plane < max - EPS;
    const removed = lower ? min >= plane - EPS : max <= plane + EPS;
    const tangent = Math.abs(plane - min) <= EPS || Math.abs(plane - max) <= EPS;
    if (removed) { states.push({ reference: ref, status: tangent ? "tangent-removed" : "removed" }); continue; }
    const clone = { ...p, position: { ...p.position }, dimensions: { ...p.dimensions } };
    if (strictCut) {
      if (lower) clone.dimensions[axis] = plane - min;
      else { clone.position[axis] = plane; clone.dimensions[axis] = max - plane; }
      const others = axes.filter(a => a !== axis);
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(bits => ({ ...p.position, [axis]: plane,
        [others[0]]: p.position[others[0]] + bits[0] * p.dimensions[others[0]], [others[1]]: p.position[others[1]] + bits[1] * p.dimensions[others[1]] } as Vector3));
      cutFaces.push({ id: `cut:${definition.id}:${p.id}`, sectionId: definition.id, reference: ref, corners,
        bounds: bounds2(corners.map(c => projectPoint(c, definition.projection))) });
    }
    retained.push(clone);
    states.push({ reference: ref, status: strictCut ? "cut" : tangent ? "tangent-retained" : "retained", retainedBounds: bounds3([clone]) });
  }
  if (definition.requiredIntersectionIds.some(id => !cutFaces.some(f => f.reference.componentId === id))) throw new Error("Section plane does not strictly intersect all intended source solids.");
  if (!retained.length) throw new Error("Section retains no physical source panels.");
  for (let i = 0; i < cutFaces.length; i++) for (let j = i + 1; j < cutFaces.length; j++) {
    const a = cutFaces[i].bounds, b = cutFaces[j].bounds;
    if (Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > EPS && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > EPS) throw new Error("Overlapping cut material is ambiguous; section withheld for engineering review.");
  }
  const raw = orthographicLines(retained, definition.projection).map(line => ({ ...line, references: line.references.map(r => references.find(ref => ref.componentId === r.componentId) ?? r) }));
  const edges = mergeEdges(raw, new Set(cutFaces.map(f => f.reference.componentId)), definition.id);
  return { algorithm: "axis-aligned-half-space-section-1", sectionId: definition.id, cutFaces, edges, states,
    bounds: bounds2(edges.flatMap(e => [e.from, e.to])) };
}

export function clipSectionLine(line: DrawingLine, crop: Bounds2): DrawingLine | null {
  const axis = Math.abs(line.to.x - line.from.x) > EPS ? "x" : "y", cross = axis === "x" ? "y" : "x";
  if (line.from[cross] < crop.min[cross] - EPS || line.from[cross] > crop.max[cross] + EPS) return null;
  const lo = Math.max(Math.min(line.from[axis], line.to[axis]), crop.min[axis]), hi = Math.min(Math.max(line.from[axis], line.to[axis]), crop.max[axis]);
  return hi - lo > EPS ? { ...line, from: { ...line.from, [axis]: lo }, to: { ...line.to, [axis]: hi } } : null;
}
export function cropSectionGeometry(geometry: Pick<SectionGeometry, "edges" | "cutFaces">, crop: Bounds2): Pick<SectionGeometry, "edges" | "cutFaces" | "bounds"> {
  if (!(crop.max.x > crop.min.x && crop.max.y > crop.min.y)) throw new Error("Invalid section detail crop.");
  return { bounds: crop, edges: geometry.edges.flatMap(line => { const clipped = clipSectionLine(line, crop); return clipped ? [clipped] : []; }),
    cutFaces: geometry.cutFaces.flatMap(face => {
      const bounds = { min: { x: Math.max(face.bounds.min.x, crop.min.x), y: Math.max(face.bounds.min.y, crop.min.y) }, max: { x: Math.min(face.bounds.max.x, crop.max.x), y: Math.min(face.bounds.max.y, crop.max.y) } };
      return bounds.max.x - bounds.min.x > EPS && bounds.max.y - bounds.min.y > EPS ? [{ ...face, bounds }] : [];
    }) };
}
