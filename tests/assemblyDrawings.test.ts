import { getPreFunctionalProfile as getDrawingProfile } from "./drawingFixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture, generateFurnitureBOM } from "../src/furniture";
import type { FurnitureResult } from "../src/furniture";
import { generateDrawingDocument, loadDrawingPreferences, parseDrawingProfile, plotSheet, saveDrawingPreferences, validateGADocument, validateGeneralAssemblyPlan } from "../src/drawings";
import type { DrawingDocument } from "../src/drawings";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";
import { assemblyPanels, createAssemblyDrawingPlan, translateDrawingPanels } from "../src/drawings/planning/assemblies";
import { createAssemblyScenes } from "../src/drawings/assemblySheets";
import { explodeDrawingPanels, projectedPanelOverlaps } from "../src/drawings/planning/explosion";
import { containsRect, primitiveBounds } from "../src/drawings/annotationGeometry";
import { bounds3, isometricLines } from "../src/drawings/projections";

function fixture(width = 900, count = 4, profile = getDrawingProfile(), input?: FurnitureResult) {
  const specification = createDemoChestSpecification(); specification.dimensions.width = width; specification.drawerCount = count;
  if (count > 4) specification.dimensions.height = count * 220;
  const result = input ?? generateFurniture(specification), generated = generateDrawingDocument(result, profile);
  assert(generated.document, generated.issues.join("; "));
  return { result, document: generated.document, plan: generated.document.assemblyPlan };
}
const panelIds = (r: FurnitureResult) => r.components.filter(c => c.kind === "panel").map(p => p.id).sort();
const sheet = (d: DrawingDocument, id: string) => { const found = d.sheets.find(s => s.id === id); assert(found, id); return found; };
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("v3 defaults add three readable assembly sheets while preserving the clean GA and all 29 panel occurrences", () => {
  const { result, document, plan } = fixture();
  assert.equal(document.profile.schemaVersion, 3);
  assert.deepEqual(document.sheets.map(s => s.id), ["GA-001", "EA-001", "DS-001", "CS-001", "CP-001", "CP-002", "CP-003", "CL-001", "HW-001"]);
  assert.equal(plan.nodes.length, 6); assert.equal(plan.nodes.find(n => n.id === "chest")!.childAssemblyIds.length, 5);
  assert.deepEqual(plan.nodes.find(n => n.id === "chest")!.descendantPanelIds, panelIds(result));
  assert.equal(document.drawingAnnotations.items.flatMap(i => i.componentIds).length, 29);
  assert.equal(new Set(document.cuttingList.flatMap(i => i.componentIds)).size, 29);
  assert.equal(sheet(document, "GA-001").viewports.find(v => v.projection === "isometric")!.entities.length, 53);
  assert.deepEqual(document.gaPlan.dimensions.map(d => d.valueMm), [900, 850, 500, 518]);
  assert.equal(document.manufacturingReady, false); assert.equal(document.complianceVerified, false);
  assert.deepEqual(document.hardware.allowances.map(a => a.quantity).sort((a, b) => a - b), [8, 8, 160]);
  assert(document.hardware.allowances.every(a => a.purchasingQuantity === 0 && !a.purchasingEligible));
});

test("four drawers reuse one six-panel drawing with explicit occurrence correspondence and per-drawer quantities", () => {
  const { result, document, plan } = fixture(), group = plan.groups.find(g => g.kind === "drawer")!;
  assert.equal(group.assemblyIds.length, 4); assert.equal(group.occurrenceMaps.length, 4);
  const all: string[] = [];
  for (const map of group.occurrenceMaps) {
    assert.equal(Object.keys(map.panels).length, 6);
    const actual = result.components.filter(p => p.kind === "panel" && p.assemblyId === map.assemblyId).map(p => p.id).sort();
    assert.deepEqual(Object.values(map.panels).sort(), actual); all.push(...actual);
  }
  assert.equal(new Set(all).size, 24);
  const drawer = sheet(document, "DS-001"), rows = drawer.annotationModel!.items;
  assert.equal(rows.length, 6); assert(rows.every(i => i.kind === "panel" && i.quantity === 1));
  assert.deepEqual(rows.flatMap(i => i.componentIds).sort(), assemblyPanels(result, plan, group.representativeId).map(p => p.id));
  assert(rows.some(i => i.description.includes("Separate drawer front")));
  assert(rows.some(i => i.description.endsWith("- left"))); assert(rows.some(i => i.description.endsWith("- right")));
  assert(rows.some(i => i.description.includes("front/rear - front"))); assert(rows.some(i => i.description.includes("front/rear - rear")));
});

