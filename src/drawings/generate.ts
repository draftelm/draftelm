import type { FurnitureResult, PanelComponent } from "../furniture";
import type { Bounds2, DrawingDimension, DrawingOptions, DrawingResult, DrawingSheet, DrawingViewport, Point2, Projection, ProjectionConvention, Rect, SheetFormat } from "./types";
import { bounds2, bounds3, isometricLines, orthographicLines, panelReference } from "./projections";

export const FORMAL_TEMPLATE_LABEL = "BS 8888 / ISO-style — compliance not yet verified";
export const SHEET_FORMATS: Record<SheetFormat, { width: number; height: number }> = { A4: { width: 297, height: 210 }, A3: { width: 420, height: 297 }, A2: { width: 594, height: 420 }, A1: { width: 841, height: 594 } };
export const DEFAULT_DRAWING_OPTIONS: DrawingOptions = { template: "workshop", projectionConvention: "third-angle", format: "A3", projectName: "DRAFTELM", drawingPrefix: "DRF-CD", revision: "A" };
export const VIEW_PADDING = { left: 25, right: 8, top: 7, bottom: 13 };

/** Largest conventional reduction that fits; no stretching and no rounding of model data. */
export function fitScale(bounds: Bounds2, frame: Rect): number {
  const max = Math.min(1, (frame.width - VIEW_PADDING.left - VIEW_PADDING.right) / (bounds.max.x - bounds.min.x), (frame.height - VIEW_PADDING.top - VIEW_PADDING.bottom) / (bounds.max.y - bounds.min.y));
  if (!(max > 0) || !Number.isFinite(max)) throw new Error("Sheet viewport cannot fit geometry.");
  for (let decade = 1; decade <= 1e15; decade *= 10) for (const factor of [1, 2, 2.5, 5]) {
    const scale = 1 / (decade * factor); if (scale <= max + 1e-12) return scale;
  }
  throw new Error("Model is too large for supported drawing scales.");
}
export function scaleLabel(scale: number) { return `1:${Number((1 / scale).toFixed(6))}`; }
export function positionViewport(view: DrawingViewport, scale = fitScale(view.bounds, view.frame)): DrawingViewport {
  const f = view.frame, b = view.bounds, p = VIEW_PADDING;
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

export function generateDrawingDocument(result: FurnitureResult, options: DrawingOptions = DEFAULT_DRAWING_OPTIONS): DrawingResult {
  try {
    if (!result.geometryValid) throw new Error("Drawing withheld: engineering geometry is invalid.");
    if (!SHEET_FORMATS[options.format] || !["workshop", "engineering"].includes(options.template) || !["first-angle", "third-angle"].includes(options.projectionConvention)) throw new Error("Unsupported drawing configuration.");
    for (const text of [options.projectName, options.drawingPrefix, options.revision]) if (!text.trim() || text.length > 60) throw new Error("Drawing metadata must be non-empty and no longer than 60 characters.");
    const panels = result.components.filter(c => c.kind === "panel");
    const all = bounds3(panels), carcassAssembly = result.assemblies.find(a => a.id.endsWith("/carcass"));
    if (!carcassAssembly) throw new Error("Carcass assembly reference is missing.");
    const ids = new Set(carcassAssembly.componentIds), carcass = panels.filter(p => p.assemblyId === carcassAssembly.id && ids.has(p.id));
    const body = bounds3(carcass), page = SHEET_FORMATS[options.format], frames = gaFrames(page.width, page.height, options.projectionConvention);
    const front = viewport("ga-front", "FRONT", "front", panels, frames.front), top = viewport("ga-top", "TOP", "top", panels, frames.top), right = viewport("ga-right", "RIGHT SIDE", "right", panels, frames.right);
    const iso = viewport("ga-isometric", "ISOMETRIC WIREFRAME", "isometric", panels, frames.isometric);
    iso.annotations = ["Parallel isometric projection; hidden edges not removed."];
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
    const mainScale = Math.min(...[front, top, right].map(v => fitScale(v.bounds, v.frame)));
    const views = [front, top, right].map(v => positionViewport(v, mainScale)); views.push(positionViewport(iso));
    const componentViews: DrawingViewport[] = [];
    // Use existing BOM grouping; quantities refer only to the referenced carcass members.
    for (const line of result.bom.filter(l => l.kind === "panel" && l.componentIds.some(id => ids.has(id)))) {
      const members = carcass.filter(p => line.componentIds.includes(p.id)), p = members[0];
      if (!p || !line.cutSize) throw new Error("Carcass BOM link is incomplete.");
      const faceAxes = (["x", "y", "z"] as const).filter(a => a !== p.thicknessAxis).sort((a, b) => p.dimensions[b] - p.dimensions[a]);
      if (Math.abs(line.cutSize.length - p.dimensions[faceAxes[0]]) > 1e-6 || Math.abs(line.cutSize.width - p.dimensions[faceAxes[1]]) > 1e-6 ||
        Math.abs(line.cutSize.thickness - p.thickness) > 1e-6 || line.itemId !== p.materialId) throw new Error("Carcass BOM and component dimensions/material disagree.");
      const u = faceAxes[0], v = faceAxes[1], min = { x: p.position[u], y: p.position[v] }, max = { x: min.x + p.dimensions[u], y: min.y + p.dimensions[v] };
      const references = members.map(m => panelReference(m, line.id));
      const corners = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
      componentViews.push({ id: `component-${line.id}`, label: line.partNames.filter(name => members.some(m => m.name === name)).join(" / "), projection: "panel-face",
        entities: corners.map((from, i) => ({ kind: "line", id: `${line.id}-edge-${i}`, from, to: corners[(i + 1) % 4], references })),
        dimensions: [dim(`${line.id}-length`, min, { x: max.x, y: min.y }, "horizontal", p.dimensions[u], references), dim(`${line.id}-width`, min, { x: min.x, y: max.y }, "vertical", p.dimensions[v], references)],
        bounds: { min, max }, frame: { x: 0, y: 0, width: 0, height: 0 }, origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1", references,
        annotations: [`Qty ${members.reduce((n, m) => n + m.quantity, 0)} | Thickness ${p.thickness} mm | ${p.materialId}`, "Face layout only; grain and edge treatment unspecified.", `Parts: ${members.map(m => m.id).join(", ")}`],
      });
    }
    if (!componentViews.length) throw new Error("No carcass components are linked to the BOM.");
    const covered = new Set(componentViews.flatMap(v => v.references.map(r => r.componentId)));
    if (carcass.some(p => !covered.has(p.id))) throw new Error("Carcass BOM coverage is incomplete.");
    // Paginate if future carcasses have more than three distinct stock blanks.
    const chunks = Array.from({ length: Math.ceil(componentViews.length / 3) }, (_, i) => componentViews.slice(i * 3, i * 3 + 3));
    const total = 1 + chunks.length;
    const sheet = (id: string, subject: string, number: number, viewports: DrawingViewport[]): DrawingSheet => ({ id, format: options.format, widthMm: page.width, heightMm: page.height,
      metadata: { projectName: options.projectName, subject, drawingNumber: `${options.drawingPrefix}-${id}`, revision: options.revision, units: "mm", scale: id === "GA-001" ? `${scaleLabel(mainScale)} main; iso ${views[3].scaleLabel}` : "See individual views", number, total, status: "PRELIMINARY - NOT FOR MANUFACTURE" },
      viewports, annotations: ["Nominal closed geometry only. No tolerances or manufacturing instructions supplied."] });
    const assemblyName = result.assemblies.find(a => a.id === carcassAssembly.parentId)?.name ?? "Furniture";
    const sheets = [sheet("GA-001", `${assemblyName} - General assembly`, 1, views)];
    chunks.forEach((chunk, index) => {
      const fitted = chunk.map((v, i) => positionViewport({ ...v, frame: { x: 10 + i * (page.width - 20) / chunk.length, y: 28, width: (page.width - 20) / chunk.length, height: page.height - 100 } }));
      sheets.push(sheet(`CP-${String(index + 1).padStart(3, "0")}`, "Carcass components", index + 2, fitted));
    });
    return { document: { schemaVersion: 1, specificationRevision: result.specificationRevision, template: options.template, projectionConvention: options.projectionConvention, standardsCandidate: "BS 8888:2025", complianceVerified: false, manufacturingReady: false, sheets }, issues: [] };
  } catch (error) { return { document: null, issues: [error instanceof Error ? error.message : "Drawing generation failed."] }; }
}
