import type { AnyDrawingAnnotationModel, DrawingSheet, PlotEntity, Point2 } from "./types";
import { BALLOON_STYLE } from "./annotationGeometry";
import { wrapDrawingText } from "./layout";

/** Both preview and PDF use these same vector primitives. */
export function plotDrawingAnnotations(model: AnyDrawingAnnotationModel, sheet: DrawingSheet): PlotEntity[] {
  const out: PlotEntity[] = [], style = BALLOON_STYLE;
  for (const placement of sheet.balloons ?? []) {
    const balloon = model.balloons.find(b => b.id === placement.annotationId)!, item = model.items.find(i => i.key === balloon.itemKey)!;
    const anchor = model.anchors.find(a => a.id === placement.anchorId)!;
    const references = [anchor.reference];
    out.push({ kind: "line", from: placement.leaderPoints[0], to: placement.leaderPoints[1], width: style.strokeWidth, role: "annotation", strokeRole: "leader", sourceId: placement.leaderId, references });
    out.push({ kind: "circle", center: placement.leaderPoints[1], radius: style.anchorRadius, width: 0, filled: true, sourceId: anchor.id, references });
    out.push({ kind: "circle", center: placement.center, radius: style.radius, width: style.strokeWidth, sourceId: balloon.id, references });
    out.push({ kind: "text", at: { x: placement.center.x, y: placement.center.y + 1 }, text: item.label, size: style.textSize, align: "middle", sourceId: balloon.id, references });
  }
  const table = sheet.assemblyPartsList;
  if (table) {
    const line = (from: Point2, to: Point2) => out.push({ kind: "line", from, to, width: 0.2, role: "annotation", strokeRole: "table", sourceId: table.annotationId });
    const title = model.groupingPolicy === "assembly-scope-v1" ? "Assembly parts list - scoped quantities" : sheet.id.startsWith("AP-") ? "Assembly panel parts list" : "Assembly parts list (panels)";
    out.push({ kind: "text", at: { x: table.frame.x + 2, y: table.frame.y + 4 }, text: title, size: 2.6, bold: true, sourceId: table.annotationId });
    let y = table.frame.y + table.titleHeight;
    const row = (cells: string[][], height: number, bold: boolean, itemKey?: string) => {
      let x = table.frame.x;
      const item = model.items.find(i => i.key === itemKey);
      const references = item?.references;
      table.columns.forEach((column, i) => {
        line({ x, y }, { x: x + column.width, y }); line({ x, y }, { x, y: y + height });
        line({ x: x + column.width, y }, { x: x + column.width, y: y + height }); line({ x, y: y + height }, { x: x + column.width, y: y + height });
        cells[i].forEach((value, j) => out.push({ kind: "text", at: { x: x + 2, y: y + 2 + table.fontSize + j * table.lineHeight }, text: value, size: table.fontSize, bold, sourceId: item ? `assembly-item-${item.number}` : table.annotationId, references }));
        x += column.width;
      }); y += height;
    };
    row(table.columns.map(c => wrapDrawingText(c.label, c.width - 4, table.fontSize)), table.headerHeight, true);
    table.rows.forEach(fragment => row(fragment.cells, fragment.height, false, fragment.itemKey));
  }
  return out;
}
