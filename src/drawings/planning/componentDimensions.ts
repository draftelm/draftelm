import type { FurnitureResult, Vector3 } from "../../furniture";
import type { DrawingDimension, DrawingProfile, DrawingViewport, Point2 } from "../types";
import type { ComponentDimensionId, ComponentDimensionKind, ComponentDimensionPlan, ComponentDrawingIntent, SemanticComponentDimension } from "./componentTypes";
import { reconcileDrawingParts } from "../reconcile";
import { canonicalDrawingSnapshot } from "./gaPlan";

const axes = ["x", "y", "z"] as const;
const kinds: ComponentDimensionKind[] = ["length", "width", "thickness"];
export const componentDimensionId = (componentId: string, kind: ComponentDimensionKind): ComponentDimensionId => `component-dimension:${encodeURIComponent(componentId)}:${kind}`;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

/** Geometry resolves all values. BOM membership supplies reusable nominal blank
 * identity only; reconciliation verifies every occurrence, not just the first. */
export function createComponentDimensionPlan(result: FurnitureResult, profile: DrawingProfile): ComponentDimensionPlan {
  if (!result.geometryValid || !reconcileDrawingParts(result).valid) throw new Error("Component dimensions require validated geometry and reconciled BOM.");
  const panels = result.components.filter(c => c.kind === "panel").sort((a, b) => a.id.localeCompare(b.id));
  const lines = result.bom.filter(b => b.kind === "panel");
  const dimensions: SemanticComponentDimension[] = [];
  const groups = lines.map(line => {
    const ids = [...line.componentIds].sort(), partTypeKey = `panel:${JSON.stringify(ids)}`;
    const members = panels.filter(p => ids.includes(p.id));
    const occurrences = members.map(panel => {
      const physicalFace = axes.filter(axis => axis !== panel.thicknessAxis);
      const face = [...physicalFace].sort((a, b) => panel.dimensions[b] - panel.dimensions[a] || axes.indexOf(a) - axes.indexOf(b));
      const frame = { componentId: panel.id, origin: { ...panel.position }, u: physicalFace[0], v: physicalFace[1], normal: panel.thicknessAxis,
        displayAxes: { horizontal: face[0], vertical: face[1] },
        dimensionIds: Object.fromEntries(kinds.map(kind => [kind, componentDimensionId(panel.id, kind)])) as Record<ComponentDimensionKind, ComponentDimensionId> };
      for (const [i, kind] of kinds.entries()) {
        const axis = [frame.displayAxes.horizontal, frame.displayAxes.vertical, frame.normal][i], valueMm = panel.dimensions[axis];
        if (!(valueMm > 0) || !Number.isFinite(valueMm) || !axes.every(a => Number.isFinite(panel.position[a]))) throw new Error(`Invalid rectangular dimension geometry: ${panel.id}.`);
        dimensions.push({ id: frame.dimensionIds[kind], kind, unit: "mm", valueMm, reference: { componentId: panel.id, assemblyId: panel.assemblyId, bomId: line.id }, partTypeKey,
          measurement: { kind: "panel-axis-extent", axis, from: { ...panel.position }, to: { ...panel.position, [axis]: panel.position[axis] + valueMm } },
          meaning: "nominal-rectangular-blank", tolerance: "unspecified", manufacturingDatum: "not-assessed" });
      }
      return frame;
    });
    return { id: `component-face:${partTypeKey}`, bomId: line.id, partTypeKey, componentIds: ids, representativeId: occurrences[0].componentId,
      quantity: line.quantity, label: line.partNames.join(" / "), materialId: line.itemId, occurrences };
  });
  const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
  return freeze({ schemaVersion: 1, id: "component-dimension-plan", binding: {
    engineeringRevision: result.specificationRevision, resolverVersion: "rectangular-panel-dimensions-1",
    sourceSnapshot: canonicalDrawingSnapshot({ panels, bom: byId(lines).map(line => ({ ...line, componentIds: [...line.componentIds].sort() })) }),
    profileSnapshot: canonicalDrawingSnapshot(profile),
  }, groups: byId(groups), dimensions: byId(dimensions), coverageScope: "nominal-rectangular-blanks-only" });
}

