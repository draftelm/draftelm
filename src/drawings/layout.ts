import type { ComponentReference, DrawingScheduleRow, DrawingTable, DrawingTableRow, DrawingViewport, SheetMetadata } from "./types";
import { formatDimension } from "./dimensionPlot";

export function titleBlockFields(metadata: Pick<SheetMetadata, "companyName" | "additionalFields">) {
  return [...(metadata.companyName?.trim() ? [{ label: "COMPANY", value: metadata.companyName }] : []), ...(metadata.additionalFields ?? [])];
}
export function titleBlockExtraHeight(metadata: Pick<SheetMetadata, "companyName" | "additionalFields">) {
  return Math.ceil(titleBlockFields(metadata).length / 2) * 10;
}

/** One em per character is conservative for the shared Arial/Helvetica presentation.
 * Keep every character, splitting even long unbroken identifiers when necessary. */
export function wrapDrawingText(value: string, width: number, size: number): string[] {
  const capacity = Math.max(1, Math.floor(width / size));
  return value.split(/\r?\n/).flatMap(paragraph => {
    const lines: string[] = [];
    let remaining = Array.from(paragraph);
    while (remaining.length > capacity) {
      const space = remaining.slice(0, capacity + 1).lastIndexOf(" ");
      const end = space > 0 ? space : capacity;
      lines.push(remaining.slice(0, end).join(""));
      remaining = remaining.slice(end + (space > 0 ? 1 : 0));
    }
    lines.push(remaining.join(""));
    return lines;
  });
}

export function viewportNotes(view: DrawingViewport): { text: string; sourceId?: string; references?: ComponentReference[] }[] {
  const thickness = view.thicknessDimension?.status === "placed" ? view.thicknessDimension : undefined;
  return [
    ...(view.functionalDimension?.status === "placed" && view.functionalDimension.valueMm === 0 ? [{ text: "Measured 0 mm (coincident reference planes)", sourceId: view.functionalDimension.representativeDimensionId, references: view.references }] : []),
    ...(thickness ? [{ text: `Thickness ${formatDimension(thickness.valueMm)} mm (normal to face)`, sourceId: thickness.id, references: thickness.references }] : []),
    ...view.annotations.map(text => ({ text })),
  ].flatMap(note => wrapDrawingText(note.text, view.frame.width - 6, 2).map(text => ({ ...note, text })));
}

export function viewportText(view: DrawingViewport) {
  return {
    heading: wrapDrawingText(`${view.label} | ${view.scaleLabel}`, view.frame.width - 6, 2.6),
    notes: viewportNotes(view).map(note => note.text),
  };
}

export function viewportPadding(view: DrawingViewport) {
  const { heading, notes } = viewportText(view);
  return { left: Math.max(25, view.balloonMargin ?? 0), right: Math.max(view.sectionData ? 14 : 8, view.balloonMargin ?? 0), top: 7 + (heading.length - 1) * 3.3 + (view.functionalDimension ? 5 : 0) + (view.sectionData?.kind === "detail" ? 28 : view.sectionData?.kind === "parent" ? 12 : view.sectionData ? 8 : 0),
    bottom: notes.length ? 15 + notes.length * 2.8 : 13 };
}

const numberText = (n: number) => Number(n.toFixed(6)).toString();
/** The logical rows stay complete; physical rows can continue onto further sheets.
 * Quantities are printed once per BOM line so continuation pages cannot double them. */
export function paginateSchedule(schedule: DrawingScheduleRow[], page: { width: number; height: number }): DrawingTable[] {
  const width = page.width - 20;
  const hardware = schedule.length > 0 && schedule.every(row => row.kind === "hardware");
  const fixedWidth = hardware ? 104 : 94;
  const columns = [
    { label: hardware ? "BOM / kind" : "Item / BOM", width: 27 }, { label: "Description", width: (width - fixedWidth) * 0.28 },
    { label: "Unique part IDs", width: (width - fixedWidth) * 0.44 }, { label: hardware ? "Allowance qty" : "Qty", width: hardware ? 22 : 12 },
    { label: "Cut L x W x T (mm)", width: 55 }, { label: "Material / item ID", width: (width - fixedWidth) * 0.28 },
  ];
  const frame = { x: 10, y: 26, width, height: page.height - 88 };
  const fontSize = 2, lineHeight = 2.8, headerHeight = 11;
  const maxLines = Math.floor((frame.height - headerHeight - 4) / lineHeight);
  const tables: DrawingTable[] = [];
  let rows: DrawingTableRow[] = [], used = headerHeight;
  const flush = () => {
    if (rows.length) tables.push({ frame: { ...frame }, columns, rows, headerHeight, fontSize, lineHeight });
    rows = []; used = headerHeight;
  };
  for (const row of schedule) {
    const cut = row.cutSize;
    const values = [`${row.drawingItemLabel ? `Item ${row.drawingItemLabel}\n` : ""}${row.bomId}\n${row.kind}`, row.description, row.componentIds.join("\n"), String(row.quantity),
      cut ? `${numberText(cut.length)} x ${numberText(cut.width)} x ${numberText(cut.thickness)}` : "Not specified", row.itemId];
    const cells = values.map((value, i) => wrapDrawingText(value, columns[i].width - 4, fontSize));
    const count = Math.max(...cells.map(cell => cell.length));
    for (let start = 0; start < count; start += maxLines) {
      const fragment = cells.map(cell => cell.slice(start, start + maxLines));
      const continuation = start > 0;
      if (continuation) fragment[0] = [row.bomId, "(cont.)"];
      const height = Math.max(2, ...fragment.map(cell => cell.length)) * lineHeight + 4;
      if (used + height > frame.height) flush();
      rows.push({ bomId: row.bomId, continuation, cells: fragment, height }); used += height;
    }
  }
  flush();
  return tables;
}
