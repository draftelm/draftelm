import type { DrawingDimension, DrawingViewport, PlotEntity, Point2 } from "./types";
export function modelToSheet(view: DrawingViewport, point: Point2): Point2 {
  return { x: view.origin.x + point.x * view.scale, y: view.origin.y - point.y * view.scale };
}
export const formatDimension = (n: number) => Number(n.toFixed(6)).toString();
export function plotDimension(view: DrawingViewport, d: DrawingDimension): PlotEntity[] {
  if (d.placement?.status === "unplaced") return [];
  const a = modelToSheet(view, d.from), b = modelToSheet(view, d.to), offset = d.offsetPaperMm;
  const placement = d.placement?.status === "placed" ? d.placement : undefined, style = placement?.style;
  const size = style?.textSizeMm ?? 2.5, arrow = style?.arrowLengthMm ?? 2.4, half = style?.arrowHalfWidthMm ?? 0.7;
  const gap = style?.extensionGapMm ?? 1, overrun = style?.extensionOverrunMm ?? 1.5, textGap = style?.textGapMm ?? 1.2;
  const outside = placement?.arrows === "outside", arrowSign = outside ? -1 : 1;
  const out: PlotEntity[] = [];
  const line = (from: Point2, to: Point2) => out.push({ kind: "line", from, to, width: style?.lineWidthMm ?? 0.18, role: "dimension", sourceId: d.id, references: d.references });
  const text = `${d.prefix ?? ""}${formatDimension(d.valueMm)}`;
  if (d.axis === "horizontal") {
    const direction = placement?.side === "top" ? -1 : 1;
    const y = (direction < 0 ? Math.min(a.y, b.y) : Math.max(a.y, b.y)) + direction * offset;
    for (const p of [a, b]) line({ x: p.x, y: p.y + direction * gap }, { x: p.x, y: y + direction * overrun });
    line({ x: Math.min(a.x, b.x) - (outside ? arrow + gap : 0), y }, { x: Math.max(a.x, b.x) + (outside ? arrow + gap : 0), y });
    for (const [x, sign] of [[Math.min(a.x, b.x), arrowSign], [Math.max(a.x, b.x), -arrowSign]]) out.push({ kind: "polygon", sourceId: d.id, references: d.references, points: [{ x, y }, { x: x + sign * arrow, y: y - half }, { x: x + sign * arrow, y: y + half }] });
    out.push({ kind: "text", at: { x: (a.x + b.x) / 2, y: y - textGap }, size, text, align: "middle", sourceId: d.id, references: d.references });
  } else {
    const direction = placement?.side === "right" ? 1 : -1;
    const x = (direction > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x)) + direction * offset;
    for (const p of [a, b]) line({ x: p.x + direction * gap, y: p.y }, { x: x + direction * overrun, y: p.y });
    line({ x, y: Math.min(a.y, b.y) - (outside ? arrow + gap : 0) }, { x, y: Math.max(a.y, b.y) + (outside ? arrow + gap : 0) });
    const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
    for (const [y, sign] of [[top, arrowSign], [bottom, -arrowSign]]) out.push({ kind: "polygon", sourceId: d.id, references: d.references, points: [{ x, y }, { x: x - half, y: y + sign * arrow }, { x: x + half, y: y + sign * arrow }] });
    out.push({ kind: "text", at: { x: direction < 0 ? x - textGap : x + textGap + size, y: (a.y + b.y) / 2 }, size, text, align: "middle", rotation: -90, sourceId: d.id, references: d.references });
  }
  return out;
}

