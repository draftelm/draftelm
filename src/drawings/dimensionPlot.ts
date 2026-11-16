import type { DrawingDimension, DrawingViewport, PlotEntity, Point2 } from "./types";
export function modelToSheet(view: DrawingViewport, point: Point2): Point2 {
  return { x: view.origin.x + point.x * view.scale, y: view.origin.y - point.y * view.scale };
}
export const formatDimension = (n: number) => Number(n.toFixed(6)).toString();
export function plotDimension(view: DrawingViewport, d: DrawingDimension): PlotEntity[] {
  const a = modelToSheet(view, d.from), b = modelToSheet(view, d.to), offset = d.offsetPaperMm;
  const out: PlotEntity[] = [];
  const line = (from: Point2, to: Point2) => out.push({ kind: "line", from, to, width: 0.18, role: "dimension", sourceId: d.id, references: d.references });
  const text = `${d.prefix ?? ""}${formatDimension(d.valueMm)}`;
  if (d.axis === "horizontal") {
    const y = Math.max(a.y, b.y) + offset;
    for (const p of [a, b]) line({ x: p.x, y: p.y + 1 }, { x: p.x, y: y + 1.5 });
    line({ x: a.x, y }, { x: b.x, y });
    for (const [x, sign] of [[a.x, 1], [b.x, -1]]) out.push({ kind: "polygon", points: [{ x, y }, { x: x + sign * 2.4, y: y - 0.7 }, { x: x + sign * 2.4, y: y + 0.7 }] });
    out.push({ kind: "text", at: { x: (a.x + b.x) / 2, y: y - 1.2 }, size: 2.5, text, align: "middle" });
  } else {
    const x = Math.min(a.x, b.x) - offset;
    for (const p of [a, b]) line({ x: p.x - 1, y: p.y }, { x: x - 1.5, y: p.y });
    line({ x, y: a.y }, { x, y: b.y });
    const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
    for (const [y, sign] of [[top, 1], [bottom, -1]]) out.push({ kind: "polygon", points: [{ x, y }, { x: x - 0.7, y: y + sign * 2.4 }, { x: x + 0.7, y: y + sign * 2.4 }] });
    out.push({ kind: "text", at: { x: x - 1.2, y: (a.y + b.y) / 2 }, size: 2.5, text, align: "middle", rotation: -90 });
  }
  return out;
}

