import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { PanelComponent } from "../src/furniture";
import { DEFAULT_DRAWING_OPTIONS, FORMAL_TEMPLATE_LABEL, generateDrawingDocument, SHEET_FORMATS } from "../src/drawings/generate";
import { isometricLines, orthographicLines, projectPoint } from "../src/drawings/projections";
import { modelToSheet, plotDimension, plotSheet } from "../src/drawings/plot";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";
import type { DrawingOptions, PlotEntity } from "../src/drawings";
const near = (a: number, b: number, tolerance = 1e-7) => assert(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function reference(options: Partial<DrawingOptions> = {}) {
  const result = generateFurniture(createDemoChestSpecification());
  const generated = generateDrawingDocument(result, { ...DEFAULT_DRAWING_OPTIONS, ...options });
  assert(generated.document, generated.issues.join(" "));
  return { result, document: generated.document };
}

test("A3 package retains general assembly and carcass sheets alongside all panel details and schedules", () => {
  const { result, document } = reference();
  assert.equal(document.sheets.length, 6);
  assert.deepEqual(document.sheets.map(s => s.id), ["GA-001", "CP-001", "CP-002", "CP-003", "CL-001", "HW-001"]);
  const [ga, cp] = document.sheets;
  assert.deepEqual([ga.widthMm, ga.heightMm], [420, 297]);
  assert.equal(ga.viewports.length, 4); assert.equal(cp.viewports.length, 3);
  assert(ga.metadata.subject.includes(result.assemblies.find(a => a.parentId === null)!.name));
  assert.equal(document.manufacturingReady, false); assert.equal(document.complianceVerified, false);
  assert.equal(document.specificationRevision, result.specificationRevision);
  assert.equal(document.template, "workshop");
  assert.equal(document.standardsCandidate, "BS 8888:2025");
  for (const s of document.sheets) {
    assert.equal(s.metadata.units, "mm"); assert.equal(s.metadata.revision, "A");
    assert.equal(s.metadata.total, document.sheets.length); assert(s.metadata.scale); assert(s.metadata.status.includes("NOT FOR MANUFACTURE"));
  }
});

test("GA dimensions distinguish 518 mm overall depth from the 500 mm carcass", () => {
  const { document } = reference();
  const dims = document.sheets[0].viewports.flatMap(v => v.dimensions);
  assert.deepEqual(dims.map(d => [d.id, d.valueMm]), [["overall-width", 900], ["overall-height", 850], ["carcass-depth", 500], ["overall-depth", 518]]);
  assert.equal(document.sheets[0].viewports[0].scale, 0.1);
  assert.equal(document.sheets[0].metadata.scale, "1:10 main; iso 1:20");
});

test("asymmetric coordinate markers preserve front, top and right orientation", () => {
  const p = { x: 11, y: 22, z: 33 };
  assert.deepEqual(projectPoint(p, "front"), { x: 11, y: 22 });
  assert.deepEqual(projectPoint(p, "top"), { x: 11, y: 33 });
  assert.deepEqual(projectPoint(p, "right"), { x: 33, y: 22 });
  assert(projectPoint({ ...p, z: 44 }, "top").y > projectPoint(p, "top").y);
  assert(projectPoint({ ...p, z: 44 }, "right").x > projectPoint(p, "right").x);
});

test("isometric is linear, parallel and equally foreshortens all three axes", () => {
  const origin = projectPoint({ x: 0, y: 0, z: 0 }, "isometric");
  assert.deepEqual(origin, { x: 0, y: 0 });
  for (const p of [{ x: 100, y: 0, z: 0 }, { x: 0, y: 100, z: 0 }, { x: 0, y: 0, z: 100 }]) {
    const q = projectPoint(p, "isometric"); near(Math.hypot(q.x, q.y), 100 * Math.sqrt(2 / 3));
    const doubled = projectPoint({ x: p.x * 2, y: p.y * 2, z: p.z * 2 }, "isometric"); near(doubled.x, q.x * 2); near(doubled.y, q.y * 2);
  }
  const { result } = reference(); assert.equal(isometricLines(result.components.filter(c => c.kind === "panel")).length, 29 * 12);
});

for (const convention of ["first-angle", "third-angle"] as const) test(`${convention} named views are correctly placed and aligned without mirroring geometry`, () => {
  const { document } = reference({ projectionConvention: convention });
  const views = document.sheets[0].viewports, front = views.find(v => v.projection === "front")!, top = views.find(v => v.projection === "top")!, right = views.find(v => v.projection === "right")!;
  assert.equal(front.scale, top.scale); assert.equal(front.scale, right.scale);
  assert.equal(front.origin.x, top.origin.x); assert.equal(front.origin.y, right.origin.y);
  assert.equal(top.frame.y > front.frame.y, convention === "first-angle");
  assert.equal(right.frame.x < front.frame.x, convention === "first-angle");
  const other = reference({ projectionConvention: convention === "first-angle" ? "third-angle" : "first-angle" }).document;
  for (const v of views) assert.deepEqual(v.entities, other.sheets[0].viewports.find(o => o.id === v.id)!.entities);
});

function box(id: string, x: number, width: number, z: number): PanelComponent {
  return { id, kind: "panel", assemblyId: "test", name: id, materialId: "test", thickness: 1, thicknessAxis: "z", quantity: 1, position: { x, y: 0, z }, dimensions: { x: width, y: 10, z: 1 } };
}
test("orthographic occlusion omits fully hidden outlines and clips partially hidden segments", () => {
  const behind = box("behind", 0, 10, 10), cover = box("cover", 0, 10, 0);
  assert(orthographicLines([behind, cover], "front").every(e => e.references.every(r => r.componentId !== "behind")));
  const partial = orthographicLines([behind, box("cover", 0, 5, 0)], "front");
  const background = partial.filter(e => e.references.some(r => r.componentId === "behind"));
  assert(background.length > 0); assert(background.every(e => e.from.x >= 5 && e.to.x >= 5));
  assert(partial.some(e => e.from.x === 5 && e.to.x === 10));
});

test("carcass sheet uses BOM identities, exact panel blanks and quantities", () => {
  const { document, result } = reference(); const details = document.sheets[1].viewports;
  assert.deepEqual(details.map(v => v.dimensions.map(d => d.valueMm)), [[900, 500], [814, 500], [864, 814]]);
  const refs = details.flatMap(v => v.references);
  assert.deepEqual(refs.map(r => r.componentId).sort(), result.components.filter(c => c.kind === "panel" && c.assemblyId === "chest/carcass").map(c => c.id).sort());
  assert(refs.every(r => result.bom.some(l => l.id === r.bomId && l.componentIds.includes(r.componentId))));
  assert(details[0].annotations[0].includes("Qty 2")); assert(details[2].annotations[0].includes("Thickness 6 mm"));
});

function points(entity: PlotEntity) {
  if (entity.kind === "circle") return [{ x: entity.center.x - entity.radius, y: entity.center.y - entity.radius }, { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius }];
  return entity.kind === "line" ? [entity.from, entity.to] : entity.kind === "polygon" ? entity.points : [entity.at];
}
for (const format of ["A4", "A3", "A2", "A1"] as const) for (const convention of ["first-angle", "third-angle"] as const) test(`${format} ${convention}: sheet and viewport fitting keep all plotted primitives within boundaries`, () => {
  const { document } = reference({ format, projectionConvention: convention });
  for (const sheet of document.sheets) {
    assert.equal(sheet.widthMm, SHEET_FORMATS[format].width);
    assert.equal(sheet.heightMm, SHEET_FORMATS[format].height);
    for (const entity of plotSheet(document, sheet)) for (const p of points(entity)) {
      assert(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert(p.x >= 10 - 1e-7 && p.x <= sheet.widthMm - 10 + 1e-7, JSON.stringify(entity));
      assert(p.y >= 10 - 1e-7 && p.y <= sheet.heightMm - 10 + 1e-7, JSON.stringify(entity));
    }
    for (const view of sheet.viewports) for (const e of view.entities) for (const p of [e.from, e.to].map(p => modelToSheet(view, p))) {
      assert(p.x >= view.frame.x && p.x <= view.frame.x + view.frame.width);
      assert(p.y >= view.frame.y && p.y <= view.frame.y + view.frame.height);
    }
  }
});

test("dimension lines, two extension lines and vector arrowheads share exact source references", () => {
  const { document } = reference(); const view = document.sheets[0].viewports[0], d = view.dimensions[0];
  const plotted = plotDimension(view, d), lines = plotted.filter(e => e.kind === "line");
  assert.equal(lines.length, 3); assert.equal(plotted.filter(e => e.kind === "polygon").length, 2);
  const span = lines[2]; near(Math.abs(span.to.x - span.from.x), 900 * view.scale);
  assert(lines.every(e => e.sourceId === "overall-width" && e.references?.length));
  assert(plotted.some(e => e.kind === "text" && e.text === "900"));
});

for (const changes of [{ width: 1100 }, { height: 1000 }, { depth: 600 }]) test(`dimensions and fitting follow engine changes ${JSON.stringify(changes)}`, () => {
  const s = createDemoChestSpecification(); Object.assign(s.dimensions, changes);
  const result = generateFurniture(s), generated = generateDrawingDocument(result, DEFAULT_DRAWING_OPTIONS); assert(generated.document);
  const dims = generated.document.sheets[0].viewports.flatMap(v => v.dimensions);
  assert.equal(dims.find(d => d.id === "overall-width")?.valueMm, s.dimensions.width);
  assert.equal(dims.find(d => d.id === "overall-height")?.valueMm, s.dimensions.height);
  assert.equal(dims.find(d => d.id === "overall-depth")?.valueMm, s.dimensions.depth + s.panels.drawerFront.thickness);
});

test("templates never change engineering projections or imply standards compliance", () => {
  const a = reference(), b = reference({ template: "engineering" });
  assert.deepEqual(a.document.sheets.map(s => s.viewports), b.document.sheets.map(s => s.viewports));
  assert(plotSheet(b.document, b.document.sheets[0]).some(e => e.kind === "text" && e.text === FORMAL_TEMPLATE_LABEL));
  assert.equal(b.document.complianceVerified, false); assert.equal(b.document.manufacturingReady, false);
});

test("generation is immutable and missing BOM links/invalid inputs withhold drawings", () => {
  const { result } = reference(), before = JSON.stringify(result);
  generateDrawingDocument(result, DEFAULT_DRAWING_OPTIONS); assert.equal(JSON.stringify(result), before);
  const invalid = { ...result, geometryValid: false }; assert.equal(generateDrawingDocument(invalid).document, null);
  assert.equal(generateDrawingDocument({ ...result, bom: [] }).document, null);
  const options = { ...DEFAULT_DRAWING_OPTIONS, revision: "" }; assert.equal(generateDrawingDocument(result, options).document, null);
  const tampered = structuredClone(result); tampered.components.find(c => c.kind === "panel")!.position.x = NaN;
  assert.equal(generateDrawingDocument(tampered).document, null);
});

test("vector PDF preserves every A3 sheet and exact plotted line coordinates without screenshots", async () => {
  const { document } = reference(); const bytes = await exportDrawingPDF(document); const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), document.sheets.length);
  for (const page of pdf.getPages()) { near(page.getWidth(), 420 * 72 / 25.4); near(page.getHeight(), 297 * 72 / 25.4); }
  const streams = pdf.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream).map(([, value]) => value as PDFRawStream);
  const content = streams.map(stream => new TextDecoder().decode(decodePDFRawStream(stream).decode())).join("\n");
  assert(!streams.some(s => s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const id of ["chest/drawer-1/front", "chest/drawer-4/front", "chest/drawer-4/rear"]) {
    assert(content.includes(Buffer.from(id).toString("hex").toUpperCase()), `PDF schedule must print ${id}`);
  }
  const view = document.sheets[0].viewports[0], dimension = view.dimensions.find(d => d.id === "overall-width")!;
  const line = plotDimension(view, dimension).filter(e => e.kind === "line")[2];
  const from = { x: line.from.x * MM_TO_PT, y: (297 - line.from.y) * MM_TO_PT }, to = { x: line.to.x * MM_TO_PT, y: (297 - line.to.y) * MM_TO_PT };
  const path = new RegExp('([-\\d.]+) ([-\\d.]+) m\\s+([-\\d.]+) ([-\\d.]+) l', 'g');
  const paths = [...content.matchAll(path)].map(m => m.slice(1).map(Number));
  const found = paths.find(p => Math.abs(p[0] - from.x) < 1e-5 && Math.abs(p[1] - from.y) < 1e-5 && Math.abs(p[2] - to.x) < 1e-5 && Math.abs(p[3] - to.y) < 1e-5);
  assert(found, "PDF content must include the actual dimension vector, not an embedded raster");
  near(Math.abs(found[2] - found[0]), 90 * MM_TO_PT, 1e-5);
});

