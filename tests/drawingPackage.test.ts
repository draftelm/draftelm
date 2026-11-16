import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { BOMLine, FurnitureResult } from "../src/furniture";
import { DEFAULT_DRAWING_OPTIONS, generateDrawingDocument, plotDimension, plotSheet, reconcileDrawingParts } from "../src/drawings";
import type { DrawingDocument, DrawingOptions, DrawingViewport, PlotEntity, Rect } from "../src/drawings";
import { viewportText } from "../src/drawings/layout";

function pack(options: Partial<DrawingOptions> = {}, count = 4) {
  const specification = createDemoChestSpecification();
  specification.drawerCount = count;
  if (count > 4) specification.dimensions.height = count * 220;
  const result = generateFurniture(specification);
  const generated = generateDrawingDocument(result, { ...DEFAULT_DRAWING_OPTIONS, ...options });
  assert(generated.document, generated.issues.join(" "));
  return { result, document: generated.document };
}
const details = (document: DrawingDocument) => document.sheets.flatMap(s => s.viewports).filter(v => v.projection === "panel-face");

test("every physical panel has one grouped drawing and cutting-list entry, including all six parts of every drawer", () => {
  const { result, document } = pack();
  const views = details(document), ids = views.flatMap(v => v.references.map(r => r.componentId));
  const panels = result.components.filter(c => c.kind === "panel");
  assert.equal(views.length, 7); assert.equal(ids.length, 29); assert.equal(new Set(ids).size, 29);
  assert.deepEqual([...ids].sort(), panels.map(p => p.id).sort());
  assert.deepEqual(document.cuttingList.map(row => [row.quantity, row.cutSize]), [
    [2, { length: 900, width: 500, thickness: 18 }], [2, { length: 814, width: 500, thickness: 18 }],
    [1, { length: 864, width: 814, thickness: 6 }], [4, { length: 838.6, width: 400, thickness: 6 }],
    [8, { length: 400, width: 124, thickness: 12 }], [8, { length: 814.6, width: 124, thickness: 12 }],
    [4, { length: 896, width: 209.25, thickness: 18 }],
  ]);
  for (let drawer = 1; drawer <= 4; drawer++) for (const key of ["front", "left", "right", "box-front", "rear", "bottom"]) {
    assert(ids.includes(`chest/drawer-${drawer}/${key}`));
  }
  for (const view of views) {
    const line = result.bom.find(l => l.id === view.references[0].bomId)!;
    assert.deepEqual(view.dimensions.map(d => d.valueMm), [line.cutSize!.length, line.cutSize!.width]);
    assert.deepEqual(view.references.map(r => r.componentId).sort(), [...line.componentIds].sort());
    assert(view.entities.every(e => e.references.length === line.componentIds.length));
    for (const ref of view.references) {
      const panel = panels.find(p => p.id === ref.componentId)!;
      const edges = (["x", "y", "z"] as const).filter(a => a !== panel.thicknessAxis).map(a => panel.dimensions[a]).sort((a, b) => b - a);
      assert.deepEqual(view.dimensions.map(d => d.valueMm), edges);
    }
  }
});

test("complete schedule is an immutable BOM projection with explicit materials and unresolved hardware quantities", () => {
  const { result, document } = pack();
  assert(document.reconciliation.valid);
  assert.equal(document.reconciliation.panelCount, 29);
  assert.equal(document.reconciliation.panelQuantity, 29);
  assert.equal(document.componentSchedule.length, result.bom.length);
  for (const row of document.componentSchedule) {
    const line = result.bom.find(l => l.id === row.bomId)!;
    assert.equal(row.quantity, line.quantity); assert.equal(row.itemId, line.itemId);
    assert.deepEqual(row.componentIds, line.componentIds); assert.deepEqual(row.partNames, line.partNames);
    assert.deepEqual(row.cutSize, line.cutSize); assert.equal(row.description, line.partNames.join(" / "));
  }
  assert.deepEqual(document.componentSchedule.flatMap(row => row.componentIds).sort(), result.components.map(c => c.id).sort());
  assert.equal(document.cuttingList.reduce((n, row) => n + row.quantity, 0), 29);
  const hardware = document.componentSchedule.filter(row => row.kind === "hardware");
  assert.deepEqual(hardware.map(row => row.quantity).sort((a, b) => a - b), [8, 8, 160]);
  assert(hardware.every(row => row.cutSize === undefined));
  const before = JSON.stringify(result);
  document.componentSchedule[0].componentIds.pop(); document.componentSchedule[0].cutSize!.length++;
  assert.equal(JSON.stringify(result), before, "drawing data must not alias the engineering BOM");
});

