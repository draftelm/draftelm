import type { FurnitureResult } from "../furniture";
import { compactPanelPropertyNotes, createManufacturingSchedule, createPanelManufacturingDocument, createPanelTopology, panelLocalToWorld, panelPropertyNotes, panelPresentationFingerprint, validatePanelManufacturingDocument } from "../manufacturing";
import type { ManufacturingScheduleRow, PanelManufacturingDocument, PanelManufacturingProperties } from "../manufacturing";
import type { ComponentDimensionPlan } from "./planning/componentTypes";
import type { DrawingDocument, DrawingProfile, DrawingSheet, DrawingTable, DrawingViewport, PlotEntity, Point2, Rect } from "./types";
import { componentFaceViewport } from "./planning/componentDimensions";
import { placeComponentDimensions, componentDimensionCollisions } from "./componentDimensionLayout";
import { positionViewport } from "./viewports";
import { modelToSheet } from "./dimensionPlot";
import { containsRect, overlaps, primitiveBounds } from "./annotationGeometry";
import { drawingRegion, titleBlockExtraHeight, wrapDrawingText } from "./layout";
import { canonicalDrawingSnapshot } from "./planning/gaPlan";
import { manufacturingFaceBadge, orientManufacturingViewport, projectPanelLocal, treatmentKey } from "./manufacturingAnnotations";
import type { ManufacturingFaceView } from "./manufacturingAnnotations";
import { catalogueLegendRows } from "./catalogueLegend";
import { hasSyntheticCatalogue } from "../manufacturing";
import { manufacturingOutput } from "./manufacturingOutput";

export interface ManufacturingDrawingInput { properties: PanelManufacturingDocument; requestedPanelIds: string[]; syntheticExample: boolean; panelViews?: Record<string, ManufacturingFaceView> }
export interface ManufacturingDrawingBinding extends ManufacturingDrawingInput { rows: ManufacturingScheduleRow[] }
export type ManufacturingSheetFactory = (id: string, subject: string, number: number, views: DrawingViewport[]) => DrawingSheet;

/** Readable paper text never scales with model geometry. Quantity is printed once
 * on fragmented rows, with all ten logical fields and occurrence IDs retained. */
export function paginateManufacturingTable(columns: { label: string; width: number }[], rows: { id: string; cells: string[] }[], frame: Rect, quantityColumn = -1): DrawingTable[] {
  const fontSize = 2.5, lineHeight = 3.2;
  const headerHeight = Math.max(...columns.map(c => wrapDrawingText(c.label, c.width - 4, fontSize).length)) * lineHeight + 4;
  const maxLines = Math.floor((frame.height - headerHeight - 4) / lineHeight);
  if (maxLines < 1) throw new Error("Manufacturing table has no space for readable rows.");
  const tables: DrawingTable[] = []; let fragments: DrawingTable["rows"] = [], used = headerHeight;
  const flush = () => { if (fragments.length) tables.push({ frame: { ...frame }, columns, rows: fragments, fontSize, lineHeight, headerHeight }); fragments = []; used = headerHeight; };
  for (const row of rows) {
    const cells = row.cells.map((v, i) => wrapDrawingText(v, columns[i].width - 4, fontSize));
    const count = Math.max(...cells.map(c => c.length));
    for (let start = 0; start < count; start += maxLines) {
      const fragment = cells.map(c => c.slice(start, start + maxLines));
      if (start && quantityColumn >= 0) fragment[quantityColumn] = [];
      const height = Math.max(1, ...fragment.map(c => c.length)) * lineHeight + 4;
      if (used + height > frame.height + 1e-8) flush();
      fragments.push({ bomId: row.id, continuation: start > 0, cells: fragment, height }); used += height;
    }
  }
  flush(); return tables;
}
export function manufacturingScheduleTables(rows: ManufacturingScheduleRow[], page: { width: number; height: number }): DrawingTable[] {
  const labels = ["Part number", "Description / occurrence", "Qty", "L x W x T (mm)", "Material / code", "Grain direction", "Edge banding / treatments", "Finished dimensions", "Surface finish", "Manufacturing notes"];
  const fractions = [28, 65, 12, 40, 45, 28, 50, 30, 44, 58].map(w => w / 400), width = page.width - 20;
  return paginateManufacturingTable(labels.map((label, i) => ({ label, width: width * fractions[i] })), rows, { x: 10, y: 26, width, height: page.height - 90 }, 2);
}
export function plotManufacturingTable(table: DrawingTable): PlotEntity[] {
  const out: PlotEntity[] = []; let y = table.frame.y;
  const row = (cells: string[][], height: number, sourceId: string, bold = false) => {
    let x = table.frame.x;
    table.columns.forEach((c, i) => {
      const p = [{ x, y }, { x: x + c.width, y }, { x: x + c.width, y: y + height }, { x, y: y + height }];
      p.forEach((from, j) => out.push({ kind: "line", from, to: p[(j + 1) % 4], width: 0.18, strokeRole: "table", role: "annotation", sourceId }));
      cells[i].forEach((text, j) => out.push({ kind: "text", at: { x: x + 2, y: y + 2 + table.fontSize + j * table.lineHeight }, text, size: table.fontSize, bold, sourceId })); x += c.width;
    }); y += height;
  };
  row(table.columns.map(c => wrapDrawingText(c.label, c.width - 4, table.fontSize)), table.headerHeight, "manufacturing-table-header", true);
  table.rows.forEach(r => row(r.cells, r.height, r.bomId)); return out;
}

