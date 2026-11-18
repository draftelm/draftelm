import type { FurnitureResult } from "../../furniture";
import type { DrawingDocument, DrawingSheet } from "../types";
import { canonicalDrawingSnapshot } from "./gaPlan";
import { createFunctionalContextPlan } from "./functionalContext";
import { buildFunctionalContextSheets, functionalContextCollisions, functionalContextPresentation } from "../functionalContext";
import { titleBlockExtraHeight } from "../layout";
import { containsRect, overlaps } from "../annotationGeometry";

export function validateFunctionalContextDocument(document: DrawingDocument, source: FurnitureResult): string[] {
  const issues: string[] = [], expected = createFunctionalContextPlan(source, document.profile, document.functionalDimensionPlan, document.contextualSectionPlan);
  if (canonicalDrawingSnapshot(expected) !== canonicalDrawingSnapshot(document.functionalContextPlan)) return ["Contextual functional plan differs from its source relationships/revision/profile."];
  const base = structuredClone(document.sheets.filter(s => !s.id.startsWith("FC-")).map(s => ({ ...s, viewports: s.viewports.filter(v => !v.functionalContext) })));
  const first = document.sheets[0], extra = titleBlockExtraHeight(document.profile.titleBlock), page = { width: first.widthMm, height: first.heightMm - extra };
  const factory = (id: string, subject: string, number: number, views: DrawingSheet["viewports"]): DrawingSheet => ({ ...first, id, metadata: { ...first.metadata, subject, number }, viewports: views, annotations: [], assemblyScope: undefined, annotationModel: undefined, balloons: undefined, assemblyPartsList: undefined, table: undefined });
  buildFunctionalContextSheets(document.profile, expected, base, page, factory);
  const presentation = functionalContextPresentation(expected, document.functionalDimensionPlan, base, !!document.profile.contents.functionalDimensions);
  if (canonicalDrawingSnapshot(presentation) !== canonicalDrawingSnapshot(document.functionalContextPresentation)) issues.push("Contextual relationship mapping or placement diagnostics differ from the source policy.");
  const actualContext = document.sheets.flatMap(s => s.viewports).filter(v => v.functionalContext), expectedContext = base.flatMap(s => s.viewports).filter(v => v.functionalContext);
  if (canonicalDrawingSnapshot(actualContext) !== canonicalDrawingSnapshot(expectedContext)) issues.push("Contextual geometry, source dimensions, references or placement differ from the bound plan.");
  const actualIds = document.sheets.filter(s => s.id.startsWith("FC-")).map(s => s.id), expectedIds = base.filter(s => s.id.startsWith("FC-")).map(s => s.id);
  if (canonicalDrawingSnapshot(actualIds) !== canonicalDrawingSnapshot(expectedIds)) issues.push("Functional context continuation sheet coverage differs from the placement plan.");
  for (const expectedSheet of base.filter(s => s.viewports.some(v => v.functionalContext))) {
    const actual = document.sheets.find(s => s.id === expectedSheet.id);
    if (!actual || canonicalDrawingSnapshot(actual.viewports.filter(v => v.functionalContext)) !== canonicalDrawingSnapshot(expectedSheet.viewports.filter(v => v.functionalContext))) issues.push(`Contextual views are attached to the wrong sheet: ${expectedSheet.id}.`);
  }
  for (const sheet of base.filter(s => s.id.startsWith("FC-"))) {
    const actual = document.sheets.find(s => s.id === sheet.id);
    if (actual && (actual.metadata.subject !== sheet.metadata.subject || canonicalDrawingSnapshot(actual.annotations) !== canonicalDrawingSnapshot(sheet.annotations))) issues.push(`Contextual sheet references/diagnostic notes differ from the plan: ${sheet.id}.`);
  }
  for (const sheet of document.sheets) for (const view of sheet.viewports.filter(v => v.functionalContext)) {
    issues.push(...functionalContextCollisions(view));
    if (!containsRect({ x: 10, y: 23, width: sheet.widthMm - 20, height: sheet.heightMm - 87 - extra }, view.frame) || sheet.viewports.some(other => other.id !== view.id && overlaps(view.frame, other.frame))) issues.push(`Context view collides with a view/reserved sheet region: ${view.id}.`);
    if (sheet.assemblyPartsList) {
      const t = sheet.assemblyPartsList, ink = { ...t.frame, height: t.titleHeight + t.headerHeight + t.rows.reduce((sum, r) => sum + r.height, 0) };
      if (overlaps(view.frame, ink)) issues.push(`Context view overlaps assembly parts list: ${view.id}.`);
    }
    for (const marker of view.sectionMarkers ?? []) if (!document.sheets.some(s => s.viewports.some(v => v.id === marker.targetViewId))) issues.push(`Context marker has no target: ${marker.id}.`);
  }
  return issues;
}
