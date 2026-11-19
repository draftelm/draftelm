import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { appendCatalogueVersion, mergeManufacturingCatalogue, catalogueDefinitionFromDraft, applyPanelPropertyDraft, applyReviewedPanelPropertyEdit, catalogueEntrySubject, catalogueReference, catalogueReferenceLabel, collectCatalogueReferences, createManufacturingSchedule, createPanelManufacturingDocument, createPanelTopology, detachChangedCatalogueSelections, hasSyntheticCatalogue, manufacturingFingerprint, panelPropertyDraft, parseManufacturingCatalogue, rebasePanelManufacturing, resolvePanelManufacturing, reviewPanelPropertyEdit, stageCataloguePreset, syntheticPanelExample, validateCatalogueEntry, validatePanelManufacturingDocument } from "../src/manufacturing";
import type { CatalogueDefinition, CatalogueEntry, ManufacturingCatalogue, PanelManufacturingDocument, PanelPropertyDraft } from "../src/manufacturing";
import { generateDrawingDocument, getDrawingProfile, plotSheet, validateGADocument, parseDrawingProfile } from "../src/drawings";
import { manufacturingWorkflowProfile } from "../src/drawings/manufacturingOutput";
import { modelToSheet } from "../src/drawings/dimensionPlot";
import { projectPanelLocal } from "../src/drawings/manufacturingAnnotations";
import { containsRect, primitiveBounds } from "../src/drawings/annotationGeometry";
import { catalogueLegendRows } from "../src/drawings/catalogueLegend";
import { fullySpecifiedFixture, verify } from "./panelManufacturingFixtures";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";

const id = "chest/drawer-1/front", second = "chest/drawer-2/front";
const common = { manufacturerCodes: [{ manufacturerId: "SYNTHETIC-MAKER", code: "SYNTHETIC-CODE" }], supplierCodes: [{ supplierId: "SYNTHETIC-SUPPLIER", code: "SYNTHETIC-SUPPLY" }] };
function entry(definition: CatalogueDefinition, name = `SYNTHETIC-${definition.kind}`, version = 1): CatalogueEntry { return { id: name.toLowerCase(), name, version, kind: definition.kind, owner: { kind: "project", id: "synthetic-tests-only" }, syntheticExample: true, specification: { status: "provisional", value: structuredClone(definition), reason: "SYNTHETIC test fixture only; no production specification or approval." } }; }
function catalogue(): ManufacturingCatalogue { return { schemaVersion: 1, id: "synthetic-library", entries: [entry({ ...common, kind: "material", stockMaterialId: "demo-sheet", nominalThicknessMm: 18, grade: "SYNTHETIC-GRADE", appearance: "SYNTHETIC stock appearance", orientation: { kind: "directional", along: "u", reversalAllowed: true } }), entry({ ...common, kind: "edge-treatment", treatmentKind: "edge-band", specificationId: "SYNTHETIC-BAND", materialId: "SYNTHETIC-EDGE-STOCK", nominalThicknessMm: 1, appearance: "SYNTHETIC edge appearance" }), entry({ ...common, kind: "finish", specificationId: "SYNTHETIC-FINISH-A", appearance: "SYNTHETIC-A" }, "SYNTHETIC-FINISH-A"), entry({ ...common, kind: "finish", specificationId: "SYNTHETIC-FINISH-B", appearance: "SYNTHETIC-B" }, "SYNTHETIC-FINISH-B")] }; }
function fixture(width = 900, drawers = 4) { const s = createDemoChestSpecification(); s.dimensions.width = width; s.drawerCount = drawers; if (drawers > 4) s.dimensions.height = drawers * 200 + 50; const source = generateFurniture(s), properties = createPanelManufacturingDocument(source); return { source, properties, library: catalogue() }; }
function applyLibrary(properties: PanelManufacturingDocument, source: ReturnType<typeof generateFurniture>, library = catalogue(), componentId = id) {
  const p = properties.panels.find(p => p.componentId === componentId)!; let draft = panelPropertyDraft(p);
  draft.grain = "longitudinal"; draft.faces.a.role = "decorative"; draft.faces.a.goodFace = "SYNTHETIC good-face criterion"; draft.faces.b.role = "reverse";
  draft = stageCataloguePreset(draft, catalogueReference(library.id, library.entries[0]), { kind: "material" });
  draft = stageCataloguePreset(draft, catalogueReference(library.id, library.entries[1]), { kind: "edge-treatment", edge: "u-min" });
  draft = stageCataloguePreset(draft, catalogueReference(library.id, library.entries[2]), { kind: "finish", face: "a" });
  draft = stageCataloguePreset(draft, catalogueReference(library.id, library.entries[3]), { kind: "finish", face: "b" });
  return applyPanelPropertyDraft(properties, source, [componentId], draft, true);
}
function drawing(properties: PanelManufacturingDocument, source: ReturnType<typeof generateFurniture>, face: "a" | "b" = "a", rotation: 0 | 90 | 180 | 270 = 0, profileId = "furniture-workshop") {
  const profile = manufacturingWorkflowProfile(getDrawingProfile(profileId)); const result = generateDrawingDocument(source, profile, undefined, { properties, requestedPanelIds: [id], syntheticExample: hasSyntheticCatalogue(properties), panelViews: { [id]: { face, rotation } } }); assert(result.document, result.issues.join("; ")); return result.document;
}

