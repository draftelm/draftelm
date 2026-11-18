import type { FurnitureResult, PanelComponent, Vector3 } from "../../furniture";
import type { Bounds2, DrawingProfile } from "../types";
import type { ContextMeasurementDisplay, FunctionalContextPlan, FunctionalContextViewDefinition } from "./functionalContextTypes";
import type { FunctionalDimensionPlan, FunctionalDisplayGroup, GeometricFaceReference } from "./functionalTypes";
import type { ContextualSectionPlan, SectionDefinition } from "./sectionTypes";
import { SECTION_VIEW_IDS } from "./contextualSections";
import { verifiedFunctionalGroups } from "./functionalGroups";
import { canonicalDrawingSnapshot } from "./gaPlan";
import { bounds2, bounds3, orthographicLines, panelReference, projectPoint } from "../projections";
import { cropSectionGeometry } from "../sectionGeometry";
import { generateSectionGeometry } from "../sectionGeometry";
import { VISIBILITY_EPSILON_MM as EPS } from "../edgeVisibility";

export const FUNCTIONAL_FRONT_ID = "functional-context-front";
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
/** The family adapter chooses relationships/crops. It never supplies new physical
 * sizes. Each grouped dimension retains all true source witnesses and identities. */
export function createFunctionalContextPlan(result: FurnitureResult, profile: DrawingProfile, functional: FunctionalDimensionPlan, vertical: ContextualSectionPlan): FunctionalContextPlan | null {
  if (profile.contents.functionalPresentation !== "contextual") return null;
  if (functional.binding.engineeringRevision !== result.specificationRevision || vertical.binding.engineeringRevision !== result.specificationRevision) throw new Error("Stale source relationships for contextual drawings.");
  const plan: FunctionalContextPlan = { schemaVersion: 1, id: "functional-context-plan",
    binding: { engineeringRevision: result.specificationRevision, sourceSnapshot: functional.binding.sourceSnapshot, profileSnapshot: canonicalDrawingSnapshot(profile), ruleVersion: "chest-functional-context-1" }, sections: [], views: [], displays: [], diagnostics: [] };
  const panels = result.components.filter((c): c is PanelComponent => c.kind === "panel").sort((a, b) => a.id.localeCompare(b.id));
  const references = panels.map(p => panelReference(p, result.bom.find(b => b.kind === "panel" && b.componentIds.includes(p.id))!.id));
  const groups = verifiedFunctionalGroups(functional);
  if (!groups.length) { plan.diagnostics.push({ requestIds: [], message: "No registered resolved functional relationships; contextual views unsupported." }); return freeze(plan); }
  const box = bounds3(panels), frontEdges = orthographicLines(panels, "front").map(line => ({ ...line, references: line.references.map(ref => references.find(r => r.componentId === ref.componentId)!) })), frontBounds = bounds2(frontEdges.flatMap(e => [e.from, e.to]));
  plan.views.push({ id: FUNCTIONAL_FRONT_ID, kind: "parent", projection: "front", label: "CLOSED FRONT - CONTEXT REFERENCES", entities: frontEdges, bounds: frontBounds, cutFaces: [], references, displayIds: [] });
  const sourceFaces = (requestId: string): [GeometricFaceReference, GeometricFaceReference] => {
    const r = functional.requests.find(r => r.id === requestId)!, d = functional.dimensions.find(d => d.id === r.dimensionId)!;
    return [d.measurement.fromFaceId, d.measurement.toFaceId].map(id => functional.faces.find(f => f.id === id)!) as [GeometricFaceReference, GeometricFaceReference];
  };
  const frontPanel = (requestId: string) => {
    const faces = sourceFaces(requestId), panel = panels.find(p => faces.some(f => f.reference.componentId === p.id) && p.id.endsWith("/front"));
    if (!panel) throw new Error("Front relationship has no actual decorative front."); return panel;
  };
  const member = (requestId: string, station: number, projection: "front" | "top", section?: SectionDefinition): ContextMeasurementDisplay["members"][number] => {
    const [a, b] = sourceFaces(requestId), r = functional.requests.find(r => r.id === requestId)!, d = functional.dimensions.find(d => d.id === r.dimensionId)!;
    const across = projection === "top" ? "z" : a.axis === "x" ? "y" : "x";
    const low = Math.max(a.bounds.min[across], b.bounds.min[across]), high = Math.min(a.bounds.max[across], b.bounds.max[across]);
    if (station < low - EPS || station > high + EPS) throw new Error("Context witnesses leave the real common source-face interval.");
    const point = (f: GeometricFaceReference): Vector3 => ({ ...f.bounds.min, ...(section ? { y: section.plane.coordinateMm } : { z: f.bounds.min.z }), [across]: station });
    const from = point(a), to = point(b);
    for (const [face, p] of [[a, from], [b, to]] as const) for (const axis of ["x", "y", "z"] as const) if (p[axis] < face.bounds.min[axis] - EPS || p[axis] > face.bounds.max[axis] + EPS) throw new Error("Context anchor is outside its actual face.");
    if (Math.abs(to[a.axis] - from[a.axis] - d.valueMm) > EPS) throw new Error("Context anchors contradict source measurement.");
    return { requestId, dimensionId: d.id, faceIds: [a.id, b.id], from, to, ...(section ? { sourceSectionPlane: { ...section.plane }, ...(plan.sections.some(s => s.definition.id === section.id) ? { sectionId: section.id } : {}) } : {}) };
  };
  const addDisplay = (group: FunctionalDisplayGroup, view: FunctionalContextViewDefinition, representativeRequestId: string, members: ContextMeasurementDisplay["members"], source: ContextMeasurementDisplay["source"]) => {
    const rep = members.find(m => m.requestId === representativeRequestId)!, d = functional.dimensions.find(d => d.id === rep.dimensionId)!;
    const from = projectPoint(rep.from, view.projection), to = projectPoint(rep.to, view.projection);
    const display: ContextMeasurementDisplay = { id: `context-measure:${group.id}`, viewId: view.id, requestIds: members.map(m => m.requestId), dimensionIds: [...new Set(members.map(m => m.dimensionId))],
      representativeRequestId, representativeDimensionId: d.id, valueMm: d.valueMm, axis: d.measurement.axis === "y" ? "vertical" : "horizontal", from, to, members,
      references: [...new Map(members.flatMap(m => functional.dimensions.find(d => d.id === m.dimensionId)!.references).map(ref => [ref.componentId, ref])).values()], source };
    plan.displays.push(display); view.displayIds.push(display.id);
  };
  const frontGroups = groups.filter(g => g.kind.startsWith("front-") && ["front-gap", "front-left-reveal", "front-right-reveal", "front-bottom-reveal", "front-top-reveal"].includes(g.kind));
  const used = new Set<string>();
  for (const group of frontGroups) {
    if (used.has(group.id)) continue;
    try {
      let requestId = group.representativeRequestId;
      const right = group.kind === "front-right-reveal" || group.kind === "front-top-reveal";
      if (group.kind === "front-right-reveal") requestId = [...group.requestIds].sort((a, b) => frontPanel(b).position.y - frontPanel(a).position.y)[0];
      const p = frontPanel(requestId), t = p.thickness;
      const corner = ["front-left-reveal", "front-right-reveal"].includes(group.kind);
      const secondary = corner ? frontGroups.find(other => other.kind === (right ? "front-top-reveal" : "front-bottom-reveal") && other.requestIds.some(id => frontPanel(id).id === p.id)) : undefined;
      const tokenBase = group.kind === "front-gap" ? "D" : group.kind === "front-left-reveal" ? "E" : group.kind === "front-right-reveal" ? "F" : group.kind === "front-bottom-reveal" ? "G" : "H";
      const siblings = frontGroups.filter(g => g.kind === group.kind), token = siblings.length === 1 ? tokenBase : `${tokenBase}${siblings.indexOf(group) + 1}`;
      const faces = sourceFaces(requestId);
      const crop: Bounds2 = group.kind === "front-gap" ? { min: { x: box.min.x - t, y: faces[0].coordinateMm - 2 * t }, max: { x: p.position.x + 5 * t, y: faces[1].coordinateMm + 2 * t } } :
        { min: { x: right ? p.position.x + p.dimensions.x - 5 * t : box.min.x - t, y: right ? p.position.y + p.dimensions.y - 5 * t : p.position.y - t },
          max: { x: right ? box.max.x + t : p.position.x + 5 * t, y: right ? box.max.y + t : p.position.y + 5 * t } };
      const cropped = cropSectionGeometry({ edges: frontEdges, cutFaces: [] }, crop);
      const view: FunctionalContextViewDefinition = { id: `functional-context-detail:${group.id}`, kind: "detail", parentViewId: FUNCTIONAL_FRONT_ID, projection: "front", labelToken: token,
        label: `DETAIL ${token} - ${group.kind === "front-gap" ? "FRONT GAP" : right ? "UPPER RIGHT REVEALS" : "LOWER LEFT REVEALS"}`, entities: cropped.edges, bounds: crop, crop, cutFaces: [], references, displayIds: [] };
      for (const g of [group, ...(secondary ? [secondary] : [])]) {
        const rep = g === group ? requestId : g.representativeRequestId;
        const members = g.requestIds.map(id => {
          const [a, b] = sourceFaces(id), front = frontPanel(id), across = a.axis === "x" ? "y" : "x";
          const low = Math.max(a.bounds.min[across], b.bounds.min[across]), high = Math.min(a.bounds.max[across], b.bounds.max[across]);
          const step = Math.min(2 * front.thickness, (high - low) / 4), station = right ? high - step : low + step;
          return member(id, station, "front");
        });
        addDisplay(g, view, rep, members, "front-elevation"); used.add(g.id);
      }
      plan.views.push(view);
    } catch (e) { plan.diagnostics.push({ requestIds: group.requestIds, message: e instanceof Error ? e.message : "Unsupported front context." }); }
  }
  // A horizontal section is selected for each distinct representative slice, and
  // equal side spaces are shared only when their X/Z panel arrangement agrees.
  const sideGroups = groups.filter(g => ["drawer-left-clearance", "drawer-right-clearance"].includes(g.kind)).flatMap(group => {
    const split = new Map<string, FunctionalDisplayGroup>();
    for (const id of group.requestIds) {
      const drawerSide = panels.find(p => functional.requests.find(r => r.id === id)!.componentIds.includes(p.id) && !p.assemblyId.endsWith("/carcass"))!;
      const slice = panels.filter(p => p.assemblyId === drawerSide.assemblyId).map(p => ({ role: p.id.slice(p.assemblyId.length), x: p.position.x, z: p.position.z, width: p.dimensions.x, depth: p.dimensions.z }));
      const signature = canonicalDrawingSnapshot(slice);
      let part = split.get(signature); if (!part) { part = { ...group, id: `verified-group:${id}`, representativeRequestId: id, requestIds: [], dimensionIds: [] }; split.set(signature, part); }
      part.requestIds.push(id); part.dimensionIds.push(functional.requests.find(r => r.id === id)!.dimensionId!);
    }
    return [...split.values()];
  });
  const sectionsByDrawer = new Map<string, FunctionalContextViewDefinition>();
  for (const group of sideGroups) {
    try {
      const sourcePanel = panels.find(p => functional.requests.find(r => r.id === group.representativeRequestId)!.componentIds.includes(p.id) && !p.assemblyId.endsWith("/carcass"))!;
      const makeSection = (drawerId: string, label: string): SectionDefinition => {
        const side = panels.find(p => p.assemblyId === drawerId && p.id.endsWith("/left"))!;
        const carcassId = sourceFaces(group.representativeRequestId).find(f => f.reference.assemblyId.endsWith("/carcass"))!.reference.assemblyId;
        const intended = panels.filter(p => (p.assemblyId === drawerId || p.assemblyId === carcassId) && p.thicknessAxis !== "y");
        const lo = Math.max(...intended.map(p => p.position.y)), hi = Math.min(...intended.map(p => p.position.y + p.dimensions.y));
        if (hi - lo <= EPS || !side) throw new Error("No common material interval for the horizontal drawer/carcass section.");
        return { id: `section:drawer-horizontal:${drawerId}`, label, parentViewId: FUNCTIONAL_FRONT_ID, sourceRevision: result.specificationRevision,
          plane: { axis: "y", coordinateMm: (lo + hi) / 2 }, cuttingDirection: { x: 0, y: -1, z: 0 }, projection: "top",
          componentIds: panels.map(p => p.id).sort(), requiredIntersectionIds: intended.map(p => p.id).sort(), selection: { rule: "functional-common-span-midpoint-1", componentIds: intended.map(p => p.id).sort(), intervalMm: [lo, hi] } };
      };
      let sectionView = sectionsByDrawer.get(sourcePanel.assemblyId);
      if (!sectionView) {
        const label = sectionsByDrawer.size === 0 ? "C-C" : `C${sectionsByDrawer.size + 1}-C${sectionsByDrawer.size + 1}`;
        const definition = makeSection(sourcePanel.assemblyId, label), geometry = generateSectionGeometry(panels, definition, references);
        plan.sections.push({ definition, geometry });
        sectionView = { id: `functional-context-section:${sourcePanel.assemblyId}`, kind: "section", projection: "top", parentViewId: FUNCTIONAL_FRONT_ID, labelToken: label,
          sectionId: definition.id, label: `SECTION ${label} - LOOKING DOWN (-Y)`, entities: geometry.edges, bounds: geometry.bounds, cutFaces: geometry.cutFaces, references, displayIds: [] };
        sectionsByDrawer.set(sourcePanel.assemblyId, sectionView); plan.views.push(sectionView);
      }
      const left = group.kind === "drawer-left-clearance", side = sourcePanel, front = panels.find(p => p.assemblyId === side.assemblyId && p.id.endsWith("/front"))!;
      const definition = plan.sections.find(s => s.definition.id === sectionView!.sectionId)!.definition;
      const carcassSide = panels.find(p => sourceFaces(group.representativeRequestId).some(f => f.reference.componentId === p.id) && p.id !== side.id)!;
      const crop: Bounds2 = { min: { x: left ? carcassSide.position.x - carcassSide.thickness : side.position.x - 2 * side.thickness, y: front.position.z },
        max: { x: left ? side.position.x + side.dimensions.x + 2 * side.thickness : carcassSide.position.x + carcassSide.dimensions.x + carcassSide.thickness, y: side.position.z + 5 * side.thickness } };
      const geometry = plan.sections.find(s => s.definition.id === definition.id)!.geometry, cropped = cropSectionGeometry(geometry, crop);
      const token = `${left ? "I" : "J"}${sideGroups.filter(g => g.kind === group.kind).length > 1 ? sideGroups.filter(g => g.kind === group.kind).indexOf(group) + 1 : ""}`;
      const detail: FunctionalContextViewDefinition = { id: `functional-context-detail:${group.id}`, kind: "detail", projection: "top", parentViewId: sectionView.id, labelToken: token, sectionId: definition.id,
        label: `DETAIL ${token} - ${left ? "LEFT" : "RIGHT"} BOX / CARCASS SPACE`, entities: cropped.edges, bounds: crop, crop, cutFaces: cropped.cutFaces, references, displayIds: [] };
      const members = group.requestIds.map(id => {
        const [a, b] = sourceFaces(id), drawer = panels.find(p => [a.reference.componentId, b.reference.componentId].includes(p.id) && !p.assemblyId.endsWith("/carcass"))!;
        const stationDefinition = makeSection(drawer.assemblyId, definition.label);
        const low = Math.max(a.bounds.min.z, b.bounds.min.z), high = Math.min(a.bounds.max.z, b.bounds.max.z);
        return member(id, low + Math.min(2 * drawer.thickness, (high - low) / 4), "top", stationDefinition);
      });
      addDisplay(group, detail, group.representativeRequestId, members, "horizontal-section"); plan.views.push(detail);
    } catch (e) { plan.diagnostics.push({ requestIds: group.requestIds, message: e instanceof Error ? e.message : "Unsupported horizontal section context." }); }
  }
  // Reuse existing section B bindings; do not create another rear measurement.
  for (const binding of vertical.dimensionBindings.filter(b => b.view === "detail")) {
    const requestIds = binding.requestIds ?? [binding.requestId];
    const members = requestIds.map(requestId => {
      const r = functional.requests.find(r => r.id === requestId)!, d = functional.dimensions.find(d => d.id === r.dimensionId)!;
      const faces = sourceFaces(requestId), plane = vertical.section!.plane.coordinateMm;
      if (r.kind === "drawer-back-clearance") {
        if (faces.some(f => plane <= f.bounds.min.x + EPS || plane >= f.bounds.max.x - EPS)) throw new Error("Grouped rear-space faces do not intersect A-A.");
        const y = (Math.max(...faces.map(f => f.bounds.min.y)) + Math.min(...faces.map(f => f.bounds.max.y))) / 2;
        return { requestId, dimensionId: d.id, faceIds: faces.map(f => f.id), from: { x: plane, y, z: faces[0].coordinateMm }, to: { x: plane, y, z: faces[1].coordinateMm }, sectionId: vertical.section!.id };
      }
      return { requestId, dimensionId: d.id, faceIds: binding.anchors.map(a => a.sourceFaceId), mappedFaceIds: binding.anchors.map(a => a.sectionFaceId), from: binding.anchors[0].point, to: binding.anchors[1].point, sectionId: vertical.section!.id };
    });
    plan.displays.push({ id: binding.id, existingBindingId: binding.id, viewId: SECTION_VIEW_IDS.detail, requestIds, dimensionIds: members.map(m => m.dimensionId),
      representativeRequestId: binding.requestId, representativeDimensionId: binding.semanticDimensionId, members, references: binding.references,
      valueMm: binding.valueMm, axis: binding.axis, from: binding.from, to: binding.to, source: "existing-detail-B" });
  }
  for (const request of functional.requests.filter(r => r.required)) if (!plan.displays.some(d => d.requestIds.includes(request.id))) plan.diagnostics.push({ requestIds: [request.id], message: request.reason ?? "No supported contextual view for this source relationship." });
  return freeze(plan);
}