test("GA and exploded scoped lists conserve leaf membership without counting assemblies as manufactured panels", () => {
  const { result, document } = fixture();
  const ga = sheet(document, "GA-001"), ea = sheet(document, "EA-001");
  assert.deepEqual(ga.annotationModel!.items.map(i => [i.kind, i.quantity]), [["assembly", 1], ["assembly", 4]]);
  for (const s of [ga, ea]) {
    assert.deepEqual(s.annotationModel!.items.flatMap(i => i.componentIds).sort(), panelIds(result));
    for (const item of s.annotationModel!.items) {
      assert(item.references.every(r => result.bom.some(b => b.id === r.bomId && b.componentIds.includes(r.componentId))));
      if (item.kind === "assembly") assert(!("cuttingListBomId" in item) && !("bomId" in item));
    }
    assert.equal(s.balloons!.length, s.annotationModel!.balloons.length);
    assert.equal(s.annotationModel!.diagnostics.filter(d => d.itemKey).length, 0);
  }
  assert.equal(ea.annotationModel!.items.filter(i => i.kind === "panel").length, 5);
  assert.equal(ea.annotationModel!.items.find(i => i.kind === "assembly")!.quantity, 4);
});

test("scoped parts retain the source blank identity and verified nominal dimensions, including shared blanks across scopes", () => {
  const s = createDemoChestSpecification(); s.panels.drawerFront = { ...s.panels.carcass }; s.drawerCount = 1; s.dimensions.height = 504;
  s.construction.fronts.edgeGap.left = 0; s.construction.fronts.edgeGap.right = 0;
  const { document, result } = fixture(900, 1, getDrawingProfile(), generateFurniture(s));
  const shared = result.bom.find(b => b.componentIds.includes("chest/carcass/top"))!; assert.equal(shared.quantity, 3);
  for (const id of ["DS-001", "CS-001"]) for (const item of sheet(document, id).annotationModel!.items) {
    assert(item.kind === "panel"); const bom = result.bom.find(b => b.id === item.bomId)!;
    assert.equal(item.quantity, 1); assert.equal(item.cuttingListBomId, bom.id);
    assert(item.scopeDetails!.includes(bom.id)); assert(item.scopeDetails!.includes(`${Number(bom.cutSize!.length.toFixed(6))} x`));
  }
});

for (const width of [900, 1000]) for (const count of [1, 3, 4, 6, 12]) test(`${width} mm / ${count} drawers: deterministic rigid groups, complete membership, unchanged engineering geometry/BOM`, () => {
  const { result, document, plan } = fixture(width, count), before = JSON.stringify(result);
  const scenes = createAssemblyScenes(result, plan), repeated = createAssemblyScenes(result, plan);
  assert.deepEqual(scenes, repeated);
  assert.equal(panelIds(result).length, 5 + count * 6);
  assert.equal(plan.groups.find(g => g.kind === "drawer")!.assemblyIds.length, count);
  for (const scene of scenes) {
    const displayed = translateDrawingPanels(scene.panels, scene.explosion.offsets);
    assert.deepEqual(displayed.map(p => p.id), scene.panels.map(p => p.id));
    displayed.forEach((p, i) => { assert.deepEqual(p.dimensions, scene.panels[i].dimensions); assert.equal(p.quantity, scene.panels[i].quantity); });
    if (scene.scope.kind !== "exploded") assert.deepEqual(projectedPanelOverlaps(displayed, 24.99), []);
  }
  const root = scenes.find(s => s.id === "EA-001")!;
  for (const node of plan.nodes.filter(n => n.parentId === plan.rootId && n.id !== "chest/carcass")) {
    const offsets = node.panelIds.map(id => root.explosion.offsets[id]); assert(offsets.every(o => JSON.stringify(o) === JSON.stringify(offsets[0])));
  }
  const moved = translateDrawingPanels(root.panels, root.explosion.offsets), stationary = assemblyPanels(result, plan, "chest/carcass");
  for (const original of stationary) assert.notDeepEqual(moved.find(p => p.id === original.id)!.position, original.position);
  assert.deepEqual(document.cuttingList.map(i => [i.quantity, i.cutSize]), result.bom.filter(b => b.kind === "panel").map(b => [b.quantity, b.cutSize]));
  assert.equal(JSON.stringify(result), before);
});