test("catalogue versions are immutable and pinned references survive later library versions", () => {
  const { source, properties, library } = fixture(), next = applyLibrary(properties, source, library), before = manufacturingFingerprint(next);
  const changed = structuredClone(library.entries[0]); changed.version = 2; changed.name = "SYNTHETIC updated material"; assert(changed.specification.status === "provisional"); if (changed.specification.value.kind !== "material") throw Error(); changed.specification.value.appearance = "SYNTHETIC-NEW";
  const v2 = appendCatalogueVersion(library, changed); assert.equal(v2.entries.length, 5); assert.equal(library.entries.length, 4); assert.equal(manufacturingFingerprint(next), before);
  assert.throws(() => appendCatalogueVersion(v2, changed)); assert.throws(() => appendCatalogueVersion(v2, { ...changed, version: 1 }));
  const p = next.panels.find(p => p.componentId === id)!; assert(p.material.status === "provisional"); assert.equal(p.material.value.catalogue!.entry.version, 1);
  const applied = applyPanelPropertyDraft(next, source, [id], stageCataloguePreset(panelPropertyDraft(p), catalogueReference(v2.id, changed), { kind: "material" }));
  assert.equal(applied.panels.find(p => p.componentId === id)!.material.status, "provisional"); assert.notEqual(createManufacturingSchedule(source, applied).find(r => r.componentId === id)!.variantId, createManufacturingSchedule(source, next).find(r => r.componentId === id)!.variantId);
});
test("unknown library definitions remain unknown and cannot be selected as specifications", () => {
  const e = entry({ ...common, kind: "finish", specificationId: "SYNTHETIC" }); e.specification = { status: "unassigned", reason: "Not specified" };
  assert.deepEqual(validateCatalogueEntry(e), []); assert.throws(() => catalogueReference("synthetic", e)); assert.equal(parseManufacturingCatalogue(JSON.stringify({ schemaVersion: 1, id: "synthetic", entries: [e] })).entries[0].specification.status, "unassigned");
});
test("supplied catalogue verification is version/value-bound and never upgrades occurrence approval", () => {
  const { source, properties, library } = fixture(), e = library.entries[0]; assert(e.specification.status === "provisional"); const value = e.specification.value;
  e.specification = { status: "verified", value, verification: { subjectFingerprint: catalogueEntrySubject(e, value), evidenceRefs: ["SYNTHETIC-EVIDENCE"], reviewedBy: "SYNTHETIC-REVIEWER" } };
  assert.deepEqual(validateCatalogueEntry(e), []); assert(validateCatalogueEntry({ ...e, version: 2 }).length);
  const next = applyLibrary(properties, source, library), p = next.panels.find(p => p.componentId === id)!; assert.equal(p.material.status, "provisional"); assert.equal(next.manufacturingReady, false); assert(!resolvePanelManufacturing(source, next).approvedManufacturingData);
});
test("catalogue parser rejects duplicate identities, malformed fields and approval overrides", () => {
  const library = catalogue(); assert.deepEqual(parseManufacturingCatalogue(JSON.stringify(library)), library);
  for (const bad of [{ ...library, approved: true }, { ...library, schemaVersion: 2 }, { ...library, entries: [library.entries[0], library.entries[0]] }, { ...library, entries: [{ ...library.entries[0], manufacturingReady: true }] }]) assert.throws(() => parseManufacturingCatalogue(JSON.stringify(bad)));
  const e = structuredClone(library.entries[0]); assert(e.specification.status === "provisional"); e.specification.value.supplierCodes.push(e.specification.value.supplierCodes[0]); assert(validateCatalogueEntry(e).length);
});
test("material selections cannot replace engineering stock or conflict with actual nominal thickness", () => {
  const { source, properties, library } = fixture(), before = manufacturingFingerprint(properties), p = properties.panels.find(p => p.componentId === id)!;
  const wrong = structuredClone(library.entries[0]); assert(wrong.specification.status === "provisional" && wrong.specification.value.kind === "material"); wrong.specification.value.nominalThicknessMm = 12;
  assert.throws(() => applyPanelPropertyDraft(properties, source, [id], stageCataloguePreset(panelPropertyDraft(p), catalogueReference(library.id, wrong), { kind: "material" })));
  wrong.specification.value.nominalThicknessMm = 18; wrong.specification.value.stockMaterialId = "SYNTHETIC-REPLACEMENT";
  assert.throws(() => applyPanelPropertyDraft(properties, source, [id], stageCataloguePreset(panelPropertyDraft(p), catalogueReference(library.id, wrong), { kind: "material" })));
  assert.equal(manufacturingFingerprint(properties), before);
});
test("manual edits detach affected references while retaining other pinned face/edge/material definitions", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), p = next.panels.find(p => p.componentId === id)!, draft = panelPropertyDraft(p);
  const changed = structuredClone(draft); changed.edges["u-min"].appearance = "SYNTHETIC manual change";
  const detached = detachChangedCatalogueSelections(draft, changed); assert.equal(detached.library!.edges["u-min"], null); assert(detached.library!.material); assert(detached.library!.faces.a);
  const applied = applyPanelPropertyDraft(next, source, [id], detached); assert.equal(collectCatalogueReferences(applied).length, 3); assert.deepEqual(validatePanelManufacturingDocument(applied, source).valid, true);
});
test("conflicting definitions cannot share a pinned catalogue identity and version across occurrences", () => {
  const { source, properties, library } = fixture(), next = applyLibrary(properties, source, library), e = structuredClone(library.entries[0]); e.name = "SYNTHETIC CONFLICT";
  const draft = stageCataloguePreset(panelPropertyDraft(next.panels.find(p => p.componentId === second)!), catalogueReference(library.id, e), { kind: "material" });
  assert.throws(() => applyPanelPropertyDraft(next, source, [second], draft), /Conflicting definitions/);
});
test("library proposals participate in explicit bulk review and never merge unresolved variants", () => {
  const { source, properties, library } = fixture(), p = properties.panels.find(p => p.componentId === id)!, draft = stageCataloguePreset(panelPropertyDraft(p), catalogueReference(library.id, library.entries[0]), { kind: "material" }), ids = [id, second];
  const review = reviewPanelPropertyEdit(properties, source, ids, draft); assert.throws(() => applyReviewedPanelPropertyEdit(properties, source, ids, draft, review, false));
  const next = applyReviewedPanelPropertyEdit(properties, source, ids, draft, review, true); assert.equal(next.panels.filter(p => p.material.status !== "unassigned" && p.material.value.catalogue).length, 2); assert.equal(resolvePanelManufacturing(source, next).variants.length, 29);
  const tampered = structuredClone(draft); tampered.library!.material!.entry.version = 2; assert.throws(() => applyReviewedPanelPropertyEdit(properties, source, ids, tampered, review, true));
});
test("library references survive reviewed geometry rebase as pinned definitions with provisional panel values", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), changed = fixture(1000).source;
  assert(!validatePanelManufacturingDocument(next, changed).valid); const rebased = rebasePanelManufacturing(next, changed).document;
  assert.equal(collectCatalogueReferences(rebased).length, 4); assert.deepEqual(collectCatalogueReferences(rebased), collectCatalogueReferences(next)); assert.equal(rebased.panels.find(p => p.componentId === id)!.material.status, "provisional"); assert(validatePanelManufacturingDocument(rebased, changed).valid);
});
test("pinned references and actual values cannot be edited independently", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), p = next.panels.find(p => p.componentId === id)!;
  assert(p.material.status === "provisional"); p.material.value.manufacturerCodes = [];
  assert(!validatePanelManufacturingDocument(next, source).valid);
  const raw = structuredClone(next); raw.panels.find(p => p.componentId === id)!.stockOrientation = null as never; assert.doesNotThrow(() => validatePanelManufacturingDocument(raw, source)); assert(!validatePanelManufacturingDocument(raw, source).valid);
});
for (const profile of ["furniture-workshop", "engineering"]) for (const face of ["a", "b"] as const) for (const rotation of [0, 90, 180, 270] as const) test(`${profile}: ${face}/${rotation} grain, edge keys and reference dimensions use actual panel axes`, () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), doc = drawing(next, source, face, rotation, profile), mp = doc.sheets.find(s => s.manufacturingComponentId === id && s.viewports.length)!, view = mp.viewports[0], p = next.panels.find(p => p.componentId === id)!, panel = source.components.find(c => c.id === id)!; assert(panel.kind === "panel");
  const topology = createPanelTopology(panel, p.orientation), localEdge = topology.edges.find(e => e.key === "u-min")!, expectedA = modelToSheet(view, projectPanelLocal(topology, { face, rotation }, localEdge.localCorners[0])), expectedB = modelToSheet(view, projectPanelLocal(topology, { face, rotation }, localEdge.localCorners[1]));
  const strip = view.manufacturingInk!.find(e => e.kind === "line" && e.sourceId === `edging:${localEdge.id}`)!; assert(strip.kind === "line"); assert.equal(Math.abs(strip.from.x - strip.to.x) < 1e-6, Math.abs(expectedA.x - expectedB.x) < 1e-6); assert(Math.hypot((strip.from.x + strip.to.x - expectedA.x - expectedB.x) / 2, (strip.from.y + strip.to.y - expectedA.y - expectedB.y) / 2) < 1.201);
  const grain = view.manufacturingInk!.find(e => e.kind === "line" && e.sourceId === `grain:${id}`)!; assert(grain.kind === "line"); const a = projectPanelLocal(topology, { face, rotation }, { u: 0, v: 0, t: 0 }), b = projectPanelLocal(topology, { face, rotation }, { u: 1, v: 0, t: 0 });
  assert.equal(Math.sign(grain.to.x - grain.from.x), Math.sign(b.x - a.x)); assert.equal(Math.sign(grain.to.y - grain.from.y), Math.sign(a.y - b.y));
  assert(view.manufacturingInk!.every(e => containsRect(view.frame, primitiveBounds(e)))); assert.deepEqual(validateGADocument(doc), []);
  assert.equal(doc.componentDimensionCoverage.displayedDimensionIds.length, 87); assert.equal(doc.functionalDimensionCoverage.displayedRequestIds.length, 26); assert.equal(doc.reconciliation.panelQuantity, 29); assert.deepEqual(doc.cuttingList.map(r => r.componentIds).flat().sort(), source.components.filter(c => c.kind === "panel").map(p => p.id).sort());
  const texts = plotSheet(doc, mp).filter(e => e.kind === "text").map(e => e.text).join(" "); assert(texts.includes(`FACE ${face.toUpperCase()} / ${rotation} deg`)); assert(texts.includes("E1 (u-min)")); assert(texts.includes("SYNTHETIC-FINISH-A")); assert(texts.includes("SYNTHETIC-FINISH-B")); assert(!doc.manufacturingReady); assert(doc.hardware.allowances.every(a => a.purchasingQuantity === 0));
});
test("grain is never inferred from library stock direction or non-directional/unknown properties", () => {
  const { source, properties, library } = fixture(); let draft = stageCataloguePreset(panelPropertyDraft(properties.panels.find(p => p.componentId === id)!), catalogueReference(library.id, library.entries[0]), { kind: "material" });
  let next = applyPanelPropertyDraft(properties, source, [id], draft); assert(!drawing(next, source).sheets.flatMap(s => s.viewports).flatMap(v => v.manufacturingInk ?? []).some(e => e.sourceId === `grain:${id}`));
  draft = panelPropertyDraft(next.panels.find(p => p.componentId === id)!); draft.grain = "non-directional"; next = applyPanelPropertyDraft(next, source, [id], draft); assert(!drawing(next, source).sheets.flatMap(s => s.viewports).flatMap(v => v.manufacturingInk ?? []).some(e => e.sourceId === `grain:${id}`));
});
test("edge unknown, explicit no treatment and specified treatments retain distinct drawing/schedule meanings", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), p = next.panels.find(p => p.componentId === id)!; let draft = panelPropertyDraft(p); draft.edges["u-max"].kind = "none"; const changed = applyPanelPropertyDraft(next, source, [id], draft), doc = drawing(changed, source), ink = doc.sheets.flatMap(s => s.viewports).flatMap(v => v.manufacturingInk ?? []);
  assert.equal(ink.filter(e => e.kind === "line" && e.sourceId?.startsWith("edging:")).length, 1); const row = doc.manufacturing!.rows.find(r => r.componentId === id)!; assert(row.cells[6].includes("u-max: None [P]")); assert(row.cells[6].includes("Other edges: Not specified"));
  draft = panelPropertyDraft(changed.panels.find(p => p.componentId === id)!); draft.edges["u-min"].kind = ""; draft = detachChangedCatalogueSelections(panelPropertyDraft(changed.panels.find(p => p.componentId === id)!), draft); assert.equal(collectCatalogueReferences(applyPanelPropertyDraft(changed, source, [id], draft)).length, 3);
});

