import type { FurnitureResult, PanelComponent } from "../../furniture";
import type { DrawingAnnotationModel, DrawingDimension, DrawingProfile, Projection } from "../types";
import type { GACornerAnchor, GADimensionId, GAExtentReference, GAPlanResult, GeneralAssemblyPlan, SemanticGADimension } from "./types";
import { createDrawingAnnotations, validateDrawingAnnotations } from "../annotations";
import { getDrawingProfile, parseDrawingProfile } from "../profiles";
import { bounds3, panelReference, projectPoint } from "../projections";
import { reconcileDrawingParts } from "../reconcile";
import { cameraDirection, EDGE_VISIBILITY_VERSION, VISIBILITY_EPSILON_MM } from "../edgeVisibility";

const PLANNER_VERSION = "ga-plan-2-visible-edges";
const RESOLVER_VERSION = "panel-envelope-dimensions-1";
const PROJECTIONS: Projection[] = ["front", "top", "right", "isometric"];
/** Explicit family registry: no chest inference for unknown furniture categories. */
const FAMILY_POLICIES: Readonly<Record<string, { id: string; version: string; primary: Projection; layoutStrategy: GeneralAssemblyPlan["policy"]["layoutStrategy"] }>> = {
  "drawer-chest": { id: "drawer-chest-dominant-isometric", version: "1", primary: "isometric", layoutStrategy: "drawer-chest-primary-and-supports-v1" },
};

export function canonicalDrawingSnapshot(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error("Drawing source contains non-finite data.");
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
    return v;
  }
  return JSON.stringify(canonical(value));
}
function sourceSnapshot(result: FurnitureResult): string {
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return canonicalDrawingSnapshot({ ...result,
    components: byId(result.components),
    assemblies: byId(result.assemblies).map(a => ({ ...a, componentIds: [...a.componentIds].sort() })),
    bom: byId(result.bom).map(line => ({ ...line, componentIds: [...line.componentIds].sort() })),
  });
}
function freezePlan<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freezePlan); Object.freeze(value); }
  return value;
}
function extent(panels: PanelComponent[], assemblyId: string, scope: GAExtentReference["scope"], axis: GAExtentReference["axis"], side: GAExtentReference["side"]) {
  const value = side === "min" ? Math.min(...panels.map(p => p.position[axis])) : Math.max(...panels.map(p => p.position[axis] + p.dimensions[axis]));
  const members = panels.filter(p => (side === "min" ? p.position[axis] : p.position[axis] + p.dimensions[axis]) === value).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { value, reference: { kind: "panel-envelope" as const, assemblyId, scope, axis, side, componentIds: members.map(p => p.id) }, panel: members[0] };
}
function anchor(panel: PanelComponent, axis: GAExtentReference["axis"], side: GAExtentReference["side"], result: FurnitureResult): GACornerAnchor {
  const corner: GACornerAnchor["corner"] = { x: "min", y: "min", z: "min", [axis]: side };
  const point = { ...panel.position }; point[axis] += side === "max" ? panel.dimensions[axis] : 0;
  return { kind: "panel-corner", reference: panelReference(panel, result.bom.find(line => line.componentIds.includes(panel.id))!.id), corner, point };
}

