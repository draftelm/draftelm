import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { applyPanelPropertyDraft, createManufacturingSchedule, createPanelManufacturingDocument, manufacturingFingerprint, panelPropertyDraft, parsePanelPropertyStorage, rebasePanelManufacturing, syntheticPanelExample, validatePanelManufacturingDocument, provisionalProperty } from "../src/manufacturing";
import { generateDrawingDocument, getDrawingProfile, plotSheet, validateGADocument } from "../src/drawings";
import type { DrawingDocument } from "../src/drawings";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";
import { containsRect, overlaps, primitiveBounds } from "../src/drawings/annotationGeometry";
import { manufacturingScheduleTables, plotManufacturingTable } from "../src/drawings/manufacturing";
import { fullySpecifiedFixture } from "./panelManufacturingFixtures";

const panelId = "chest/drawer-1/front";
function source(width = 900) { const s = createDemoChestSpecification(); s.dimensions.width = width; return generateFurniture(s); }
function fixture(demo = false, profileId = "furniture-workshop", convention: "first-angle" | "third-angle" = "third-angle", format: "A4" | "A3" | "A2" | "A1" = "A3", ids = [panelId]) {
  const result = source(), before = manufacturingFingerprint(result), raw = createPanelManufacturingDocument(result), properties = demo ? syntheticPanelExample(raw, result, panelId) : raw;
  const profile = getDrawingProfile(profileId); profile.sheet.projectionConvention = convention; profile.sheet.format = format;
  const generated = generateDrawingDocument(result, profile, undefined, { properties, requestedPanelIds: ids, syntheticExample: demo });
  assert(generated.document, generated.issues.join("; ")); assert.equal(manufacturingFingerprint(result), before);
  return { result, properties, document: generated.document, profile };
}
const nominal = (d: DrawingDocument) => d.sheets.flatMap(s => s.viewports).filter(v => v.projection === "panel-face" && !v.manufacturingComponentId);

test("the visible application slice adds a physical panel map and ten-field schedule while preserving nominal output", () => {
  const { result, document, profile } = fixture(), legacy = generateDrawingDocument(result, profile); assert(legacy.document);
  assert.deepEqual(nominal(document), nominal(legacy.document)); assert.equal(document.componentDimensionPlan.dimensions.length, 87);
  assert.equal(document.componentDimensionCoverage.displayedDimensionIds.length, 87); assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26);
  assert.equal(document.reconciliation.panelQuantity, 29); assert.deepEqual(document.cuttingList, legacy.document.cuttingList);
  assert(document.sheets.some(s => s.id.startsWith("MP-"))); assert(document.sheets.some(s => s.id.startsWith("MN-"))); assert(document.sheets.some(s => s.id.startsWith("MS-")));
  assert.equal(document.manufacturing!.rows.length, 29); assert(document.manufacturing!.rows.every(r => r.cells.length === 10 && r.cells[0] === "Not specified" && r.cells[7] === "Not specified"));
  assert.equal(document.sheets.length, 17); assert.equal(legacy.document.sheets.length, 12);
  const mp = document.sheets.find(s => s.manufacturingComponentId === panelId && s.viewports.length)!;
  assert(mp.viewports[0].references.every(r => r.componentId === panelId)); assert(mp.viewports[0].dimensions.every(d => d.prefix === "REF "));
  assert(!mp.viewports[0].manufacturingInk!.some(e => e.sourceId?.startsWith("grain:") || e.sourceId?.startsWith("edging:")));
  assert(document.hardware.allowances.every(h => h.purchasingQuantity === 0 && !h.purchasingEligible)); assert(!document.manufacturingReady); assert(!document.complianceVerified);
});

