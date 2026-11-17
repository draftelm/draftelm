import type { FurnitureResult } from "../../furniture";
import type { DrawingDocument } from "../types";
import { bounds2, isometricLines, orthographicLines } from "../projections";
import { canonicalDrawingSnapshot, presentGADimensions, validateGeneralAssemblyPlan } from "./gaPlan";
import { validateDrawingAnnotations } from "../annotations";
import { reconcileDrawingParts } from "../reconcile";
import { createAssemblyDrawingPlan, translateDrawingPanels } from "./assemblies";
import { assemblyVisibilityDiagnostics, createAssemblyScenes } from "../assemblySheets";
import { validateScopedAnnotations } from "../assemblyAnnotations";
import { validateComponentDimensionDocument } from "./componentValidation";
import { validateContextualSectionDocument } from "./sectionValidation";
import { validateFunctionalDimensionDocument } from "./functionalValidation";

/** Validate frozen source/plan/presentation consistency at the shared render boundary.
 * Without a current engineering input this verifies the captured snapshot, not that
 * it is the latest live design; callers reusing plans must also check freshness. */
export function validateGADocument(document: DrawingDocument): string[] {
  try {
    const plan = document.gaPlan;
    if (!plan || document.specificationRevision !== plan.source.engineeringRevision) return ["Drawing package has a missing or stale GA source revision."];
    const source: FurnitureResult = JSON.parse(plan.binding.sourceSnapshot);
    const issues = validateGeneralAssemblyPlan(plan, source, document.profile, document.drawingAnnotations);
    if (issues.length) return issues;
    issues.push(...validateComponentDimensionDocument(document, source));
    issues.push(...validateFunctionalDimensionDocument(document, source));
    issues.push(...validateContextualSectionDocument(document, source));
    issues.push(...reconcileDrawingParts(source, document.componentSchedule).issues.map(i => i.message));
    issues.push(...validateDrawingAnnotations(source, document.drawingAnnotations, document.sheets));
    const assemblyPlan = createAssemblyDrawingPlan(source, document.profile, plan.source.rootAssemblyId, plan.source.carcassAssemblyId);
    if (canonicalDrawingSnapshot(assemblyPlan) !== canonicalDrawingSnapshot(document.assemblyPlan)) issues.push("Assembly hierarchy or sheet decisions differ from the bound source/profile.");
    issues.push(...validateScopedAnnotations(source, assemblyPlan, document.profile.annotations, document.sheets));
    const scenes = createAssemblyScenes(source, assemblyPlan);
    const assemblySheets = document.sheets.filter(s => s.assemblyScope && s.assemblyScope.kind !== "general" && s.viewports.length);
    if (assemblySheets.length !== scenes.length) issues.push("Assembly drawing sheet coverage is missing or duplicated.");
    for (const scene of scenes) {
      const sheet = assemblySheets.find(s => s.id === scene.id);
      if (!sheet || canonicalDrawingSnapshot(sheet.assemblyScope) !== canonicalDrawingSnapshot(scene.scope)) { issues.push(`Assembly drawing scope differs from its source: ${scene.id}.`); continue; }
      const expectedViews = scene.scope.kind === "exploded" ? 1 : 2;
      const assemblyViews = sheet.viewports.filter(v => !v.sectionData);
      if (assemblyViews.length !== expectedViews || new Set(assemblyViews.map(v => v.id)).size !== expectedViews) issues.push(`Assembly drawing views are missing or duplicated: ${scene.id}.`);
      for (const view of assemblyViews) {
        const exploded = view.id === `${scene.id}-exploded`, assembled = view.id === `${scene.id}-assembled`;
        const offsets = exploded ? scene.explosion.offsets : {};
        const expectedPanels = translateDrawingPanels(scene.panels, offsets), geometry = isometricLines(expectedPanels);
        if ((!exploded && !assembled) || view.projection !== "isometric" || view.dimensions.length || canonicalDrawingSnapshot(view.presentationOffsets) !== canonicalDrawingSnapshot(offsets) ||
          canonicalDrawingSnapshot(view.entities) !== canonicalDrawingSnapshot(geometry) || canonicalDrawingSnapshot(view.bounds) !== canonicalDrawingSnapshot(bounds2(geometry.flatMap(e => [e.from, e.to]))) ||
          canonicalDrawingSnapshot(view.references.map(r => r.componentId).sort()) !== canonicalDrawingSnapshot(scene.panels.map(p => p.id).sort())) issues.push(`Assembly drawing geometry/offsets differ from the source: ${view.id}.`);
      }
      const exploded = sheet.viewports.find(v => v.id === `${scene.id}-exploded`);
      if (!exploded || canonicalDrawingSnapshot(sheet.assemblyDiagnostics) !== canonicalDrawingSnapshot(assemblyVisibilityDiagnostics(scene, exploded))) issues.push(`Assembly visibility diagnostics differ from the resolved scene: ${scene.id}.`);
    }
    for (const sheet of document.sheets.filter(s => s.id.startsWith("GA-"))) {
      if ((document.profile.annotations.gaLevel === "assemblies") !== !!sheet.annotationModel) issues.push("GA callout level differs from the profile.");
      if (sheet.annotationModel && canonicalDrawingSnapshot(sheet.assemblyScope) !== canonicalDrawingSnapshot({ kind: "general", representativeId: assemblyPlan.rootId, assemblyIds: [assemblyPlan.rootId] })) issues.push("GA assembly scope differs from the source root.");
    }
    for (const sheet of document.sheets.filter(s => s.annotationModel)) {
      if (!sheet.assemblyScope || (!document.profile.annotations.balloons && sheet.balloons?.length) || (!document.profile.annotations.assemblyPartsList && sheet.assemblyPartsList)) issues.push(`Scoped annotations differ from profile visibility: ${sheet.id}.`);
    }
    if (document.hardware.policy !== "approved-only" || document.hardware.approvedPurchasingItems.length || document.hardware.allowances.some(a => a.purchasingEligible || a.purchasingQuantity !== 0 || a.verificationStatus !== "unverified" || source.bom.find(line => line.id === a.bomId)?.quantity !== a.quantity)) issues.push("Unverified hardware allowance/purchasing data differs from its source policy.");
    if (issues.length) return issues;
    if (document.template !== document.profile.template || document.projectionConvention !== document.profile.sheet.projectionConvention) return ["Drawing presentation differs from the GA profile binding."];
    const views = document.sheets.filter(s => s.id.startsWith("GA-")).flatMap(s => s.viewports);
    const expected = plan.views.filter(v => v.included);
    if (views.length !== expected.length || new Set(views.map(v => v.id)).size !== views.length) return ["GA view coverage is missing or duplicated."];
    const panels = source.components.filter(c => c.kind === "panel");
    for (const intent of expected) {
      const view = views.find(v => v.id === intent.id);
      if (!view || view.semanticViewId !== intent.id || view.projection !== intent.projection || view.role !== intent.role) { issues.push(`GA view does not match its semantic intent: ${intent.id}.`); continue; }
      if (view.presentationOffsets && Object.keys(view.presentationOffsets).length) issues.push(`Closed GA has unexpected presentation offsets: ${intent.id}.`);
      const references = view.references.map(r => [r.componentId, r.assemblyId]).sort();
      if (canonicalDrawingSnapshot(references) !== canonicalDrawingSnapshot(panels.map(p => [p.id, p.assemblyId]).sort())) issues.push(`GA view lost source occurrence references: ${intent.id}.`);
      const dimensions = presentGADimensions(plan, intent.projection);
      const semanticFields = (d: typeof dimensions[number]) => ({ id: d.id, semanticDimensionId: d.semanticDimensionId, from: d.from, to: d.to, axis: d.axis, valueMm: d.valueMm, prefix: d.prefix, references: d.references });
      if (canonicalDrawingSnapshot(view.dimensions.map(semanticFields)) !== canonicalDrawingSnapshot(dimensions.map(semanticFields))) issues.push(`GA dimension values or source anchors differ from the semantic plan: ${intent.id}.`);
      const geometry = intent.projection === "isometric" ? isometricLines(panels, plan.visibility.isometricMode) : orthographicLines(panels, intent.projection);
      // Coincident fragments retain the ID of whichever panel was visited first.
      // Compare exact geometry/membership, not that incidental representative ID.
      const normalise = (lines: typeof geometry) => lines.map(line => ({ kind: line.kind, from: line.from, to: line.to,
        references: [...line.references].sort((a, b) => a.componentId < b.componentId ? -1 : 1) })).sort((a, b) => {
          const x = canonicalDrawingSnapshot(a), y = canonicalDrawingSnapshot(b); return x < y ? -1 : x > y ? 1 : 0;
        });
      if (canonicalDrawingSnapshot(normalise(view.entities)) !== canonicalDrawingSnapshot(normalise(geometry)) || canonicalDrawingSnapshot(view.bounds) !== canonicalDrawingSnapshot(bounds2(geometry.flatMap(e => [e.from, e.to])))) issues.push(`GA projected geometry differs from its bound source: ${intent.id}.`);
    }
    return issues;
  } catch (error) { return [error instanceof Error ? error.message : "GA document validation failed."]; }
}

export function assertGADocument(document: DrawingDocument): void {
  const issues = validateGADocument(document);
  if (issues.length) throw new Error(issues.join(" "));
}