const corruptions: [string, "missing" | "duplicate" | "mismatch", (r: FurnitureResult) => void][] = [
  ["missing decorative front BOM link", "missing", r => { const l = r.bom.find(l => l.componentIds.includes("chest/drawer-4/front"))!; l.componentIds.pop(); l.quantity--; }],
  ["missing physical drawer rear", "missing", r => { r.components = r.components.filter(c => c.id !== "chest/drawer-4/rear"); }],
  ["duplicate ID within BOM group", "duplicate", r => { const l = r.bom.find(l => l.componentIds.includes("chest/drawer-4/front"))!; l.componentIds.push(l.componentIds[0]); l.quantity++; }],
  ["duplicate BOM line", "duplicate", r => { r.bom.push(structuredClone(r.bom[0])); }],
  ["duplicate engineering component", "duplicate", r => { r.components.push(structuredClone(r.components[0])); }],
  ["extra BOM part ID", "missing", r => { r.bom[0].componentIds.push("missing-part"); }],
  ["wrong group quantity", "mismatch", r => { r.bom.find(l => l.componentIds.includes("chest/drawer-4/bottom"))!.quantity++; }],
  ["wrong material on nonrepresentative member", "mismatch", r => { const p = r.components.find(c => c.id === "chest/drawer-4/front")!; if (p.kind === "panel") p.materialId = "other-material"; }],
  ["wrong cut dimension on nonrepresentative member", "mismatch", r => { const p = r.components.find(c => c.id === "chest/drawer-4/right")!; if (p.kind === "panel") p.dimensions.z--; }],
  ["wrong thickness axis dimension", "mismatch", r => { const p = r.components.find(c => c.id === "chest/drawer-4/bottom")!; if (p.kind === "panel") p.dimensions.y++; }],
  ["wrong BOM cut size", "mismatch", r => { r.bom.find(l => l.componentIds.includes("chest/drawer-4/box-front"))!.cutSize!.width--; }],
  ["missing BOM cut size", "mismatch", r => { delete r.bom[0].cutSize; }],
  ["wrong BOM kind", "mismatch", r => { r.bom[0].kind = "hardware"; }],
  ["wrong BOM description", "mismatch", r => { r.bom[0].partNames = ["invented"]; }],
  ["wrong hardware quantity", "mismatch", r => { r.bom.find(l => l.kind === "hardware")!.quantity++; }],
  ["missing hardware line", "missing", r => { r.bom = r.bom.filter(l => l.kind === "panel"); }],
];
for (const [name, code, corrupt] of corruptions) test(`reconciliation flags ${name} and withholds the entire drawing package`, () => {
  const result = generateFurniture(createDemoChestSpecification()); corrupt(result);
  const checked = reconcileDrawingParts(result);
  assert.equal(checked.valid, false); assert(checked.issues.some(issue => issue.code === code));
  const generated = generateDrawingDocument(result);
  assert.equal(generated.document, null); assert(generated.issues.length > 0);
});

test("drawing schedule and component views are checked independently against the source BOM", () => {
  const { result, document } = pack();
  const schedule = structuredClone(document.componentSchedule);
  schedule.pop(); schedule[0].quantity++; schedule[1].componentIds.pop(); schedule.push(structuredClone(schedule[0]));
  const views = structuredClone(details(document));
  views.pop(); views[0].dimensions[0].valueMm++; views.push(structuredClone(views[1]));
  const checked = reconcileDrawingParts(result, schedule, views);
  assert.equal(checked.valid, false);
  assert.deepEqual([...new Set(checked.issues.map(i => i.code))].sort(), ["duplicate", "mismatch", "missing"]);
  assert(checked.issues.some(i => i.message.includes("schedule")));
  assert(checked.issues.some(i => i.message.includes("Panel drawing missing")));
});