test("explicit matching groups are occurrence-bound, distinct from shared grain direction and remain unverified", () => {
  const { source, properties } = fixture(); let next = syntheticPanelExample(properties, source, id); const before = next.panels.find(p => p.componentId === id)!; assert.equal(before.grainMatching.status, "unassigned");
  const matching: NonNullable<PanelPropertyDraft["matching"]> = { mode: "specified", groupId: "SYNTHETIC-FRONT-GROUP", face: "a", sequence: "0", originU: "0", originV: "0", rotation: "0" };
  let draft = panelPropertyDraft(before); draft.matching = matching; draft.matchingEdited = true; next = applyPanelPropertyDraft(next, source, [id], draft);
  assert(validatePanelManufacturingDocument(next, source).diagnostics.some(d => d.code === "incomplete-matching"));
  draft = panelPropertyDraft(next.panels.find(p => p.componentId === second)!); draft.grain = "longitudinal"; draft.matching = { ...matching, sequence: "1", originV: "220" }; draft.matchingEdited = true; next = applyPanelPropertyDraft(next, source, [second], draft);
  assert(!validatePanelManufacturingDocument(next, source).diagnostics.some(d => d.code === "incomplete-matching")); const doc = drawing(next, source); const text = doc.sheets.flatMap(s => plotSheet(doc, s)).filter(e => e.kind === "text").map(e => e.text).join(" "); assert(text.includes("SYNTHETIC-FRONT-GROUP")); assert(text.includes("continuity UNVERIFIED")); assert(doc.manufacturing!.rows.find(r => r.componentId === id)!.cells[9].includes("order 0"));
  const duplicate = panelPropertyDraft(next.panels.find(p => p.componentId === second)!); duplicate.matching = { ...matching }; duplicate.matchingEdited = true; assert.throws(() => applyPanelPropertyDraft(next, source, [second], duplicate));
  const bulk = panelPropertyDraft(next.panels.find(p => p.componentId === id)!); bulk.matchingEdited = true; assert.throws(() => reviewPanelPropertyEdit(next, source, [id, second], bulk), /occurrence-specific/);
});
test("unknown/independent matching and incomplete registration cannot become assumed continuous grain", () => {
  const { source, properties } = fixture(), p = properties.panels.find(p => p.componentId === id)!, draft = panelPropertyDraft(p); draft.matching = { ...draft.matching!, mode: "specified", groupId: "SYNTHETIC-MISSING" }; draft.matchingEdited = true;
  assert.throws(() => applyPanelPropertyDraft(properties, source, [id], draft)); draft.matching.mode = "independent"; const next = applyPanelPropertyDraft(properties, source, [id], draft); assert(createManufacturingSchedule(source, next).find(r => r.componentId === id)!.cells[9].includes("Independent; no cross-panel matching"));
});
test("compact schedule aliases resolve to one pinned library definition per version", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), rows = createManufacturingSchedule(source, next), row = rows.find(r => r.componentId === id)!;
  assert.equal(row.cells.length, 10); assert.match(row.cells[4], /^L\d /); assert.match(row.cells[6], /L\d /); assert.match(row.cells[8], /L\d /); assert.equal(row.cells[7], "Not specified"); assert(!row.cells[4].includes("SYNTHETIC-GRADE")); assert(!row.cells[4].includes("SYNTHETIC-SUPPLY"));
  const legend = catalogueLegendRows(next); assert.equal(legend.length, 4); assert(legend.some(r => r.cells[1].includes("SYNTHETIC-GRADE"))); assert(legend.some(r => r.cells[1].includes("SYNTHETIC-SUPPLY")));
  const doc = drawing(next, source); assert.equal(doc.sheets.filter(s => s.id.startsWith("LC-")).length, 1); assert.equal(doc.manufacturing!.rows.length, 29); assert.equal(doc.sheets.filter(s => s.manufacturingComponentId && s.viewports.length).length, 1);
});
test("library tables/annotations can be hidden without losing bound snapshots or occurrence rows", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), profile = manufacturingWorkflowProfile(getDrawingProfile()); profile.contents.manufacturingOutput!.catalogueLegend = false; profile.contents.manufacturingOutput!.propertyDrawings = false; profile.contents.manufacturingOutput!.schedule = false;
  const result = generateDrawingDocument(source, profile, undefined, { properties: next, requestedPanelIds: [id], syntheticExample: true }); assert(result.document, result.issues.join("; ")); assert(!result.document.sheets.some(s => /^(LC|MP|MS)-/.test(s.id))); assert.equal(collectCatalogueReferences(result.document.manufacturing!.properties).length, 4); assert.equal(result.document.manufacturing!.rows.length, 29); assert.deepEqual(validateGADocument(result.document), []);
});
test("missing/tampered library legend sheets and lost synthetic labelling are rejected", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), doc = drawing(next, source), missing = structuredClone(doc); missing.sheets = missing.sheets.filter(s => !s.id.startsWith("LC-")); assert(validateGADocument(missing).length);
  const bad = structuredClone(doc); bad.sheets.find(s => s.id.startsWith("LC-"))!.table!.rows[0].cells[1][0] = "FABRICATED APPROVAL"; assert(validateGADocument(bad).length);
  const unlabeled = generateDrawingDocument(source, doc.profile, undefined, { properties: next, requestedPanelIds: [id], syntheticExample: false }); assert(!unlabeled.document);
});
test("invalid view face/rotation references cannot bypass validation by hiding property drawings", () => {
  const { source, properties } = fixture(), profile = manufacturingWorkflowProfile(getDrawingProfile()); profile.contents.manufacturingOutput!.propertyDrawings = false;
  for (const panelViews of [{ [id]: { face: "a", rotation: 45 } }, { foreign: { face: "b", rotation: 0 } }, 3]) { const result = generateDrawingDocument(source, profile, undefined, { properties, requestedPanelIds: [id], syntheticExample: false, panelViews } as never); assert(!result.document); }
});
test("equal stock blanks with different library finishes remain distinct manufacturing variants", () => {
  const { source, document } = fullySpecifiedFixture(), p = document.panels[0], e = entry({ ...common, kind: "finish", specificationId: "SYNTHETIC-FINISH" });
  const draft = stageCataloguePreset(panelPropertyDraft(p), catalogueReference("synthetic", e), { kind: "finish", face: "a" }), next = applyPanelPropertyDraft(document, source, [p.componentId], draft), plan = resolvePanelManufacturing(source, next);
  assert.equal(plan.stockBlankGroups.length, 1); assert.equal(plan.variants.length, 2); assert.equal(plan.variants.reduce((sum, v) => sum + v.quantity, 0), 2); assert(!plan.manufacturingReady); assert.equal(next.panels[1].componentId, document.panels[1].componentId);
});
test("new drawing annotation switches preserve older saved profile output and reject unsupported overrides", () => {
  const profile = manufacturingWorkflowProfile(getDrawingProfile()); assert.equal(profile.contents.manufacturingOutput!.keyedAnnotations, true); assert(parseDrawingProfile(profile).profile);
  const old = structuredClone(profile); delete old.contents.manufacturingOutput!.keyedAnnotations; delete old.contents.manufacturingOutput!.catalogueLegend; assert(parseDrawingProfile(old).profile);
  const bad = structuredClone(profile); bad.contents.manufacturingOutput!.keyedAnnotations = "approved" as never; assert(!parseDrawingProfile(bad).profile);
});
for (const width of [900, 1000, 1100]) for (const drawers of [1, 4, 6, 12]) test(`${width} mm/${drawers} drawers: source geometry, panel IDs, nominal dimensions and allowances survive library drawings`, () => {
  const { source, properties } = fixture(width, drawers), snapshot = manufacturingFingerprint(source), next = applyLibrary(properties, source), doc = drawing(next, source);
  assert.equal(manufacturingFingerprint(source), snapshot); assert.equal(doc.reconciliation.panelQuantity, source.components.filter(c => c.kind === "panel").length); assert.equal(doc.componentDimensionCoverage.displayedDimensionIds.length, doc.componentDimensionPlan.dimensions.length); assert.deepEqual(doc.componentDimensionCoverage.missingDimensionIds, []); assert.equal(doc.manufacturing!.rows.reduce((s, r) => s + r.quantity, 0), 5 + drawers * 6); assert(doc.hardware.allowances.every(a => a.purchasingQuantity === 0));
});
test("keyed manufacturing annotations and catalogue tables remain vector PDF primitives with fixed printed sizes", async () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), doc = drawing(next, source, "b", 90), bytes = await exportDrawingPDF(doc), pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(), doc.sheets.length);
  for (const sheet of doc.sheets.filter(s => s.id.startsWith("MP-") || s.id.startsWith("LC-"))) {
    const page = pdf.getPages()[sheet.metadata.number - 1], raw = page.node.Contents(); assert(raw instanceof PDFArray);
    const content = raw.asArray().map(ref => pdf.context.lookup(ref)).map(s => new TextDecoder().decode(decodePDFRawStream(s as PDFRawStream).decode())).join("\n");
    const segments = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
    const plot = plotSheet(doc, sheet); for (const e of plot) { if (e.kind !== "line" || !e.sourceId) continue; const want = [e.from.x * MM_TO_PT, (sheet.heightMm - e.from.y) * MM_TO_PT, e.to.x * MM_TO_PT, (sheet.heightMm - e.to.y) * MM_TO_PT]; assert(segments.some(s => s.every((v, i) => Math.abs(v - want[i]) < 1e-6))); }
    if (sheet.id.startsWith("MP-")) assert(plot.some(e => e.kind === "text" && e.sourceId?.startsWith("panel-edge:") && e.size === 3));
  }
  assert(!pdf.context.enumerateIndirectObjects().some(([, o]) => o instanceof PDFRawStream && o.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
});

