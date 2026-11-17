import type { FurnitureResult } from "../furniture";
import type { Bounds2, DrawingDimension, DrawingLine, DrawingProfile, DrawingSheet, DrawingViewport, Rect } from "./types";
import type { FunctionalDimensionCoverage, FunctionalDimensionPlan, FunctionalDisplayGroup } from "./planning/functionalTypes";
import { DEFAULT_COMPONENT_DIMENSION_STYLE as STYLE } from "./componentDimensionLayout";
import { modelToSheet, plotDimension } from "./dimensionPlot";
import { containsRect, overlaps, primitiveBounds } from "./annotationGeometry";
import { viewportPadding, viewportText } from "./layout";
import { positionViewport } from "./viewports";
import { projectPoint } from "./projections";

function clipEdge(line: DrawingLine, bounds: Bounds2): DrawingLine | null {
  const axis = Math.abs(line.to.x - line.from.x) > 1e-6 ? "x" : "y", cross = axis === "x" ? "y" : "x";
  if (line.from[cross] < bounds.min[cross] - 1e-6 || line.from[cross] > bounds.max[cross] + 1e-6) return null;
  const low = Math.max(Math.min(line.from[axis], line.to[axis]), bounds.min[axis]), high = Math.min(Math.max(line.from[axis], line.to[axis]), bounds.max[axis]);
  return high - low > 1e-6 ? { ...line, from: { ...line.from, [axis]: low }, to: { ...line.to, [axis]: high } } : null;
}
function reservedBands(view: DrawingViewport): Rect[] {
  const { heading, notes } = viewportText(view), f = view.frame;
  return [{ x: f.x, y: f.y, width: f.width, height: 6 + (heading.length - 1) * 3.3 },
    { x: f.x, y: f.y + f.height - 5 - Math.max(0, notes.length - 1) * 2.8, width: f.width, height: 5 + Math.max(0, notes.length - 1) * 2.8 }];
}
function imageBounds(view: DrawingViewport): Rect {
  const a = modelToSheet(view, view.bounds.min), b = modelToSheet(view, view.bounds.max);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
/** Witness extensions may coincide with their own reference edges. The actual
 * dimension line, arrows and label must stay outside the clipped image and notes. */
export function functionalDetailCollisions(view: DrawingViewport, extraReserved: Rect[] = []): string[] {
  const issues: string[] = [], bands = [...reservedBands(view), ...extraReserved], body = imageBounds(view);
  const labels = (view.referenceLabels ?? []).map(label => primitiveBounds({ kind: "text", size: 2.5, ...label }));
  if (labels.some(box => !containsRect(view.frame, box) || bands.some(b => overlaps(box, b, 0.4)))) issues.push(`Functional reference labels clip or overlap reserved text: ${view.id}.`);
  for (const d of view.dimensions) {
    const entities = plotDimension(view, d);
    entities.forEach((e, i) => {
      const box = primitiveBounds(e);
      if (!containsRect(view.frame, box) || [...bands, ...labels].some(b => overlaps(box, b, 0.4)) || (i >= 2 && overlaps(box, body, 0.4))) issues.push(`Functional dimension clips or overlaps image/labels: ${d.id}.`);
    });
  }
  return issues;
}

export function functionalDetailView(result: FurnitureResult, plan: FunctionalDimensionPlan, group: FunctionalDisplayGroup, frame: Rect, extraReserved: Rect[] = []): DrawingViewport {
  const request = plan.requests.find(r => r.id === group.representativeRequestId)!;
  const d = plan.dimensions.find(d => d.id === request.dimensionId)!;
  const from = projectPoint(d.measurement.from, d.projection), to = projectPoint(d.measurement.to, d.projection);
  const direction = projectPoint({ x: d.measurement.axis === "x" ? 1 : 0, y: d.measurement.axis === "y" ? 1 : 0, z: d.measurement.axis === "z" ? 1 : 0 }, d.projection);
  const axis = Math.abs(direction.x) > Math.abs(direction.y) ? "horizontal" : "vertical";
  const along = Math.max(8, d.valueMm * 0.15), across = Math.max(10, d.valueMm * 0.18);
  const bounds = { min: { x: Math.min(from.x, to.x) - (axis === "horizontal" ? along : across), y: Math.min(from.y, to.y) - (axis === "horizontal" ? across : along) },
    max: { x: Math.max(from.x, to.x) + (axis === "horizontal" ? along : across), y: Math.max(from.y, to.y) + (axis === "horizontal" ? across : along) } };
  const edges = [d.measurement.fromEdgeId, d.measurement.toEdgeId].map(id => plan.edges.find(e => e.id === id)!);
  const lines = edges.map(edge => clipEdge({ kind: "line", id: `functional-edge:${edge.id}`, from: projectPoint(edge.from, d.projection), to: projectPoint(edge.to, d.projection), references: [edge.reference] }, bounds)).filter((line): line is DrawingLine => !!line);
  const entities = [...new Map(lines.map(line => [JSON.stringify([line.from, line.to]), line])).values()];
  for (const line of entities) line.references = [...new Map(lines.filter(other => JSON.stringify([other.from, other.to]) === JSON.stringify([line.from, line.to])).flatMap(other => other.references).map(ref => [ref.componentId, ref])).values()];
  const faceLabel = (id: string) => {
    const face = plan.faces.find(f => f.id === id)!, name = result.components.find(c => c.id === face.reference.componentId)!.name;
    return `${name} [${face.reference.componentId}] (${face.axis.toUpperCase()} ${face.side.toUpperCase()})`;
  };
  const intent = request.intent;
  const intentNote = intent.status === "not-directly-specified" ? "Measured geometry; intent not directly specified." :
    `Source ${intent.comparison === "minimum" ? "minimum" : "exact"} ${Number(intent.valueMm.toFixed(6))} mm; ${intent.status === "violated" ? "CONTRADICTS geometry" : "geometry consistent"}.`;
  const view: DrawingViewport = { id: group.id, semanticViewId: group.id, label: group.label, projection: d.projection, frame,
    entities, dimensions: [], bounds, origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1", references: d.references,
    annotations: [`Isolated ${d.projection.toUpperCase()} edges; context outside crop omitted.`, `R1: ${faceLabel(d.measurement.fromFaceId)}`, `R2: ${faceLabel(d.measurement.toFaceId)}`,
      `${group.requestIds.length} measured relationship${group.requestIds.length === 1 ? "" : "s"}; linked occurrences retained.`, intentNote],
    functionalDimension: { groupId: group.id, requestIds: [...group.requestIds], dimensionIds: [...group.dimensionIds], representativeDimensionId: d.id, valueMm: d.valueMm, from, to, status: "placed" },
  };
  let placed = positionViewport(view);
  // Enlarge small isolated references at a stated uniform 2:1 scale when space
  // permits. Other drawing fitters and manufacturing coordinates are unchanged.
  const enlarged = { ...view, scale: 2, scaleLabel: "2:1" }, padding = viewportPadding(enlarged);
  if ((bounds.max.x - bounds.min.x) * 2 <= frame.width - padding.left - padding.right && (bounds.max.y - bounds.min.y) * 2 <= frame.height - padding.top - padding.bottom) {
    const center = { x: frame.x + padding.left + (frame.width - padding.left - padding.right) / 2, y: frame.y + padding.top + (frame.height - padding.top - padding.bottom) / 2 };
    placed = { ...enlarged, origin: { x: center.x - (bounds.min.x + bounds.max.x), y: center.y + bounds.min.y + bounds.max.y } };
  }
  const body = imageBounds(placed);
  placed.referenceLabels = edges.map((edge, i) => {
    const clipped = lines[i], points = clipped ? [clipped.from, clipped.to].map(p => modelToSheet(placed, p)) : [modelToSheet(placed, from)];
    const x = axis === "horizontal" ? points[0].x + (i === 0 ? -6 : 1) : Math.max(...points.map(p => p.x)) + 1;
    const y = axis === "horizontal" ? (i === 0 ? Math.min(...points.map(p => p.y)) - 1 : Math.max(...points.map(p => p.y)) + 3) : points[0].y + (i === 0 ? 3 : -1);
    return { sourceId: edge.id, text: `R${i + 1}`, at: { x, y }, references: [edge.reference] };
  });
  const deferred = (reason: string): DrawingViewport => ({ ...placed, functionalDimension: { ...placed.functionalDimension!, status: "unplaced", reason } });
  if (extraReserved.some(region => reservedBands(placed).some(band => overlaps(region, band, 0.4)))) return deferred("Reserved regions overlap functional reference labels or notes.");
  if (d.valueMm === 0) return functionalDetailCollisions(placed, extraReserved).length ? deferred("Coincident-face reference annotation cannot fit reliably.") : placed; // linked note, never a fake edge dimension
  const a = modelToSheet(placed, from), b = modelToSheet(placed, to);
  const span = Math.hypot(a.x - b.x, a.y - b.y), labelSize = String(Number(d.valueMm.toFixed(6))).length * STYLE.textSizeMm;
  const arrows = span < labelSize + 2 * STYLE.arrowLengthMm + 1 ? "outside" : "inside";
  const sides = axis === "horizontal" ? ["bottom", "top"] as const : ["left", "right"] as const;
  for (const side of sides) for (const lane of [0, 3, 6]) {
    const edgeDistance = side === "bottom" ? body.y + body.height - Math.max(a.y, b.y) : side === "top" ? Math.min(a.y, b.y) - body.y : side === "left" ? Math.min(a.x, b.x) - body.x : body.x + body.width - Math.max(a.x, b.x);
    const dimension: DrawingDimension = { id: d.id, semanticDimensionId: d.id, from, to, axis, valueMm: d.valueMm, references: d.references,
      offsetPaperMm: edgeDistance + 7 + lane, placement: { status: "placed", side, arrows, style: { ...STYLE } } };
    const candidate = { ...placed, dimensions: [dimension] };
    if (!functionalDetailCollisions(candidate, extraReserved).length) return candidate;
  }
  return deferred("No collision-free functional dimension lane fits this detail viewport.");
}

export function functionalDetailFrames(page: { width: number; height: number }): Rect[] {
  const columns = Math.max(1, Math.min(3, Math.floor((page.width - 20) / 130)));
  return Array.from({ length: columns * 2 }, (_, index) => ({ x: 10 + index % columns * (page.width - 20) / columns, y: 23 + Math.floor(index / columns) * (page.height - 87) / 2, width: (page.width - 20) / columns, height: (page.height - 87) / 2 }));
}

export function functionalDetailSheets(result: FurnitureResult, profile: DrawingProfile, plan: FunctionalDimensionPlan, page: { width: number; height: number },
  makeSheet: (id: string, subject: string, number: number, views: DrawingViewport[]) => DrawingSheet): DrawingSheet[] {
  if (!profile.contents.functionalDimensions) return [];
  const frames = functionalDetailFrames(page), perPage = frames.length;
  return Array.from({ length: Math.ceil(plan.displayGroups.length / perPage) }, (_, pageIndex) => {
    const views = plan.displayGroups.slice(pageIndex * perPage, (pageIndex + 1) * perPage).map((group, i) => functionalDetailView(result, plan, group, frames[i]));
    const sheet = makeSheet(`FD-${String(pageIndex + 1).padStart(3, "0")}`, "Assembly functional reference details", 0, views);
    sheet.annotations = [`Measured relationships; ${views.filter(v => v.functionalDimension?.status === "unplaced").length} detail placements deferred. Source nominal assumptions unverified; no datums/tolerances approved.`];
    return sheet;
  });
}

export function functionalDimensionCoverage(plan: FunctionalDimensionPlan, sheets: DrawingSheet[], enabled: boolean): FunctionalDimensionCoverage {
  const views = sheets.flatMap(s => s.viewports).filter(v => v.functionalDimension);
  const displayed = new Set(views.filter(v => v.functionalDimension!.status === "placed").flatMap(v => v.functionalDimension!.requestIds));
  const required = plan.requests.filter(r => r.required), unsupported = required.filter(r => r.state === "unsupported").map(r => r.id);
  const unplaced = required.filter(r => r.state === "resolved" && !displayed.has(r.id)).map(r => r.id);
  return { requiredRequestIds: required.map(r => r.id), displayedRequestIds: required.filter(r => displayed.has(r.id)).map(r => r.id), unplacedRequestIds: unplaced,
    unsupportedRequestIds: unsupported, deferredRequestIds: plan.requests.filter(r => !r.required).map(r => r.id),
    diagnostics: [
      ...(unsupported.length ? [{ code: "unsupported" as const, requestIds: unsupported, message: "Required functional relationships could not be resolved from supported source geometry." }] : []),
      ...(unplaced.length ? [{ code: enabled ? "unplaced" as const : "hidden" as const, requestIds: unplaced, message: enabled ? "Required functional dimensions have no reliable placed detail; see detail placement diagnostics." : "Functional detail sheets are hidden; measured relationships remain source-bound internally." }] : []),
    ] };
}