for (const count of [1, 3, 8, 64]) test(`${count} drawers: every updated engine dimension and ID is traced with no stale parts`, () => {
  const { result, document } = pack({}, count);
  assert.equal(document.reconciliation.panelCount, 5 + 6 * count);
  assert(reconcileDrawingParts(result, document.componentSchedule, details(document)).valid);
  assert.equal(document.cuttingList.find(row => row.componentIds.includes("chest/drawer-1/front"))!.quantity, count);
  assert(!document.cuttingList.flatMap(row => row.componentIds).includes(`chest/drawer-${count + 1}/front`));
});

test("all panel drawings and schedule sizes follow changed engine dimensions, thicknesses and nominal back gap", () => {
  const s = createDemoChestSpecification();
  s.dimensions = { width: 1100, height: 1000, depth: 600 };
  s.panels.carcass.thickness = 20; s.panels.back.thickness = 8;
  s.panels.drawerWall.thickness = 15; s.panels.drawerBottom.thickness = 8; s.panels.drawerFront.thickness = 22;
  s.construction.back.edgeClearance = 1;
  const result = generateFurniture(s), generated = generateDrawingDocument(result);
  assert(generated.document, generated.issues.join(" "));
  for (const view of details(generated.document)) for (const ref of view.references) {
    const panel = result.components.find(c => c.id === ref.componentId)!; assert(panel.kind === "panel");
    const edges = (["x", "y", "z"] as const).filter(a => a !== panel.thicknessAxis).map(a => panel.dimensions[a]).sort((a, b) => b - a);
    assert.deepEqual(view.dimensions.map(d => d.valueMm), edges);
    const cut: NonNullable<BOMLine["cutSize"]> = generated.document.cuttingList.find(row => row.componentIds.includes(panel.id))!.cutSize!;
    assert.deepEqual([cut.length, cut.width, cut.thickness], [...edges, panel.thickness]);
  }
});

test("drawing groups stay linked when engine BOM combines the same blank across component roles", () => {
  const s = createDemoChestSpecification();
  s.panels.drawerFront = { ...s.panels.carcass };
  // A one-drawer front is the same blank as top/base; all geometry is still engine generated.
  s.drawerCount = 1; s.dimensions.height = 504; s.construction.fronts.verticalGap = 3;
  s.construction.fronts.edgeGap.left = 0; s.construction.fronts.edgeGap.right = 0;
  const result = generateFurniture(s);
  assert(result.geometryValid);
  const generated = generateDrawingDocument(result); assert(generated.document);
  const shared = generated.document.cuttingList.find(row => row.componentIds.includes("chest/carcass/top"))!;
  assert.deepEqual(shared.componentIds, ["chest/carcass/base", "chest/carcass/top", "chest/drawer-1/front"]);
  assert.equal(shared.quantity, 3);
  // The ordinary engine grouping is used, regardless of which assembly owns a member.
  assert(reconcileDrawingParts(result, generated.document.componentSchedule, details(generated.document)).valid);
});

test("multiple BOM faults report all implicated IDs instead of only the first error", () => {
  const result = generateFurniture(createDemoChestSpecification());
  const front = result.bom.find(row => row.componentIds.includes("chest/drawer-4/front"))!;
  front.componentIds.pop(); front.quantity--;
  result.bom[0].quantity++;
  const generated = generateDrawingDocument(result);
  assert.equal(generated.document, null);
  assert(generated.issues.some(message => message.includes("chest/drawer-4/front")));
  assert(generated.issues.some(message => message.includes(result.bom[0].id)));
});

