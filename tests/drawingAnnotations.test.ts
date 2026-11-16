import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { PanelComponent } from "../src/furniture";
import { createDrawingAnnotations, DRAWING_PREFERENCES_KEY, generateDrawingDocument, getDrawingProfile, loadDrawingPreferences, parseDrawingProfile, plotSheet, saveDrawingPreferences, validateDrawingAnnotations } from "../src/drawings";
import type { DrawingDocument } from "../src/drawings";
import { modelToSheet, plotDimension } from "../src/drawings/dimensionPlot";
import { anchorIsVisible, BALLOON_STYLE, balloonBounds, containsRect, overlaps, panelEdges, pointOnSegment, primitiveBounds, segmentHitsRect, segmentsIntersect } from "../src/drawings/annotationGeometry";
import { projectPoint } from "../src/drawings/projections";
import { titleBlockExtraHeight, viewportPadding } from "../src/drawings/layout";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";

const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function generated(profile = getDrawingProfile(), result = generateFurniture(createDemoChestSpecification())) {
  const output = generateDrawingDocument(result, profile); assert(output.document, output.issues.join(" "));
  return { result, document: output.document };
}
const identities = (document: DrawingDocument) => document.drawingAnnotations.items.map(item => [item.key, item.number, item.label]);

test("seven canonical items account for all 29 panels while retaining every BOM and occurrence reference", () => {
  const { result, document } = generated(), model = document.drawingAnnotations;
  assert.equal(model.groupingPolicy, "bom-membership-v1");
  assert.deepEqual(model.items.map(item => [item.number, item.quantity]), [[1, 1], [2, 2], [3, 2], [4, 4], [5, 8], [6, 4], [7, 8]]);
  assert.equal(model.items.reduce((sum, item) => sum + item.quantity, 0), 29);
  assert.deepEqual(model.items.flatMap(item => item.componentIds).sort(), result.components.filter(c => c.kind === "panel").map(c => c.id).sort());
  for (const item of model.items) {
    const line = result.bom.find(line => line.id === item.bomId)!;
    assert.deepEqual([...line.componentIds].sort(), item.componentIds);
    assert.equal(item.quantity, line.quantity); assert.equal(item.materialId, line.itemId);
    assert.equal(item.cuttingListBomId, line.id);
    assert.deepEqual(item.references.map(ref => ref.componentId), item.componentIds);
    for (const id of item.componentIds) assert.equal(document.cuttingList.find(row => row.componentIds.includes(id))!.drawingItemLabel, item.label);
  }
  assert.deepEqual(validateDrawingAnnotations(result, model, document.sheets), []);
});

test("item numbering survives BOM/component array reordering, membership order and transient BOM-ID changes", () => {
  const { result, document } = generated(), reordered = structuredClone(result);
  reordered.bom.reverse(); reordered.components.reverse();
  reordered.bom.forEach((line, index) => { line.id = `reidentified-${index}`; line.componentIds.reverse(); });
  const other = generated(getDrawingProfile(), reordered).document;
  assert.deepEqual(identities(other), identities(document));
  assert(other.drawingAnnotations.items.every(item => item.bomId.startsWith("reidentified-")));
});

for (const change of [{ width: 1100 }, { height: 1000 }, { depth: 600 }]) test(`dimension change ${JSON.stringify(change)} preserves numbering and uses current geometry for anchors`, () => {
  const s = createDemoChestSpecification(); Object.assign(s.dimensions, change);
  const { result, document } = generated(getDrawingProfile(), generateFurniture(s));
  assert.deepEqual(identities(document), identities(generated().document));
  assert.deepEqual(validateDrawingAnnotations(result, document.drawingAnnotations, document.sheets), []);
});

