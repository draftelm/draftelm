import { fitScale, positionViewport, scaleLabel } from "./viewports";
export { fitScale, positionViewport, scaleLabel, VIEW_PADDING } from "./viewports";
import type { FurnitureResult, PanelComponent } from "../furniture";
import type { DrawingOptions, DrawingProfile, DrawingProfileV1, DrawingProfileV2, DrawingResult, DrawingSheet, DrawingViewport, Projection, ProjectionConvention, Rect, SheetFormat } from "./types";
import { bounds2, isometricLines, orthographicLines, panelReference } from "./projections";
import { paginateSchedule, titleBlockExtraHeight, viewportPadding } from "./layout";
import { createComponentSchedule, reconcileDrawingParts } from "./reconcile";
import { getDrawingProfile, parseDrawingProfile, profileFromOptions } from "./profiles";
import { createDrawingAnnotations, placeComponentBalloons, validateDrawingAnnotations } from "./annotations";
import { planAssemblyPartsList } from "./assemblyPartsList";
import { createGeneralAssemblyPlan, presentGADimensions, validateGeneralAssemblyPlan } from "./planning/gaPlan";
import { layoutGAViews } from "./planning/gaLayout";
import { validateGADocument } from "./planning/gaValidation";
import type { GeneralAssemblyPlan } from "./planning/types";
import { createAssemblyDrawingPlan } from "./planning/assemblies";
import { createScopedAnnotations } from "./assemblyAnnotations";
import { buildAssemblySheets } from "./assemblySheets";
import { componentFaceViewport, createComponentDimensionPlan } from "./planning/componentDimensions";
import { componentDimensionCoverage, fitComponentDimensions } from "./componentDimensionLayout";

export const FORMAL_TEMPLATE_LABEL = "BS 8888 / ISO-style — compliance not yet verified";
export const SHEET_FORMATS: Record<SheetFormat, { width: number; height: number }> = { A4: { width: 297, height: 210 }, A3: { width: 420, height: 297 }, A2: { width: 594, height: 420 }, A1: { width: 841, height: 594 } };
export const DEFAULT_DRAWING_OPTIONS: DrawingOptions = { template: "workshop", projectionConvention: "third-angle", format: "A3", projectName: "DRAFTELM", drawingPrefix: "DRF-CD", revision: "A" };