test("hierarchy, assembly equivalence and translations survive source array reordering", () => {
  const { result, document } = fixture(), other = structuredClone(result);
  other.assemblies.reverse(); other.components.reverse(); other.bom.reverse(); other.assemblies.forEach(a => a.componentIds.reverse()); other.bom.forEach(b => b.componentIds.reverse());
  const next = fixture(900, 4, getDrawingProfile(), other).document;
  assert.deepEqual(next.assemblyPlan, document.assemblyPlan);
  for (const id of ["EA-001", "DS-001", "CS-001"]) assert.deepEqual(sheet(next, id), sheet(document, id));
});

test("different drawer panel geometry/orientation/material and hardware allowances cannot silently reuse a drawer drawing", () => {
  for (const mode of ["position", "material", "dimension", "orientation", "hardware"]) {
    const r = generateFurniture(createDemoChestSpecification()), p = r.components.find(c => c.id === "chest/drawer-4/front")!;
    assert(p.kind === "panel");
    if (mode === "position") p.position.z -= 1;
    if (mode === "material") p.materialId = "different-existing-material";
    if (mode === "dimension") p.dimensions.x -= 1;
    if (mode === "orientation") { [p.dimensions.x, p.dimensions.z] = [p.dimensions.z, p.dimensions.x]; p.thicknessAxis = "x"; }
    if (mode === "hardware") r.components.find(c => c.id === "chest/drawer-4/box-screws")!.quantity++;
    r.bom = generateFurnitureBOM(r.components);
    const { document, plan } = fixture(900, 4, getDrawingProfile(), r);
    assert.equal(plan.groups.filter(g => g.kind === "drawer").length, 2, mode);
    assert.deepEqual(plan.groups.filter(g => g.kind === "drawer").map(g => g.assemblyIds.length), [3, 1]);
    assert(sheet(document, "DS-002"));
  }
});

test("hierarchy rejects duplicate ownership, orphan/cyclic assemblies and invalid drawer membership", () => {
  for (const tamper of [
    (r: FurnitureResult) => { r.assemblies[0].componentIds.push("chest/carcass/top"); },
    (r: FurnitureResult) => { r.assemblies[1].parentId = "missing"; },
    (r: FurnitureResult) => { r.assemblies[1].parentId = r.assemblies[1].id; },
    (r: FurnitureResult) => { r.assemblies.find(a => a.id === "chest/drawer-1")!.componentIds.pop(); },
  ]) {
    const r = generateFurniture(createDemoChestSpecification()); tamper(r);
    assert.throws(() => createAssemblyDrawingPlan(r, getDrawingProfile(), "chest", "chest/carcass"));
    assert.equal(generateDrawingDocument(r).document, null);
  }
});