for (const count of [1, 3, 6, 12]) test(`${count} valid drawers retain grouping, quantities, occurrence IDs and complete parts-list coverage`, () => {
  const s = createDemoChestSpecification(); s.drawerCount = count;
  if (count > 4) s.dimensions.height = count * 220;
  const { result, document } = generated(getDrawingProfile(), generateFurniture(s));
  const model = document.drawingAnnotations;
  assert.equal(model.items.reduce((sum, item) => sum + item.quantity, 0), 5 + 6 * count);
  assert.equal(model.items.find(item => item.componentIds.includes("chest/drawer-1/front"))!.quantity, count);
  assert.equal(model.items.find(item => item.componentIds.includes("chest/drawer-1/left"))!.quantity, count * 2);
  assert(!model.items.flatMap(item => item.componentIds).includes(`chest/drawer-${count + 1}/front`));
  assert.deepEqual(validateDrawingAnnotations(result, model, document.sheets), []);
});

test("genuine engine grouping shared between carcass and drawer roles shares one item number", () => {
  const s = createDemoChestSpecification(); s.panels.drawerFront = { ...s.panels.carcass };
  s.drawerCount = 1; s.dimensions.height = 504; s.construction.fronts.edgeGap.left = 0; s.construction.fronts.edgeGap.right = 0;
  const { document } = generated(getDrawingProfile(), generateFurniture(s));
  const shared = document.drawingAnnotations.items.find(item => item.componentIds.includes("chest/carcass/top"))!;
  assert.equal(shared.quantity, 3);
  assert.deepEqual(shared.componentIds, ["chest/carcass/base", "chest/carcass/top", "chest/drawer-1/front"]);
});

test("default closed assembly places only three reliable group balloons and explicitly reports four concealed groups", () => {
  const { document } = generated(), model = document.drawingAnnotations, ga = document.sheets[0];
  assert.equal(ga.balloons!.length, 3);
  assert.deepEqual(model.diagnostics.filter(d => d.itemKey).map(d => model.items.find(item => item.key === d.itemKey)!.number), [1, 4, 5, 7]);
  assert(model.diagnostics.every(d => d.code === "no-visible-edge"));
  assert.equal(model.diagnostics.flatMap(d => d.componentIds).length, 21);
  assert.equal(ga.assemblyPartsList!.rows.length, 7);
  assert.equal(ga.balloons!.length + model.diagnostics.filter(d => d.itemKey).length, model.balloons.length);
});

test("every leader terminates on its actual engine panel edge, visible source line and correct item occurrence", () => {
  const { result, document } = generated(), model = document.drawingAnnotations;
  const panels = result.components.filter(c => c.kind === "panel");
  for (const sheet of document.sheets) for (const placed of sheet.balloons ?? []) {
    const balloon = model.balloons.find(b => b.id === placed.annotationId)!, anchor = model.anchors.find(a => a.id === placed.anchorId)!;
    const item = model.items.find(item => item.key === balloon.itemKey)!, panel = panels.find(p => p.id === anchor.reference.componentId)!;
    const view = sheet.viewports.find(v => v.id === placed.viewportId)!;
    assert.equal(anchor.reference.bomId, item.bomId); assert(item.componentIds.includes(panel.id));
    assert(balloon.componentIds.includes(panel.id)); assert.equal(anchor.reference.assemblyId, panel.assemblyId);
    assert(panelEdges(panel).some(edge => JSON.stringify(edge.from) === JSON.stringify(anchor.edgeStart) && JSON.stringify(edge.to) === JSON.stringify(anchor.edgeEnd)));
    const projected = projectPoint(anchor.point, view.projection as "isometric");
    const source = view.entities.find(e => e.id === anchor.sourceLineId)!;
    assert(source.references.some(ref => ref.componentId === panel.id)); assert(pointOnSegment(projected, source.from, source.to));
    assert(anchorIsVisible(anchor.point, view.projection as "isometric", panels));
    const paper = modelToSheet(view, projected); near(paper.x, placed.leaderPoints[1].x); near(paper.y, placed.leaderPoints[1].y);
    near(Math.hypot(placed.leaderPoints[0].x - placed.center.x, placed.leaderPoints[0].y - placed.center.y), BALLOON_STYLE.radius);
  }
});

