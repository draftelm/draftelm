import { getPanelRegressionProfile as getDrawingProfile } from "./drawingFixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { Box3, Ray, Vector3 as ThreeVector } from "three";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { PanelComponent, Vector3 } from "../src/furniture";
import { generateDrawingDocument,  loadDrawingPreferences, saveDrawingPreferences, validateGADocument, validateGeneralAssemblyPlan, plotSheet } from "../src/drawings";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";
import { parseDrawingProfile } from "../src/drawings/profiles";
import { isometricLines, projectPoint } from "../src/drawings/projections";
import { panelEdges, visibleIsometricEdges, VISIBILITY_EPSILON_MM as EPS } from "../src/drawings/edgeVisibility";
import { pointOnSegment } from "../src/drawings/annotationGeometry";

const box = (id: string, position = { x: 0, y: 0, z: 0 }, dimensions = { x: 10, y: 10, z: 10 }): PanelComponent => ({
  id, position, dimensions, kind: "panel", assemblyId: "fixture", name: id, materialId: "fixture", quantity: 1, thickness: dimensions.z, thicknessAxis: "z",
});
const at = (a: Vector3, b: Vector3, t: number): Vector3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const near = (a: number, b: number) => assert(Math.abs(a - b) < 8 * EPS, `${a} != ${b}`);
// Independent Three.js slab intersection oracle, not the interval elimination code.
function oracleVisible(point: Vector3, panels: PanelComponent[]) {
  const ray = new Ray(new ThreeVector(point.x, point.y, point.z), new ThreeVector(1, 1, -1).normalize());
  return !panels.some(p => {
    const hit = ray.intersectBox(new Box3(new ThreeVector(p.position.x + EPS, p.position.y + EPS, p.position.z + EPS),
      new ThreeVector(p.position.x + p.dimensions.x - EPS, p.position.y + p.dimensions.y - EPS, p.position.z + p.dimensions.z - EPS)), new ThreeVector());
    return hit && hit.distanceTo(ray.origin) > EPS;
  });
}
function fixture(count = 4, dimensions = { width: 900, height: 850, depth: 500 }, profile = getDrawingProfile()) {
  const s = createDemoChestSpecification(); s.drawerCount = count; s.dimensions = dimensions;
  const result = generateFurniture(s), output = generateDrawingDocument(result, profile); assert(output.document, output.issues.join(" "));
  return { result, document: output.document, panels: result.components.filter(p => p.kind === "panel") };
}

test("a solid box has nine visible edges; diagnostic mode retains all twelve", () => {
  const cube = box("cube"); assert.equal(isometricLines([cube]).length, 9); assert.equal(isometricLines([cube], "diagnostic-wireframe").length, 12);
  for (const edge of visibleIsometricEdges([cube])) for (const t of [0.1, 0.5, 0.9]) assert(oracleVisible(at(edge.from, edge.to, t), [cube]));
});

test("a solid foreground panel hides another panel with the same projected extent", () => {
  const panels = [box("rear"), box("cover", { x: 18, y: 18, z: -22 }, { x: 14, y: 14, z: 14 })];
  assert(isometricLines(panels).every(line => line.references.every(r => r.componentId === "cover")));
});

test("partial occlusion clips a source edge into visible intervals, without removing its exposed ends", () => {
  const beam = box("beam", { x: 0, y: 0, z: 0 }, { x: 20, y: 1, z: 1 }), cover = box("cover", { x: 10, y: 1, z: -3 }, { x: 3, y: 3, z: 2 });
  const fragments = visibleIsometricEdges([beam, cover]).filter(e => e.panel.id === "beam" && e.axis === "x" && e.from.y === 0 && e.from.z === 0);
  assert.equal(fragments.length, 2); near(fragments[0].from.x, 0); near(fragments[0].to.x, 7); near(fragments[1].from.x, 12); near(fragments[1].to.x, 20);
  for (const e of fragments) assert(oracleVisible(at(e.from, e.to, 0.5), [beam, cover]));
  assert(!oracleVisible({ x: 10, y: 0, z: 0 }, [beam, cover]));
});

test("a narrow occluder between sampling positions still removes its entire covered edge interval", () => {
  const beam = box("beam", { x: 0, y: 0, z: 0 }, { x: 20, y: 1, z: 1 }), cover = box("cover", { x: 4.1, y: 1, z: -1.01 }, { x: 0.05, y: 0.01, z: 0.01 });
  const fragments = visibleIsometricEdges([beam, cover]).filter(e => e.panel.id === "beam" && e.axis === "x" && e.from.y === 0 && e.from.z === 0);
  assert.equal(fragments.length, 2); near(fragments[0].to.x, 3.09); near(fragments[1].from.x, 3.15);
});

