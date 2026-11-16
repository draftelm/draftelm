import type { FurnitureResult, PanelComponent } from "../furniture";
import type { Bounds2, DrawingDimension, DrawingOptions, DrawingProfile, DrawingProfileV1, DrawingResult, DrawingSheet, DrawingViewport, Point2, Projection, ProjectionConvention, Rect, SheetFormat } from "./types";
import { bounds2, bounds3, isometricLines, orthographicLines, panelReference } from "./projections";
import { paginateSchedule, titleBlockExtraHeight, viewportPadding } from "./layout";
import { createComponentSchedule, reconcileDrawingParts } from "./reconcile";
import { getDrawingProfile, parseDrawingProfile, profileFromOptions } from "./profiles";
import { createDrawingAnnotations, placeComponentBalloons, validateDrawingAnnotations } from "./annotations";
import { planAssemblyPartsList } from "./assemblyPartsList";

export const FORMAL_TEMPLATE_LABEL = "BS 8888 / ISO-style — compliance not yet verified";
export const SHEET_FORMATS: Record<SheetFormat, { width: number; height: number }> = { A4: { width: 297, height: 210 }, A3: { width: 420, height: 297 }, A2: { width: 594, height: 420 }, A1: { width: 841, height: 594 } };
export const DEFAULT_DRAWING_OPTIONS: DrawingOptions = { template: "workshop", projectionConvention: "third-angle", format: "A3", projectName: "DRAFTELM", drawingPrefix: "DRF-CD", revision: "A" };
export const VIEW_PADDING = { left: 25, right: 8, top: 7, bottom: 13 };

