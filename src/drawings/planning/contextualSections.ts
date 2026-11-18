import type { FurnitureResult, PanelComponent, Vector3 } from "../../furniture";
import type { DrawingProfile } from "../types";
import type { FunctionalDimensionPlan, FunctionalRelationshipRequest, GeometricFaceReference } from "./functionalTypes";
import type { ContextualSectionPlan, SectionDimensionBinding } from "./sectionTypes";
import { canonicalDrawingSnapshot } from "./gaPlan";
import { panelFaceReference } from "./geometryReferences";
import { bounds3, panelReference, projectPoint } from "../projections";
import { cropSectionGeometry, generateSectionGeometry } from "../sectionGeometry";
import { VISIBILITY_EPSILON_MM as EPS } from "../edgeVisibility";

import { verifiedFunctionalGroups } from "./functionalGroups";

export const SECTION_VIEW_IDS = { parent: "context-section-parent", section: "context-section-A-A", detail: "context-detail-B" } as const;
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
/** Registered family selection only. Intersection, cropping and visibility remain
 * independent reusable rectangular-solid operations. No engineering size formula. */
export function createContextualSectionPlan(result: FurnitureResult, profile: DrawingProfile, functional: FunctionalDimensionPlan): ContextualSectionPlan {
  if (functional.binding.engineeringRevision !== result.specificationRevision) throw new Error("Stale functional source for section planning.");
  const plan: ContextualSectionPlan = { schemaVersion: 1, id: "contextual-section-plan",
    binding: { engineeringRevision: result.specificationRevision, sourceSnapshot: functional.binding.sourceSnapshot, profileSnapshot: canonicalDrawingSnapshot(profile), ruleVersion: "chest-contextual-sections-1" },
    section: null, geometry: null, detail: null, dimensionBindings: [], diagnostics: [] };
  try {
    const panels = result.components.filter((c): c is PanelComponent => c.kind === "panel").sort((a, b) => a.id.localeCompare(b.id));
    const backRequests = functional.requests.filter(r => r.kind === "drawer-back-clearance" && r.state === "resolved").sort((a, b) => {
      const y = (r: FunctionalRelationshipRequest) => Math.min(...r.componentIds.filter(id => id.endsWith("/rear")).map(id => panels.find(p => p.id === id)!.position.y));
      return y(a) - y(b) || a.id.localeCompare(b.id);
    });
    const rearRequest = backRequests[0], insetRequest = functional.requests.find(r => r.kind === "back-rear-inset" && r.state === "resolved");
    if (!rearRequest || !insetRequest) throw new Error("No registered, resolved drawer/back assembly relationship for section selection.");
    const rear = panels.find(p => rearRequest.componentIds.includes(p.id) && p.id.endsWith("/rear"))!;
    const back = panels.find(p => rearRequest.componentIds.includes(p.id) && p.id.endsWith("/back"))!;
    const base = panels.find(p => p.assemblyId === back?.assemblyId && p.id.endsWith("/base"));
    if (!rear || !back || !base) throw new Error("Required rear, back or base solid is missing.");
    const intended = panels.filter(p => p.assemblyId === back.assemblyId ? ["base", "top", "back"].some(role => p.id.endsWith(`/${role}`)) : ["front", "box-front", "rear", "bottom"].some(role => p.id.endsWith(`/${role}`)));
    const lo = Math.max(...intended.map(p => p.position.x)), hi = Math.min(...intended.map(p => p.position.x + p.dimensions.x));
    if (hi - lo <= EPS) throw new Error("Assembly has no common interior X span through the required source panels.");
    plan.section = { id: "section:chest-centre-width", label: "A-A", parentViewId: SECTION_VIEW_IDS.parent, sourceRevision: result.specificationRevision,
      plane: { axis: "x", coordinateMm: (lo + hi) / 2 }, cuttingDirection: { x: -1, y: 0, z: 0 }, projection: "right",
      componentIds: panels.map(p => p.id).sort(), requiredIntersectionIds: intended.map(p => p.id).sort(),
      selection: { rule: "functional-common-span-midpoint-1", componentIds: intended.map(p => p.id).sort(), intervalMm: [lo, hi] } };
    plan.geometry = generateSectionGeometry(panels, plan.section, panels.map(p => panelReference(p, result.bom.find(b => b.kind === "panel" && b.componentIds.includes(p.id))!.id)));
    const carcassBounds = bounds3(panels.filter(p => p.assemblyId === back.assemblyId));
    // Context margins are presentation only, derived from adjacent panel extents.
    const margin = 2 * rear.thickness;
    const crop = { min: { x: rear.position.z - margin, y: base.position.y - base.thickness },
      max: { x: carcassBounds.max.z + margin, y: rear.position.y + Math.min(rear.dimensions.y, Math.max(4 * rear.thickness, rear.dimensions.y / 2)) + margin } };
    const clipped = cropSectionGeometry(plan.geometry, crop);
    plan.detail = { id: "detail:lowest-drawer-rear-back-base", label: "B", parentSectionId: plan.section.id, parentViewId: SECTION_VIEW_IDS.section,
      crop, relationshipRequestIds: [rearRequest.id, insetRequest.id], componentIds: [...new Set([...clipped.edges.flatMap(e => e.references.map(r => r.componentId)), ...clipped.cutFaces.map(f => f.reference.componentId)])].sort(), rule: "lowest-drawer-rear-back-base-context-1" };
    const gap = functional.requests.find(r => r.kind === "front-gap" && r.state === "resolved") ?? functional.requests.find(r => r.kind === "front-bottom-reveal" && r.state === "resolved");
    const requests = [...(gap ? [{ request: gap, view: "section" as const }] : []), { request: rearRequest, view: "detail" as const }, { request: insetRequest, view: "detail" as const }];
    for (const { request, view } of requests) {
      try {
        const d = functional.dimensions.find(d => d.id === request.dimensionId)!;
        if (!["y", "z"].includes(d.measurement.axis)) throw new Error("Relationship is normal to the selected section view.");
        const sources = [d.measurement.fromFaceId, d.measurement.toFaceId].map(id => functional.faces.find(f => f.id === id)!);
        const mappings: SectionDimensionBinding["anchors"][number]["mapping"][] = ["direct-intersection", "direct-intersection"];
        const faces: GeometricFaceReference[] = sources.map((face, i) => {
          if (face.bounds.min.x < plan.section!.plane.coordinateMm - EPS && face.bounds.max.x > plan.section!.plane.coordinateMm + EPS) return face;
          if (request.kind === "back-rear-inset" && face.axis === "z" && face.reference.assemblyId === back.assemblyId) {
            const replacement = panelFaceReference(result, base, "z", "max");
            if (Math.abs(replacement.coordinateMm - face.coordinateMm) <= EPS) { mappings[i] = "coplanar-carcass-rear-envelope"; return replacement; }
          }
          throw new Error(`Source face ${face.id} has no supported intersection/coplanar envelope in section A-A.`);
        });
        const across = d.measurement.axis === "z" ? "y" : "z";
        const low = Math.max(...faces.map(f => f.bounds.min[across])), high = Math.min(...faces.map(f => f.bounds.max[across]));
        if (high < low - EPS) throw new Error("Section references have no common real station.");
        const anchors = faces.map((face, i) => ({ sourceFaceId: sources[i].id, sectionFaceId: face.id, componentId: face.reference.componentId, mapping: mappings[i],
          point: { ...face.bounds.min, x: plan.section!.plane.coordinateMm, [across]: (low + high) / 2 } as Vector3 }));
        if (Math.abs(anchors[1].point[d.measurement.axis] - anchors[0].point[d.measurement.axis] - d.valueMm) > EPS) throw new Error("Section anchors contradict the source-bound functional value.");
        plan.dimensionBindings.push({ id: `context-repeat:${request.id}`, view, requestId: request.id, semanticDimensionId: d.id, label: request.label,
          valueMm: d.valueMm, axis: d.measurement.axis === "z" ? "horizontal" : "vertical", anchors,
          from: projectPoint(anchors[0].point, "right"), to: projectPoint(anchors[1].point, "right"),
          references: [...new Map([...d.references, ...faces.map(f => f.reference)].map(r => [r.componentId, r])).values()], role: "reference-repeat" });
      } catch (e) { plan.diagnostics.push({ code: "unsupported-context-anchor", requestId: request.id, message: e instanceof Error ? e.message : "Unsupported section reference." }); }
    }
    if (profile.contents.functionalPresentation === "contextual") {
      for (const binding of plan.dimensionBindings.filter(b => b.view === "detail")) {
        const group = verifiedFunctionalGroups(functional).find(g => g.requestIds.includes(binding.requestId));
        if (group) {
          binding.requestIds = [...group.requestIds]; binding.dimensionIds = [...group.dimensionIds];
          binding.references = [...new Map([...binding.references, ...group.dimensionIds.flatMap(id => functional.dimensions.find(d => d.id === id)!.references)].map(r => [r.componentId, r])).values()];
          const request = functional.requests.find(r => r.id === binding.requestId)!;
          if (request.kind === "drawer-back-clearance" && request.intent.status !== "not-directly-specified") binding.intentNote = `Actual rear space; source ${request.intent.comparison} ${request.intent.valueMm} mm (unverified).`;
        }
      }
    }
  } catch (e) {
    plan.section = null; plan.geometry = null; plan.detail = null; plan.dimensionBindings = [];
    plan.diagnostics.push({ code: "unsupported-section", message: e instanceof Error ? e.message : "Section unavailable." });
  }
  return freeze(plan);
}
