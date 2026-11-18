import type { DrawingDocument, DrawingSheet, DrawingViewport, PlotEntity, Rect } from "./types";
import { balloonBounds, containsRect, convexHull, insideConvexHull, overlaps, primitiveBounds, segmentHitsRect, segmentsIntersect } from "./annotationGeometry";
import { modelToSheet, plotDimension } from "./dimensionPlot";
import { plotSectionMarkers } from "./sectionPlot";
import { drawingRegion, titleBlockExtraHeight, viewportNotes, viewportText } from "./layout";

export interface CompositionDiagnostic {
  code: "clipping" | "poor-utilisation" | "view-collision" | "border-clearance" | "leader-crossing" | "component-collision";
  sheetId: string; viewId?: string; message: string;
}
export interface ViewComposition {
  sheetId: string; viewId: string; scale: number; geometryBounds: Rect; annotationBounds: Rect;
  /** Projected envelope / allocated frame, not occupied ink or compliance. */
  utilisation: number;
}
export interface CompositionReport { policy: "paper-composition-v1"; views: ViewComposition[]; diagnostics: CompositionDiagnostic[] }
export function unionRects(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.max(...rects.map(r => r.y + r.height)) - y };
}
export function viewportInk(view: DrawingViewport): PlotEntity[] {
  const f = view.frame, { heading } = viewportText(view), notes = viewportNotes(view);
  return [
    ...view.entities.map(e => ({ kind: "line" as const, from: modelToSheet(view, e.from), to: modelToSheet(view, e.to), width: 0, role: "geometry" as const })),
    ...view.dimensions.flatMap(d => plotDimension(view, d)), ...plotSectionMarkers(view),
    ...heading.map((text, i) => ({ kind: "text" as const, text, at: { x: f.x + 3, y: f.y + 4 + i * 3.3 }, size: 2.6 })),
    ...notes.map((n, i) => ({ kind: "text" as const, text: n.text, at: { x: f.x + 3, y: f.y + f.height - 3 - (notes.length - 1 - i) * 2.8 }, size: 2 })),
    ...(view.referenceLabels ?? []).map(l => ({ kind: "text" as const, ...l, size: 2.5 })),
  ];
}
/** Nonblocking presentation evidence. Engineering coverage and concealment stay
 * in their independent source-bound reports. No manufacturing release authority. */
export function assessComposition(sheets: DrawingSheet[]): CompositionReport {
  const views: ViewComposition[] = [], diagnostics: CompositionDiagnostic[] = [];
  for (const sheet of sheets) {
    const region = drawingRegion({ width: sheet.widthMm, height: sheet.heightMm - titleBlockExtraHeight(sheet.metadata) });
    const add = (code: CompositionDiagnostic["code"], message: string, viewId?: string) => diagnostics.push({ code, sheetId: sheet.id, ...(viewId ? { viewId } : {}), message });
    for (const [i, v] of sheet.viewports.entries()) {
      const a = modelToSheet(v, v.bounds.min), b = modelToSheet(v, v.bounds.max);
      const geometryBounds = { x: a.x, y: b.y, width: b.x - a.x, height: a.y - b.y };
      const ink = viewportInk(v).map(primitiveBounds), annotationBounds = unionRects(ink);
      const utilisation = geometryBounds.width * geometryBounds.height / (v.frame.width * v.frame.height);
      views.push({ sheetId: sheet.id, viewId: v.id, scale: v.scale, geometryBounds, annotationBounds, utilisation });
      const tolerance = { x: v.frame.x - 1e-6, y: v.frame.y - 1e-6, width: v.frame.width + 2e-6, height: v.frame.height + 2e-6 };
      if (!containsRect(region, v.frame) || ink.some(r => !containsRect(tolerance, r))) add("clipping", "Geometry or annotation exceeds the allocated usable drawing region.", v.id);
      if (v.projection === "isometric" && utilisation < 0.14) add("poor-utilisation", "Projected envelope uses less than 14% of its allocated frame; review scale or composition.", v.id);
      if (sheet.viewports.slice(i + 1).some(other => overlaps(v.frame, other.frame)) || (sheet.assemblyPartsList && overlaps(v.frame, sheet.assemblyPartsList.frame))) add("view-collision", "Allocated view region overlaps another view or the parts list.", v.id);
    }
    const safeBorder = { x: 13, y: 13, width: sheet.widthMm - 26, height: sheet.heightMm - 26 };
    for (const [i, b] of (sheet.balloons ?? []).entries()) {
      if (!containsRect(safeBorder, balloonBounds(b.center))) add("border-clearance", "Balloon outline is less than 3 mm inside the drawing border.", b.viewportId);
      const view = sheet.viewports.find(v => v.id === b.viewportId);
      if (!view) continue;
      const [start, end] = b.leaderPoints, length = Math.hypot(end.x - start.x, end.y - start.y);
      const hulls = view.references.map(ref => convexHull(view.entities.filter(e => e.references.some(r => r.componentId === ref.componentId)).flatMap(e => [modelToSheet(view, e.from), modelToSheet(view, e.to)])));
      const nearEnd = { x: end.x + (start.x - end.x) / Math.max(length, 1) * 0.8, y: end.y + (start.y - end.y) / Math.max(length, 1) * 0.8 };
      if (hulls.some(h => insideConvexHull(b.center, h)) || view.entities.some(e => {
        const a = modelToSheet(view, e.from), c = modelToSheet(view, e.to);
        return segmentHitsRect(a, c, balloonBounds(b.center), 0.7) || segmentsIntersect(start, nearEnd, a, c);
      })) add("component-collision", "Balloon or leader crosses projected component ink away from its attachment.", view.id);
      if ((sheet.balloons ?? []).slice(i + 1).some(c => overlaps(balloonBounds(b.center), balloonBounds(c.center), 0.7) || segmentsIntersect(start, end, c.leaderPoints[0], c.leaderPoints[1]))) add("leader-crossing", "Balloon outlines or leader paths intersect.", view.id);
    }
  }
  return { policy: "paper-composition-v1", views, diagnostics };
}
export function validateCompositionReport(document: DrawingDocument) {
  return JSON.stringify(document.compositionReport) === JSON.stringify(assessComposition(document.sheets)) ? [] : ["Drawing composition diagnostics differ from the current sheets. Regenerate drawings."];
}