/** Map actual local topology through world coordinates onto the established
 * component display axes. Signed/reversed frames cannot silently swap edges. */
export function manufacturingPanelInk(source: FurnitureResult, p: PanelManufacturingProperties, plan: ComponentDimensionPlan, view: DrawingViewport): PlotEntity[] {
  const panel = source.components.find(c => c.kind === "panel" && c.id === p.componentId)!; if (panel.kind !== "panel") throw new Error("Missing manufacturing panel.");
  const group = plan.groups.find(g => g.componentIds.includes(p.componentId))!, occurrence = group.occurrences.find(o => o.componentId === p.componentId)!, topology = createPanelTopology(panel, p.orientation);
  const map = (local: { u: number; v: number; t: number }): Point2 => { if (view.manufacturingFaceView) return modelToSheet(view, projectPanelLocal(topology, view.manufacturingFaceView, local)); const w = panelLocalToWorld(topology.frame, local); return modelToSheet(view, { x: w[occurrence.displayAxes.horizontal] - panel.position[occurrence.displayAxes.horizontal], y: w[occurrence.displayAxes.vertical] - panel.position[occurrence.displayAxes.vertical] }); };
  const low = modelToSheet(view, view.bounds.min), high = modelToSheet(view, view.bounds.max);
  const image = { x: low.x, y: high.y, width: high.x - low.x, height: low.y - high.y }, out: PlotEntity[] = [];
  const reserve: Rect[] = [];
  const keyed = view.keyedManufacturingAnnotations;
  let grainRegion: Rect | undefined;
  const g = p.grain, s = topology.frame.size, centerLocal = { u: s.u / 2, v: s.v / 2, t: 0 };
  const alongU = g.status !== "unassigned" && g.value.direction === "longitudinal", axis = alongU ? "u" : "v", paperSpan = s[axis] * view.scale;
  const arrowLength = keyed ? Math.min(28, Math.max(5, paperSpan * 0.35), paperSpan - 1.5) : Math.min(18, paperSpan * 0.35);
  const grainA = map({ ...centerLocal, [axis]: centerLocal[axis] - arrowLength / view.scale / 2 }), grainB = map({ ...centerLocal, [axis]: centerLocal[axis] + arrowLength / view.scale / 2 });
  if ((keyed || view.manufacturingFaceView) && g.status !== "unassigned" && g.value.direction !== "non-directional" && arrowLength >= 5) { const b = primitiveBounds({ kind: "line", from: grainA, to: grainB, width: 0.25, role: "annotation" }); grainRegion = { x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4 }; }
  const addText = (sourceId: string, text: string, at: Point2, rotation?: -90) => { const entity: PlotEntity = { kind: "text", sourceId, text, at, align: "middle", ...(rotation ? { rotation } : {}), size: keyed ? 3 : 2.5, references: view.references }; const box = primitiveBounds(entity); if (containsRect(image, box) && !(grainRegion && overlaps(grainRegion, box, 0.7)) && !reserve.some(r => overlaps(r, box, 0.7))) { out.push(entity); reserve.push(box); return true; } return false; };
  for (const e of topology.edges) {
    const a = map(e.localCorners[0]), b = map(e.localCorners[1]), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const verticalEdge = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
    const at = { x: keyed && verticalEdge ? mid.x < image.x + image.width / 2 ? image.x + 6 : image.x + image.width - 3.5 : Math.max(image.x + 9, Math.min(image.x + image.width - 9, mid.x)), y: Math.max(image.y + (keyed ? 7 : 4), Math.min(image.y + image.height - (keyed ? 4 : 2), mid.y)) };
    const assigned = p.edges.find(t => t.edgeId === e.id)!.treatment;
    const label = keyed ? `${treatmentKey(e.key)}${assigned.status !== "unassigned" && assigned.value.kind !== "none" ? " *" : ""}` : e.key;
    if (!addText(e.id, label, at, keyed && verticalEdge ? -90 : undefined) && keyed) for (const offset of [-16, 16, -24, 24]) { if (addText(e.id, label, { x: at.x + (verticalEdge ? 0 : offset), y: at.y + (verticalEdge ? offset : 0) }, verticalEdge ? -90 : undefined)) break; }
    const t = p.edges.find(t => t.edgeId === e.id)!.treatment;
    if (t.status !== "unassigned" && t.value.kind !== "none") {
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), inset = 1.2;
      if (length > 5) {
        const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 }, nx = Math.sign(center.x - mid.x) * (Math.abs(dy) > Math.abs(dx) ? inset : 0), ny = Math.sign(center.y - mid.y) * (Math.abs(dx) >= Math.abs(dy) ? inset : 0);
        out.push({ kind: "line", role: "annotation", strokeRole: keyed ? "edge-treatment" : "visible-outline", sourceId: `edging:${e.id}`, references: view.references, width: 0.35, from: { x: a.x + dx / length * 2 + nx, y: a.y + dy / length * 2 + ny }, to: { x: b.x - dx / length * 2 + nx, y: b.y - dy / length * 2 + ny } });
      }
    }
  }
  if (g.status !== "unassigned" && g.value.direction !== "non-directional") {
    if (arrowLength >= 5) {
      const a = grainA, b = grainB;
      const box = primitiveBounds({ kind: "line", from: a, to: b, width: 0.18, role: "annotation" });
      if (!reserve.some(r => overlaps(r, box, 1))) {
        out.push({ kind: "line", from: a, to: b, width: keyed ? 0.25 : 0.18, ...(keyed ? { strokeRole: "grain" as const } : {}), role: "annotation", sourceId: `grain:${p.componentId}`, references: view.references });
        const dx = (b.x - a.x) / arrowLength, dy = (b.y - a.y) / arrowLength, sense = g.value.sense;
        for (const [tip, sign] of ([[a, 1], [b, -1]] as const).filter(([, sign]) => sense === "either" || (sense === "positive" ? sign === -1 : sign === 1))) out.push({ kind: "polygon", sourceId: `grain:${p.componentId}`, references: view.references, points: [tip, { x: tip.x + sign * dx * 2 - dy * 0.7, y: tip.y + sign * dy * 2 + dx * 0.7 }, { x: tip.x + sign * dx * 2 + dy * 0.7, y: tip.y + sign * dy * 2 - dx * 0.7 }] });
        reserve.push({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 });
        const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
        addText(`grain:${p.componentId}`, `Grain ${alongU ? "U" : "V"} [${g.status === "provisional" ? "P" : "V"}]`, { x: (a.x + b.x) / 2 + (vertical ? 18 : 0), y: (a.y + b.y) / 2 - (vertical ? 0 : 4) });
      }
    }
  }
  if (keyed) { const badge = manufacturingFaceBadge(p, view.manufacturingFaceView); if (badge) addText(badge.sourceId, badge.text, { x: image.x + image.width / 2, y: image.y + 15 }); }
  return out;
}
export function buildManufacturingPanelSheets(source: FurnitureResult, plan: ComponentDimensionPlan, profile: DrawingProfile, input: ManufacturingDrawingInput, baseSheets: DrawingSheet[], page: { width: number; height: number }, factory: ManufacturingSheetFactory): DrawingSheet[] {
  if (typeof input.syntheticExample !== "boolean" || !Array.isArray(input.requestedPanelIds) || new Set(input.requestedPanelIds).size !== input.requestedPanelIds.length || input.requestedPanelIds.some(id => !input.properties.panels.some(p => p.componentId === id))) throw new Error("Manufacturing drawing scope must contain explicit existing panel IDs and a labelled example state.");
  if (input.panelViews !== undefined && (!input.panelViews || typeof input.panelViews !== "object" || Array.isArray(input.panelViews) || Object.entries(input.panelViews).some(([id, v]) => !input.properties.panels.some(p => p.componentId === id) || !v || Object.keys(v).some(k => !["face", "rotation"].includes(k)) || !["a", "b"].includes(v.face) || ![0, 90, 180, 270].includes(v.rotation)))) throw new Error("Invalid manufacturing face-view references.");
  const output = manufacturingOutput(profile);
  if (!profile.contents.componentDrawings || !output.propertyDrawings && !output.detailedTables) return [];
  const original = createPanelManufacturingDocument(source), ids = [...new Set([...input.requestedPanelIds, ...(output.panelScope === "selected-and-edited" ? input.properties.panels.filter(p => panelPresentationFingerprint(p) !== panelPresentationFingerprint(original.panels.find(r => r.componentId === p.componentId)!)).map(p => p.componentId) : [])])].sort();
  const sheets: DrawingSheet[] = [], body = drawingRegion(page), tableWidth = Math.min(190, body.width * 0.44), leftWidth = body.width - tableWidth - 6;
  for (const [i, id] of ids.entries()) {
    const p = input.properties.panels.find(p => p.componentId === id); if (!p) throw new Error(`Unknown manufacturing drawing occurrence: ${id}.`);
    if (!output.propertyDrawings) {
      const tables = paginateManufacturingTable([{ label: "Property / physical reference", width: body.width * 0.36 }, { label: "Value / verification state", width: body.width * 0.64 }], panelPropertyNotes(p).map((n, j) => ({ id: n.sourceId ?? `manufacturing-note:${id}:${j}`, cells: [n.label, n.text] })), body);
      tables.forEach((table, j) => {
        const next = factory(`MN-${String(i * 100 + j + 1).padStart(3, "0")}`, `Panel properties: ${id}`, 0, []);
        next.manufacturingComponentId = id; next.manufacturingTable = table;
        next.annotations = ["Detailed table only; physical panel map hidden by profile. P = provisional; V = supplied record only.", "No manufacturing or purchasing approval. Finished dimensions: Not specified."];
        sheets.push(next);
      });
      continue;
    }
    const group = plan.groups.find(g => g.componentIds.includes(id))!, occurrence = group.occurrences.find(o => o.componentId === id)!;
    const originalView = baseSheets.flatMap(s => s.viewports).find(v => v.projection === "panel-face" && !v.manufacturingComponentId && v.references.some(r => r.componentId === id));
    if (!originalView) throw new Error(`Missing nominal component drawing for ${id}.`);
    const scoped = { ...group, id: `manufacturing-panel:${encodeURIComponent(id)}`, representativeId: id, componentIds: [id], occurrences: [occurrence], quantity: source.components.find(c => c.id === id)!.quantity };
    let view = componentFaceViewport(plan, scoped, profile.contents.cuttingList.include);
    view = { ...view, id: scoped.id, label: "PHYSICAL PANEL / LOCAL FACE MAP", manufacturingComponentId: id, frame: { ...body, width: leftWidth }, annotations: [id, "A: local T=0; B: opposite broad face.", `U: ${p.orientation.u.sign > 0 ? "+" : "-"}${p.orientation.u.axis.toUpperCase()}; V: ${p.orientation.v.sign > 0 ? "+" : "-"}${p.orientation.v.axis.toUpperCase()}; T: ${p.orientation.normal.sign > 0 ? "+" : "-"}${p.orientation.normal.axis.toUpperCase()}.`, "REF dimensions repeat the nominal component measurements.", "Edge strips are symbols; no thickness deduction."], dimensions: view.dimensions.map(d => ({ ...d, prefix: "REF " })) };
    view.keyedManufacturingAnnotations = output.keyedAnnotations ?? false;
    if (input.panelViews?.[id]) { const physical = source.components.find(c => c.id === id)!; if (physical.kind !== "panel") throw new Error("Missing physical panel."); view = orientManufacturingViewport(view, physical, p, scoped, input.panelViews[id]); }
    if (output.keyedAnnotations) view.annotations.push("Edge keys: E1=u-min; E2=u-max; E3=v-min; E4=v-max. * = assigned treatment.", "Grain arrow = explicit local pattern; continuity is not inferred.");
    const unfitted = view;
    const retainScale = !view.manufacturingFaceView;
    if (!output.detailedTables) {
      const compact = compactPanelPropertyNotes(p);
      const text = compact.map(n => `${output.keyedAnnotations && ["u-min", "u-max", "v-min", "v-max"].includes(n.label) ? `${treatmentKey(n.label as "u-min")} (${n.label})` : n.label}: ${n.text}`);
      const base = { ...unfitted, noteTextSizeMm: 2.5 as const, frame: body };
      let continuation = false;
      try {
        view = placeComponentDimensions(positionViewport({ ...base, annotations: [...base.annotations, ...text, "Compact summary; detailed process/material fields retained in source properties and optional tables."] }, originalView.scale));
        continuation = (retainScale && Math.abs(view.scale - originalView.scale) > 1e-12) || !!view.componentDimensionLayout!.diagnostics.length;
      } catch (error) {
        // A long note band can exhaust the region before scale fitting starts.
        // Move those notes to a readable continuation instead of failing export.
        if (!(error instanceof Error) || error.message !== "Sheet viewport cannot fit geometry.") throw error;
        continuation = true;
      }
      if (continuation) view = placeComponentDimensions(positionViewport({ ...base, annotations: [...base.annotations, `Compact notes: MN-${String(i * 100 + 1).padStart(3, "0")}.`] }, originalView.scale));
      if ((retainScale && Math.abs(view.scale - originalView.scale) > 1e-12) || view.componentDimensionLayout!.diagnostics.length) throw new Error(`Manufacturing panel ${id} cannot retain its nominal scale readably.`);
      view.manufacturingInk = manufacturingPanelInk(source, p, plan, view);
      const main = factory(`MP-${String(i + 1).padStart(3, "0")}`, `Manufacturing panel: ${id}`, 0, [view]);
      main.manufacturingComponentId = id;
      main.annotations = ["Compact property presentation; full source-bound properties retained. P = provisional; V = supplied record only.", "No manufacturing or purchasing approval. Finished dimensions: Not specified."];
      sheets.push(main);
      if (continuation) paginateManufacturingTable([{ label: "Property", width: body.width * 0.3 }, { label: "Value / status", width: body.width * 0.7 }], compact.map((n, j) => ({ id: n.sourceId ?? `manufacturing-note:${id}:${j}`, cells: [n.label, n.text] })), body).forEach((table, j) => {
        const next = factory(`MN-${String(i * 100 + j + 1).padStart(3, "0")}`, `Compact properties: ${id}`, 0, []);
        next.manufacturingComponentId = id; next.manufacturingTable = table; next.annotations = main.annotations; sheets.push(next);
      });
      continue;
    }
    view = placeComponentDimensions(positionViewport(view, originalView.scale));
    const fullPage = (retainScale && Math.abs(view.scale - originalView.scale) > 1e-12) || !!view.componentDimensionLayout!.diagnostics.length;
    if (fullPage) view = placeComponentDimensions(positionViewport({ ...unfitted, annotations: [...unfitted.annotations, `Full property table: MN-${String(i * 100 + 1).padStart(3, "0")}.`], frame: body }, originalView.scale));
    if ((retainScale && Math.abs(view.scale - originalView.scale) > 1e-12) || view.componentDimensionLayout!.diagnostics.length) throw new Error(`Manufacturing panel ${id} cannot retain its nominal scale readably at this sheet size.`);
    view.manufacturingInk = manufacturingPanelInk(source, p, plan, view);
    const tableFrame = fullPage ? { ...body } : { x: body.x + leftWidth + 6, y: body.y, width: tableWidth, height: body.height };
    const tables = paginateManufacturingTable([{ label: "Property / physical reference", width: tableFrame.width * 0.36 }, { label: "Value / verification state", width: tableFrame.width * 0.64 }], panelPropertyNotes(p).map((n, j) => ({ id: n.sourceId ?? `manufacturing-note:${id}:${j}`, cells: [n.label, n.text] })), tableFrame);
    const main = factory(`MP-${String(i + 1).padStart(3, "0")}`, `Manufacturing panel: ${id}`, 0, [view]);
    main.manufacturingComponentId = id;
    main.annotations = ["P = provisional / unverified. V = supplied verification record only. No manufacturing or purchasing approval.", "Finished dimensions: Not specified. No treatment allowances or manufacturing processes validated."];
    if (!fullPage) main.manufacturingTable = tables[0];
    sheets.push(main);
    tables.slice(fullPage ? 0 : 1).forEach((table, j) => {
      const sheet = factory(`MN-${String(i * 100 + j + 1).padStart(3, "0")}`, `Properties continuation: ${id}`, 0, []);
      sheet.manufacturingComponentId = id; sheet.manufacturingTable = table; sheet.annotations = [...main.annotations]; sheets.push(sheet);
    });
  }
  return sheets;
}
export function buildCatalogueLegendSheets(profile: DrawingProfile, properties: PanelManufacturingDocument, page: { width: number; height: number }, factory: ManufacturingSheetFactory): DrawingSheet[] {
  if (!manufacturingOutput(profile).catalogueLegend) return [];
  const body = drawingRegion(page);
  return paginateManufacturingTable([{ label: "Pinned library reference", width: body.width * 0.32 }, { label: "Definition / supplied status", width: body.width * 0.68 }], catalogueLegendRows(properties), body).map((table, i) => {
    const sheet = factory(`LC-${String(i + 1).padStart(3, "0")}`, "Manufacturing library definitions - pinned preliminary snapshots", 0, []);
    sheet.table = table; sheet.annotations = ["L references are document library keys, not part numbers. Pinned versions do not update automatically.", "Library evidence is not panel approval. No manufacturing, finished-size or purchasing approval."]; return sheet;
  });
}
export function validateManufacturingDrawings(document: DrawingDocument, source: FurnitureResult): string[] {
  const input = document.manufacturing;
  if (!input) return document.profile.contents.panelManufacturing || document.sheets.some(s => s.manufacturingComponentId || (s.id.startsWith("MS-") || s.id.startsWith("LC-"))) ? ["Missing bound manufacturing properties; regenerate the drawing package."] : [];
  const validation = validatePanelManufacturingDocument(input.properties, source);
  if (!validation.valid) return ["Manufacturing properties are stale or invalid; regenerate after review."];
  if (hasSyntheticCatalogue(input.properties) && !input.syntheticExample) return ["Synthetic catalogue selections must retain the labelled example state."];
  const rows = createManufacturingSchedule(source, input.properties);
  if (canonicalDrawingSnapshot(rows) !== canonicalDrawingSnapshot(input.rows)) return ["Manufacturing schedule differs from its bound properties/source."];
  const first = document.sheets[0], page = { width: first.widthMm, height: first.heightMm - titleBlockExtraHeight(document.profile.titleBlock) };
  const factory: ManufacturingSheetFactory = (id, subject, number, views) => ({ ...first, id, metadata: { ...first.metadata, subject, number }, annotations: [], viewports: views, manufacturingComponentId: undefined, manufacturingTable: undefined, table: undefined });
  const expected = buildManufacturingPanelSheets(source, document.componentDimensionPlan, document.profile, input, document.sheets, page, factory);
  const actual = document.sheets.filter(s => s.manufacturingComponentId);
  const core = (s: DrawingSheet) => ({ id: s.id, subject: s.metadata.subject, componentId: s.manufacturingComponentId, table: s.manufacturingTable, views: s.viewports, annotations: s.annotations });
  const issues: string[] = [];
  if (canonicalDrawingSnapshot(actual.map(core)) !== canonicalDrawingSnapshot(expected.map(core))) issues.push("Manufacturing panel views, properties or annotation placement differ from the bound plan.");
  const tables = document.profile.contents.cuttingList.include && manufacturingOutput(document.profile).schedule ? manufacturingScheduleTables(rows, page) : [];
  const actualTables = document.sheets.filter(s => s.id.startsWith("MS-"));
  if (canonicalDrawingSnapshot(actualTables.map(s => s.table)) !== canonicalDrawingSnapshot(tables)) issues.push("Manufacturing schedule pagination/coverage differs from the bound rows.");
  const expectedLibrary = buildCatalogueLegendSheets(document.profile, input.properties, page, factory);
  const actualLibrary = document.sheets.filter(s => s.id.startsWith("LC-"));
  const libraryCore = (s: DrawingSheet) => ({ id: s.id, subject: s.metadata.subject, table: s.table, annotations: s.annotations });
  if (canonicalDrawingSnapshot(actualLibrary.map(libraryCore)) !== canonicalDrawingSnapshot(expectedLibrary.map(libraryCore))) issues.push("Catalogue legend differs from its pinned property definitions.");
  for (const sheet of actual) {
    for (const view of sheet.viewports) {
      issues.push(...componentDimensionCollisions(view));
      if (view.manufacturingInk?.some(e => !containsRect(view.frame, primitiveBounds(e)))) issues.push(`Manufacturing symbols clip the physical panel view: ${view.id}.`);
    }
    if (sheet.manufacturingTable) {
      const tableInk = plotManufacturingTable(sheet.manufacturingTable);
      if (tableInk.some(e => !containsRect({ ...drawingRegion(page), width: page.width - 20 + 1e-6, height: page.height - 87 + 1e-6 }, primitiveBounds(e)))) issues.push(`Manufacturing property table clips the usable sheet: ${sheet.id}.`);
    }
  }
  return issues;
}