test("visibility rejects foreground occluders and self-hidden faces instead of trusting isometric wireframe lines", () => {
  const panel = (id: string, z: number, y = 0): PanelComponent => ({ id, assemblyId: "test", kind: "panel", name: id, materialId: "test", thickness: 1, thicknessAxis: "z", quantity: 1,
    position: { x: 0, y, z }, dimensions: { x: 10, y: 10, z: 1 } });
  const target = panel("target", 10), occluder = panel("cover", 0, -1);
  assert(anchorIsVisible({ x: 5, y: 0, z: 10 }, "front", [target]));
  assert(!anchorIsVisible({ x: 5, y: 0, z: 10 }, "front", [target, occluder]));
  assert(!anchorIsVisible({ x: 5, y: 5, z: 11 }, "front", [target]));
});

test("per-occurrence display distinguishes 29 physical requests while repeated parts keep the same item label", () => {
  const p = getDrawingProfile(); p.annotations.balloonDisplay = "visible-occurrences";
  const { document } = generated(p), model = document.drawingAnnotations;
  assert.equal(model.balloons.length, 29); assert(model.balloons.every(b => b.scope === "occurrence" && b.componentIds.length === 1));
  assert.equal(new Set(model.balloons.flatMap(b => b.componentIds)).size, 29);
  assert.equal(document.sheets.flatMap(s => s.balloons ?? []).length + model.diagnostics.filter(d => d.itemKey).length, 29);
  assert.equal(new Set(model.balloons.filter(b => b.componentIds[0].endsWith("/front")).map(b => b.itemKey)).size, 1);
});