for (const template of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${template} / ${convention} / ${format}: scoped view/list/balloon vector bounds fit the sheet`, () => {
  const p = getDrawingProfile(template); p.sheet.format = format; p.sheet.projectionConvention = convention;
  const { document } = fixture(1000, 4, p); assert.deepEqual(validateGADocument(document), []);
  for (const s of document.sheets) for (const e of plotSheet(document, s)) {
    assert(containsRect({ x: 10 - 1e-6, y: 10 - 1e-6, width: s.widthMm - 20 + 2e-6, height: s.heightMm - 20 + 2e-6 }, primitiveBounds(e)), `${s.id}: ${JSON.stringify(e)}`);
  }
  const drawer = sheet(document, "DS-001"); assert.equal(drawer.annotationModel!.items.length, 6);
  assert.equal(drawer.balloons!.length + drawer.annotationModel!.diagnostics.filter(d => d.itemKey).length, 6);
});

for (const convention of ["first-angle", "third-angle"] as const) test(`${convention}: all sheet inclusion combinations and numbering schemes preserve stable kind IDs`, () => {
  for (const scheme of ["by-sheet-kind", "sequential"] as const) for (let mask = 0; mask < 8; mask++) {
    const p = getDrawingProfile(); p.sheet.projectionConvention = convention; p.numbering.scheme = scheme; p.numbering.startAt = 17;
    p.contents.assemblySheets = { exploded: !!(mask & 1), drawers: !!(mask & 2), carcass: !!(mask & 4) };
    const { document } = fixture(900, 4, p);
    assert.equal(document.sheets.some(s => s.id === "EA-001"), !!(mask & 1));
    assert.equal(document.sheets.some(s => s.id === "DS-001"), !!(mask & 2));
    assert.equal(document.sheets.some(s => s.id === "CS-001"), !!(mask & 4));
    assert.equal(new Set(document.sheets.map(s => s.metadata.drawingNumber)).size, document.sheets.length);
    document.sheets.forEach((s, i) => { assert.equal(s.metadata.total, document.sheets.length); assert.equal(s.metadata.number, i + 1);
      if (scheme === "sequential") assert(s.metadata.drawingNumber.endsWith(String(17 + i).padStart(3, "0"))); });
    assert.equal(sheet(document, "CP-001").id, "CP-001");
  }
});

test("assembly-only subsets and hidden annotation settings retain all source data without empty GA sheets", () => {
  const p = getDrawingProfile(); p.contents.assemblyViews = []; p.contents.componentDrawings = false; p.contents.cuttingList.include = false; p.contents.hardwareSchedule = false;
  p.annotations.balloons = false; p.annotations.assemblyPartsList = false;
  const { document } = fixture(900, 4, p);
  assert.deepEqual(document.sheets.map(s => s.id), ["EA-001", "DS-001", "CS-001"]);
  assert(document.sheets.every(s => !s.balloons?.length && !s.assemblyPartsList));
  assert.equal(document.reconciliation.panelQuantity, 29); assert.equal(document.cuttingList.reduce((sum, r) => sum + r.quantity, 0), 29);
});

test("visible assembly occurrences use assembly membership, while subassembly balloons identify all physical panels", () => {
  const p = getDrawingProfile(); p.annotations.balloonDisplay = "visible-occurrences"; p.annotations.itemNumberStyle = "prefixed";
  const { document } = fixture(900, 4, p), ga = sheet(document, "GA-001");
  assert.equal(ga.annotationModel!.balloons.length, 5); assert.equal(ga.balloons!.length, 5);
  assert(ga.annotationModel!.items.every(i => i.kind === "assembly" && i.label.startsWith("A")));
  assert.equal(sheet(document, "DS-001").annotationModel!.balloons.length, 6);
  assert(sheet(document, "DS-001").annotationModel!.items.every(i => i.label.startsWith("P")));
});

test("v1/v2 migrate without changing previous output; v3 preferences persist all new switches and GA level", () => {
  for (const version of [1, 2]) {
    const raw = JSON.parse(JSON.stringify(getDrawingProfile())); raw.schemaVersion = version; delete raw.contents.assemblySheets;
    delete raw.annotations.gaLevel; if (version === 1) delete raw.annotations;
    const before = JSON.stringify(raw), parsed = parseDrawingProfile(raw); assert(parsed.profile);
    assert.equal(parsed.profile.schemaVersion, 3); assert.equal(parsed.profile.annotations.gaLevel, "panels");
    assert.deepEqual(parsed.profile.contents.assemblySheets, { exploded: false, drawers: false, carcass: false });
    assert.equal(fixture(900, 4, parsed.profile).document.sheets.length, 6); assert.equal(JSON.stringify(raw), before);
  }
  const values = new Map<string, string>(), storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  const p = getDrawingProfile("engineering"); p.contents.assemblySheets.carcass = false; p.annotations.gaLevel = "panels";
  const saved = saveDrawingPreferences(storage, p, "engineering"), loaded = loadDrawingPreferences(storage); assert(saved.profile); assert(loaded.profile);
  assert.deepEqual(loaded.profile, saved.profile); assert.deepEqual(fixture(1000, 3, loaded.profile).document.sheets, fixture(1000, 3, p).document.sheets);
  for (const change of [{ ...p, schemaVersion: 4 }, { ...p, contents: { ...p.contents, assemblySheets: { exploded: "yes", drawers: true, carcass: true } } }, { ...p, annotations: { ...p.annotations, gaLevel: "approved" } }]) assert.equal(parseDrawingProfile(change).profile, null);
});

test("unplaced balloons, concealed internal panels and unresolved projection overlaps remain explicit and revision bound", () => {
  const { document } = fixture();
  const ea = sheet(document, "EA-001");
  assert.deepEqual(ea.assemblyDiagnostics!.map(d => d.componentIds[0]).sort(), [1, 2, 3, 4].map(i => `chest/drawer-${i}/box-front`));
  const p = getDrawingProfile(); p.sheet.format = "A4"; p.titleBlock.companyName = "Example"; p.titleBlock.additionalFields = [{ label: "Author", value: "Example" }, { label: "Project", value: "Example" }, { label: "Check", value: "Example" }];
  p.annotations.balloonDisplay = "visible-occurrences";
  const small = fixture(1000, 12, p).document;
  for (const s of small.sheets.filter(s => s.viewports.length && s.annotationModel)) {
    const model = s.annotationModel!;
    assert.equal(s.balloons!.length + model.diagnostics.filter(d => d.itemKey).length, model.balloons.length);
  }
  assert(sheet(small, "EA-001").annotationModel!.diagnostics.some(d => d.code === "no-visible-edge" || d.code === "layout-full"));
});

test("physical box interval packing separates panels beyond the former uniform expansion limit", () => {
  const panel = { kind: "panel" as const, id: "large-1", assemblyId: "scope", name: "large", materialId: "existing", quantity: 1, thickness: 1, thicknessAxis: "y" as const,
    position: { x: 0, y: 0, z: 0 }, dimensions: { x: 10000, y: 1, z: 10000 } };
  const second = { ...panel, id: "large-2", position: { ...panel.position, y: 2 } };
  const explosion = explodeDrawingPanels([panel, second]);
  assert.deepEqual(explosion.unresolvedPairs, []);
  assert.deepEqual(projectedPanelOverlaps(translateDrawingPanels([panel, second], explosion.offsets), 24.99), []);
});

test("long source materials paginate scoped lists at fixed lettering with unique numbering and complete quantities", () => {
  const r = generateFurniture(createDemoChestSpecification());
  for (const p of r.components) if (p.kind === "panel") p.materialId = "existing-long-material-reference-".repeat(6);
  r.bom = generateFurnitureBOM(r.components);
  const p = getDrawingProfile(); p.sheet.format = "A4"; p.titleBlock.companyName = "Example";
  p.titleBlock.additionalFields = [{ label: "Author", value: "Example" }, { label: "Project", value: "Example" }, { label: "Check", value: "Example" }];
  const { document } = fixture(900, 4, p, r);
  assert(document.sheets.some(s => s.id.startsWith("DSL-")));
  assert.equal(new Set(document.sheets.map(s => s.metadata.drawingNumber)).size, document.sheets.length);
  for (const s of document.sheets) for (const e of plotSheet(document, s)) assert(containsRect({ x: 10 - 1e-6, y: 10 - 1e-6, width: s.widthMm - 20 + 2e-6, height: s.heightMm - 20 + 2e-6 }, primitiveBounds(e)), `${s.id}: ${JSON.stringify(e)}`);
  for (const s of document.sheets.filter(s => s.assemblyPartsList)) assert(s.assemblyPartsList!.fontSize >= 2.5);
  const drawer = sheet(document, "DS-001"); assert.equal(drawer.viewports[1].frame.width, drawer.widthMm - 20);
  const rows = document.sheets.filter(s => s.annotationModel?.scopeId === drawer.annotationModel!.scopeId).flatMap(s => s.assemblyPartsList?.rows ?? []);
  assert.equal(rows.filter(row => !row.continuation).length, 6);
});

test("render/export rejects tampered hierarchy, scoped quantities, source offsets, geometry, hidden diagnostics and stale plans", async () => {
  const { result, document } = fixture();
  const cases: ((d: DrawingDocument) => void)[] = [
    d => { d.assemblyPlan.groups[0].assemblyIds.pop(); },
    d => { sheet(d, "DS-001").annotationModel!.items[0].quantity = 4; },
    d => { sheet(d, "DS-001").viewports[1].presentationOffsets!["chest/drawer-1/front"].z -= 10; },
    d => { sheet(d, "EA-001").viewports[0].entities[0].from.x++; },
    d => { sheet(d, "CS-001").assemblyPartsList!.rows[0].cells[2] = ["999"]; },
    d => { sheet(d, "GA-001").assemblyScope = undefined; },
    d => { sheet(d, "EA-001").assemblyDiagnostics = []; },
    d => { d.sheets = d.sheets.filter(s => s.id !== "DS-001"); },
    d => { sheet(d, "DS-001").balloons![0].leaderPoints[1].x++; },
    d => { sheet(d, "GA-001").annotationModel!.anchors[0].reference.bomId = "bom-9"; },
  ];
  for (const tamper of cases) {
    const copy = structuredClone(document); tamper(copy); assert(validateGADocument(copy).length);
    assert.throws(() => plotSheet(copy, copy.sheets[0])); await assert.rejects(exportDrawingPDF(copy));
  }
  const current = fixture(1000).result; assert(validateGeneralAssemblyPlan(document.gaPlan, current, document.profile).length);
  assert.equal(generateDrawingDocument(current, document.profile, document.gaPlan).document, null);
  assert.deepEqual(bounds3(result.components.filter(c => c.kind === "panel")), { min: { x: 0, y: 0, z: -18 }, max: { x: 900, y: 850, z: 500 } });
});

test("browser/PDF share every assembly geometry segment as vectors on the corresponding page", async () => {
  const { document } = fixture(), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length);
  assert(!pdf.context.enumerateIndirectObjects().some(([, s]) => s instanceof PDFRawStream && s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const [index, s] of document.sheets.entries()) {
    if (!s.assemblyScope) continue;
    const contents = pdf.getPages()[index].node.Contents(); assert(contents instanceof PDFArray);
    const content = contents.asArray().map(ref => pdf.context.lookup(ref)).map(value => { assert(value instanceof PDFRawStream); return new TextDecoder().decode(decodePDFRawStream(value).decode()); }).join("\n");
    const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
    for (const e of plotSheet(document, s).filter(e => e.kind === "line" && e.role === "geometry")) {
      assert(e.kind === "line");
      const expected = [e.from.x * MM_TO_PT, (s.heightMm - e.from.y) * MM_TO_PT, e.to.x * MM_TO_PT, (s.heightMm - e.to.y) * MM_TO_PT];
      assert(paths.some(path => path.every((v, i) => Math.abs(v - expected[i]) < 1e-6)), s.id);
    }
    near(pdf.getPages()[index].getWidth(), s.widthMm * MM_TO_PT);
  }
  for (const s of document.sheets.filter(s => s.assemblyScope?.kind === "drawer")) for (const v of s.viewports) {
    const original = assemblyPanels(fixture().result, document.assemblyPlan, s.assemblyScope!.representativeId);
    assert.deepEqual(v.entities, isometricLines(translateDrawingPanels(original, v.presentationOffsets ?? {})));
  }
});
