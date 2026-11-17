import type { FurnitureResult } from "../../furniture";
import type { DrawingDocument } from "../types";
import { canonicalDrawingSnapshot } from "./gaPlan";
import { validateFunctionalDimensionPlan } from "./functionalDimensions";
import { functionalDetailCollisions, functionalDetailFrames, functionalDetailView, functionalDimensionCoverage } from "../functionalDetails";
import { containsRect, overlaps } from "../annotationGeometry";
import { titleBlockExtraHeight } from "../layout";

export function validateFunctionalDimensionDocument(document: DrawingDocument, result: FurnitureResult): string[] {
  if (!document.functionalDimensionPlan) return ["Missing functional reference/dimension plan; regenerate the drawing package."];
  const plan = document.functionalDimensionPlan, issues = validateFunctionalDimensionPlan(plan, result, document.profile);
  if (issues.length) return issues;
  const enabled = !!document.profile.contents.functionalDimensions, sheets = document.sheets.filter(s => s.id.startsWith("FD-"));
  const expectedGroups = enabled ? plan.displayGroups : [];
  const views = sheets.flatMap(s => s.viewports);
  const page = sheets[0], perPage = page ? functionalDetailFrames({ width: page.widthMm, height: page.heightMm - titleBlockExtraHeight(document.profile.titleBlock) }).length : 6;
  if (sheets.length !== Math.ceil(expectedGroups.length / perPage) || views.length !== expectedGroups.length || new Set(views.map(v => v.id)).size !== views.length) issues.push("Functional detail sheet/view coverage differs from the selected source policy.");
  for (const [i, sheet] of sheets.entries()) {
    if (sheet.id !== `FD-${String(i + 1).padStart(3, "0")}` || sheet.table || sheet.assemblyPartsList || sheet.balloons?.length) issues.push(`Functional details have unexpected numbering or unrelated annotations: ${sheet.id}.`);
    const extra = titleBlockExtraHeight(document.profile.titleBlock);
    for (const view of sheet.viewports) {
      const group = expectedGroups.find(g => g.id === view.id);
      if (!group) { issues.push(`Unknown functional detail view: ${view.id}.`); continue; }
      const expected = functionalDetailView(result, plan, group, view.frame);
      if (canonicalDrawingSnapshot(view) !== canonicalDrawingSnapshot(expected)) issues.push(`Functional references, values, crop or placement differ from the source: ${view.id}.`);
      if (!containsRect({ x: 10, y: 23, width: sheet.widthMm - 20, height: sheet.heightMm - 85 - extra }, view.frame) || sheet.viewports.some(other => other !== view && overlaps(other.frame, view.frame))) issues.push(`Functional detail overlaps another view or a reserved sheet region: ${view.id}.`);
      issues.push(...functionalDetailCollisions(view));
    }
  }
  if (document.sheets.filter(s => !s.id.startsWith("FD-")).some(s => s.viewports.some(v => v.functionalDimension))) issues.push("Functional detail geometry is attached to an unexpected sheet scope.");
  const coverage = functionalDimensionCoverage(plan, document.sheets, enabled);
  if (canonicalDrawingSnapshot(coverage) !== canonicalDrawingSnapshot(document.functionalDimensionCoverage)) issues.push("Functional dimension coverage/placement diagnostics differ from the bound source.");
  return issues;
}