export function createGeneralAssemblyPlan(result: FurnitureResult, configuration: DrawingProfile = getDrawingProfile(), annotations?: DrawingAnnotationModel): GAPlanResult {
  try {
    const parsed = parseDrawingProfile(configuration);
    if (!parsed.profile) return { plan: null, issues: parsed.issues };
    const profile = parsed.profile;
    if (!result.geometryValid || result.issues.some(i => i.severity === "error")) throw new Error("GA plan requires validated engineering geometry.");
    const reconciliation = reconcileDrawingParts(result);
    if (!reconciliation.valid) return { plan: null, issues: reconciliation.issues.map(i => i.message) };
    // FurnitureResult has no family discriminator. Its documented canonical engine
    // revision contains the source specification; read identity only, never formulas.
    let family: unknown;
    try {
      const revision = JSON.parse(result.specificationRevision);
      if (typeof revision.engineRevision !== "string" || revision.parameters?.schemaVersion !== 2 || revision.parameters?.units !== "mm") throw new Error();
      family = revision.parameters.family;
    } catch { throw new Error("GA source identity cannot be resolved from the engineering revision."); }
    const policy = typeof family === "string" && Object.prototype.hasOwnProperty.call(FAMILY_POLICIES, family) ? FAMILY_POLICIES[family] : undefined;
    if (!policy) throw new Error(`No registered GA policy for furniture family: ${String(family)}.`);
    const roots = result.assemblies.filter(a => a.parentId === null);
    if (new Set(result.assemblies.map(a => a.id)).size !== result.assemblies.length) throw new Error("GA source has duplicate assembly identities.");
    if (roots.length !== 1) throw new Error("GA source requires one unambiguous root assembly.");
    const root = roots[0];
    // Explicit drawer-chest schema-v2 contract, not a generic ID-path heuristic.
    const carcass = result.assemblies.find(a => a.parentId === root.id && a.id === `${root.id}/carcass`);
    if (!carcass) throw new Error("Drawer-chest GA source has no carcass assembly.");
    const panels = result.components.filter(c => c.kind === "panel"); bounds3(panels);
    for (const panel of panels) {
      const owner = result.assemblies.find(a => a.id === panel.assemblyId);
      if (!owner || !owner.componentIds.includes(panel.id)) throw new Error(`GA source assembly membership is incomplete: ${panel.id}.`);
      const visited = new Set<string>(); let parent: typeof owner | undefined = owner;
      while (parent && parent.id !== root.id) {
        if (visited.has(parent.id)) throw new Error("GA source assembly hierarchy is cyclic.");
        visited.add(parent.id); parent = result.assemblies.find(a => a.id === parent!.parentId);
      }
      if (!parent) throw new Error(`GA panel is outside the root assembly: ${panel.id}.`);
    }
    const body = panels.filter(p => p.assemblyId === carcass.id); bounds3(body);
    const model = annotations ?? createDrawingAnnotations(result, profile.annotations);
    const modelIssues = validateDrawingAnnotations(result, { ...model, anchors: [], leaders: [] });
    if (modelIssues.length) return { plan: null, issues: modelIssues };
    const dimensions: SemanticGADimension[] = [];
    const add = (id: GADimensionId, meaning: SemanticGADimension["meaning"], members: PanelComponent[], scope: GAExtentReference["scope"], assemblyId: string, axis: GAExtentReference["axis"], relevantView: Projection) => {
      const from = extent(members, assemblyId, scope, axis, "min"), to = extent(members, assemblyId, scope, axis, "max");
      dimensions.push({ id, meaning, unit: "mm", valueMm: to.value - from.value,
        measurement: { kind: "linear-axis-distance", axis, from: from.reference, to: to.reference },
        anchors: { from: anchor(from.panel, axis, "min", result), to: anchor(to.panel, axis, "max", result) },
        relevantViews: [relevantView], references: [...members].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(p => panelReference(p, result.bom.find(line => line.componentIds.includes(p.id))!.id)),
        referenceContext: { frame: "engine-global-mm", datumSystem: "not-assessed" }, tolerance: { state: "unspecified" } });
    };
    add("overall-width", "overall-cabinet-width", panels, "closed-assembly-panels", root.id, "x", "front");
    add("overall-height", "overall-cabinet-height", panels, "closed-assembly-panels", root.id, "y", "front");
    add("carcass-depth", "carcass-depth", body, "carcass-panels", carcass.id, "z", "top");
    add("overall-depth", "overall-closed-depth-including-fronts", panels, "closed-assembly-panels", root.id, "z", "right");
    const selected = profile.contents.assemblyViews;
    const primary = selected.includes(policy.primary) ? policy.primary : PROJECTIONS.find(p => selected.includes(p)) ?? null;
    const balloonIds = model.balloons.map(b => b.id);
    const views = PROJECTIONS.map(projection => ({ id: `ga-${projection}`, projection, included: selected.includes(projection), role: projection === primary ? "primary" as const : "supporting" as const,
      sourceComponentIds: panels.map(p => p.id).sort(), dimensionIds: dimensions.filter(d => d.relevantViews.includes(projection)).map(d => d.id), candidateBalloonIds: [...balloonIds] }));
    const displayed = dimensions.filter(d => d.relevantViews.some(p => selected.includes(p))).map(d => d.id);
    const missing = dimensions.filter(d => !displayed.includes(d.id)).map(d => d.id);
    const diagnostics: GeneralAssemblyPlan["diagnostics"] = missing.map(dimensionId => ({ code: "hidden-required-view", dimensionId, message: `Nominal GA dimension ${dimensionId} is not displayed: its supporting view is hidden by the profile.` }));
    if (!primary) diagnostics.push({ code: "assembly-views-hidden", message: "GA views are hidden; semantic dimensions remain internally resolved." });
    else if (primary !== policy.primary) diagnostics.push({ code: "primary-view-hidden", message: `Profile hides the preferred ${policy.primary}; ${primary} is the selected primary view.` });
    const plan: GeneralAssemblyPlan = { schemaVersion: 1, id: `ga-plan:${root.id}`,
      source: { family: family as string, rootAssemblyId: root.id, carcassAssemblyId: carcass.id, engineeringRevision: result.specificationRevision },
      binding: { sourceSnapshot: sourceSnapshot(result), profileSnapshot: canonicalDrawingSnapshot(profile),
        annotationSnapshot: canonicalDrawingSnapshot({ items: model.items, balloons: model.balloons, partsList: model.partsList }), plannerVersion: PLANNER_VERSION, resolverVersion: RESOLVER_VERSION },
      visibility: { algorithm: EDGE_VISIBILITY_VERSION, isometricMode: profile.sheet.isometricMode ?? "visible-edges", cameraDirection: cameraDirection("isometric"), computationalEpsilonMm: VISIBILITY_EPSILON_MM },
      policy: { id: policy.id, version: policy.version, preferredPrimary: policy.primary, selectedPrimary: primary, layoutStrategy: policy.layoutStrategy,
        reasons: ["Drawer-chest policy prioritises a parallel isometric of the closed panel assembly.", "Solid panel edge visibility is resolved from the deterministic isometric camera; diagnostic wireframe is optional.", "Supporting orthographic views carry true-length nominal dimensions.", primary !== policy.primary ? "Profile visibility is respected; missing coverage is reported." : "Preferred primary is enabled by the profile."] },
      views, dimensions, annotationReferences: { balloonIds, partsListId: model.partsList.id, itemKeys: model.items.map(item => item.key) },
      coverage: { requiredDimensionIds: dimensions.map(d => d.id), displayedDimensionIds: displayed, missingDimensionIds: missing, scope: "four-nominal-GA-dimensions-only" }, diagnostics,
      manufacturingReady: false, complianceVerified: false, manufacturingVariants: "not-assessed" };
    return { plan: freezePlan(plan), issues: [] };
  } catch (error) { return { plan: null, issues: [error instanceof Error ? error.message : "GA planning failed."] }; }
}

