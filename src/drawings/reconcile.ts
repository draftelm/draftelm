import type { BOMLine, FurnitureResult, PanelComponent } from "../furniture";
import type { DrawingReconciliation, DrawingScheduleRow, DrawingViewport } from "./types";

const equalNumber = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6;
const sameMembers = (a: string[], b: string[]) => {
  const sorted = [...b].sort();
  return a.length === b.length && [...a].sort().every((id, i) => id === sorted[i]);
};
const sameCut = (a: BOMLine["cutSize"], b: BOMLine["cutSize"]) => a && b
  ? equalNumber(a.length, b.length) && equalNumber(a.width, b.width) && equalNumber(a.thickness, b.thickness)
  : a === b;

/** Verify stock against every engine panel, never just the representative blank. */
export function panelMatchesBOM(panel: PanelComponent, line: BOMLine): boolean {
  const face = (["x", "y", "z"] as const).filter(axis => axis !== panel.thicknessAxis).map(axis => panel.dimensions[axis]);
  return line.kind === "panel" && line.itemId === panel.materialId && !!line.cutSize &&
    equalNumber(line.cutSize.length, Math.max(...face)) && equalNumber(line.cutSize.width, Math.min(...face)) &&
    equalNumber(line.cutSize.thickness, panel.thickness) && equalNumber(panel.dimensions[panel.thicknessAxis], panel.thickness);
}

export function createComponentSchedule(result: FurnitureResult): DrawingScheduleRow[] {
  return result.bom.map(line => ({ bomId: line.id, kind: line.kind, description: line.partNames.join(" / "),
    partNames: [...line.partNames], componentIds: [...line.componentIds], quantity: line.quantity, itemId: line.itemId,
    ...(line.cutSize ? { cutSize: { ...line.cutSize } } : {}) }));
}

/** Check both sides of the engineering/BOM/schedule/detail-view links. Fail closed. */
export function reconcileDrawingParts(result: FurnitureResult, schedule?: DrawingScheduleRow[], componentViews?: DrawingViewport[]): DrawingReconciliation {
  const issues: DrawingReconciliation["issues"] = [];
  const flag = (code: DrawingReconciliation["issues"][number]["code"], message: string, componentIds: string[], bomId?: string) =>
    issues.push({ code, message, componentIds, ...(bomId ? { bomId } : {}) });
  const components = new Map(result.components.map(c => [c.id, c]));
  const componentIds = new Set<string>(), bomIds = new Set<string>(), occurrences = new Map<string, number>();
  for (const c of result.components) {
    if (componentIds.has(c.id)) flag("duplicate", `Duplicate engineering component ID: ${c.id}.`, [c.id]);
    componentIds.add(c.id);
    if (!Number.isSafeInteger(c.quantity) || c.quantity <= 0) flag("mismatch", `Invalid engineering quantity: ${c.id}.`, [c.id]);
  }
  for (const line of result.bom) {
    if (bomIds.has(line.id)) flag("duplicate", `Duplicate BOM line ID: ${line.id}.`, line.componentIds, line.id);
    bomIds.add(line.id);
    if (!line.componentIds.length) flag("missing", `BOM line ${line.id} has no components.`, [], line.id);
    let quantity = 0;
    const names = new Set<string>();
    for (const id of line.componentIds) {
      occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
      const c = components.get(id);
      if (!c) { flag("missing", `BOM ${line.id} references missing component ${id}.`, [id], line.id); continue; }
      quantity += c.quantity; names.add(c.name);
      if (line.kind !== c.kind || (c.kind === "panel" ? !panelMatchesBOM(c, line) : line.itemId !== c.hardwareId || !!line.cutSize)) {
        flag("mismatch", `BOM and component dimensions/material/kind disagree: ${id} (${line.id}).`, [id], line.id);
      }
    }
    if (line.quantity !== quantity || line.unit !== "piece" || !sameMembers(line.partNames, [...names])) {
      flag("mismatch", `BOM quantity, unit or descriptions disagree: ${line.id}.`, line.componentIds, line.id);
    }
  }
  for (const id of componentIds) if (!occurrences.has(id)) flag("missing", `Component missing from BOM: ${id}.`, [id]);
  for (const [id, count] of occurrences) if (count > 1) flag("duplicate", `Component occurs ${count} times in BOM: ${id}.`, [id]);

  if (schedule) {
    const seen = new Set<string>();
    for (const row of schedule) {
      if (seen.has(row.bomId)) flag("duplicate", `Duplicate schedule row: ${row.bomId}.`, row.componentIds, row.bomId);
      seen.add(row.bomId);
      const line = result.bom.find(l => l.id === row.bomId);
      if (!line) { flag("missing", `Schedule references missing BOM line: ${row.bomId}.`, row.componentIds, row.bomId); continue; }
      if (row.kind !== line.kind || row.quantity !== line.quantity || row.itemId !== line.itemId ||
        !sameMembers(row.componentIds, line.componentIds) || !sameMembers(row.partNames, line.partNames) ||
        row.description !== line.partNames.join(" / ") || !sameCut(row.cutSize, line.cutSize)) {
        flag("mismatch", `Drawing schedule and BOM disagree: ${row.bomId}.`, row.componentIds, row.bomId);
      }
    }
    for (const line of result.bom) if (!seen.has(line.id)) flag("missing", `BOM line missing from drawing schedule: ${line.id}.`, line.componentIds, line.id);
  }
  const panels = result.components.filter(c => c.kind === "panel");
  if (componentViews) {
    const seen = new Map<string, number>();
    for (const view of componentViews) for (const ref of view.references) {
      seen.set(ref.componentId, (seen.get(ref.componentId) ?? 0) + 1);
      const c = components.get(ref.componentId), line = result.bom.find(l => l.id === ref.bomId);
      if (!c || c.kind !== "panel" || !line || !line.cutSize || !line.componentIds.includes(ref.componentId) || ref.assemblyId !== c.assemblyId) {
        flag("mismatch", `Invalid component drawing reference: ${ref.componentId}.`, [ref.componentId], ref.bomId);
      } else if (!sameMembers(view.references.map(r => r.componentId), line.componentIds) ||
        view.dimensions.length !== 2 || !equalNumber(view.dimensions[0].valueMm, line.cutSize!.length) ||
        !equalNumber(view.dimensions[1].valueMm, line.cutSize!.width)) {
        flag("mismatch", `Component drawing and BOM dimensions/members disagree: ${view.id}.`, [ref.componentId], ref.bomId);
      }
    }
    for (const panel of panels) if (!seen.has(panel.id)) flag("missing", `Panel drawing missing: ${panel.id}.`, [panel.id]);
    for (const [id, count] of seen) if (count > 1) flag("duplicate", `Panel occurs ${count} times in component drawings: ${id}.`, [id]);
  }
  return { valid: issues.length === 0, issues, componentCount: result.components.length, panelCount: panels.length,
    panelQuantity: panels.reduce((sum, panel) => sum + panel.quantity, 0) };
}