test("transverse grain remains visible beside keyed edges in narrow rotated views", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source), draft = panelPropertyDraft(next.panels.find(p => p.componentId === id)!); draft.grain = "transverse"; draft.grainSense = "negative";
  const changed = applyPanelPropertyDraft(next, source, [id], draft), doc = drawing(changed, source, "b", 90), view = doc.sheets.find(s => s.manufacturingComponentId === id && s.viewports.length)!.viewports[0];
  const ink = view.manufacturingInk!, line = ink.find(e => e.kind === "line" && e.sourceId === `grain:${id}`)!; assert(line?.kind === "line"); const heads = ink.filter(e => e.kind === "polygon" && e.sourceId === `grain:${id}`); assert.equal(heads.length, 1); assert(heads[0].kind === "polygon"); assert.deepEqual(heads[0].points[0], line.from);
});
test("reusable definitions capture complete staged library metadata rather than discarding supplier/process values", () => {
  const { source, properties, library } = fixture(), next = applyLibrary(properties, source, library), p = next.panels.find(p => p.componentId === id)!, draft = panelPropertyDraft(p);
  // Definition capture is part of the UI's Create higher version path.
  assert.deepEqual(catalogueDefinitionFromDraft("material", draft, p, 18, "a", "u-min"), library.entries[0].specification.status !== "unassigned" ? library.entries[0].specification.value : null);
  assert.deepEqual(catalogueDefinitionFromDraft("finish", draft, p, 18, "a", "u-min"), library.entries[2].specification.status !== "unassigned" ? library.entries[2].specification.value : null);
});
for (const componentId of ["chest/carcass/left", "chest/carcass/top", id]) test(`${componentId}: signed/swapped local frames resolve grain in actual assembly axes`, () => {
  const { source } = fixture(), panel = source.components.find(c => c.id === componentId)!; assert(panel.kind === "panel"); const axes = (["x", "y", "z"] as const).filter(a => a !== panel.thicknessAxis);
  const properties = createPanelManufacturingDocument(source, { [componentId]: { u: { axis: axes[1], sign: -1 }, v: { axis: axes[0], sign: 1 }, normal: { axis: panel.thicknessAxis, sign: -1 } } });
  const next = syntheticPanelExample(properties, source, componentId);
  for (const face of ["a", "b"] as const) {
    const generated = generateDrawingDocument(source, manufacturingWorkflowProfile(getDrawingProfile()), undefined, { properties: next, requestedPanelIds: [componentId], syntheticExample: true, panelViews: { [componentId]: { face, rotation: 90 } } }); assert(generated.document, generated.issues.join("; "));
    const p = next.panels.find(p => p.componentId === componentId)!, view = generated.document.sheets.find(s => s.manufacturingComponentId === componentId && s.viewports.length)!.viewports[0], grain = view.manufacturingInk!.find(e => e.kind === "line" && e.sourceId === `grain:${componentId}`)!; assert(grain?.kind === "line");
    const topology = createPanelTopology(panel, p.orientation), a = projectPanelLocal(topology, { face, rotation: 90 }, { u: 0, v: 0, t: 0 }), b = projectPanelLocal(topology, { face, rotation: 90 }, { u: 1, v: 0, t: 0 }); assert.equal(Math.sign(grain.to.x - grain.from.x), Math.sign(b.x - a.x)); assert.equal(Math.sign(grain.to.y - grain.from.y), Math.sign(a.y - b.y));
  }
});