test("overall depth extension lines originate on actual front and rear component corners", () => {
  const { result, document } = reference();
  const d = document.sheets[0].viewports.find(v => v.projection === "right")!.dimensions[0];
  const a = result.components.find(c => c.id === d.references[0].componentId)!;
  const b = result.components.find(c => c.id === d.references[1].componentId)!;
  assert(a.kind === "panel" && b.kind === "panel");
  assert.deepEqual(d.from, { x: a.position.z, y: a.position.y });
  assert.deepEqual(d.to, { x: b.position.z + b.dimensions.z, y: b.position.y });
  assert.equal(d.from.y, 2); assert.equal(d.to.y, 0);
});

test("long metadata stays intact in the model and is conservatively abbreviated in the title block", () => {
  const { document } = reference({ projectName: "W".repeat(60), revision: "R".repeat(60) });
  assert.equal(document.sheets[0].metadata.projectName.length, 60);
  const texts = plotSheet(document, document.sheets[0]).filter(e => e.kind === "text");
  assert(texts.some(e => e.text.startsWith("WWW") && e.text.endsWith("...")));
  assert(texts.some(e => e.text.startsWith("RRR") && e.text.endsWith("...")));
});

test("BOM/component disagreement cannot produce misleading component drawings", () => {
  const { result } = reference(); const changed = structuredClone(result);
  const back = changed.bom.find(l => l.componentIds.includes("chest/carcass/back"))!;
  back.cutSize!.width -= 1;
  const generated = generateDrawingDocument(changed);
  assert.equal(generated.document, null); assert(generated.issues.some(i => i.includes("disagree")));
});