/** Largest conventional reduction that fits; no stretching and no rounding of model data. */
export function fitScale(bounds: Bounds2, frame: Rect, padding = VIEW_PADDING): number {
  const max = Math.min(1, (frame.width - padding.left - padding.right) / (bounds.max.x - bounds.min.x), (frame.height - padding.top - padding.bottom) / (bounds.max.y - bounds.min.y));
  if (!(max > 0) || !Number.isFinite(max)) throw new Error("Sheet viewport cannot fit geometry.");
  for (let decade = 1; decade <= 1e15; decade *= 10) for (const factor of [1, 2, 2.5, 5]) {
    const scale = 1 / (decade * factor); if (scale <= max + 1e-12) return scale;
  }
  throw new Error("Model is too large for supported drawing scales.");
}
export function scaleLabel(scale: number) { return `1:${Number((1 / scale).toFixed(6))}`; }
export function positionViewport(view: DrawingViewport, scale = fitScale(view.bounds, view.frame, viewportPadding(view))): DrawingViewport {
  // Recheck the actual scale label as it can wrap onto another heading line.
  const labelled = { ...view, scaleLabel: scaleLabel(scale) };
  const fittedScale = Math.min(scale, fitScale(view.bounds, view.frame, viewportPadding(labelled)));
  if (fittedScale !== scale) return positionViewport(view, fittedScale);
  const f = view.frame, b = view.bounds, p = viewportPadding(labelled);
  const center = { x: f.x + p.left + (f.width - p.left - p.right) / 2, y: f.y + p.top + (f.height - p.top - p.bottom) / 2 };
  return { ...view, scale, scaleLabel: scaleLabel(scale), origin: { x: center.x - (b.min.x + b.max.x) / 2 * scale, y: center.y + (b.min.y + b.max.y) / 2 * scale } };
}
export function gaFrames(width: number, height: number, convention: ProjectionConvention): Record<Projection, Rect> {
  const cellWidth = (width - 20) / 2, cellHeight = (height - 85) / 2;
  const cell = (col: number, row: number): Rect => ({ x: 10 + col * cellWidth, y: 23 + row * cellHeight, width: cellWidth, height: cellHeight });
  return convention === "third-angle" ? { front: cell(0, 1), top: cell(0, 0), right: cell(1, 1), isometric: cell(1, 0) } : { front: cell(1, 0), top: cell(1, 1), right: cell(0, 0), isometric: cell(0, 1) };
}
function viewport(id: string, label: string, projection: Projection, panels: PanelComponent[], frame: Rect): DrawingViewport {
  const entities = projection === "isometric" ? isometricLines(panels) : orthographicLines(panels, projection);
  return { id, label, projection, entities, dimensions: [], frame, bounds: bounds2(entities.flatMap(e => [e.from, e.to])), origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1", annotations: [], references: panels.map(p => panelReference(p)) };
}
const dim = (id: string, from: Point2, to: Point2, axis: DrawingDimension["axis"], valueMm: number, references: DrawingDimension["references"], prefix?: string): DrawingDimension => ({ id, from, to, axis, valueMm, offsetPaperMm: 9, references, ...(prefix ? { prefix } : {}) });

export function generateDrawingDocument(result: FurnitureResult, configuration: DrawingOptions | DrawingProfile | DrawingProfileV1 = getDrawingProfile()): DrawingResult {
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
    for (const row of componentSchedule) row.drawingItemLabel = drawingAnnotations.items.find(item => item.bomId === row.bomId)?.label;
    const cuttingList = componentSchedule.filter(row => row.kind === "panel");
    const hardwareAllowances = componentSchedule.filter(row => row.kind === "hardware").map(row => ({ ...row,
      verificationStatus: "unverified" as const, purchasingQuantity: 0 as const, purchasingEligible: false as const }));
    const omittedSections = [!contents.assemblyViews.length ? "assembly views" : contents.assemblyViews.length < 4 ? "some assembly views" : "",
      !contents.componentDrawings ? "component drawings" : "", !contents.cuttingList.include ? "cutting list" : "", !contents.hardwareSchedule ? "hardware schedule" : ""].filter(Boolean);
    const panels = result.components.filter(c => c.kind === "panel");
    const all = bounds3(panels), carcassAssembly = result.assemblies.find(a => a.id.endsWith("/carcass"));
    if (!carcassAssembly) throw new Error("Carcass assembly reference is missing.");
    const ids = new Set(carcassAssembly.componentIds), carcass = panels.filter(p => p.assemblyId === carcassAssembly.id && ids.has(p.id));
    const body = bounds3(carcass), page = SHEET_FORMATS[options.format];
    const layoutPage = { ...page, height: page.height - titleBlockExtraHeight(profile.titleBlock) };
    const partsListPlan = planAssemblyPartsList(drawingAnnotations, layoutPage, profile.annotations.assemblyPartsList, contents.assemblyViews.length > 0);
    const frames = gaFrames(partsListPlan.viewWidth, layoutPage.height, options.projectionConvention);
    const front = viewport("ga-front", "FRONT", "front", panels, frames.front), top = viewport("ga-top", "TOP", "top", panels, frames.top), right = viewport("ga-right", "RIGHT SIDE", "right", panels, frames.right);
    const iso = viewport("ga-isometric", "ISOMETRIC WIREFRAME", "isometric", panels, frames.isometric);
    iso.annotations = ["Parallel isometric projection; hidden edges not removed."];
    if (profile.annotations.balloons) for (const view of [front, top, right, iso]) view.balloonMargin = 16;
    front.dimensions = [
      dim("overall-width", { x: all.min.x, y: all.min.y }, { x: all.max.x, y: all.min.y }, "horizontal", all.max.x - all.min.x, front.references),
      dim("overall-height", { x: all.min.x, y: all.min.y }, { x: all.min.x, y: all.max.y }, "vertical", all.max.y - all.min.y, front.references),
    ];
    const nearest = panels.find(p => p.position.z === all.min.z)!;
    const rearmost = panels.find(p => p.position.z + p.dimensions.z === all.max.z)!;
    right.dimensions = [dim("overall-depth", { x: nearest.position.z, y: nearest.position.y },
      { x: rearmost.position.z + rearmost.dimensions.z, y: rearmost.position.y }, "horizontal", all.max.z - all.min.z,
      [panelReference(nearest), panelReference(rearmost)], "Overall ")];
    top.dimensions = [dim("carcass-depth", { x: body.min.x, y: body.min.z }, { x: body.min.x, y: body.max.z }, "vertical", body.max.z - body.min.z, carcass.map(p => panelReference(p)), "Carcass ")];
    const mainScale = Math.min(...[front, top, right].map(v => fitScale(v.bounds, v.frame, viewportPadding(v))));
    const views = [front, top, right].map(v => positionViewport(v, mainScale)); views.push(positionViewport(iso));
    const componentViews: DrawingViewport[] = [];
    // Use the engine's existing blank groups, retaining every carcass and drawer ID.
    for (const line of result.bom.filter(l => l.kind === "panel")) {
      const members = panels.filter(p => line.componentIds.includes(p.id)), p = members[0];
      if (!p || !line.cutSize) throw new Error("Panel BOM link is incomplete.");
      const faceAxes = (["x", "y", "z"] as const).filter(a => a !== p.thicknessAxis).sort((a, b) => p.dimensions[b] - p.dimensions[a]);
      const u = faceAxes[0], v = faceAxes[1], min = { x: p.position[u], y: p.position[v] }, max = { x: min.x + p.dimensions[u], y: min.y + p.dimensions[v] };
      const references = members.map(m => panelReference(m, line.id));
      const corners = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
      componentViews.push({ id: `component-${line.id}`, label: line.partNames.filter(name => members.some(m => m.name === name)).join(" / "), projection: "panel-face",
        entities: corners.map((from, i) => ({ kind: "line", id: `${line.id}-edge-${i}`, from, to: corners[(i + 1) % 4], references })),
        dimensions: [dim(`${line.id}-length`, min, { x: max.x, y: min.y }, "horizontal", p.dimensions[u], references), dim(`${line.id}-width`, min, { x: min.x, y: max.y }, "vertical", p.dimensions[v], references)],
        bounds: { min, max }, frame: { x: 0, y: 0, width: 0, height: 0 }, origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1", references,
        annotations: [`Qty ${line.quantity} | Thickness ${p.thickness} mm`,
          p.materialId.length <= 40 ? `Material: ${p.materialId}` : contents.cuttingList.include ? `Material: see ${line.id} in schedule.` : "Full material ID retained internally; cutting list hidden.",
          contents.cuttingList.include ? `All ${members.length} unique part IDs: ${line.id} in schedule.` : `BOM ${line.id}: ${members.length} IDs retained internally; list hidden.`, "Grain and edge treatment unspecified."],
      });
    }
    const reconciliation = reconcileDrawingParts(result, componentSchedule, componentViews);
    if (!reconciliation.valid) return { document: null, issues: reconciliation.issues.map(issue => issue.message) };
    const columns = Math.max(1, Math.min(3, Math.floor((page.width - 20) / 125)));
    const chunks = contents.componentDrawings ? Array.from({ length: Math.ceil(componentViews.length / columns) }, (_, i) => componentViews.slice(i * columns, (i + 1) * columns)) : [];
    const panelTables = contents.cuttingList.include ? paginateSchedule(cuttingList, layoutPage) : [];
    const hardwareTables = contents.hardwareSchedule ? paginateSchedule(hardwareAllowances, layoutPage) : [];
    const assemblyViews = views.filter(view => contents.assemblyViews.includes(view.projection as Projection));
    const gaScale = [assemblyViews.some(v => v.projection !== "isometric") ? `${scaleLabel(mainScale)} main` : "",
      assemblyViews.some(v => v.projection === "isometric") ? `iso ${views[3].scaleLabel}` : ""].filter(Boolean).join("; ");
    const total = (assemblyViews.length ? 1 : 0) + partsListPlan.continuations.length + chunks.length + panelTables.length + hardwareTables.length;
    const sheet = (id: string, subject: string, number: number, viewports: DrawingViewport[]): DrawingSheet => ({ id, format: options.format, widthMm: page.width, heightMm: page.height,
      metadata: { projectName: options.projectName, companyName: profile.titleBlock.companyName, additionalFields: profile.titleBlock.additionalFields,
        subject, drawingNumber: `${options.drawingPrefix}-${id}`, revision: options.revision, units: "mm", scale: id === "GA-001" ? gaScale : viewports.length ? "See individual views" : "Not to scale", number, total, status: "PRELIMINARY - NOT FOR MANUFACTURE" },
      viewports, annotations: [omittedSections.length ? "Configured subset; hidden sections remain reconciled internally. Not a manufacturing release." : "Nominal closed geometry only. No tolerances or manufacturing instructions supplied."] });
    const assemblyName = result.assemblies.find(a => a.id === carcassAssembly.parentId)?.name ?? "Furniture";
    const sheets: DrawingSheet[] = assemblyViews.length ? [sheet("GA-001", `${assemblyName} - General assembly`, 1, assemblyViews)] : [];
    const balloonPlacements = placeComponentBalloons(drawingAnnotations, result, assemblyViews, profile.annotations.balloons);
    if (sheets[0]) {
      sheets[0].balloons = balloonPlacements;
      sheets[0].assemblyPartsList = partsListPlan.onGA;
      const unplaced = drawingAnnotations.diagnostics.filter(d => d.itemKey).length;
      if (unplaced) sheets[0].annotations.push(`${unplaced} balloon requests unplaced: concealed edges or layout limits. All items remain listed internally.`);
      if (partsListPlan.continuations.length) sheets[0].annotations.push("Compact assembly parts list: see adjacent AP sheets.");
    }
    partsListPlan.continuations.forEach((table, index) => {
      const listSheet = sheet(`AP-${String(index + 1).padStart(3, "0")}`, "Assembly panel parts list", sheets.length + 1, []);
      listSheet.assemblyPartsList = table;
      listSheet.annotations = [contents.cuttingList.include ? "Same item numbers as GA balloons; nominal panels only. Complete cut sizes and IDs remain in the cutting list." : "Same GA item numbers; cutting list hidden. Full cut sizes and component IDs remain reconciled internally."];
      sheets.push(listSheet);
    });
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
      const fitted = chunk.map((v, i) => positionViewport({ ...v, frame: { x: 10 + i * (page.width - 20) / chunk.length, y: 28, width: (page.width - 20) / chunk.length, height: layoutPage.height - 100 } }));
      const carcassOnly = chunk.every(v => v.references.every(r => r.assemblyId === carcassAssembly.id));
      sheets.push(sheet(`CP-${String(index + 1).padStart(3, "0")}`, carcassOnly ? "Carcass components" : "Panel components", sheets.length + 1, fitted));
    });
    if (contents.cuttingList.placement === "after-components") addTables("CL", "Component schedule / nominal cutting list", panelTables);
    addTables("HW", "UNVERIFIED hardware allowances", hardwareTables);
    sheets.forEach((s, index) => {
      const [kind, localNumber] = s.id.split("-");
      const serial = String(profile.numbering.startAt + (profile.numbering.scheme === "sequential" ? index : Number(localNumber) - 1)).padStart(3, "0");
      s.metadata.number = index + 1;
      s.metadata.drawingNumber = `${options.drawingPrefix}-${profile.numbering.scheme === "sequential" ? serial : `${kind}-${serial}`}`;
    });
    const annotationIssues = validateDrawingAnnotations(result, drawingAnnotations, sheets);
    if (annotationIssues.length) return { document: null, issues: annotationIssues };
    return { document: { schemaVersion: 1, specificationRevision: result.specificationRevision, template: options.template, projectionConvention: options.projectionConvention, standardsCandidate: "BS 8888:2025", complianceVerified: false, manufacturingReady: false, sheets, componentSchedule, cuttingList, reconciliation, drawingAnnotations, profile,
      output: { assemblyViews: [...contents.assemblyViews], componentDrawings: contents.componentDrawings, cuttingList: contents.cuttingList.include, hardwareSchedule: contents.hardwareSchedule, omittedSections },
      hardware: { allowances: hardwareAllowances, approvedPurchasingItems: [], policy: "approved-only" } }, issues: [] };
  } catch (error) { return { document: null, issues: [error instanceof Error ? error.message : "Drawing generation failed."] }; }
}
