import type { FurnitureResult } from "../furniture";
import { createManufacturingSchedule, createPanelManufacturingDocument, createPanelTopology, panelLocalToWorld, panelPropertyNotes, panelPresentationFingerprint, validatePanelManufacturingDocument } from "../manufacturing";
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

export interface ManufacturingDrawingInput { properties: PanelManufacturingDocument; requestedPanelIds: string[]; syntheticExample: boolean }
export interface ManufacturingDrawingBinding extends ManufacturingDrawingInput { rows: ManufacturingScheduleRow[] }
type Factory = (id: string, subject: string, number: number, views: DrawingViewport[]) => DrawingSheet;

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
  const map = (local: { u: number; v: number; t: number }): Point2 => { const w = panelLocalToWorld(topology.frame, local); return modelToSheet(view, { x: w[occurrence.displayAxes.horizontal] - panel.position[occurrence.displayAxes.horizontal], y: w[occurrence.displayAxes.vertical] - panel.position[occurrence.displayAxes.vertical] }); };
  const low = modelToSheet(view, view.bounds.min), high = modelToSheet(view, view.bounds.max);
  const image = { x: low.x, y: high.y, width: high.x - low.x, height: low.y - high.y }, out: PlotEntity[] = [];
  const reserve: Rect[] = [];
  const addText = (sourceId: string, text: string, at: Point2) => { const entity: PlotEntity = { kind: "text", sourceId, text, at, align: "middle", size: 2.5, references: view.references }; const box = primitiveBounds(entity); if (containsRect(image, box) && !reserve.some(r => overlaps(r, box, 0.7))) { out.push(entity); reserve.push(box); return true; } return false; };
  for (const e of topology.edges) {
    const a = map(e.localCorners[0]), b = map(e.localCorners[1]), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const at = { x: Math.max(image.x + 9, Math.min(image.x + image.width - 9, mid.x)), y: Math.max(image.y + 4, Math.min(image.y + image.height - 2, mid.y)) };
    addText(e.id, e.key, at);
    const t = p.edges.find(t => t.edgeId === e.id)!.treatment;
    if (t.status !== "unassigned" && t.value.kind !== "none") {
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), inset = 1.2;
      if (length > 5) {
        const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 }, nx = Math.sign(center.x - mid.x) * (Math.abs(dy) > Math.abs(dx) ? inset : 0), ny = Math.sign(center.y - mid.y) * (Math.abs(dx) >= Math.abs(dy) ? inset : 0);
        out.push({ kind: "line", role: "annotation", strokeRole: "visible-outline", sourceId: `edging:${e.id}`, references: view.references, width: 0.35, from: { x: a.x + dx / length * 2 + nx, y: a.y + dy / length * 2 + ny }, to: { x: b.x - dx / length * 2 + nx, y: b.y - dy / length * 2 + ny } });
      }
    }
  }
  const g = p.grain;
  if (g.status !== "unassigned" && g.value.direction !== "non-directional") {
    const s = topology.frame.size, center = { u: s.u / 2, v: s.v / 2, t: 0 }, alongU = g.value.direction === "longitudinal", axis = alongU ? "u" : "v";
    const paperSpan = s[axis] * view.scale, arrowLength = Math.min(18, paperSpan * 0.35);
    if (arrowLength >= 5) {
      const a = map({ ...center, [axis]: center[axis] - arrowLength / view.scale / 2 }), b = map({ ...center, [axis]: center[axis] + arrowLength / view.scale / 2 });
      const box = primitiveBounds({ kind: "line", from: a, to: b, width: 0.18, role: "annotation" });
      if (!reserve.some(r => overlaps(r, box, 1))) {
        out.push({ kind: "line", from: a, to: b, width: 0.18, role: "annotation", sourceId: `grain:${p.componentId}`, references: view.references });
        const dx = (b.x - a.x) / arrowLength, dy = (b.y - a.y) / arrowLength, sense = g.value.sense;
        for (const [tip, sign] of ([[a, 1], [b, -1]] as const).filter(([, sign]) => sense === "either" || (sense === "positive" ? sign === -1 : sign === 1))) out.push({ kind: "polygon", sourceId: `grain:${p.componentId}`, references: view.references, points: [tip, { x: tip.x + sign * dx * 2 - dy * 0.7, y: tip.y + sign * dy * 2 + dx * 0.7 }, { x: tip.x + sign * dx * 2 + dy * 0.7, y: tip.y + sign * dy * 2 - dx * 0.7 }] });
        reserve.push({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 });
        const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
        addText(`grain:${p.componentId}`, `Grain ${alongU ? "U" : "V"} [${g.status === "provisional" ? "P" : "V"}]`, { x: (a.x + b.x) / 2 + (vertical ? 18 : 0), y: (a.y + b.y) / 2 - (vertical ? 0 : 4) });
      }
    }
  }
  return out;
}
export function buildManufacturingPanelSheets(source: FurnitureResult, plan: ComponentDimensionPlan, profile: DrawingProfile, input: ManufacturingDrawingInput, baseSheets: DrawingSheet[], page: { width: number; height: number }, factory: Factory): DrawingSheet[] {
  if (typeof input.syntheticExample !== "boolean" || !Array.isArray(input.requestedPanelIds) || new Set(input.requestedPanelIds).size !== input.requestedPanelIds.length || input.requestedPanelIds.some(id => !input.properties.panels.some(p => p.componentId === id))) throw new Error("Manufacturing drawing scope must contain explicit existing panel IDs and a labelled example state.");
  if (!profile.contents.componentDrawings) return [];
  const original = createPanelManufacturingDocument(source), ids = [...new Set([...input.requestedPanelIds, ...input.properties.panels.filter(p => panelPresentationFingerprint(p) !== panelPresentationFingerprint(original.panels.find(r => r.componentId === p.componentId)!)).map(p => p.componentId)])].sort();
  const sheets: DrawingSheet[] = [], body = drawingRegion(page), tableWidth = Math.min(190, body.width * 0.44), leftWidth = body.width - tableWidth - 6;
  for (const [i, id] of ids.entries()) {
    const p = input.properties.panels.find(p => p.componentId === id); if (!p) throw new Error(`Unknown manufacturing drawing occurrence: ${id}.`);
    const group = plan.groups.find(g => g.componentIds.includes(id))!, occurrence = group.occurrences.find(o => o.componentId === id)!;
    const originalView = baseSheets.flatMap(s => s.viewports).find(v => v.projection === "panel-face" && !v.manufacturingComponentId && v.references.some(r => r.componentId === id));
    if (!originalView) throw new Error(`Missing nominal component drawing for ${id}.`);
    const scoped = { ...group, id: `manufacturing-panel:${encodeURIComponent(id)}`, representativeId: id, componentIds: [id], occurrences: [occurrence], quantity: source.components.find(c => c.id === id)!.quantity };
    let view = componentFaceViewport(plan, scoped, profile.contents.cuttingList.include);
    view = { ...view, id: scoped.id, label: "PHYSICAL PANEL / LOCAL FACE MAP", manufacturingComponentId: id, frame: { ...body, width: leftWidth }, annotations: [id, "A: local T=0; B: opposite broad face.", `U: ${p.orientation.u.sign > 0 ? "+" : "-"}${p.orientation.u.axis.toUpperCase()}; V: ${p.orientation.v.sign > 0 ? "+" : "-"}${p.orientation.v.axis.toUpperCase()}; T: ${p.orientation.normal.sign > 0 ? "+" : "-"}${p.orientation.normal.axis.toUpperCase()}.`, "REF dimensions repeat the nominal component measurements.", "Edge strips are symbols; no thickness deduction."], dimensions: view.dimensions.map(d => ({ ...d, prefix: "REF " })) };
    const unfitted = view;
    view = placeComponentDimensions(positionViewport(view, originalView.scale));
    const fullPage = Math.abs(view.scale - originalView.scale) > 1e-12 || !!view.componentDimensionLayout!.diagnostics.length;
    if (fullPage) view = placeComponentDimensions(positionViewport({ ...unfitted, annotations: [...unfitted.annotations, `Full property table: MN-${String(i * 100 + 1).padStart(3, "0")}.`], frame: body }, originalView.scale));
    if (Math.abs(view.scale - originalView.scale) > 1e-12 || view.componentDimensionLayout!.diagnostics.length) throw new Error(`Manufacturing panel ${id} cannot retain its nominal scale readably at this sheet size.`);
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
export function validateManufacturingDrawings(document: DrawingDocument, source: FurnitureResult): string[] {
  const input = document.manufacturing;
  if (!input) return document.profile.contents.panelManufacturing || document.sheets.some(s => s.manufacturingComponentId || s.id.startsWith("MS-")) ? ["Missing bound manufacturing properties; regenerate the drawing package."] : [];
  const validation = validatePanelManufacturingDocument(input.properties, source);
  if (!validation.valid) return ["Manufacturing properties are stale or invalid; regenerate after review."];
  const rows = createManufacturingSchedule(source, input.properties);
  if (canonicalDrawingSnapshot(rows) !== canonicalDrawingSnapshot(input.rows)) return ["Manufacturing schedule differs from its bound properties/source."];
  const first = document.sheets[0], page = { width: first.widthMm, height: first.heightMm - titleBlockExtraHeight(document.profile.titleBlock) };
  const factory: Factory = (id, subject, number, views) => ({ ...first, id, metadata: { ...first.metadata, subject, number }, annotations: [], viewports: views, manufacturingComponentId: undefined, manufacturingTable: undefined, table: undefined });
  const expected = buildManufacturingPanelSheets(source, document.componentDimensionPlan, document.profile, input, document.sheets, page, factory);
  const actual = document.sheets.filter(s => s.manufacturingComponentId);
  const core = (s: DrawingSheet) => ({ id: s.id, subject: s.metadata.subject, componentId: s.manufacturingComponentId, table: s.manufacturingTable, views: s.viewports, annotations: s.annotations });
  const issues: string[] = [];
  if (canonicalDrawingSnapshot(actual.map(core)) !== canonicalDrawingSnapshot(expected.map(core))) issues.push("Manufacturing panel views, properties or annotation placement differ from the bound plan.");
  const tables = document.profile.contents.cuttingList.include ? manufacturingScheduleTables(rows, page) : [];
  const actualTables = document.sheets.filter(s => s.id.startsWith("MS-"));
  if (canonicalDrawingSnapshot(actualTables.map(s => s.table)) !== canonicalDrawingSnapshot(tables)) issues.push("Manufacturing schedule pagination/coverage differs from the bound rows.");
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
