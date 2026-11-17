import type { FurnitureResult, PanelComponent } from "../../furniture";
import type { DrawingProfile } from "../types";
import type { FaceSide, FunctionalDesignIntent, FunctionalDimensionPlan, FunctionalKind, FunctionalReferencePolicy, FunctionalRelationshipRequest, GeometricFaceReference, ModelAxis } from "./functionalTypes";
import { canonicalDrawingSnapshot } from "./gaPlan";
import { reconcileDrawingParts } from "../reconcile";
import { DEFAULT_FUNCTIONAL_REFERENCE_POLICY, measureParallelFaces, panelFaceReference } from "./geometryReferences";
import { VISIBILITY_EPSILON_MM as EPS } from "../edgeVisibility";
import { bounds3 } from "../projections";

export const FUNCTIONAL_LABELS: Record<FunctionalKind, string> = {
  "front-gap": "Adjacent front gap", "front-left-reveal": "Front left outer reveal", "front-right-reveal": "Front right outer reveal",
  "front-bottom-reveal": "Bottom outer reveal", "front-top-reveal": "Top outer reveal", "drawer-left-clearance": "Box left side space",
  "drawer-right-clearance": "Box right side space", "drawer-cell-bottom-clearance": "Box / usable cell below", "drawer-cell-top-clearance": "Box / usable cell above",
  "drawer-back-clearance": "Box / back actual space", "front-box-bottom-offset": "Box bottom above front", "front-rear-setback": "Front rear face setback",
  "back-rear-inset": "Back rear inset", "back-left-clearance": "Back left edge space", "back-right-clearance": "Back right edge space",
  "back-bottom-clearance": "Back bottom edge space", "back-top-clearance": "Back top edge space",
};
const REQUIRED: FunctionalKind[] = ["front-gap", "front-left-reveal", "front-right-reveal", "front-bottom-reveal", "front-top-reveal", "drawer-left-clearance", "drawer-right-clearance", "drawer-back-clearance", "back-rear-inset"];
type IntentInput = { path: string; comparison: "exact" | "minimum"; area: string };
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function readNumber(source: unknown, path: string): number | undefined {
  let current = source;
  for (const key of path.split(".")) current = current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
  return typeof current === "number" && Number.isFinite(current) ? current : undefined;
}

/** Registered geometry adapter reads source parameters only for intent checks;
 * no furniture sizing/layout formula is copied into the drawing engine. */
