import type { DrawingDimension, DrawingViewport, PlotEntity, Rect } from "./types";
import type { ComponentDimensionCoverage, ComponentDimensionDiagnostic, ComponentDimensionPlan, ComponentDimensionStyle, DimensionPlacement } from "./planning/componentTypes";
import { formatDimension, modelToSheet, plotDimension } from "./dimensionPlot";
import { containsRect, overlaps, primitiveBounds } from "./annotationGeometry";
import { viewportText } from "./layout";
import { positionViewport } from "./viewports";

export const DEFAULT_COMPONENT_DIMENSION_STYLE: Readonly<ComponentDimensionStyle> = Object.freeze({
  id: "rectangular-component-paper-mm-1", textSizeMm: 2.5, arrowLengthMm: 2.4, arrowHalfWidthMm: 0.7, lineWidthMm: 0.18,
  extensionGapMm: 1, extensionOverrunMm: 1.5, textGapMm: 1.2,
  clearanceMm: 7, laneSpacingMm: 3, lanes: 4, collisionGapMm: 0.5,
});
export function validateComponentDimensionStyle(style: ComponentDimensionStyle): void {
  if (!style.id.trim() || Object.entries(style).some(([key, value]) => key !== "id" && (!Number.isFinite(value) || Number(value) <= 0)) ||
    style.textSizeMm < 2.5 || !Number.isInteger(style.lanes) || style.lanes > 20 || style.clearanceMm <= style.extensionGapMm) throw new Error("Invalid component dimension presentation style.");
}

/** Conservative one-em glyph envelopes, including rotated text and arrowheads.
 * Extension lines start outside the outline; none may cross reserved regions. */
export function componentDimensionObstacles(view: DrawingViewport): Rect[] {
  const { heading, notes } = viewportText(view), f = view.frame;
  const a = modelToSheet(view, view.bounds.min), b = modelToSheet(view, view.bounds.max);
  return [
    { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) },
    { x: f.x, y: f.y, width: f.width, height: 4 + (heading.length - 1) * 3.3 + 2 },
    ...(notes.length ? [{ x: f.x, y: f.y + f.height - 5 - (notes.length - 1) * 2.8, width: f.width, height: 5 + (notes.length - 1) * 2.8 }] : []),
  ];
}
const collision = (a: PlotEntity[], b: PlotEntity[], gap: number) => a.some(x => b.some(y => overlaps(primitiveBounds(x), primitiveBounds(y), gap)));

export function componentDimensionCollisions(view: DrawingViewport, extraObstacles: Rect[] = []): string[] {
  const style = view.componentDimensionLayout?.style ?? DEFAULT_COMPONENT_DIMENSION_STYLE;
  const obstacles = [...componentDimensionObstacles(view), ...extraObstacles], issues: string[] = [];
  const plots = view.dimensions.map(d => plotDimension(view, d));
  plots.forEach((entities, i) => {
    if (entities.some(e => !containsRect(view.frame, primitiveBounds(e)) || obstacles.some(o => overlaps(primitiveBounds(e), o, style.collisionGapMm)))) issues.push(`Component dimension overlaps geometry/reserved regions or clips: ${view.dimensions[i].id}.`);
  });
  for (let i = 0; i < plots.length; i++) for (let j = i + 1; j < plots.length; j++) if (collision(plots[i], plots[j], style.collisionGapMm)) issues.push(`Component dimensions overlap: ${view.dimensions[i].id} / ${view.dimensions[j].id}.`);
  return issues;
}

function candidates(view: DrawingViewport, dimension: DrawingDimension, style: ComponentDimensionStyle, extraObstacles: Rect[]): DrawingDimension[] {
  const { min, max } = view.bounds, horizontal = dimension.axis === "horizontal";
  const span = (horizontal ? max.x - min.x : max.y - min.y) * view.scale;
  const labelWidth = Array.from(`${dimension.prefix ?? ""}${formatDimension(dimension.valueMm)}`).length * style.textSizeMm;
  const arrows = span >= labelWidth + 2 * style.arrowLengthMm + 2 * style.collisionGapMm ? "inside" : "outside";
  const obstacles = [...componentDimensionObstacles(view), ...extraObstacles];
  const sides: (DimensionPlacement & { status: "placed" })["side"][] = horizontal ? ["bottom", "top"] : ["left", "right"];
  return sides.flatMap(side => Array.from({ length: style.lanes }, (_, lane) => {
    const from = horizontal ? { x: min.x, y: side === "top" ? max.y : min.y } : { x: side === "right" ? max.x : min.x, y: min.y };
    const to = horizontal ? { x: max.x, y: from.y } : { x: from.x, y: max.y };
    return { ...dimension, from, to, offsetPaperMm: style.clearanceMm + lane * style.laneSpacingMm,
      placement: { status: "placed" as const, side, arrows: arrows as "inside" | "outside", style: { ...style } } };
  })).filter(d => plotDimension(view, d).every(e => containsRect(view.frame, primitiveBounds(e)) && !obstacles.some(o => overlaps(primitiveBounds(e), o, style.collisionGapMm))));
}