test("reviewed rebase resets a pinned stock definition when actual panel thickness changes", () => {
  const { source, properties } = fixture(), componentId = "chest/carcass/left", next = applyLibrary(properties, source, catalogue(), componentId), s = createDemoChestSpecification(); s.panels.carcass.thickness = 20;
  const changed = generateFurniture(s); assert(changed.geometryValid); const review = rebasePanelManufacturing(next, changed); assert(review.reset.includes(componentId)); const p = review.document.panels.find(p => p.componentId === componentId)!; assert(p.material.status === "provisional"); assert.equal(p.material.value.catalogue, undefined); assert(validatePanelManufacturingDocument(review.document, changed).valid);
});

test("catalogue snapshots pin evidence/status as well as definition and local loads cannot clobber known versions", () => {
  const library = catalogue(), original = catalogueReference(library.id, library.entries[0]), changed = structuredClone(library.entries[0]); assert(changed.specification.status === "provisional"); changed.specification.reason = "SYNTHETIC changed evidence context";
  const replacement = catalogueReference(library.id, changed); assert.notEqual(original.fingerprint, replacement.fingerprint);
  assert.throws(() => mergeManufacturingCatalogue(library, { ...library, entries: [changed] }));
  assert.throws(() => mergeManufacturingCatalogue({ ...library, entries: [] }, { ...library, entries: [changed] }, [original]));
  const next = structuredClone(library.entries[0]); next.version = 2; const merged = mergeManufacturingCatalogue(appendCatalogueVersion(library, next), library); assert(merged.entries.some(e => e.version === 2));
});