export function gaFrames(width: number, height: number, convention: ProjectionConvention): Record<Projection, Rect> {
  const cellWidth = (width - 20) / 2, cellHeight = (height - 85) / 2;
  const cell = (col: number, row: number): Rect => ({ x: 10 + col * cellWidth, y: 23 + row * cellHeight, width: cellWidth, height: cellHeight });
  return convention === "third-angle" ? { front: cell(0, 1), top: cell(0, 0), right: cell(1, 1), isometric: cell(1, 0) } : { front: cell(1, 0), top: cell(1, 1), right: cell(0, 0), isometric: cell(0, 1) };
}
function viewport(id: string, label: string, projection: Projection, panels: PanelComponent[], frame: Rect, mode: DrawingProfile["sheet"]["isometricMode"] = "visible-edges"): DrawingViewport {
  const entities = projection === "isometric" ? isometricLines(panels, mode) : orthographicLines(panels, projection);
  return { id, label, projection, entities, dimensions: [], frame, bounds: bounds2(entities.flatMap(e => [e.from, e.to])), origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1", annotations: [], references: panels.map(p => panelReference(p)) };
}


export function generateDrawingDocument(result: FurnitureResult, configuration: DrawingOptions | DrawingProfile | DrawingProfileV1 | DrawingProfileV2 = getDrawingProfile(), reusablePlan?: GeneralAssemblyPlan): DrawingResult {
  try {
    const parsed = parseDrawingProfile("schemaVersion" in configuration ? configuration : profileFromOptions(configuration));
    if (!parsed.profile) return { document: null, issues: parsed.issues };
    const profile = parsed.profile, contents = profile.contents;
    const options: DrawingOptions = { template: profile.template, ...profile.sheet, projectName: profile.titleBlock.projectName,
      drawingPrefix: profile.numbering.prefix, revision: profile.numbering.revision };
    if (!result.geometryValid) throw new Error("Drawing withheld: engineering geometry is invalid.");
    if (!SHEET_FORMATS[options.format] || !["workshop", "engineering"].includes(options.template) || !["first-angle", "third-angle"].includes(options.projectionConvention)) throw new Error("Unsupported drawing configuration.");
    for (const text of [options.projectName, options.drawingPrefix, options.revision]) if (!text.trim() || text.length > 60) throw new Error("Drawing metadata must be non-empty and no longer than 60 characters.");
    const sourceCheck = reconcileDrawingParts(result);
    if (!sourceCheck.valid) return { document: null, issues: sourceCheck.issues.map(issue => issue.message) };
    const componentSchedule = createComponentSchedule(result);
    const drawingAnnotations = createDrawingAnnotations(result, profile.annotations);
    if (reusablePlan) {
      const stale = validateGeneralAssemblyPlan(reusablePlan, result, profile, drawingAnnotations);
      if (stale.length) return { document: null, issues: stale };
    }
    const planned = createGeneralAssemblyPlan(result, profile, drawingAnnotations);
    if (!planned.plan) return { document: null, issues: planned.issues };
    const gaPlan = planned.plan;
    const assemblyPlan = createAssemblyDrawingPlan(result, profile, gaPlan.source.rootAssemblyId, gaPlan.source.carcassAssemblyId);
    const gaScope = { kind: "general" as const, representativeId: assemblyPlan.rootId, assemblyIds: [assemblyPlan.rootId] };
    const gaAnnotations = profile.annotations.gaLevel === "assemblies" ? createScopedAnnotations(result, assemblyPlan, gaScope, profile.annotations) : drawingAnnotations;
    for (const row of componentSchedule) row.drawingItemLabel = drawingAnnotations.items.find(item => item.bomId === row.bomId)?.label;
    const cuttingList = componentSchedule.filter(row => row.kind === "panel");
    const hardwareAllowances = componentSchedule.filter(row => row.kind === "hardware").map(row => ({ ...row,
      verificationStatus: "unverified" as const, purchasingQuantity: 0 as const, purchasingEligible: false as const }));
    const omittedSections = [!contents.assemblyViews.length ? "assembly views" : contents.assemblyViews.length < 4 ? "some assembly views" : "",
      !contents.componentDrawings ? "component drawings" : "", !contents.cuttingList.include ? "cutting list" : "", !contents.hardwareSchedule ? "hardware schedule" : "",
      ...assemblyPlan.decisions.filter(d => !d.included).map(d => `${d.kind} assembly sheets`)].filter(Boolean);
    const panels = result.components.filter(c => c.kind === "panel");
    const carcassAssembly = result.assemblies.find(a => a.id === gaPlan.source.carcassAssemblyId);
    if (!carcassAssembly) throw new Error("Carcass assembly reference is missing.");
    const page = SHEET_FORMATS[options.format];
    const layoutPage = { ...page, height: page.height - titleBlockExtraHeight(profile.titleBlock) };
    const gaLayout = layoutGAViews(gaPlan, layoutPage, options.projectionConvention), frames = gaLayout.frames;
    const partsListPlan = planAssemblyPartsList(gaAnnotations, layoutPage, profile.annotations.assemblyPartsList, contents.assemblyViews.length > 0, gaLayout.partsListSlot);
    const front = viewport("ga-front", "FRONT", "front", panels, frames.front), top = viewport("ga-top", "TOP", "top", panels, frames.top), right = viewport("ga-right", "RIGHT SIDE", "right", panels, frames.right);
    const diagnostic = gaPlan.visibility.isometricMode === "diagnostic-wireframe";
    const iso = viewport("ga-isometric", diagnostic ? "ISOMETRIC - DIAGNOSTIC WIREFRAME" : "ISOMETRIC", "isometric", panels, frames.isometric, gaPlan.visibility.isometricMode);
    iso.annotations = [diagnostic ? "DIAGNOSTIC ONLY: transparent wireframe; hidden edges not removed." : "Parallel isometric; solid panel hidden edges removed."];
    for (const view of [front, top, right, iso]) {
      const intent = gaPlan.views.find(v => v.id === view.id)!;
      view.semanticViewId = intent.id; view.role = intent.role;
      view.dimensions = presentGADimensions(gaPlan, intent.projection);
    }
    if (profile.annotations.balloons) for (const view of [front, top, right, iso]) view.balloonMargin = 16;
    const mainScale = Math.min(...[front, top, right].map(v => fitScale(v.bounds, v.frame, viewportPadding(v))));
    const views = [front, top, right].map(v => positionViewport(v, mainScale)); views.push(positionViewport(iso));
    const componentDimensionPlan = createComponentDimensionPlan(result, profile);
    // Keep existing BOM ordering/pagination; identities and values come from the semantic plan.
    const componentViews = result.bom.filter(line => line.kind === "panel").map(line =>
      componentFaceViewport(componentDimensionPlan, componentDimensionPlan.groups.find(g => g.bomId === line.id)!, contents.cuttingList.include));
    const reconciliation = reconcileDrawingParts(result, componentSchedule, componentViews);
    if (!reconciliation.valid) return { document: null, issues: reconciliation.issues.map(issue => issue.message) };
    const columns = Math.max(1, Math.min(3, Math.floor((page.width - 20) / 125)));
    const chunks = contents.componentDrawings ? Array.from({ length: Math.ceil(componentViews.length / columns) }, (_, i) => componentViews.slice(i * columns, (i + 1) * columns)) : [];
    const panelTables = contents.cuttingList.include ? paginateSchedule(cuttingList, layoutPage) : [];
    const hardwareTables = contents.hardwareSchedule ? paginateSchedule(hardwareAllowances, layoutPage) : [];
    const assemblyViews = views.filter(view => contents.assemblyViews.includes(view.projection as Projection));
    const gaScale = [assemblyViews.some(v => v.projection === "isometric") ? `iso ${views[3].scaleLabel} primary` : "",
      assemblyViews.some(v => v.projection !== "isometric") ? `${scaleLabel(mainScale)} orthographic` : ""].filter(Boolean).join("; ");
    const total = (assemblyViews.length ? 1 : 0) + partsListPlan.continuations.length + chunks.length + panelTables.length + hardwareTables.length;
    const sheet = (id: string, subject: string, number: number, viewports: DrawingViewport[]): DrawingSheet => ({ id, format: options.format, widthMm: page.width, heightMm: page.height,
      metadata: { projectName: options.projectName, companyName: profile.titleBlock.companyName, additionalFields: profile.titleBlock.additionalFields,
        subject, drawingNumber: `${options.drawingPrefix}-${id}`, revision: options.revision, units: "mm", scale: id === "GA-001" ? gaScale : viewports.length ? "See individual views" : "Not to scale", number, total, status: "PRELIMINARY - NOT FOR MANUFACTURE" },
      viewports, annotations: [omittedSections.length ? "Configured subset; hidden sections remain reconciled internally. Not a manufacturing release." : "Nominal closed geometry only. No tolerances or manufacturing instructions supplied."] });
    const assemblyName = result.assemblies.find(a => a.id === carcassAssembly.parentId)?.name ?? "Furniture";
    const sheets: DrawingSheet[] = assemblyViews.length ? [sheet("GA-001", `${assemblyName} - General assembly`, 1, assemblyViews)] : [];
    const balloonPlacements = placeComponentBalloons(gaAnnotations, result, assemblyViews, profile.annotations.balloons);
    if (sheets[0]) {
      if (gaAnnotations.groupingPolicy === "assembly-scope-v1") { sheets[0].annotationModel = gaAnnotations; sheets[0].assemblyScope = gaScope; }
      if (gaPlan.coverage.missingDimensionIds.length) sheets[0].annotations[0] = `Preliminary subset: ${gaPlan.coverage.displayedDimensionIds.length}/4 nominal GA dimensions displayed; see plan coverage.`;
      sheets[0].balloons = balloonPlacements;
      sheets[0].assemblyPartsList = partsListPlan.onGA;
      const unplaced = gaAnnotations.diagnostics.filter(d => d.itemKey).length;
      if (unplaced) sheets[0].annotations.push(`${unplaced} balloon requests unplaced: concealed edges or layout limits. All items remain listed internally.`);
      if (partsListPlan.continuations.length) sheets[0].annotations.push("Compact assembly parts list: see adjacent AP sheets.");
    }
    partsListPlan.continuations.forEach((table, index) => {
      const listSheet = sheet(`AP-${String(index + 1).padStart(3, "0")}`, "Assembly panel parts list", sheets.length + 1, []);
      listSheet.assemblyPartsList = table;
      if (gaAnnotations.groupingPolicy === "assembly-scope-v1") { listSheet.annotationModel = gaAnnotations; listSheet.assemblyScope = gaScope; }
      listSheet.annotations = [contents.cuttingList.include ? "Same item numbers as GA balloons; nominal panels only. Complete cut sizes and IDs remain in the cutting list." : "Same GA item numbers; cutting list hidden. Full cut sizes and component IDs remain reconciled internally."];
      sheets.push(listSheet);
    });
    sheets.push(...buildAssemblySheets(result, profile, assemblyPlan, layoutPage, sheet));
    const addTables = (prefix: string, subject: string, tables: ReturnType<typeof paginateSchedule>) => {
      tables.forEach((table, index) => {
        const scheduleSheet = sheet(`${prefix}-${String(index + 1).padStart(3, "0")}`, subject, sheets.length + 1, []);
        scheduleSheet.table = table;
        scheduleSheet.annotations = [prefix === "CL" ? "Nominal blanks only; no grain, edge treatment, cutting allowance or tolerance specified." : "UNVERIFIED demonstration allowances. Excluded from purchasing totals; no approved hardware quantities."];
        if (omittedSections.length) scheduleSheet.annotations.push("Configured subset; omitted sections remain internal.");
        sheets.push(scheduleSheet);
      });
    };
    if (contents.cuttingList.placement === "before-components") addTables("CL", "Component schedule / nominal cutting list", panelTables);
    chunks.forEach((chunk, index) => {
      const fitted = chunk.map((v, i) => fitComponentDimensions({ ...v, frame: { x: 10 + i * (page.width - 20) / chunk.length, y: 28, width: (page.width - 20) / chunk.length, height: layoutPage.height - 100 } }));
      const carcassOnly = chunk.every(v => v.references.every(r => r.assemblyId === carcassAssembly.id));
      const componentSheet = sheet(`CP-${String(index + 1).padStart(3, "0")}`, carcassOnly ? "Carcass components" : "Panel components", sheets.length + 1, fitted);
      const unplaced = fitted.flatMap(v => v.componentDimensionLayout!.diagnostics).length;
      componentSheet.annotations = [unplaced ? `Nominal blank dimensions: ${unplaced} placement diagnostics; see preview coverage. Thickness is normal to face.` : "Nominal blank dimensions; linked thickness is normal to face. No finished sizes or tolerances supplied."];
      sheets.push(componentSheet);
    });
    if (contents.cuttingList.placement === "after-components") addTables("CL", "Component schedule / nominal cutting list", panelTables);
    addTables("HW", "UNVERIFIED hardware allowances", hardwareTables);
    sheets.forEach((s, index) => {
      const [kind, localNumber] = s.id.split("-");
      const serial = String(profile.numbering.startAt + (profile.numbering.scheme === "sequential" ? index : Number(localNumber) - 1)).padStart(3, "0");
      s.metadata.number = index + 1;
      s.metadata.total = sheets.length;
      s.metadata.drawingNumber = `${options.drawingPrefix}-${profile.numbering.scheme === "sequential" ? serial : `${kind}-${serial}`}`;
    });
    const annotationIssues = validateDrawingAnnotations(result, drawingAnnotations, sheets);
    if (annotationIssues.length) return { document: null, issues: annotationIssues };
    const dimensionCoverage = componentDimensionCoverage(componentDimensionPlan, sheets.flatMap(s => s.viewports).filter(v => v.projection === "panel-face"), contents.componentDrawings);
    const document = { schemaVersion: 1 as const, specificationRevision: result.specificationRevision, template: options.template, projectionConvention: options.projectionConvention, standardsCandidate: "BS 8888:2025" as const, complianceVerified: false as const, manufacturingReady: false as const, sheets, componentSchedule, cuttingList, reconciliation, drawingAnnotations, gaPlan, assemblyPlan, componentDimensionPlan, componentDimensionCoverage: dimensionCoverage, profile,
      output: { assemblyViews: [...contents.assemblyViews], componentDrawings: contents.componentDrawings, cuttingList: contents.cuttingList.include, hardwareSchedule: contents.hardwareSchedule, assemblySheets: { ...contents.assemblySheets }, omittedSections },
      hardware: { allowances: hardwareAllowances, approvedPurchasingItems: [] as [], policy: "approved-only" as const } };
    const planIssues = validateGADocument(document);
    return planIssues.length ? { document: null, issues: planIssues } : { document, issues: [] };
  } catch (error) { return { document: null, issues: [error instanceof Error ? error.message : "Drawing generation failed."] }; }
}