/** Placement is separate from semantic values; callers can inject future company
 * style policies and reserved regions without modifying source measurements. */
export function placeComponentDimensions(view: DrawingViewport, style: ComponentDimensionStyle = DEFAULT_COMPONENT_DIMENSION_STYLE, extraObstacles: Rect[] = []): DrawingViewport {
  validateComponentDimensionStyle(style);
  if (view.projection !== "panel-face" || view.dimensions.length !== 2 || !view.thicknessDimension) throw new Error("Rectangular component placement requires a face and three linked nominal dimensions.");
  const options = view.dimensions.map(d => candidates(view, d, style, extraObstacles));
  const picked: DrawingDimension[] = [];
  outer: for (const a of options[0]) for (const b of options[1]) if (!collision(plotDimension(view, a), plotDimension(view, b), style.collisionGapMm)) { picked.push(a, b); break outer; }
  if (!picked.length) {
    for (let i = 0; i < options.length; i++) picked.push(options[i].find(d => picked.every(p => !collision(plotDimension(view, p), plotDimension(view, d), style.collisionGapMm))) ?? { ...view.dimensions[i], placement: { status: "unplaced" } });
  }
  const diagnostics: ComponentDimensionDiagnostic[] = picked.filter(d => d.placement?.status === "unplaced").map(d => ({ code: "no-readable-placement", groupId: view.semanticViewId,
    dimensionIds: [...d.equivalentDimensionIds!], message: `Required ${d.axis === "horizontal" ? "length" : "width"} dimension could not fit without collision: ${view.id}.` }));
  const { notes, heading } = viewportText(view), noteTop = view.frame.y + view.frame.height - 5 - (notes.length - 1) * 2.8;
  const noteBox = { x: view.frame.x + 3, y: noteTop, width: view.frame.width - 6, height: notes.length * 2.8 };
  const noteFits = containsRect(view.frame, noteBox) && noteTop > view.frame.y + 6 + (heading.length - 1) * 3.3 && ![componentDimensionObstacles(view)[0], ...extraObstacles].some(o => overlaps(noteBox, o, style.collisionGapMm));
  if (!noteFits) diagnostics.push({ code: "no-readable-placement", groupId: view.semanticViewId, dimensionIds: [...view.thicknessDimension.equivalentDimensionIds], message: `Required linked thickness annotation could not fit its reserved note band: ${view.id}.` });
  return { ...view, dimensions: picked, thicknessDimension: { ...view.thicknessDimension, status: noteFits ? "placed" : "unplaced" },
    componentDimensionLayout: { version: "rectangular-component-placement-1", groupId: view.semanticViewId!, style: { ...style }, diagnostics } };
}

function nextScale(scale: number): number {
  for (let decade = 1; decade <= 1e15; decade *= 10) for (const factor of [1, 2, 2.5, 5]) if (1 / (decade * factor) < scale - 1e-12) return 1 / (decade * factor);
  return scale / 2;
}

export function fitComponentDimensions(view: DrawingViewport, style: ComponentDimensionStyle = DEFAULT_COMPONENT_DIMENSION_STYLE): DrawingViewport {
  let positioned: DrawingViewport;
  try { positioned = positionViewport(view); }
  catch (error) { throw new Error(`Component ${view.id}: no readable viewport for required nominal dimensions. ${error instanceof Error ? error.message : "Regenerate with more sheet space."}`); }
  let best: DrawingViewport | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    const placed = placeComponentDimensions(positioned, style);
    if (!best || placed.componentDimensionLayout!.diagnostics.length < best.componentDimensionLayout!.diagnostics.length) best = placed;
    if (!placed.componentDimensionLayout!.diagnostics.length) return placed;
    positioned = positionViewport(view, nextScale(positioned.scale));
  }
  return best!;
}

export function componentDimensionCoverage(plan: ComponentDimensionPlan, views: DrawingViewport[], included: boolean): ComponentDimensionCoverage {
  const displayed = new Set(views.flatMap(v => [
    ...v.dimensions.filter(d => d.placement?.status === "placed").flatMap(d => d.equivalentDimensionIds ?? []),
    ...(v.thicknessDimension?.status === "placed" ? v.thicknessDimension.equivalentDimensionIds : []),
  ]));
  const required = plan.dimensions.map(d => d.id), missing = required.filter(id => !displayed.has(id));
  return { requiredDimensionIds: required, displayedDimensionIds: required.filter(id => displayed.has(id)), missingDimensionIds: missing, scope: plan.coverageScope,
    diagnostics: included ? views.flatMap(v => v.componentDimensionLayout?.diagnostics ?? []) : [{ code: "component-drawings-hidden", dimensionIds: required, message: "Component drawings are hidden; nominal blank dimensions remain resolved but are not displayed." }] };
}