/** Conservative paper-space bounds, including rotated dimension lettering. */
function extent(entity: PlotEntity): Rect {
  if (entity.kind === "circle") return { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius, width: entity.radius * 2, height: entity.radius * 2 };
  if (entity.kind !== "text") {
    const points = entity.kind === "line" ? [entity.from, entity.to] : entity.points;
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
  }
  const width = Array.from(entity.text).length * entity.size;
  if (entity.rotation === -90) return { x: entity.at.x - entity.size, y: entity.at.y - width / 2, width: entity.size * 1.2, height: width };
  return { x: entity.at.x - (entity.align === "middle" ? width / 2 : 0), y: entity.at.y - entity.size, width, height: entity.size * 1.2 };
}
function inside(child: Rect, parent: Rect) {
  assert(child.x >= parent.x - 1e-6 && child.y >= parent.y - 1e-6 && child.x + child.width <= parent.x + parent.width + 1e-6 && child.y + child.height <= parent.y + parent.height + 1e-6,
    JSON.stringify({ child, parent }));
}
function checkView(view: DrawingViewport) {
  const { heading, notes } = viewportText(view);
  const headerBottom = view.frame.y + 4 + (heading.length - 1) * 3.3 + 0.6;
  const noteTop = view.frame.y + view.frame.height - 5 - (notes.length - 1) * 2.8;
  for (const dim of view.dimensions) for (const entity of plotDimension(view, dim)) {
    const box = extent(entity); inside(box, view.frame);
    assert(box.y > headerBottom, `dimension overlaps heading: ${view.id}`);
    if (notes.length) assert(box.y + box.height < noteTop, `dimension overlaps notes: ${view.id}`);
  }
}
for (const format of ["A4", "A3", "A2", "A1"] as const) for (const template of ["workshop", "engineering"] as const) test(`${format} ${template}: full text and dimension extents fit reserved bands and schedule cells`, () => {
  const { document } = pack({ format, template }, 12);
  assert(document.reconciliation.valid);
  for (const sheet of document.sheets) {
    assert.equal(sheet.metadata.number, document.sheets.indexOf(sheet) + 1); assert.equal(sheet.metadata.total, document.sheets.length);
    for (const entity of plotSheet(document, sheet)) inside(extent(entity), { x: 10, y: 10, width: sheet.widthMm - 20, height: sheet.heightMm - 20 });
    sheet.viewports.forEach(checkView);
    if (!sheet.table) continue;
    const table = sheet.table;
    assert(table.headerHeight + table.rows.reduce((sum, row) => sum + row.height, 0) <= table.frame.height);
    for (const row of table.rows) row.cells.forEach((cell, i) => {
      assert(cell.every(value => Array.from(value).length * table.fontSize <= table.columns[i].width - 4));
      assert(cell.length * table.lineHeight <= row.height - 4);
    });
  }
  const allFragments = document.sheets.flatMap(s => s.table?.rows ?? []);
  for (const row of document.componentSchedule) {
    const fragments = allFragments.filter(fragment => fragment.bomId === row.bomId);
    assert(fragments.length);
    assert.equal(fragments.filter(fragment => !fragment.continuation).length, 1);
    assert.deepEqual(fragments.flatMap(fragment => fragment.cells[2]), row.componentIds);
    assert.equal(fragments.flatMap(fragment => fragment.cells[3]).join(""), String(row.quantity));
  }
});

test("long material identifiers continue without losing characters or creating duplicate quantities", () => {
  const s = createDemoChestSpecification(), materialId = "W".repeat(1600);
  s.materials.push({ id: materialId, name: "User supplied material", kind: "sheet" }); s.panels.drawerFront.materialId = materialId;
  const result = generateFurniture(s), generated = generateDrawingDocument(result, { ...DEFAULT_DRAWING_OPTIONS, format: "A4" });
  assert(generated.document, generated.issues.join(" "));
  const document = generated.document, row = document.cuttingList.find(row => row.itemId === materialId)!;
  const fragments = document.sheets.flatMap(s => s.table?.rows ?? []).filter(fragment => fragment.bomId === row.bomId);
  assert(fragments.some(fragment => fragment.continuation));
  assert.equal(fragments.flatMap(fragment => fragment.cells[5]).join(""), materialId);
  assert.equal(fragments.flatMap(fragment => fragment.cells[3]).join(""), "4");
});