test("lipping catalogue proposals identify the treated physical edge without changing nominal blank dimensions", () => {
  const { source, properties, library } = fixture(), before = manufacturingFingerprint(source), lipping = entry({ ...common, kind: "edge-treatment", treatmentKind: "lipping", specificationId: "SYNTHETIC-LIP", materialId: "SYNTHETIC-LIP-STOCK", nominalThicknessMm: 2 });
  const draft = stageCataloguePreset(panelPropertyDraft(properties.panels.find(p => p.componentId === id)!), catalogueReference(library.id, lipping), { kind: "edge-treatment", edge: "v-max" });
  const next = applyPanelPropertyDraft(properties, source, [id], draft), doc = drawing(next, source), row = doc.manufacturing!.rows.find(r => r.componentId === id)!;
  assert(row.cells[6].includes("v-max:")); assert(row.cells[6].includes("2 mm")); assert.equal(row.cells[7], "Not specified"); assert.equal(manufacturingFingerprint(source), before); assert(catalogueLegendRows(next)[0].cells[1].includes("lipping"));
});

test("grain and treatment strokes use fixed paper semantic widths across scales and company profiles", () => {
  const { source, properties } = fixture(), next = applyLibrary(properties, source);
  for (const profile of ["furniture-workshop", "engineering"]) for (const rotation of [0, 90] as const) { const doc = drawing(next, source, "a", rotation, profile), sheet = doc.sheets.find(s => s.manufacturingComponentId === id && s.viewports.length)!, ink = plotSheet(doc, sheet); assert(ink.some(e => e.kind === "line" && e.sourceId === `grain:${id}` && e.width === 0.25 && e.strokeRole === "grain")); assert(ink.some(e => e.kind === "line" && e.sourceId?.startsWith("edging:") && e.width === 0.5 && e.strokeRole === "edge-treatment")); }
});