test("grain, finish, good face, codes and edge edits update actual properties, their occurrence drawing and schedule", () => {
  const { result, properties, document } = fixture(), record = properties.panels.find(p => p.componentId === panelId)!, draft = panelPropertyDraft(record);
  draft.grain = "longitudinal"; draft.materialCodes = "User maker=USER-MATERIAL";
  draft.faces.a = { role: "decorative", goodFace: "User appearance requirement", finish: "specified", finishId: "USER-FINISH" };
  draft.edges["v-min"] = { kind: "lipping", specificationId: "USER-LIP", material: "USER-LIP-MATERIAL", thickness: "2", appearance: "User edge appearance", process: "USER-PROCESS-REFERENCE" };
  const edited = applyPanelPropertyDraft(properties, result, [panelId], draft), generated = generateDrawingDocument(result, document.profile, undefined, { properties: edited, requestedPanelIds: [panelId], syntheticExample: false }); assert(generated.document, generated.issues.join("; "));
  const d = generated.document, row = d.manufacturing!.rows.find(r => r.componentId === panelId)!;
  assert(row.cells[4].includes("USER-MATERIAL")); assert(row.cells[5].includes("U")); assert(row.cells[6].includes("USER-LIP")); assert(row.cells[8].includes("USER-FINISH")); assert(row.cells[9].includes("User appearance requirement"));
  assert.notEqual(row.variantId, document.manufacturing!.rows.find(r => r.componentId === panelId)!.variantId);
  const view = d.sheets.flatMap(s => s.viewports).find(v => v.manufacturingComponentId === panelId)!;
  assert(view.manufacturingInk!.some(e => e.sourceId === `grain:${panelId}`)); assert(view.manufacturingInk!.some(e => e.sourceId?.startsWith("edging:")));
  assert.deepEqual(nominal(d), nominal(document));
  const neighbouring = d.manufacturing!.rows.find(r => r.componentId === "chest/drawer-2/front")!;
  assert.equal(neighbouring.cells[8], "Not specified"); assert.notEqual(neighbouring.variantId, row.variantId);
});

test("bulk proposals apply only to explicit occurrence IDs and invalid scopes/specifications fail atomically", () => {
  const result = source(), properties = createPanelManufacturingDocument(result), before = manufacturingFingerprint(properties), p = properties.panels.find(p => p.componentId === panelId)!, draft = panelPropertyDraft(p);
  draft.grain = "transverse";
  const ids = [panelId, "chest/drawer-3/front"], edited = applyPanelPropertyDraft(properties, result, ids, draft);
  assert.deepEqual(edited.panels.filter(p => p.grain.status !== "unassigned").map(p => p.componentId).sort(), [...ids].sort());
  assert.equal(manufacturingFingerprint(properties), before);
  for (const bad of [[], [panelId, panelId], ["not-a-panel"]]) assert.throws(() => applyPanelPropertyDraft(properties, result, bad, draft));
  draft.edges["u-min"].kind = "edge-band"; assert.throws(() => applyPanelPropertyDraft(properties, result, [panelId], draft));
  draft.edges["u-min"].specificationId = "EXPLICIT"; draft.edges["u-min"].thickness = "-1"; assert.throws(() => applyPanelPropertyDraft(properties, result, [panelId], draft));
  assert.equal(manufacturingFingerprint(properties), before);
});

test("explicit none and not specified produce different schedule values and neither creates an edge symbol", () => {
  const { result, properties } = fixture(), p = properties.panels.find(p => p.componentId === panelId)!, draft = panelPropertyDraft(p);
  draft.edges["u-min"].kind = "none"; draft.faces.a.finish = "none";
  const next = applyPanelPropertyDraft(properties, result, [panelId], draft), rows = createManufacturingSchedule(result, next), row = rows.find(r => r.componentId === panelId)!;
  assert(row.cells[6].includes("None [P]")); assert(row.cells[8].includes("No applied finish [P]")); assert.equal(row.cells[7], "Not specified");
  draft.edges["u-min"].kind = ""; draft.faces.a.finish = "";
  const reset = applyPanelPropertyDraft(next, result, [panelId], draft); assert.equal(createManufacturingSchedule(result, reset).find(r => r.componentId === panelId)!.cells[6], "Not specified");
});

test("geometry changes retain stale data until explicit review; rebasing strips previous verification claims", () => {
  const { result, properties } = fixture(true), changed = source(1100);
  assert(!validatePanelManufacturingDocument(properties, changed).valid);
  assert.throws(() => applyPanelPropertyDraft(properties, changed, [panelId], panelPropertyDraft(properties.panels.find(p => p.componentId === panelId)!)));
  assert.equal(generateDrawingDocument(changed, getDrawingProfile(), undefined, { properties, requestedPanelIds: [panelId], syntheticExample: true }).document, null);
  const next = rebasePanelManufacturing(properties, changed); assert(validatePanelManufacturingDocument(next.document, changed).valid); assert.equal(next.retained.length, 29);
  assert.equal(next.document.panels.find(p => p.componentId === panelId)!.grain.status, "provisional");
  const s = createDemoChestSpecification(); s.drawerCount = 3; const reduced = generateFurniture(s), removed = rebasePanelManufacturing(properties, reduced);
  assert.equal(removed.document.panels.length, 23); assert.equal(removed.removed.length, 6);
  const synthetic = fullySpecifiedFixture(), rebased = rebasePanelManufacturing(synthetic.document, synthetic.source);
  assert(rebased.document.panels.every(p => p.material.status === "provisional"));
  assert.equal(manufacturingFingerprint(result), manufacturingFingerprint(source()));
});

