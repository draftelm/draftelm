import type { FurnitureResult } from "../../furniture";
import type { DrawingDocument, DrawingSheet } from "../types";
import { createContextualSectionPlan } from "./contextualSections";
import { canonicalDrawingSnapshot } from "./gaPlan";
import { buildContextualSections } from "../contextualSections";
import { titleBlockExtraHeight } from "../layout";

/** Rebuild semantic intersections and their presentation from the frozen source.
 * Live-model freshness is enforced by the existing GA revision reuse gate. */
export function validateContextualSectionDocument(document: DrawingDocument, source: FurnitureResult): string[] {
  const issues: string[] = [], expected = createContextualSectionPlan(source, document.profile, document.functionalDimensionPlan);
  if (canonicalDrawingSnapshot(expected) !== canonicalDrawingSnapshot(document.contextualSectionPlan)) return ["Section definition/intersections differ from the bound source revision/profile. Regenerate drawings."];
  const context = document.sheets.flatMap(s => s.viewports).filter(v => v.sectionData);
  const base = structuredClone(document.sheets.filter(s => !s.id.startsWith("SC-")).map(s => ({ ...s, viewports: s.viewports.filter(v => !v.sectionData) })));
  const first = document.sheets[0];
  const page = { width: first.widthMm, height: first.heightMm - titleBlockExtraHeight(document.profile.titleBlock) };
  const makeSheet = (id: string, subject: string, number: number, views: DrawingSheet["viewports"]): DrawingSheet => ({ ...first, id, metadata: { ...first.metadata, subject, number }, viewports: views, annotations: [], assemblyScope: undefined, annotationModel: undefined, balloons: undefined, assemblyPartsList: undefined, table: undefined });
  const presentation = buildContextualSections(source, document.profile, expected, base, page, makeSheet);
  if (canonicalDrawingSnapshot(presentation) !== canonicalDrawingSnapshot(document.sectionPresentation)) issues.push("Section presentation/coverage differs from the bound placement rules.");
  const expectedContext = base.flatMap(s => s.viewports).filter(v => v.sectionData);
  if (canonicalDrawingSnapshot(context) !== canonicalDrawingSnapshot(expectedContext)) issues.push("Section geometry, crop, hatching regions, reference markers or dimensions differ from the bound plan.");
  const actualSheets = document.sheets.filter(s => s.id.startsWith("SC-")), expectedSheets = base.filter(s => s.id.startsWith("SC-"));
  if (canonicalDrawingSnapshot(actualSheets.map(s => s.id)) !== canonicalDrawingSnapshot(expectedSheets.map(s => s.id))) issues.push("Section continuation sheet coverage is missing or duplicated.");
  for (const expectedSheet of base.filter(s => s.viewports.some(v => v.sectionData))) {
    const actualSheet = document.sheets.find(s => s.id === expectedSheet.id);
    if (!actualSheet || canonicalDrawingSnapshot(actualSheet.viewports.filter(v => v.sectionData)) !== canonicalDrawingSnapshot(expectedSheet.viewports.filter(v => v.sectionData))) issues.push(`Section views differ from their referenced host sheet: ${expectedSheet.id}.`);
  }
  for (const sheet of expectedSheets) {
    const actual = actualSheets.find(s => s.id === sheet.id);
    if (actual && (canonicalDrawingSnapshot(actual.annotations) !== canonicalDrawingSnapshot(sheet.annotations) || actual.metadata.subject !== sheet.metadata.subject)) issues.push(`Section sheet references or notes differ from their bound targets: ${sheet.id}.`);
  }
  if (presentation?.parentAssemblySheetId) {
    const expectedParent = base.find(s => s.id === presentation.parentAssemblySheetId), actual = document.sheets.find(s => s.id === presentation.parentAssemblySheetId);
    if (expectedParent?.annotations[1] !== actual?.annotations[1]) issues.push("Assembly-to-section sheet reference differs from its target.");
  }
  for (const sheet of document.sheets) for (const view of sheet.viewports) {
    if (!view.sectionData && (view.sectionMarkers?.length || view.entities.some(e => e.sectionRole))) issues.push(`Unbound section presentation: ${view.id}.`);
    for (const marker of view.sectionMarkers ?? []) if (!document.sheets.some(s => s.viewports.some(v => v.id === marker.targetViewId))) issues.push(`Section/detail reference has no target: ${marker.id}.`);
  }
  return issues;
}