export function createFunctionalDimensionPlan(result: FurnitureResult, profile: DrawingProfile, preference: FunctionalReferencePolicy = DEFAULT_FUNCTIONAL_REFERENCE_POLICY): FunctionalDimensionPlan {
  if (!result.geometryValid || result.issues.some(i => i.severity === "error") || !reconcileDrawingParts(result).valid) throw new Error("Functional dimensions require validated geometry and reconciled source BOM.");
  bounds3(result.components.filter(c => c.kind === "panel"));
  if (!preference.id.trim() || !["overlap-midpoint", "overlap-min"].includes(preference.station) ||
    !["front", "top"].includes(preference.projections.x) || !["front", "right"].includes(preference.projections.y) || !["right", "top"].includes(preference.projections.z)) throw new Error("Unsupported functional reference preference.");
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const plan: FunctionalDimensionPlan = { schemaVersion: 1, id: "functional-dimension-plan",
    binding: { engineeringRevision: result.specificationRevision, sourceSnapshot: canonicalDrawingSnapshot({ ...result,
      components: byId(result.components), assemblies: byId(result.assemblies).map(a => ({ ...a, componentIds: [...a.componentIds].sort() })),
      bom: byId(result.bom).map(b => ({ ...b, componentIds: [...b.componentIds].sort() })) }), profileSnapshot: canonicalDrawingSnapshot(profile), ruleVersion: "drawer-chest-functional-1" },
    referencePolicy: structuredClone(preference), faces: [], edges: [], dimensions: [], requests: [], displayGroups: [], diagnostics: [], coverageScope: "registered-rectangular-assembly-relationships-only" };
  let parameters: unknown;
  try {
    const revision = JSON.parse(result.specificationRevision);
    if (revision.engineRevision !== "drawer-chest-contact-layout-3-zero-gap-back" || revision.parameters?.schemaVersion !== 2 || revision.parameters?.units !== "mm" || revision.parameters?.family !== "drawer-chest") throw new Error();
    const construction = revision.parameters.construction;
    if (construction?.carcass !== "full-width-top-base" || construction.back?.type !== "square-cut-inset" || construction.drawer?.joint !== "front-rear-between-sides" || construction.drawer?.bottom !== "under-box" || construction.fronts?.fixing !== "screws-from-box") throw new Error();
    parameters = revision.parameters;
  } catch {
    plan.diagnostics.push({ code: "unsupported", message: "No registered functional relationship adapter for this engineering revision/family; no values inferred." });
    return freeze(plan);
  }
  const root = result.assemblies.find(a => a.parentId === null), carcassId = root && `${root.id}/carcass`;
  const carcass = result.assemblies.find(a => a.id === carcassId && a.parentId === root?.id);
  if (!root || !carcass) { plan.diagnostics.push({ code: "unsupported", message: "The source carcass hierarchy is not defined for functional relationship resolution." }); return freeze(plan); }
  const panel = (assemblyId: string, role: string): PanelComponent => {
    const owner = result.assemblies.find(a => a.id === assemblyId), id = `${assemblyId}/${role}`;
    const p = result.components.find(c => c.id === id && c.kind === "panel");
    const expectedNormal = ["left", "right"].includes(role) ? "x" : ["base", "top", "bottom"].includes(role) ? "y" : "z";
    if (!p || p.kind !== "panel" || p.assemblyId !== assemblyId || !owner?.componentIds.includes(p.id) || p.thicknessAxis !== expectedNormal) throw new Error(`Unsupported/missing source panel role: ${id}.`);
    return p;
  };
  const face = (assemblyId: string, role: string, axis: ModelAxis, side: FaceSide) => panelFaceReference(result, panel(assemblyId, role), axis, side);
  const add = (scope: string, kind: FunctionalKind, componentIds: string[], resolve: () => [GeometricFaceReference, GeometricFaceReference], intentInput?: IntentInput) => {
    const request: FunctionalRelationshipRequest = { id: `functional-request:${encodeURIComponent(scope)}:${kind}`, kind, assemblyIds: [...new Set(componentIds.flatMap(id => result.components.find(c => c.id === id)?.assemblyId ?? []))].sort(), componentIds: [...componentIds].sort(),
      required: REQUIRED.includes(kind), classification: kind.includes("reveal") ? "reveal" : kind.includes("clearance") ? "clearance" : kind === "front-gap" ? "gap" : kind.includes("offset") || kind.includes("inset") ? "offset" : "relative-position",
      relationshipSpace: kind.includes("cell-") ? "usable-front-cell" : ["drawer-left-clearance", "drawer-right-clearance", "drawer-back-clearance", "front-gap"].includes(kind) ? "opposed-faces" : "projected-reference",
      label: FUNCTIONAL_LABELS[kind], state: "unsupported", intent: { status: "not-directly-specified" } };
    try {
      const [from, to] = resolve(), projection = preference.projections[from.axis];
      if (request.relationshipSpace === "opposed-faces" && (["x", "y", "z"] as const).filter(axis => axis !== from.axis).some(axis => Math.min(from.bounds.max[axis], to.bounds.max[axis]) - Math.max(from.bounds.min[axis], to.bounds.min[axis]) <= EPS)) throw new Error("Clearance/gap faces have no positive common physical face area; relationship unsupported.");
      const measured = measureParallelFaces(from, to, projection, preference.station), dimension = measured.dimension;
      for (const f of [from, to]) if (!plan.faces.some(existing => existing.id === f.id)) plan.faces.push(f);
      for (const edge of measured.edges) {
        const existing = plan.edges.find(existing => existing.id === edge.id);
        if (existing) existing.faceIds = [...new Set([...existing.faceIds, ...edge.faceIds])].sort(); else plan.edges.push(edge);
      }
      // Shared physical face pairs (e.g. a cell gap and a front offset) are one
      // measurement with separate relationship/intention records, never competing values.
      if (!plan.dimensions.some(d => d.id === dimension.id)) plan.dimensions.push(dimension);
      request.state = "resolved"; request.dimensionId = dimension.id;
      request.componentIds = dimension.references.map(r => r.componentId).sort();
      request.assemblyIds = [...new Set(dimension.references.map(r => r.assemblyId))].sort();
      if (intentInput) {
        const value = readNumber(parameters, intentInput.path);
        if (value !== undefined) {
          const matches = intentInput.comparison === "minimum" ? dimension.valueMm >= value - EPS : Math.abs(dimension.valueMm - value) <= EPS;
          const intent: FunctionalDesignIntent = { status: matches ? "geometry-consistent" : "violated", authority: "engineering-revision-parameter", parameterPath: intentInput.path,
            valueMm: value, comparison: intentInput.comparison, validation: "geometry-check-only", nominalStatus: result.issues.some(i => i.code === `unverified:${intentInput.area}`) ? "unverified-nominal-assumption" : "verification-not-assessed" };
          request.intent = intent;
          if (!matches) plan.diagnostics.push({ code: "intent-mismatch", requestId: request.id, message: `${request.label}: measured geometry contradicts the source ${intentInput.comparison} intent; engineering review required.` });
        }
      }
    } catch (error) {
      request.reason = error instanceof Error ? error.message : "Relationship geometry is unsupported.";
      plan.diagnostics.push({ code: "unsupported", requestId: request.id, message: `${request.label}: ${request.reason}` });
    }
    plan.requests.push(request);
  };
  const body = (role: string, axis: ModelAxis, side: FaceSide) => face(carcass.id, role, axis, side);
  const drawers = result.assemblies.filter(a => a.parentId === root.id && a.id !== carcass.id).sort((a, b) => {
    const pa = result.components.find(p => p.id === `${a.id}/front`), pb = result.components.find(p => p.id === `${b.id}/front`);
    return (pa?.position.y ?? 0) - (pb?.position.y ?? 0) || a.id.localeCompare(b.id);
  });
  const ids = (a: string, role: string, b: string, other: string) => [`${a}/${role}`, `${b}/${other}`];
  drawers.forEach((drawer, index) => {
    const id = drawer.id, own = (role: string, axis: ModelAxis, side: FaceSide) => face(id, role, axis, side);
    add(id, "front-left-reveal", ids(carcass.id, "left", id, "front"), () => [body("left", "x", "min"), own("front", "x", "min")]);
    add(id, "front-right-reveal", ids(id, "front", carcass.id, "right"), () => [own("front", "x", "max"), body("right", "x", "max")]);
    if (index === 0) add(id, "front-bottom-reveal", ids(carcass.id, "base", id, "front"), () => [body("base", "y", "min"), own("front", "y", "min")]);
    if (index === drawers.length - 1) add(id, "front-top-reveal", ids(id, "front", carcass.id, "top"), () => [own("front", "y", "max"), body("top", "y", "max")]);
    if (index > 0) {
      const lower = drawers[index - 1].id;
      add(`${lower}|${id}`, "front-gap", ids(lower, "front", id, "front"), () => [face(lower, "front", "y", "max"), own("front", "y", "min")], { path: "construction.fronts.verticalGap", comparison: "exact", area: "frontFixing" });
    }
    for (const side of ["left", "right"] as const) add(id, side === "left" ? "drawer-left-clearance" : "drawer-right-clearance", ids(carcass.id, side, id, side), () => side === "left" ? [body(side, "x", "max"), own(side, "x", "min")] : [own(side, "x", "max"), body(side, "x", "min")], { path: "hardware.runner.sideClearance", comparison: "exact", area: "runners" });
    add(id, "drawer-cell-bottom-clearance", ids(id, "bottom", carcass.id, "base"), () => {
      const base = body("base", "y", "max"), front = own("front", "y", "min");
      return [base.coordinateMm >= front.coordinateMm ? base : front, own("bottom", "y", "min")];
    }, { path: "construction.drawer.bottomClearance", comparison: "minimum", area: "drawerConstruction" });
    add(id, "drawer-cell-top-clearance", ids(id, "left", carcass.id, "top"), () => {
      const top = body("top", "y", "min"), front = own("front", "y", "max");
      const walls = ["left", "right", "box-front", "rear"].map(role => own(role, "y", "max")).sort((a, b) => b.coordinateMm - a.coordinateMm || a.id.localeCompare(b.id));
      return [walls[0], top.coordinateMm <= front.coordinateMm ? top : front];
    }, { path: "construction.drawer.topClearance", comparison: "minimum", area: "drawerConstruction" });
    add(id, "drawer-back-clearance", ids(id, "rear", carcass.id, "back"), () => [own("rear", "z", "max"), body("back", "z", "min")], { path: "construction.drawer.rearClearance", comparison: "minimum", area: "drawerConstruction" });
    add(id, "front-box-bottom-offset", ids(id, "front", id, "bottom"), () => [own("front", "y", "min"), own("bottom", "y", "min")], { path: "construction.drawer.frontBottomOffset", comparison: "exact", area: "frontFixing" });
    add(id, "front-rear-setback", ids(carcass.id, "left", id, "front"), () => [body("left", "z", "min"), own("front", "z", "max")], { path: "construction.fronts.rearFaceSetback", comparison: "exact", area: "frontFixing" });
  });
  add(carcass.id, "back-rear-inset", ids(carcass.id, "back", carcass.id, "right"), () => [body("back", "z", "max"), body("right", "z", "max")], { path: "construction.back.rearInset", comparison: "exact", area: "backFixing" });
  for (const [kind, role, axis, low] of [["back-left-clearance", "left", "x", true], ["back-right-clearance", "right", "x", false], ["back-bottom-clearance", "base", "y", true], ["back-top-clearance", "top", "y", false]] as const) {
    add(carcass.id, kind, ids(carcass.id, "back", carcass.id, role), () => low ? [body(role, axis, "max"), body("back", axis, "min")] : [body("back", axis, "max"), body(role, axis, "min")], { path: "construction.back.edgeClearance", comparison: "exact", area: "backFixing" });
  }
  plan.requests = byId(plan.requests); plan.dimensions = byId(plan.dimensions); plan.faces = byId(plan.faces); plan.edges = byId(plan.edges);
  const groups = new Map<string, FunctionalDimensionPlan["displayGroups"][number]>();
  for (const request of plan.requests.filter(r => r.required && r.state === "resolved")) {
    const d = plan.dimensions.find(d => d.id === request.dimensionId)!;
    const key = canonicalDrawingSnapshot({ kind: request.kind, axis: d.measurement.axis, projection: d.projection, value: Number(d.valueMm.toFixed(6)), intent: request.intent });
    let group = groups.get(key);
    if (!group) { group = { id: `functional-detail:${request.id}`, label: request.label, kind: request.kind, representativeRequestId: request.id, requestIds: [], dimensionIds: [] }; groups.set(key, group); }
    group.requestIds.push(request.id); if (!group.dimensionIds.includes(d.id)) group.dimensionIds.push(d.id);
  }
  plan.displayGroups = [...groups.values()].sort((a, b) => REQUIRED.indexOf(a.kind) - REQUIRED.indexOf(b.kind) || a.id.localeCompare(b.id));
  return freeze(plan);
}

export function validateFunctionalDimensionPlan(plan: FunctionalDimensionPlan, source: FurnitureResult, profile: DrawingProfile): string[] {
  try { return canonicalDrawingSnapshot(plan) === canonicalDrawingSnapshot(createFunctionalDimensionPlan(source, profile)) ? [] : ["Stale or inconsistent functional dimension/reference plan. Regenerate the drawing package."]; }
  catch (error) { return [error instanceof Error ? error.message : "Functional relationship validation failed."]; }
}
