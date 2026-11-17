import { itemReferenceText } from "./annotationItems";
import type { AnyDrawingAnnotationModel, PlacedAssemblyPartsList, Rect } from "./types";
import { wrapDrawingText } from "./layout";

/** A presentation of validated item references, not a second BOM. Font size is fixed
 * at 2.5 paper mm; overflow moves/splits tables instead of shrinking lettering. */
export function paginateAssemblyPartsList(model: AnyDrawingAnnotationModel, width: number, availableHeight: number): PlacedAssemblyPartsList[] {
  const columns = [{ label: "Item", width: 16 }, { label: "Description", width: (width - 30) * 0.56 }, { label: "Qty", width: 14 }, { label: model.groupingPolicy === "assembly-scope-v1" ? "BOM / size / material" : "Material ID", width: (width - 30) * 0.44 }];
  const fontSize = 2.5, lineHeight = 3.2, titleHeight = 7, headerHeight = 11;
  const maxLines = Math.floor((availableHeight - titleHeight - headerHeight - 4) / lineHeight);
  if (maxLines < 2) throw new Error("Assembly parts list cannot fit readable text on this sheet.");
  const pages: PlacedAssemblyPartsList[] = [];
  let rows: PlacedAssemblyPartsList["rows"] = [], height = titleHeight + headerHeight;
  const flush = () => {
    if (rows.length) pages.push({ annotationId: model.partsList.id, frame: { x: 10, y: 23, width, height }, columns, rows, fontSize, lineHeight, titleHeight, headerHeight });
    rows = []; height = titleHeight + headerHeight;
  };
  for (const key of model.partsList.itemKeys) {
    const item = model.items.find(i => i.key === key)!;
    const cells = [item.label, item.description, String(item.quantity), itemReferenceText(item)].map((value, i) => wrapDrawingText(value, columns[i].width - 4, fontSize));
    const count = Math.max(...cells.map(cell => cell.length));
    for (let start = 0; start < count; start += maxLines) {
      const fragment = cells.map(cell => cell.slice(start, start + maxLines));
      if (start) fragment[0] = [item.label, "..."];
      const rowHeight = Math.max(2, ...fragment.map(cell => cell.length)) * lineHeight + 4;
      if (height + rowHeight > availableHeight) flush();
      rows.push({ itemKey: item.key, continuation: start > 0, cells: fragment, height: rowHeight }); height += rowHeight;
    }
  }
  flush(); return pages;
}

export function planAssemblyPartsList(model: AnyDrawingAnnotationModel, page: { width: number; height: number }, enabled: boolean, hasGA: boolean, gaSlot?: Rect | null) {
  if (enabled && !hasGA) model.diagnostics.push({ code: "assembly-views-hidden", annotationId: model.partsList.id, componentIds: [], message: "Assembly parts list is not printed because assembly views are hidden; all item links remain internal." });
  if (!enabled || !hasGA) return { viewWidth: page.width, onGA: undefined, continuations: [] as PlacedAssemblyPartsList[] };
  if (gaSlot !== undefined) {
    if (gaSlot && gaSlot.width >= 110 && gaSlot.height >= 50) {
      const tables = paginateAssemblyPartsList(model, gaSlot.width, gaSlot.height);
      if (tables.length === 1) {
        tables[0].frame.x = gaSlot.x; tables[0].frame.y = gaSlot.y;
        return { viewWidth: page.width, onGA: tables[0], continuations: [] as PlacedAssemblyPartsList[] };
      }
    }
    model.diagnostics.push({ code: "parts-list-moved", annotationId: model.partsList.id, componentIds: [], message: "Assembly parts list moved to adjacent AP sheets to preserve the primary view, readable text and clear supporting views." });
    return { viewWidth: page.width, onGA: undefined, continuations: paginateAssemblyPartsList(model, page.width - 20, page.height - 85) };
  }
  const tableWidth = 150, remainingWidth = page.width - 20 - tableWidth - 8, availableHeight = page.height - 85;
  const compact = paginateAssemblyPartsList(model, tableWidth, availableHeight);
  if (remainingWidth >= 230 && compact.length === 1) {
    compact[0].frame.x = page.width - 10 - tableWidth;
    return { viewWidth: remainingWidth + 20, onGA: compact[0], continuations: [] as PlacedAssemblyPartsList[] };
  }
  model.diagnostics.push({ code: "parts-list-moved", annotationId: model.partsList.id, componentIds: [], message: "Assembly parts list moved to adjacent AP sheets to preserve readable text and clear viewports." });
  return { viewWidth: page.width, onGA: undefined, continuations: paginateAssemblyPartsList(model, page.width - 20, availableHeight) };
}