test("coplanar adjacent panel seams survive with both source identities; overlapping duplicate edges merge", () => {
  const panels = [box("left"), box("right", { x: 10, y: 0, z: 0 })], lines = isometricLines(panels);
  for (const point of [{ x: 10, y: 5, z: 0 }, { x: 10, y: 10, z: 5 }]) {
    const seam = lines.find(line => pointOnSegment(projectPoint(point, "isometric"), line.from, line.to)); assert(seam);
    assert.deepEqual(seam.references.map(r => r.componentId), ["left", "right"]);
  }
  const duplicates = isometricLines([box("a"), box("b")]); assert.equal(duplicates.length, 9);
  assert(duplicates.every(l => l.references.length === 2));
  assert.deepEqual(isometricLines([...panels].reverse()), lines);
});

test("partially overlapping solids retain exposed boundaries and near-coplanar faces are numerically stable", () => {
  for (const offset of [0, EPS / 4, -EPS / 4, EPS * 10]) {
    const panels = [box("a"), box("b", { x: 5, y: 0, z: offset })];
    const edges = visibleIsometricEdges(panels), lines = isometricLines(panels);
    assert(lines.length > 0); assert(lines.every(l => [l.from.x, l.from.y, l.to.x, l.to.y].every(Number.isFinite)));
    for (const e of edges) assert(oracleVisible(at(e.from, e.to, 0.5), panels));
    assert.deepEqual(isometricLines([...panels].reverse()), lines);
  }
  assert.throws(() => isometricLines([box("invalid", { x: NaN, y: 0, z: 0 })]));
});

test("closed four-drawer chest shows each front rim and separation, with no rear or interior edges", () => {
  const { panels, document } = fixture(), view = document.sheets[0].viewports.find(v => v.projection === "isometric")!;
  assert.equal(view.label, "ISOMETRIC"); assert(view.annotations[0].includes("hidden edges removed"));
  assert(view.entities.length < 29 * 12);
  const shown = new Set(view.entities.flatMap(l => l.references.map(r => r.componentId)));
  for (let n = 1; n <= 4; n++) {
    const front = panels.find(p => p.id === `chest/drawer-${n}/front`)!;
    assert(shown.has(front.id));
    for (const y of [front.position.y, front.position.y + front.dimensions.y]) {
      const point = projectPoint({ x: front.position.x + front.dimensions.x / 2, y, z: front.position.z }, "isometric");
      assert(view.entities.some(line => line.references.some(r => r.componentId === front.id) && pointOnSegment(point, line.from, line.to)));
    }
  }
  for (const panel of panels.filter(p => p.id.endsWith("/back") || (/drawer-/.test(p.id) && !p.id.endsWith("/front")))) assert(!shown.has(panel.id), panel.id);
  assert.equal(view.references.length, 29); assert.equal(document.reconciliation.panelCount, 29);
  assert.equal(document.drawingAnnotations.items.length, 7); assert.equal(document.sheets[0].balloons!.length, 3);
});

for (const count of [1, 4, 8]) test(`${count} drawers: continuous clipping agrees with independent ray tests on source edges and visible fragments`, () => {
  const { panels, document } = fixture(count, { width: 1100, height: Math.max(850, count * 220), depth: 600 });
  const lines = isometricLines(panels);
  for (const p of panels) for (const edge of panelEdges(p)) for (const t of [0.13, 0.37, 0.63, 0.87]) {
    const point = at(edge.from, edge.to, t), projected = projectPoint(point, "isometric");
    const drawn = lines.some(l => l.references.some(r => r.componentId === p.id) && pointOnSegment(projected, l.from, l.to));
    assert.equal(drawn, oracleVisible(point, panels), `${p.id} ${edge.axis} at ${t}`);
  }
  for (const e of visibleIsometricEdges(panels)) for (const t of [0.1, 0.5, 0.9]) assert(oracleVisible(at(e.from, e.to, t), panels));
  assert.deepEqual(validateGADocument(document), []);
});

