import type { FurnitureResult } from "../../furniture";
import type { DrawingDocument } from "../types";
import { canonicalDrawingSnapshot } from "./gaPlan";
import { componentFaceViewport, validateComponentDimensionPlan } from "./componentDimensions";
import { componentDimensionCollisions, componentDimensionCoverage, fitComponentDimensions } from "../componentDimensionLayout";
import { containsRect, overlaps } from "../annotationGeometry";
import { reconcileDrawingParts } from "../reconcile";
import { titleBlockExtraHeight } from "../layout";

/** Called at the shared generation/preview/PDF boundary. Re-resolve dimensions
 * from the captured engineering source, then independently check paper bounds.
 * A current external source is still needed to assess live-design freshness. */
export function validateComponentDimensionDocument(document: DrawingDocument, source: FurnitureResult): string[] {
  const plan = document.componentDimensionPlan;
  if (!plan) return ["Missing component dimension plan. Regenerate the drawing package."];
  const issues = validateComponentDimensionPlan(plan, source, document.profile);
  if (issues.length) return issues;
  const views = document.sheets.flatMap(s => s.viewports).filter(v => v.projection === "panel-face");
  if (document.profile.contents.componentDrawings) {
    issues.push(...reconcileDrawingParts(source, document.componentSchedule, views).issues.map(i => i.message));
    if (views.length !== plan.groups.length) issues.push("Component drawing type coverage is missing or duplicated.");
  } else if (views.length) issues.push("Component drawings differ from profile visibility.");
  for (const view of views) {
    const group = plan.groups.find(g => g.id === view.semanticViewId);
    if (!group) { issues.push(`Component view lacks its semantic blank group: ${view.id}.`); continue; }
    const expected = fitComponentDimensions({ ...componentFaceViewport(plan, group, document.profile.contents.cuttingList.include), frame: view.frame });
    if (canonicalDrawingSnapshot(view) !== canonicalDrawingSnapshot(expected)) issues.push(`Component dimensions, geometry or placement differ from the bound source: ${view.id}.`);
    const sheet = document.sheets.find(s => s.viewports.includes(view))!;
    const extra = titleBlockExtraHeight(document.profile.titleBlock);
    if (!containsRect({ x: 10, y: 23, width: sheet.widthMm - 20, height: sheet.heightMm - 85 - extra }, view.frame)) issues.push(`Component viewport crosses a reserved sheet region: ${view.id}.`);
    const obstacles = [...sheet.viewports.filter(v => v !== view).map(v => v.frame), ...(sheet.assemblyPartsList ? [sheet.assemblyPartsList.frame] : []), ...(sheet.table ? [sheet.table.frame] : [])];
    if (obstacles.some(o => overlaps(view.frame, o))) issues.push(`Component viewport overlaps another view or parts list: ${view.id}.`);
    issues.push(...componentDimensionCollisions(view, obstacles));
  }
  const coverage = componentDimensionCoverage(plan, views, document.profile.contents.componentDrawings);
  if (canonicalDrawingSnapshot(coverage) !== canonicalDrawingSnapshot(document.componentDimensionCoverage)) issues.push("Component dimension coverage/diagnostics differ from the displayed source-linked dimensions.");
  return issues;
}
