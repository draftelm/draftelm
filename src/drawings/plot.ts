import type { DrawingDimension, DrawingDocument, DrawingSheet, DrawingViewport, PlotEntity, Point2 } from "./types";
import { FORMAL_TEMPLATE_LABEL } from "./generate";
import { titleBlockExtraHeight, titleBlockFields, viewportText, wrapDrawingText } from "./layout";
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

/** Both SVG and PDF consume these same paper-mm primitives. Text sizes/stroke
 * weights/arrowheads are paper dimensions and do not shrink with viewport scale.
 * Presentation defaults are not assertions of any BS/ISO clause compliance.
 */
export function plotSheet(document: DrawingDocument, sheet: DrawingSheet): PlotEntity[] {
  const formal = document.template === "engineering";
  const extraHeight = titleBlockExtraHeight(sheet.metadata);
  const out: PlotEntity[] = [];
  const line = (a: Point2, b: Point2, width = 0.2) => out.push({ kind: "line", from: a, to: b, width, role: "sheet" });
  const rect = (x: number, y: number, w: number, h: number) => {
    line({ x, y }, { x: x + w, y }); line({ x: x + w, y }, { x: x + w, y: y + h }); line({ x: x + w, y: y + h }, { x, y: y + h }); line({ x, y: y + h }, { x, y });
  };
  const text = (x: number, y: number, value: string, size = 2.5, bold = false) => out.push({ kind: "text", at: { x, y }, text: value, size, bold });
  rect(10, 10, sheet.widthMm - 20, sheet.heightMm - 20);
  text(13, 17, formal ? FORMAL_TEMPLATE_LABEL : "Furniture Workshop - preliminary drawing", 3, true);
  for (const view of sheet.viewports) {
    const { heading, notes } = viewportText(view);
    heading.forEach((value, i) => text(view.frame.x + 3, view.frame.y + 4 + i * 3.3, value, 2.6, true));
    for (const e of view.entities) out.push({ kind: "line", from: modelToSheet(view, e.from), to: modelToSheet(view, e.to), role: "geometry", width: view.projection === "isometric" ? 0.12 : formal ? 0.35 : 0.3, sourceId: e.id, references: e.references });
    for (const d of view.dimensions) out.push(...plotDimension(view, d));
    // Reserved note bands participate in geometry fitting; no text is truncated.
    notes.forEach((value, i) => text(view.frame.x + 3, view.frame.y + view.frame.height - 3 - (notes.length - 1 - i) * 2.8, value, 2));
  }
  if (sheet.table) {
    const table = sheet.table;
    text(13, 23, sheet.metadata.subject, 2.6, true);
    let y = table.frame.y;
    const row = (cells: string[][], height: number, bold: boolean) => {
      let x = table.frame.x;
      table.columns.forEach((column, i) => {
        rect(x, y, column.width, height);
        cells[i].forEach((value, j) => text(x + 2, y + 2 + table.fontSize + j * table.lineHeight, value, table.fontSize, bold));
        x += column.width;
      });
      y += height;
    };
    row(table.columns.map(c => wrapDrawingText(c.label, c.width - 4, table.fontSize)), table.headerHeight, true);
    for (const fragment of table.rows) row(fragment.cells, fragment.height, false);
  }
  sheet.annotations.flatMap(note => wrapDrawingText(note, sheet.widthMm - 26, 2.2)).forEach((note, i) => text(13, sheet.heightMm - 56 - extraHeight + i * 3, note, 2.2));
  const x = 10, y = sheet.heightMm - 47 - extraHeight, width = sheet.widthMm - 20;
  rect(x, y, width, 37 + extraHeight);
  line({ x, y: y + 12 }, { x: x + width, y: y + 12 }); line({ x, y: y + 24 }, { x: x + width, y: y + 24 });
  const fields = (offset: number, entries: [string, string, number][], height = 12) => {
    let left = x;
    for (const [label, value, fraction] of entries) {
      const w = width * fraction;
      if (left > x) line({ x: left, y: y + offset }, { x: left, y: y + offset + height });
      text(left + 2, y + offset + 3.5, label, 1.8);
      // Conservative maximum glyph advance (one em), shared by SVG/PDF output.
      const max = Math.max(3, Math.floor((w - 4) / 2.4));
      text(left + 2, y + offset + 9, value.length > max ? `${value.slice(0, max - 3)}...` : value, 2.4, true);
      left += w;
    }
  };
  const m = sheet.metadata;
  fields(0, [["PROJECT", m.projectName, 0.3], ["ASSEMBLY / COMPONENT", m.subject, 0.35], ["DRAWING NUMBER", m.drawingNumber, 0.35]]);
  fields(12, [["REVISION", m.revision, 0.1], ["UNITS", m.units, 0.08], ["SCALE", m.scale, 0.27], ["PROJECTION", document.projectionConvention === "first-angle" ? "FIRST-ANGLE" : "THIRD-ANGLE", 0.28], ["SHEET", `${m.number}/${m.total}`, 0.12], ["FORMAT", `${sheet.format} landscape`, 0.15]]);
  const additional = titleBlockFields(m);
  for (let i = 0; i < additional.length; i += 2) {
    fields(24 + i / 2 * 10, additional.slice(i, i + 2).map(f => [f.label, f.value, 0.5]), 10);
    line({ x, y: y + 34 + i / 2 * 10 }, { x: x + width, y: y + 34 + i / 2 * 10 });
  }
  text(13, y + 29 + extraHeight, m.status, 2.8, true);
  text(13, y + 34 + extraHeight, formal ? "BS 8888:2025 candidate. Licensed requirements have not been individually verified." : "Nominal design geometry only. Materials, hardware and manufacturing details unverified.", 2.1);
  return out;
}
