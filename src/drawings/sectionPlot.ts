import type { DrawingViewport, PlotEntity, Point2 } from "./types";
import type { SectionCutFace } from "./planning/sectionTypes";
import { modelToSheet } from "./dimensionPlot";
import { VISIBILITY_EPSILON_MM as EPS } from "./edgeVisibility";

/** Greedy adjacency colouring keeps touching cut panels distinguishable. Patterns
 * indicate separate cut occurrences, never material layers or machining detail. */
export function sectionHatchPatterns(faces: SectionCutFace[]): Map<string, number> {
  const assigned = new Map<string, number>(), ordered = [...faces].sort((a, b) => a.id.localeCompare(b.id));
  const adjacent = (a: SectionCutFace, b: SectionCutFace) => {
    const x = Math.min(a.bounds.max.x, b.bounds.max.x) - Math.max(a.bounds.min.x, b.bounds.min.x);
    const y = Math.min(a.bounds.max.y, b.bounds.max.y) - Math.max(a.bounds.min.y, b.bounds.min.y);
    return x >= -EPS && y >= -EPS && (x > EPS || y > EPS);
  };
  for (const face of ordered) {
    const used = new Set(ordered.filter(f => assigned.has(f.id) && adjacent(face, f)).map(f => assigned.get(f.id)));
    let colour = 0; while (used.has(colour)) colour++;
    assigned.set(face.id, colour);
  }
  return assigned;
}
/** Paper-spacing style is deliberately separate from true section intersections.
 * Each vector segment is analytically clipped to one actual cut-face rectangle. */
export function plotSectionHatches(view: DrawingViewport, fullFaces: SectionCutFace[]): PlotEntity[] {
  const patterns = sectionHatchPatterns(fullFaces), out: PlotEntity[] = [];
  for (const face of view.sectionData?.cutFaces ?? []) {
    const a = modelToSheet(view, face.bounds.min), b = modelToSheet(view, face.bounds.max);
    const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
    const colour = patterns.get(face.id) ?? 0, slope = [1, -1, 0.577350269, -0.577350269][colour % 4], step = (2.5 + Math.floor(colour / 4) * 0.6) * Math.sqrt(1 + slope * slope);
    const values = [min.y - slope * min.x, min.y - slope * max.x, max.y - slope * min.x, max.y - slope * max.x];
    for (let k = Math.ceil(Math.min(...values) / step); k * step < Math.max(...values) - EPS; k++) {
      const intercept = k * step, points: Point2[] = [];
      for (const x of [min.x, max.x]) { const y = slope * x + intercept; if (y >= min.y - EPS && y <= max.y + EPS) points.push({ x, y }); }
      for (const y of [min.y, max.y]) { const x = (y - intercept) / slope; if (x >= min.x - EPS && x <= max.x + EPS) points.push({ x, y }); }
      const unique = [...new Map(points.map(p => [`${p.x.toFixed(6)}:${p.y.toFixed(6)}`, p])).values()];
      if (unique.length === 2 && Math.hypot(unique[1].x - unique[0].x, unique[1].y - unique[0].y) > EPS) out.push({ kind: "line", role: "hatch", width: 0.1, from: unique[0], to: unique[1], sourceId: `hatch:${view.id}:${face.id}:${k}`, references: [face.reference] });
    }
  }
  return out;
}
export function plotSectionMarkers(view: DrawingViewport): PlotEntity[] {
  const out: PlotEntity[] = [], references = view.references;
  const line = (a: Point2, b: Point2, sourceId: string, width = 0.18) => out.push({ kind: "line", from: a, to: b, width, role: "annotation", sourceId, references });
  const dashed = (a: Point2, b: Point2, sourceId: string) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t < length; t += 4) { const end = Math.min(length, t + 2.5); line({ x: a.x + (b.x - a.x) * t / length, y: a.y + (b.y - a.y) * t / length }, { x: a.x + (b.x - a.x) * end / length, y: a.y + (b.y - a.y) * end / length }, sourceId); }
  };
  for (const label of view.sectionData?.identifications ?? []) {
    const sourceId = label.id, refs = references.filter(r => r.componentId === label.componentId);
    const anchor = modelToSheet(view, label.anchor), tail = { x: label.at.x + label.text.length * 1.25, y: label.at.y + 1 };
    out.push({ kind: "line", from: anchor, to: tail, width: 0.15, role: "annotation", sourceId, references: refs });
    out.push({ kind: "text", at: label.at, text: label.text, size: 2.5, sourceId, references: refs });
  }
  for (const marker of view.sectionMarkers ?? []) {
    if (marker.kind === "cutting-plane") {
      const a = modelToSheet(view, marker.from), b = modelToSheet(view, marker.to);
      const length = Math.hypot(b.x - a.x, b.y - a.y), along = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const ends = [{ x: a.x - 4 * along.x, y: a.y - 4 * along.y }, { x: b.x + 4 * along.x, y: b.y + 4 * along.y }];
      dashed(ends[0], ends[1], marker.id);
      const dir = { x: marker.direction.x, y: -marker.direction.y };
      for (const end of ends) {
        const tail = { x: end.x - 7 * dir.x, y: end.y - 7 * dir.y };
        line(tail, end, marker.id, 0.35);
        out.push({ kind: "polygon", sourceId: marker.id, references, points: [end, { x: end.x - 2.5 * dir.x - 0.8 * dir.y, y: end.y - 2.5 * dir.y + 0.8 * dir.x }, { x: end.x - 2.5 * dir.x + 0.8 * dir.y, y: end.y - 2.5 * dir.y - 0.8 * dir.x }] });
        out.push({ kind: "text", sourceId: marker.id, references, at: { x: tail.x + 1, y: tail.y - 1.5 }, text: marker.label.split("-")[0], size: 2.6, bold: true });
      }
    } else {
      const a = modelToSheet(view, marker.bounds.min), b = modelToSheet(view, marker.bounds.max);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
      const corners = [{ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }];
      corners.forEach((p, i) => dashed(p, corners[(i + 1) % 4], marker.id));
      const center = { x: right + 5, y: y - 5 };
      line({ x: right, y }, { x: center.x - 2, y: center.y + 2 }, marker.id);
      out.push({ kind: "circle", center, radius: 3, width: 0.2, sourceId: marker.id, references });
      out.push({ kind: "text", at: { x: center.x, y: center.y + 0.9 }, align: "middle", size: 2.6, text: marker.label, sourceId: marker.id, references });
    }
  }
  return out;
}