export function validateGeneralAssemblyPlan(plan: GeneralAssemblyPlan, result: FurnitureResult, profile: DrawingProfile, annotations?: DrawingAnnotationModel): string[] {
  const expected = createGeneralAssemblyPlan(result, profile, annotations);
  if (!expected.plan) return expected.issues;
  if (canonicalDrawingSnapshot(plan.binding) !== canonicalDrawingSnapshot(expected.plan.binding) || plan.source.engineeringRevision !== result.specificationRevision) return ["Stale GA plan: engineering, profile, annotation or planner inputs changed. Regenerate the drawing package."];
  if (canonicalDrawingSnapshot(plan) !== canonicalDrawingSnapshot(expected.plan)) return ["Invalid GA plan: semantic values, references, policy or coverage differ from the validated source."];
  return [];
}

/** Adapter into the existing 2D vector dimension model; scale/style stay downstream. */
export function presentGADimensions(plan: GeneralAssemblyPlan, projection: Projection): DrawingDimension[] {
  return plan.dimensions.filter(d => d.relevantViews.includes(projection)).map(d => ({
    id: d.id, semanticDimensionId: d.id,
    from: projectPoint(d.anchors.from.point, projection), to: projectPoint(d.anchors.to.point, projection),
    axis: d.id === "overall-height" || d.id === "carcass-depth" ? "vertical" : "horizontal",
    valueMm: d.valueMm, offsetPaperMm: 9,
    references: d.id === "overall-depth" ? [d.anchors.from.reference, d.anchors.to.reference] : d.references,
    ...(d.id === "overall-depth" ? { prefix: "Overall " } : d.id === "carcass-depth" ? { prefix: "Carcass " } : {}),
  }));
}