for (const template of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${template}, ${convention}: same visible edges, dimensions, stable items and source-bound balloons`, () => {
  const profile = getDrawingProfile(template); profile.sheet.projectionConvention = convention;
  const { result, document } = fixture(4, undefined, profile), base = fixture().document;
  const iso = document.sheets[0].viewports.find(v => v.projection === "isometric")!;
  assert.deepEqual(iso.entities, base.sheets[0].viewports.find(v => v.projection === "isometric")!.entities);
  assert.deepEqual(document.gaPlan.dimensions, base.gaPlan.dimensions);
  assert.deepEqual(document.drawingAnnotations.items, base.drawingAnnotations.items);
  for (const anchor of document.drawingAnnotations.anchors) {
    const view = document.sheets[0].viewports.find(v => v.id === anchor.viewportId)!;
    assert(view.entities.some(l => l.id === anchor.sourceLineId && l.references.some(r => r.componentId === anchor.reference.componentId)));
  }
  assert.deepEqual(validateGeneralAssemblyPlan(document.gaPlan, result, profile, document.drawingAnnotations), []);
  assert.equal(document.sheets.length, 6); assert.equal(document.manufacturingReady, false);
  assert.deepEqual(document.hardware.allowances.map(a => a.quantity).sort((a, b) => a - b), [8, 8, 160]);
  assert(document.hardware.allowances.every(a => a.purchasingQuantity === 0));
});

test("old profiles default to clean output; diagnostic preference persists and invalidates an existing plan", () => {
  const profile = getDrawingProfile(), { result, document } = fixture(4, undefined, profile);
  assert.equal(document.gaPlan.visibility.isometricMode, "visible-edges"); assert(parseDrawingProfile(profile).profile);
  profile.sheet.isometricMode = "diagnostic-wireframe";
  assert(validateGeneralAssemblyPlan(document.gaPlan, result, profile).some(i => i.includes("Stale")));
  const diagnostic = generateDrawingDocument(result, profile).document!;
  const iso = diagnostic.sheets[0].viewports.find(v => v.projection === "isometric")!;
  assert.equal(iso.entities.length, 29 * 12); assert(iso.label.includes("DIAGNOSTIC"));
  assert.deepEqual(diagnostic.gaPlan.dimensions, document.gaPlan.dimensions);
  const storage = new Map<string, string>(), adapter = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } };
  saveDrawingPreferences(adapter, profile, profile.id);
  assert.equal(loadDrawingPreferences(adapter).profile?.sheet.isometricMode, "diagnostic-wireframe");
  assert.equal(getDrawingProfile().sheet.isometricMode ?? "visible-edges", "visible-edges");
  assert.equal(parseDrawingProfile({ ...profile, sheet: { ...profile.sheet, isometricMode: "unknown" } }).profile, null);
});

test("size changes regenerate visible edges and reject stale geometry while retaining dimensions and BOM identities", () => {
  const old = fixture(), current = fixture(4, { width: 1000, height: 950, depth: 550 });
  assert(validateGeneralAssemblyPlan(old.document.gaPlan, current.result, current.document.profile).length);
  assert.notDeepEqual(old.document.sheets[0].viewports[3].entities, current.document.sheets[0].viewports[3].entities);
  assert.deepEqual(current.document.gaPlan.dimensions.map(d => d.valueMm), [1000, 950, 550, 568]);
  assert.deepEqual(old.document.drawingAnnotations.items.map(i => i.key), current.document.drawingAnnotations.items.map(i => i.key));
  const bad = structuredClone(current.document); bad.sheets[0].viewports[3].entities = old.document.sheets[0].viewports[3].entities;
  assert(validateGADocument(bad).length); assert.throws(() => plotSheet(bad, bad.sheets[0]));
});

test("PDF and browser plot use the same clipped vector segments, with no image objects or hidden wireframe", async () => {
  const { document } = fixture(), sheet = document.sheets[0], iso = sheet.viewports.find(v => v.projection === "isometric")!;
  const primitives = plotSheet(document, sheet).filter(e => e.kind === "line" && e.role === "geometry" && e.sourceId?.startsWith("iso-visible:"));
  assert.equal(primitives.length, iso.entities.length);
  const pdf = await PDFDocument.load(await exportDrawingPDF(document)); assert.equal(pdf.getPageCount(), 6);
  const streams = pdf.context.enumerateIndirectObjects().map(([, v]) => v).filter(v => v instanceof PDFRawStream);
  assert(!streams.some(s => s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  const content = streams.map(s => new TextDecoder().decode(decodePDFRawStream(s).decode())).join("\n");
  const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
  for (const line of primitives) {
    assert(line.kind === "line");
    const expected = [line.from.x * MM_TO_PT, (sheet.heightMm - line.from.y) * MM_TO_PT, line.to.x * MM_TO_PT, (sheet.heightMm - line.to.y) * MM_TO_PT];
    assert(paths.some(path => path.every((v, i) => Math.abs(v - expected[i]) < 1e-6)));
  }
});