export function validateComponentDimensionPlan(plan: ComponentDimensionPlan, result: FurnitureResult, profile: DrawingProfile): string[] {
  try {
    const expected = createComponentDimensionPlan(result, profile);
    return canonicalDrawingSnapshot(plan) === canonicalDrawingSnapshot(expected) ? [] : ["Stale or inconsistent component dimension plan. Regenerate the drawing package."];
  } catch (error) { return [error instanceof Error ? error.message : "Component dimension plan validation failed."]; }
}

export function groupDimension(plan: ComponentDimensionPlan, group: ComponentDrawingIntent, kind: ComponentDimensionKind) {
  const occurrence = group.occurrences.find(o => o.componentId === group.representativeId)!;
  const dimension = plan.dimensions.find(d => d.id === occurrence.dimensionIds[kind]);
  if (!dimension) throw new Error(`Missing semantic component dimension: ${group.id}/${kind}.`);
  return dimension;
}

/** Local face coordinates are a presentation frame, not a manufacturing datum.
 * All differently oriented members retain their own physical frame/measurements. */
export function componentFaceViewport(plan: ComponentDimensionPlan, group: ComponentDrawingIntent, cuttingList: boolean): DrawingViewport {
  const length = groupDimension(plan, group, "length"), width = groupDimension(plan, group, "width"), thickness = groupDimension(plan, group, "thickness");
  const references = group.occurrences.map(o => ({ ...plan.dimensions.find(d => d.id === o.dimensionIds.length)!.reference }));
  const corners = [{ x: 0, y: 0 }, { x: length.valueMm, y: 0 }, { x: length.valueMm, y: width.valueMm }, { x: 0, y: width.valueMm }];
  const dimension = (kind: "length" | "width", from: Point2, to: Point2): DrawingDimension => {
    const semantic = groupDimension(plan, group, kind);
    return { id: semantic.id, semanticDimensionId: semantic.id, equivalentDimensionIds: group.occurrences.map(o => o.dimensionIds[kind]),
      from, to, axis: kind === "length" ? "horizontal" : "vertical", valueMm: semantic.valueMm, offsetPaperMm: 0, references };
  };
  return { id: `component-${group.bomId}`, semanticViewId: group.id, label: group.label, projection: "panel-face",
    entities: corners.map((from, i) => ({ kind: "line", id: `${group.bomId}-edge-${i}`, from, to: corners[(i + 1) % 4], references })),
    dimensions: [dimension("length", corners[0], corners[1]), dimension("width", corners[0], corners[3])],
    bounds: { min: corners[0], max: corners[2] }, frame: { x: 0, y: 0, width: 0, height: 0 }, origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1", references,
    thicknessDimension: { id: thickness.id, semanticDimensionId: thickness.id, equivalentDimensionIds: group.occurrences.map(o => o.dimensionIds.thickness),
      valueMm: thickness.valueMm, references, presentation: "normal-to-face-note", status: "placed" },
    annotations: [`Qty ${group.quantity}`, group.materialId.length <= 40 ? `Material: ${group.materialId}` : cuttingList ? `Material: see ${group.bomId} in schedule.` : "Full material ID retained internally; cutting list hidden.",
      cuttingList ? `All ${group.componentIds.length} unique part IDs: ${group.bomId} in schedule.` : `BOM ${group.bomId}: ${group.componentIds.length} IDs retained internally; list hidden.`, "Nominal blank; grain and edge treatment unspecified."],
  };
}

/** Map a displayed local face corner back to its actual source panel corner. */
export function componentFacePoint(group: ComponentDrawingIntent, point: Point2): Vector3 {
  const frame = group.occurrences.find(o => o.componentId === group.representativeId)!;
  return { ...frame.origin, [frame.displayAxes.horizontal]: frame.origin[frame.displayAxes.horizontal] + point.x, [frame.displayAxes.vertical]: frame.origin[frame.displayAxes.vertical] + point.y };
}