for (const template of ["workshop", "engineering"] as const) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${template} ${convention} ${format}: balloons, leaders, dimensions and parts-list regions stay separated`, () => {
  const p = getDrawingProfile(template === "engineering" ? "engineering" : "furniture-workshop"); p.sheet = { format, projectionConvention: convention };
  const { result, document } = generated(p);
  assert.deepEqual(validateDrawingAnnotations(result, document.drawingAnnotations, document.sheets), []);
  const all = document.sheets.flatMap(s => s.balloons ?? []);
  for (const sheet of document.sheets) {
    const extra = titleBlockExtraHeight(sheet.metadata);
    for (const primitive of plotSheet(document, sheet)) assert(containsRect({ x: 10 - 1e-6, y: 10 - 1e-6, width: sheet.widthMm - 20 + 2e-6, height: sheet.heightMm - 20 + 2e-6 }, primitiveBounds(primitive)), JSON.stringify(primitive));
    for (const placed of sheet.balloons ?? []) {
      const view = sheet.viewports.find(v => v.id === placed.viewportId)!, pad = viewportPadding(view), box = balloonBounds(placed.center);
      assert(containsRect(view.frame, box)); assert(box.y > view.frame.y + pad.top); assert(box.y + box.height < view.frame.y + view.frame.height - pad.bottom);
      for (const dimension of view.dimensions.flatMap(d => plotDimension(view, d))) {
        assert(!overlaps(box, primitiveBounds(dimension), 0.7)); assert(!segmentHitsRect(placed.leaderPoints[0], placed.leaderPoints[1], primitiveBounds(dimension)));
      }
    }
    if (sheet.assemblyPartsList) {
      const t = sheet.assemblyPartsList; assert(t.fontSize >= 2.5);
      assert(t.frame.y + t.frame.height < sheet.heightMm - 60 - extra);
      assert(sheet.viewports.every(v => !overlaps(v.frame, t.frame)));
      for (const row of t.rows) row.cells.forEach((cell, i) => {
        assert(cell.every(value => Array.from(value).length * t.fontSize <= t.columns[i].width - 4));
        assert(cell.length * t.lineHeight <= row.height - 4);
      });
    }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    assert(!overlaps(balloonBounds(all[i].center), balloonBounds(all[j].center), 0.7));
    assert(!segmentsIntersect(all[i].leaderPoints[0], all[i].leaderPoints[1], all[j].leaderPoints[0], all[j].leaderPoints[1]));
  }
  if (format === "A3") assert(document.sheets[0].assemblyPartsList);
  if (format === "A4") assert(document.sheets.some(s => s.id.startsWith("AP-")));
});

test("selected orthographic alternatives are used when isometric is hidden", () => {
  const p = getDrawingProfile(); p.contents.assemblyViews = ["front", "top", "right"];
  const { document } = generated(p);
  assert(document.drawingAnnotations.anchors.length > 0);
  assert(document.drawingAnnotations.anchors.every(a => a.viewportId !== "ga-isometric"));
});

test("hidden annotations retain numbering, internal references and full source reconciliation", () => {
  const p = getDrawingProfile(); p.annotations.balloons = false; p.annotations.assemblyPartsList = false;
  const { result, document } = generated(p);
  assert.deepEqual(identities(document), identities(generated().document));
  assert(document.sheets.every(s => !(s.balloons?.length) && !s.assemblyPartsList));
  assert.equal(document.drawingAnnotations.anchors.length, 0); assert.equal(document.drawingAnnotations.diagnostics.length, 0);
  const corrupted = structuredClone(result); corrupted.bom.find(l => l.kind === "panel")!.quantity++;
  assert.equal(generateDrawingDocument(corrupted, p).document, null);
});

test("hiding GA reports unavailable annotations without adding empty pages", () => {
  const p = getDrawingProfile(); p.contents.assemblyViews = [];
  const { document } = generated(p);
  assert(!document.sheets.some(s => s.id.startsWith("GA-") || s.id.startsWith("AP-")));
  assert(document.drawingAnnotations.diagnostics.every(d => d.code === "assembly-views-hidden"));
  assert.equal(document.drawingAnnotations.items.flatMap(i => i.componentIds).length, 29);
});

test("long material identifiers paginate the parts list at readable size without repeating quantities or losing links", () => {
  const s = createDemoChestSpecification(), materialId = "W".repeat(6000);
  s.materials.push({ id: materialId, name: "User supplied material", kind: "sheet" }); s.panels.drawerFront.materialId = materialId;
  const { document } = generated(getDrawingProfile(), generateFurniture(s));
  const item = document.drawingAnnotations.items.find(i => i.materialId === materialId)!;
  const tables = document.sheets.flatMap(s => s.assemblyPartsList ? [s.assemblyPartsList] : []);
  assert(!document.sheets[0].assemblyPartsList); assert(tables.length > 1);
  const fragments = tables.flatMap(t => t.rows).filter(row => row.itemKey === item.key);
  assert(fragments.some(row => row.continuation));
  assert.equal(fragments.flatMap(row => row.cells[3]).join(""), materialId);
  assert.equal(fragments.flatMap(row => row.cells[2]).join(""), "4");
  assert(tables.every(t => t.fontSize === 2.5));
});

test("annotation reconciliation flags changed quantities, missing items, wrong balloon membership and detached anchors", () => {
  const { result, document } = generated();
  const cases: ((d: DrawingDocument) => void)[] = [
    d => { d.drawingAnnotations.items[0].quantity++; },
    d => { d.drawingAnnotations.items.pop(); },
    d => { d.drawingAnnotations.balloons[0].componentIds = ["chest/drawer-1/front"]; },
    d => { d.drawingAnnotations.anchors[0].point.x += 500; },
    d => { d.sheets[0].balloons![0].leaderPoints[1].x += 10; },
    d => { d.sheets[0].assemblyPartsList!.rows[0].cells[2] = ["999"]; },
  ];
  for (const tamper of cases) {
    const d = structuredClone(document); tamper(d);
    assert(validateDrawingAnnotations(result, d.drawingAnnotations, d.sheets).length);
  }
});

test("v1 profile/preferences migrate without enabling new output, while v2 saved settings and reset defaults round-trip", () => {
  const legacy = structuredClone(getDrawingProfile()) as unknown as Record<string, unknown>; delete legacy.annotations; legacy.schemaVersion = 1;
  const before = JSON.stringify(legacy), parsed = parseDrawingProfile(legacy); assert(parsed.profile);
  assert.equal(parsed.profile.schemaVersion, 2); assert.equal(parsed.profile.annotations.balloons, false); assert.equal(parsed.profile.annotations.assemblyPartsList, false);
  assert.equal(JSON.stringify(legacy), before);
  const values = new Map<string, string>([[DRAWING_PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, baseProfileId: "furniture-workshop", profile: legacy })]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const oldRaw = values.get(DRAWING_PREFERENCES_KEY), loaded = loadDrawingPreferences(storage); assert(loaded.profile); assert(loaded.message.includes("migrated"));
  assert.equal(values.get(DRAWING_PREFERENCES_KEY), oldRaw, "load must not rewrite saved data");
  loaded.profile.annotations = { balloons: false, assemblyPartsList: true, balloonDisplay: "visible-occurrences", itemNumberStyle: "prefixed" };
  assert(saveDrawingPreferences(storage, loaded.profile, loaded.baseProfileId!).profile);
  const restored = loadDrawingPreferences(storage); assert(restored.profile);
  assert.deepEqual(restored.profile.annotations, loaded.profile.annotations);
  assert.equal(JSON.parse(values.get(DRAWING_PREFERENCES_KEY)!).schemaVersion, 2);
  assert.equal(getDrawingProfile().annotations.balloons, true);
});

test("invalid/future annotation settings are rejected rather than silently dropped", () => {
  const p = getDrawingProfile();
  for (const annotation of [{ ...p.annotations, balloons: "yes" }, { ...p.annotations, balloonDisplay: "invented" }, { ...p.annotations, itemNumberStyle: "hardware-approved" }, { ...p.annotations, future: true }]) {
    assert.equal(parseDrawingProfile({ ...p, annotations: annotation }).profile, null);
  }
  assert.equal(parseDrawingProfile({ ...p, schemaVersion: 3 }).profile, null);
});

test("annotation generation is immutable and keeps hardware allowances outside numbered panel/purchasing items", () => {
  const result = generateFurniture(createDemoChestSpecification()), before = JSON.stringify(result), p = getDrawingProfile(), profileBefore = JSON.stringify(p);
  const { document } = generated(p, result);
  assert.equal(JSON.stringify(result), before); assert.equal(JSON.stringify(p), profileBefore);
  assert(document.drawingAnnotations.items.every(item => item.kind === "panel"));
  assert.deepEqual(document.hardware.allowances.map(row => row.quantity).sort((a, b) => a - b), [8, 8, 160]);
  assert(document.hardware.allowances.every(row => !row.purchasingEligible && row.purchasingQuantity === 0));
  assert.deepEqual(document.hardware.approvedPurchasingItems, []);
  const bad = structuredClone(result); bad.bom.pop(); assert.throws(() => createDrawingAnnotations(bad, p.annotations));
});

for (const format of ["A3", "A4"] as const) test(`${format}: PDF includes vector balloon circles, matching item text and every numbered parts-list page`, async () => {
  const p = getDrawingProfile("engineering"); p.sheet.format = format; p.annotations.itemNumberStyle = "prefixed";
  const { document } = generated(p), bytes = await exportDrawingPDF(document), pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), document.sheets.length);
  pdf.getPages().forEach(page => near(page.getWidth(), document.sheets[0].widthMm * MM_TO_PT));
  const streams = pdf.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream).map(([, value]) => value as PDFRawStream);
  assert(!streams.some(s => s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  const content = streams.map(s => new TextDecoder().decode(decodePDFRawStream(s).decode())).join("\n");
  assert(/\sc\s/.test(content), "balloon circles must be vector curves");
  for (const item of document.drawingAnnotations.items) assert(content.includes(Buffer.from(item.label).toString("hex").toUpperCase()));
  assert.equal(document.complianceVerified, false); assert.equal(document.manufacturingReady, false);
});