test("local saving/loading preserves source binding and rejects corrupt or approval-bearing documents", () => {
  const { result, properties } = fixture(true), text = JSON.stringify({ schemaVersion: 1, syntheticExample: true, properties });
  assert.deepEqual(parsePanelPropertyStorage(text, result), { properties, syntheticExample: true });
  const stale = parsePanelPropertyStorage(text, source(1000)); assert(!validatePanelManufacturingDocument(stale.properties, source(1000)).valid);
  assert.throws(() => parsePanelPropertyStorage("{", result));
  assert.throws(() => parsePanelPropertyStorage(JSON.stringify({ schemaVersion: 1, syntheticExample: false, properties: { ...properties, manufacturingReady: true } }), result));
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${profileId}/${convention}/${format}: actual-scale manufacturing maps and property tables stay clear`, () => {
  const { result, document, profile } = fixture(true, profileId, convention, format), legacy = generateDrawingDocument(result, profile);
  // The profile passed into generation remains unchanged and no manufacturing field is persisted implicitly.
  assert.equal(profile.contents.panelManufacturing, undefined);
  assert(document.manufacturing!.syntheticExample);
  assert.deepEqual(document.compositionReport.diagnostics.filter(d => d.code !== "poor-utilisation"), []);
  for (const s of document.sheets.filter(s => s.manufacturingComponentId)) {
    if (s.manufacturingTable) {
      const ink = plotManufacturingTable(s.manufacturingTable);
      for (const e of ink) assert(containsRect({ x: 10 - 1e-6, y: 23 - 1e-6, width: s.widthMm - 20 + 2e-6, height: s.heightMm - 87 + 2e-6 }, primitiveBounds(e)), `${s.id}: ${JSON.stringify(e)}`);
      assert(s.viewports.every(v => !overlaps(v.frame, s.manufacturingTable!.frame)));
    }
    for (const v of s.viewports) for (const e of v.manufacturingInk ?? []) assert(containsRect(v.frame, primitiveBounds(e)));
  }
  assert(legacy.document, legacy.issues.join("; ")); assert.deepEqual(nominal(document), nominal(legacy.document));
  assert.deepEqual(validateGADocument(document), []);
});

test("all rectangular occurrences can be requested without changing controlling component measurement coverage", () => {
  const result = source(), properties = createPanelManufacturingDocument(result), ids = properties.panels.map(p => p.componentId);
  const output = generateDrawingDocument(result, getDrawingProfile(), undefined, { properties, requestedPanelIds: ids, syntheticExample: false }); assert(output.document, output.issues.join("; "));
  assert.equal(output.document.sheets.flatMap(s => s.viewports).filter(v => v.manufacturingComponentId).length, 29);
  assert.equal(output.document.componentDimensionCoverage.displayedDimensionIds.length, 87); assert.equal(output.document.functionalDimensionCoverage.displayedRequestIds.length, 26);
  for (const id of ids) assert(output.document.sheets.some(s => s.manufacturingComponentId === id && s.viewports.length));
});

test("captured manufacturing values, notes, symbols, pagination and missing bindings cannot be silently tampered", async () => {
  const { document } = fixture(true);
  for (const edit of [
    (d: DrawingDocument) => { delete d.manufacturing; },
    (d: DrawingDocument) => { d.manufacturing!.rows[0].cells[7] = "Invented finished size"; },
    (d: DrawingDocument) => { d.sheets.find(s => s.id === "MP-001")!.viewports[0].manufacturingInk![0].sourceId = "wrong-edge"; },
    (d: DrawingDocument) => { d.sheets.find(s => s.id === "MN-001")!.manufacturingTable!.rows[0].cells[1] = ["wrong value"]; },
    (d: DrawingDocument) => { d.sheets = d.sheets.filter(s => s.id !== "MS-002"); },
  ]) { const copy = structuredClone(document); edit(copy); assert(validateGADocument(copy).length); assert.throws(() => plotSheet(copy, copy.sheets[0])); await assert.rejects(exportDrawingPDF(copy)); }
});

test("long source-bound schedule fields paginate at readable sizes and never duplicate quantities", () => {
  const { result, properties } = fixture(), p = properties.panels.find(p => p.componentId === panelId)!, draft = panelPropertyDraft(p);
  draft.faces.a.finish = "specified"; draft.faces.a.finishId = "Long-explicit-finish-".repeat(100);
  const next = applyPanelPropertyDraft(properties, result, [panelId], draft), rows = createManufacturingSchedule(result, next), tables = manufacturingScheduleTables(rows, { width: 420, height: 297 });
  for (const row of rows) {
    const fragments = tables.flatMap(t => t.rows).filter(r => r.bomId === row.id);
    assert.equal(fragments.filter(r => !r.continuation).length, 1); assert.equal(fragments.flatMap(r => r.cells[2]).join(""), String(row.quantity));
    assert(tables.every(t => t.fontSize === 2.5));
  }
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId}/${convention}: manufacturing SVG/PDF vector parity, reference dimensions, tables and synthetic status`, async () => {
  const { document } = fixture(true, profileId, convention), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length);
  assert(!pdf.context.enumerateIndirectObjects().some(([, s]) => s instanceof PDFRawStream && s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const [i, sheet] of document.sheets.entries()) {
    if (!sheet.manufacturingComponentId && !sheet.id.startsWith("MS-")) continue;
    const raw = pdf.getPages()[i].node.Contents(); assert(raw instanceof PDFArray);
    const content = raw.asArray().map(ref => { const stream = pdf.context.lookup(ref); assert(stream instanceof PDFRawStream); return new TextDecoder().decode(decodePDFRawStream(stream).decode()); }).join("\n");
    const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
    for (const e of plotSheet(document, sheet)) {
      if (e.kind === "line" && e.sourceId) { const want = [e.from.x * MM_TO_PT, (sheet.heightMm - e.from.y) * MM_TO_PT, e.to.x * MM_TO_PT, (sheet.heightMm - e.to.y) * MM_TO_PT]; assert(paths.some(p => p.every((n, j) => Math.abs(n - want[j]) < 1e-6))); }
      if (e.kind === "text" && e.sourceId) assert(content.includes(Buffer.from(e.text).toString("hex").toUpperCase()), e.text);
    }
    assert(content.includes(Buffer.from("SYNTHETIC EXAMPLE").toString("hex").toUpperCase()));
  }
});

test("explicit rebase retains one edited manufacturing map instead of expanding every audit-only change into a drawing", () => {
  const { properties } = fixture(true), changed = source(1100), rebased = rebasePanelManufacturing(properties, changed);
  const output = generateDrawingDocument(changed, getDrawingProfile(), undefined, { properties: rebased.document, requestedPanelIds: [panelId], syntheticExample: true });
  assert(output.document, output.issues.join("; ")); assert.equal(output.document.sheets.flatMap(s => s.viewports).filter(v => v.manufacturingComponentId).length, 1);
});

test("grain sense is preserved in editable drafts and explicit directional proposals draw a single correct arrowhead", () => {
  const { result, properties } = fixture(), draft = panelPropertyDraft(properties.panels.find(p => p.componentId === panelId)!);
  draft.grain = "longitudinal"; draft.grainSense = "negative";
  const next = applyPanelPropertyDraft(properties, result, [panelId], draft);
  assert.equal(panelPropertyDraft(next.panels.find(p => p.componentId === panelId)!).grainSense, "negative");
  const output = generateDrawingDocument(result, getDrawingProfile(), undefined, { properties: next, requestedPanelIds: [panelId], syntheticExample: false }); assert(output.document, output.issues.join("; "));
  const ink = output.document.sheets.flatMap(s => s.viewports).find(v => v.manufacturingComponentId === panelId)!.manufacturingInk!.filter(e => e.sourceId === `grain:${panelId}`);
  assert.equal(ink.filter(e => e.kind === "polygon").length, 1);
});

for (const width of [900, 1000, 1100, 1200]) test(`${width} mm: visible manufacturing slice retains source identity, dimensions and all core coverage`, () => {
  const result = source(width), properties = syntheticPanelExample(createPanelManufacturingDocument(result), result, panelId);
  const output = generateDrawingDocument(result, getDrawingProfile(), undefined, { properties, requestedPanelIds: [panelId], syntheticExample: true }); assert(output.document, output.issues.join("; "));
  assert.equal(output.document.componentDimensionCoverage.displayedDimensionIds.length, 87); assert.equal(output.document.functionalDimensionCoverage.displayedRequestIds.length, 26);
  assert.deepEqual(output.document.compositionReport.diagnostics.filter(d => d.code !== "poor-utilisation"), []);
});

test("actual signed local orientation controls which physical edge is marked and the world direction of grain", () => {
  const result = source(), properties = createPanelManufacturingDocument(result, { [panelId]: { u: { axis: "x", sign: -1 }, v: { axis: "y", sign: -1 }, normal: { axis: "z", sign: 1 } } });
  const p = properties.panels.find(p => p.componentId === panelId)!, draft = panelPropertyDraft(p); draft.grain = "longitudinal"; draft.grainSense = "positive";
  draft.edges["v-min"] = { kind: "edge-band", specificationId: "USER-EDGE", thickness: "1", material: "", appearance: "", process: "" };
  const edited = applyPanelPropertyDraft(properties, result, [panelId], draft), output = generateDrawingDocument(result, getDrawingProfile(), undefined, { properties: edited, requestedPanelIds: [panelId], syntheticExample: false }); assert(output.document, output.issues.join("; "));
  const v = output.document.sheets.flatMap(s => s.viewports).find(v => v.manufacturingComponentId === panelId)!, arrow = v.manufacturingInk!.find(e => e.kind === "line" && e.sourceId === `grain:${panelId}`)!;
  assert(arrow.kind === "line" && arrow.from.x > arrow.to.x);
  const edge = v.manufacturingInk!.find(e => e.kind === "line" && e.sourceId?.startsWith("edging:") && e.sourceId.endsWith(":v-min"))!;
  assert(edge.kind === "line"); assert(Math.abs(edge.from.y - (v.origin.y - v.bounds.max.y * v.scale + 1.2)) < 1e-6);
});

test("profiles can hide printable manufacturing maps or schedules while the full data and missing-coverage status remain explicit", () => {
  const result = source(), properties = createPanelManufacturingDocument(result), p = getDrawingProfile(); p.contents.componentDrawings = false;
  let output = generateDrawingDocument(result, p, undefined, { properties, requestedPanelIds: [panelId], syntheticExample: false }); assert(output.document, output.issues.join("; "));
  assert(!output.document.sheets.some(s => s.manufacturingComponentId)); assert.equal(output.document.componentDimensionCoverage.missingDimensionIds.length, 87); assert.equal(output.document.manufacturing!.rows.length, 29);
  p.contents.componentDrawings = true; p.contents.cuttingList.include = false;
  output = generateDrawingDocument(result, p, undefined, { properties, requestedPanelIds: [panelId], syntheticExample: false }); assert(output.document, output.issues.join("; "));
  assert(!output.document.sheets.some(s => s.id.startsWith("MS-"))); assert.equal(output.document.manufacturing!.rows.length, 29); assert(!output.document.manufacturingReady);
});

test("supplied finish appearance and additional manufacturing requirements remain visible in source-bound tables", () => {
  const { result, properties } = fixture(true), p = properties.panels.find(p => p.componentId === panelId)!, f = p.faces[0];
  assert(f.finish.status !== "unassigned" && f.finish.value.kind === "specified");
  f.finish = provisionalProperty({ ...f.finish.value, appearance: provisionalProperty("USER-APPEARANCE", "User proposal") }, "User proposal");
  p.otherRequirements = provisionalProperty([{ requirementId: "USER-NOTE", specification: "User-defined requirement for review" }], "User proposal");
  const rows = createManufacturingSchedule(result, properties), row = rows.find(r => r.componentId === panelId)!;
  assert(row.cells[8].includes("USER-APPEARANCE")); assert(row.cells[9].includes("User-defined requirement for review"));
  const output = generateDrawingDocument(result, getDrawingProfile(), undefined, { properties, requestedPanelIds: [panelId], syntheticExample: true }); assert(output.document, output.issues.join("; "));
  const notes = output.document.sheets.filter(s => s.manufacturingComponentId === panelId).flatMap(s => s.manufacturingTable?.rows.flatMap(r => r.cells.flat()) ?? []).join(" ");
  assert(notes.includes("USER-APPEARANCE")); assert(notes.includes("User-defined requirement for review"));
});

test("unsupported manufacturing text is retained in the browser and explicitly withholds PDF instead of substituting a material/finish value", async () => {
  const { result, properties } = fixture(), p = properties.panels.find(p => p.componentId === panelId)!, draft = panelPropertyDraft(p);
  draft.faces.a.finish = "specified"; draft.faces.a.finishId = "USER-仕上げ";
  const edited = applyPanelPropertyDraft(properties, result, [panelId], draft), output = generateDrawingDocument(result, getDrawingProfile(), undefined, { properties: edited, requestedPanelIds: [panelId], syntheticExample: false }); assert(output.document, output.issues.join("; "));
  const sheet = output.document.sheets.find(s => s.id === "MN-001")!;
  assert(plotSheet(output.document, sheet).some(e => e.kind === "text" && e.text.includes("USER-仕上げ")));
  await assert.rejects(exportDrawingPDF(output.document), /Manufacturing PDF requires text supported/);
});