test("catalogue evidence changes invalidate captured metadata without changing physical variant meaning", () => {
  const { source, document } = fullySpecifiedFixture(), e = entry({ ...common, kind: "material", stockMaterialId: "synthetic-stock", grade: "SYNTHETIC-GRADE", nominalThicknessMm: 18 }); assert(e.specification.status === "provisional");
  const value = e.specification.value; e.specification = { status: "verified", value, verification: { subjectFingerprint: catalogueEntrySubject(e, value), evidenceRefs: ["SYNTHETIC-A"], reviewedBy: "SYNTHETIC-A" } };
  let next = document;
  for (const p of document.panels) next = applyPanelPropertyDraft(next, source, [p.componentId], stageCataloguePreset(panelPropertyDraft(next.panels.find(q => q.componentId === p.componentId)!), catalogueReference("synthetic", e), { kind: "material" }));
  for (const p of next.panels) { assert(p.material.status !== "unassigned"); const v = p.material.value; v.grade = verify(p, "material/grade", "SYNTHETIC-GRADE"); p.material = verify(p, "material", v); }
  const first = resolvePanelManufacturing(source, next); assert.equal(first.variants.length, 1);
  const changed = structuredClone(next);
  for (const p of changed.panels) { assert(p.material.status === "verified"); const v = p.material.value, updated = structuredClone(e); assert(updated.specification.status === "verified"); updated.specification.verification.reviewedBy = "SYNTHETIC-B"; updated.specification.verification.evidenceRefs = ["SYNTHETIC-B"]; v.catalogue = catalogueReference("synthetic", updated); p.material = verify(p, "material", v); }
  const secondPlan = resolvePanelManufacturing(source, changed); assert.notEqual(first.binding.propertiesSnapshot, secondPlan.binding.propertiesSnapshot); assert.deepEqual(first.variants, secondPlan.variants);
});

test("catalogue namespace delimiters cannot alias printed physical property references", () => {
  const a = entry({ ...common, kind: "finish", specificationId: "SYNTHETIC" }), b = structuredClone(a); a.owner.id = "synthetic:one/two"; a.id = "synthetic@finish"; b.owner.id = "synthetic"; b.id = "one/two:synthetic@finish";
  const first = catalogueReference("synthetic/library", a), secondRef = catalogueReference("synthetic/library", b); assert.notEqual(catalogueReferenceLabel(first), catalogueReferenceLabel(secondRef)); assert(catalogueReferenceLabel(first).includes("%2F")); assert(catalogueReferenceLabel(first).includes("%40"));
});
