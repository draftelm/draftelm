import type { FurnitureResult, PanelComponent } from "../furniture";
import type { AnyDrawingAnnotationModel, DrawingProfile, DrawingScopeItem, DrawingSheet, ScopedDrawingAnnotationModel } from "./types";
import type { AssemblyDrawingPlan } from "./planning/assemblies";
import { assemblyPanels } from "./planning/assemblies";
import { bounds3, panelReference } from "./projections";
import { validateAnnotationPlacements } from "./annotations";
import { canonicalDrawingSnapshot } from "./planning/gaPlan";

function positionName(panel: PanelComponent, panels: PanelComponent[]) {
  const bounds = bounds3(panels), axis = panel.thicknessAxis;
  const lower = panel.position[axis] + panel.dimensions[axis] / 2 < (bounds.min[axis] + bounds.max[axis]) / 2;
  return axis === "x" ? lower ? "left" : "right" : axis === "y" ? lower ? "bottom" : "top" : lower ? "front" : "rear";
}

/** Root lists contain assembly occurrences; the exploded root replaces the
 * carcass row with its five panels. Subassembly lists have six/five local rows,
 * each linked to its reusable source blank without multiplying by drawer count. */
export function createScopedAnnotations(result: FurnitureResult, plan: AssemblyDrawingPlan, scope: NonNullable<DrawingSheet["assemblyScope"]>, settings: DrawingProfile["annotations"]): ScopedDrawingAnnotationModel {
  const items: DrawingScopeItem[] = [];
  const addPanels = (assemblyId: string) => {
    const panels = assemblyPanels(result, plan, assemblyId);
    for (const p of panels) {
      const bom = result.bom.find(line => line.kind === "panel" && line.componentIds.includes(p.id));
      if (!bom?.cutSize) throw new Error(`Scoped panel lacks its nominal BOM blank: ${p.id}.`);
      const { length, width, thickness } = bom.cutSize;
      const size = [length, width, thickness].map(n => Number(n.toFixed(6))).join(" x ");
      items.push({ kind: "panel", key: `occurrence:${p.id}`, number: 0, label: "", bomId: bom.id, componentIds: [p.id],
        description: `${p.name} - ${positionName(p, panels)}`, quantity: p.quantity, materialId: p.materialId, cuttingListBomId: bom.id,
        references: [panelReference(p, bom.id)], scopeDetails: `${bom.id}\n${size} mm\n${p.materialId}` });
    }
  };
  if (scope.kind === "drawer" || scope.kind === "carcass") addPanels(scope.representativeId);
  else for (const group of plan.groups) {
    if (scope.kind === "exploded" && group.kind === "carcass") { addPanels(group.representativeId); continue; }
    const componentIds = group.assemblyIds.flatMap(id => assemblyPanels(result, plan, id).map(p => p.id)).sort();
    const references = componentIds.map(id => {
      const panel = result.components.find((p): p is PanelComponent => p.kind === "panel" && p.id === id)!;
      return panelReference(panel, result.bom.find(line => line.componentIds.includes(id))!.id);
    });
    const localNumber = plan.groups.filter(g => g.kind === group.kind).indexOf(group) + 1;
    const enabled = plan.decisions.find(d => d.kind === group.kind)?.included;
    const drawing = `${group.kind === "drawer" ? "DS" : "CS"}-${String(localNumber).padStart(3, "0")}`;
    items.push({ kind: "assembly", key: `assembly:${JSON.stringify(group.assemblyIds)}`, number: 0, label: "", assemblyIds: [...group.assemblyIds],
      bomIds: [...new Set(references.map(r => r.bomId!))].sort(), componentIds, references,
      description: `${group.kind === "drawer" ? "Drawer assembly" : "Carcass assembly"}\n${enabled ? `Sheet ${drawing}` : "Subassembly sheet hidden"}`, quantity: group.assemblyIds.length });
  }
  items.sort((a, b) => a.key.localeCompare(b.key));
  items.forEach((item, i) => { item.number = i + 1; item.label = `${settings.itemNumberStyle === "prefixed" ? item.kind === "assembly" ? "A" : "P" : ""}${i + 1}`; });
  const scopeId = `${scope.kind}:${scope.representativeId}`;
  return { schemaVersion: 1, groupingPolicy: "assembly-scope-v1", scopeId, items,
    balloons: items.flatMap(item => {
      const members = settings.balloonDisplay === "visible-occurrences" && item.kind === "assembly"
        ? item.assemblyIds.map(id => item.references.filter(r => r.assemblyId === id).map(r => r.componentId)) : [item.componentIds];
      return members.map((ids, index) => ({ kind: "component-balloon" as const, id: `${scopeId}:balloon:${item.key}:${index}`, itemKey: item.key,
        componentIds: [...ids], scope: settings.balloonDisplay === "visible-occurrences" && item.kind === "assembly" ? "assembly-occurrence" as const : "group-representative" as const }));
    }), anchors: [], leaders: [], diagnostics: [],
    partsList: { kind: "assembly-parts-list", id: `${scopeId}:parts-list`, scope: scope.kind === "general" ? "assemblies" : scope.kind === "exploded" ? "mixed" : "panels", itemKeys: items.map(i => i.key) } };
}

export function validateScopedAnnotations(result: FurnitureResult, plan: AssemblyDrawingPlan, settings: DrawingProfile["annotations"], sheets: DrawingSheet[]): string[] {
  const issues: string[] = [];
  for (const sheet of sheets.filter(s => s.assemblyScope && s.annotationModel)) {
    // Continuation tables and the parent share one semantic model.
    const model = sheet.annotationModel!, scope = sheet.assemblyScope!;
    const family = sheets.filter(s => s.annotationModel?.scopeId === model.scopeId);
    if (family[0] !== sheet) continue;
    const expected = createScopedAnnotations(result, plan, scope, settings);
    const semantics = (m: AnyDrawingAnnotationModel) => ({ items: m.items, balloons: m.balloons, partsList: m.partsList });
    if (canonicalDrawingSnapshot(semantics(model)) !== canonicalDrawingSnapshot(semantics(expected))) issues.push(`Scoped assembly identities, dimensions or quantities disagree with the source: ${sheet.id}.`);
    if (family.some(s => canonicalDrawingSnapshot(s.annotationModel) !== canonicalDrawingSnapshot(model))) issues.push(`Scoped annotation continuation differs from its parent: ${sheet.id}.`);
    issues.push(...validateAnnotationPlacements(result, model, family));
    const placed = family.flatMap(s => s.balloons ?? []).map(b => b.annotationId);
    const unplaced = model.diagnostics.filter(d => d.itemKey).map(d => d.annotationId);
    if (settings.balloons && (new Set([...placed, ...unplaced]).size !== model.balloons.length || placed.length + unplaced.length !== model.balloons.length || model.balloons.some(b => ![...placed, ...unplaced].includes(b.id)))) issues.push(`Scoped balloon requests are not fully accounted for: ${sheet.id}.`);
  }
  return issues;
}
