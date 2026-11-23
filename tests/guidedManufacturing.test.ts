import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { applyPanelPropertyDraft, applyReviewedPanelFields, catalogueEntrySubject, catalogueReference, createPanelManufacturingDocument, createPanelTopology, manufacturingComponentGroups, manufacturingFingerprint, mergePanelDraftFields, panelFaceView, panelPropertyDraft, PANEL_PROPOSAL_FIELDS, resolvePanelManufacturing, reviewPanelFields, stageCataloguePreset, syntheticPanelExample, validatePanelManufacturingDocument } from "../src/manufacturing";
import type { CatalogueEntry, ManufacturingCatalogue, PanelFieldProposal, PanelProposalField, PanelManufacturingProperties } from "../src/manufacturing";
import { generateDrawingDocument, getDrawingProfile, validateGADocument } from "../src/drawings";
import { manufacturingWorkflowProfile } from "../src/drawings/manufacturingOutput";
import { fullySpecifiedFixture } from "./panelManufacturingFixtures";
const id = "chest/drawer-1/front", second = "chest/drawer-2/front";
const catalogue: ManufacturingCatalogue = { schemaVersion: 1, id: "synthetic-guided-fixtures", entries: [] };
function entry(): CatalogueEntry { return { id: "synthetic-sheet", name: "SYNTHETIC sheet", version: 1, kind: "material", owner: { kind: "company", id: "synthetic-tests" }, syntheticExample: true, specification: { status: "provisional", reason: "SYNTHETIC test only", value: { kind: "material", stockMaterialId: "demo-sheet", nominalThicknessMm: 18, manufacturerCodes: [], supplierCodes: [] } } }; }
function fixture(width = 900, count = 4) { const spec = createDemoChestSpecification(); spec.dimensions.width = width; spec.drawerCount = count; if (count > 4) spec.dimensions.height = count * 200 + 50; const source = generateFurniture(spec), document = createPanelManufacturingDocument(source); return { source, document }; }
function proposal(document: ReturnType<typeof fixture>["document"], fields: PanelProposalField[] = ["grain"]): PanelFieldProposal { const draft = panelPropertyDraft(document.panels.find(p => p.componentId === id)!); draft.grain = "transverse"; return { referenceId: id, componentIds: [id, second], fields, draft }; }
function commit(f = fixture(), p = proposal(f.document), lib = catalogue) { const review = reviewPanelFields(f.document, f.source, p, lib, true); assert(!review.issues.some(i => i.blocking)); return applyReviewedPanelFields(f.document, f.source, p, lib, review, true, true); }
function editable(p: PanelManufacturingProperties, field: PanelProposalField) { if (field === "material") return [p.material, p.stockOrientation]; if (field === "grain") return p.grain; if (field.startsWith("edge:")) return p.edges.find(e => e.edgeId.endsWith(`:${field.slice(5)}`))!.treatment; const f = p.faces.find(f => f.faceId.endsWith(`:${field.split(":")[1]}`))!; return field.endsWith("finish") ? f.finish : f.requirements; }

test("reference groups partition actual 29 occurrences into 4 fronts, 5 carcass and 20 box panels", () => {
  const { source } = fixture(), groups = manufacturingComponentGroups(source);
  assert.deepEqual(groups.map(g => [g.id, g.componentIds.length, g.quantity]), [["drawer-fronts", 4, 4], ["carcass", 5, 5], ["drawer-boxes", 20, 20]]);
  assert.deepEqual(groups.flatMap(g => g.componentIds).sort(), source.components.filter(p => p.kind === "panel").map(p => p.id).sort());
  const namesChanged = structuredClone(source); namesChanged.components.forEach(p => p.name = "same arbitrary label"); assert.deepEqual(manufacturingComponentGroups(namesChanged), groups);
});
test("unregistered identities are explicit Other panels, not inferred from dimensions or names", () => { const { source } = fullySpecifiedFixture(); const groups = manufacturingComponentGroups(source); assert.equal(groups.length, 1); assert.equal(groups[0].id, "other"); assert.equal(groups[0].componentIds.length, source.components.filter(p => p.kind === "panel").length); });
for (const width of [900, 1000, 1100]) for (const count of [1, 4, 6, 12]) test(`${width}/${count}: groups conserve source IDs and field-specific proposals conserve geometry/BOM`, () => {
  const f = fixture(width, count), before = structuredClone(f.source), groups = manufacturingComponentGroups(f.source), front = groups[0];
  assert.equal(groups.reduce((n, g) => n + g.quantity, 0), 5 + count * 6);
  const p = proposal(f.document); p.componentIds = front.componentIds; const next = commit(f, p);
  assert.equal(next.panels.length, 5 + count * 6); assert.deepEqual(f.source, before); assert.equal(validatePanelManufacturingDocument(next, f.source).valid, true); assert.equal(next.manufacturingReady, false);
});
for (const selected of PANEL_PROPOSAL_FIELDS) test(`only ${selected} may change; unrelated finishes, matching, metadata and IDs are preserved`, () => {
  const f = fixture(); f.document = syntheticPanelExample(f.document, f.source, second);
  const p = proposal(f.document, [selected]); p.draft.materialDescription = "SYNTHETIC new description"; p.draft.faces.a = { role: "decorative", goodFace: "SYNTHETIC acceptance", finish: "specified", finishId: "SYNTHETIC-FINISH-A" }; p.draft.faces.b = { role: "reverse", goodFace: "", finish: "none", finishId: "" }; p.draft.edges["u-min"].kind = "none"; p.draft.edges["u-max"].kind = "none"; p.draft.edges["v-min"].kind = "none"; p.draft.edges["v-max"].kind = "none";
  const before = structuredClone(f.document), next = commit(f, p);
  for (const record of next.panels) {
    const old = before.panels.find(p => p.componentId === record.componentId)!;
    if (!p.componentIds.includes(record.componentId)) { assert.deepEqual(record, old); continue; }
    for (const other of PANEL_PROPOSAL_FIELDS.filter(field => field !== selected)) assert.deepEqual(editable(record, other), editable(old, other));
    for (const key of ["componentId", "assemblyId", "binding", "orientation", "grainMatching", "otherRequirements"] as const) assert.deepEqual(record[key], old[key]);
  }
  assert.deepEqual(f.document, before);
});
test("material-only library application carries its own pinned metadata but never invents grain, good face or finishes", () => {
  const f = fixture(), e = entry(), lib = { ...catalogue, entries: [e] }, p = proposal(f.document, ["material"]);
  p.draft = stageCataloguePreset(p.draft, catalogueReference(lib.id, e), { kind: "material" }); const next = commit(f, p, lib);
  for (const panel of next.panels.filter(p => [id, second].includes(p.componentId))) { assert.equal(panel.material.status, "provisional"); assert.equal(panel.grain.status, "unassigned"); assert(panel.faces.every(f => f.finish.status === "unassigned" && f.requirements.status === "unassigned")); assert.equal(panel.material.value.catalogue?.entry.version, 1); }
  assert.equal(resolvePanelManufacturing(f.source, next).variants.length, 29);
});
test("a supplied verified catalogue entry remains a provisional occurrence proposal, not an approved stock", () => {
  const f = fixture(), e = entry(); assert(e.specification.status === "provisional"); const value = e.specification.value; e.specification = { status: "verified", value, verification: { subjectFingerprint: catalogueEntrySubject(e, value), evidenceRefs: ["SYNTHETIC-EVIDENCE"], reviewedBy: "SYNTHETIC-REVIEWER" } };
  const lib = { ...catalogue, entries: [e] }, p = proposal(f.document, ["material"]); p.draft = stageCataloguePreset(p.draft, catalogueReference(lib.id, e), { kind: "material" }); const next = commit(f, p, lib); assert.equal(next.panels.find(p => p.componentId === id)!.material.status, "provisional"); assert.equal(resolvePanelManufacturing(f.source, next).approvedManufacturingData, false);
});
test("unknown versus explicit no treatment can be applied to one physical edge without clearing any others", () => {
  const f = fixture(), p = proposal(f.document, ["edge:v-min"]); p.draft.edges["v-min"].kind = "none"; const next = commit(f, p); const panel = next.panels.find(p => p.componentId === id)!; assert.equal(panel.edges.find(e => e.edgeId.endsWith(":v-min"))!.treatment.status, "provisional"); assert(panel.edges.filter(e => !e.edgeId.endsWith(":v-min")).every(e => e.treatment.status === "unassigned"));
  const reset = proposal(next, ["edge:v-min"]); reset.draft.edges["v-min"].kind = ""; const after = commit({ ...f, document: next }, reset); assert.equal(after.panels.find(p => p.componentId === id)!.edges.find(e => e.edgeId.endsWith(":v-min"))!.treatment.status, "unassigned");
});
test("mixed stock/thickness group produces blocking conflicts and cannot partially apply", () => {
  const f = fixture(), e = entry(), lib = { ...catalogue, entries: [e] }, p = proposal(f.document, ["material"]); p.componentIds = manufacturingComponentGroups(f.source)[1].componentIds; p.draft = stageCataloguePreset(p.draft, catalogueReference(lib.id, e), { kind: "material" });
  const before = manufacturingFingerprint(f.document), review = reviewPanelFields(f.document, f.source, p, lib, true); assert(review.issues.some(i => i.componentId === "chest/carcass/back" && i.blocking)); assert.throws(() => applyReviewedPanelFields(f.document, f.source, p, lib, review, true, true), /conflicts/); assert.equal(manufacturingFingerprint(f.document), before);
});
test("mirrored group mapping requires individual review; same-size panels never imply orientation compatibility", () => {
  const f = fixture(), orientation = structuredClone(f.document.panels.find(p => p.componentId === second)!.orientation); orientation.u.sign = -1;
  f.document = createPanelManufacturingDocument(f.source, { [second]: orientation }); const p = proposal(f.document, ["edge:u-min"]); p.draft.edges["u-min"].kind = "none";
  const review = reviewPanelFields(f.document, f.source, p, catalogue); assert(review.issues.some(i => i.blocking && i.componentId === second));
  p.referenceId = second; p.componentIds = [second]; const next = commit(f, p); assert.equal(next.panels.find(p => p.componentId === second)!.edges.find(e => e.edgeId.endsWith(":u-min"))!.treatment.status, "provisional");
});
for (const face of ["a", "b"] as const) for (const rotation of [0, 90, 180, 270] as const) test(`${face}/${rotation}: selecting the displayed left edge targets its actual stable physical surface`, () => {
  const f = fixture(), record = f.document.panels.find(p => p.componentId === id)!, panel = f.source.components.find(p => p.id === id)!; assert(panel.kind === "panel");
  const view = panelFaceView(createPanelTopology(panel, record.orientation), face, rotation), edge = view.sides.left;
  const p = proposal(f.document, [`edge:${edge.key}`]); p.draft.edges[edge.key].kind = "none"; const next = commit(f, p);
  const current = next.panels.find(p => p.componentId === id)!; assert.equal(current.edges.find(e => e.edgeId === edge.id)!.treatment.status, "provisional"); assert.equal(current.edges.filter(e => e.treatment.status !== "unassigned").length, 1);
});
test("empty fields, foreign/duplicate IDs and unsupported fields never create an implicit all-fields proposal", () => {
  const f = fixture(), p = proposal(f.document);
  for (const bad of [{ ...p, manufacturingReady: true }, { ...p, fields: [] }, { ...p, componentIds: [] }, { ...p, componentIds: [id, id] }, { ...p, componentIds: ["foreign"] }, { ...p, fields: ["all" as PanelProposalField] }, { ...p, referenceId: "foreign" }]) assert.throws(() => reviewPanelFields(f.document, f.source, bad, catalogue));
});
test("review is invalidated by scope, field, draft, catalogue, synthetic provenance or document changes", () => {
  const f = fixture(), p = proposal(f.document), review = reviewPanelFields(f.document, f.source, p, catalogue, true);
  assert.throws(() => applyReviewedPanelFields(f.document, f.source, p, catalogue, review, false, true));
  for (const changed of [{ ...p, componentIds: [id] }, { ...p, fields: ["material" as const] }, { ...p, draft: { ...p.draft, grain: "longitudinal" as const } }]) assert.throws(() => applyReviewedPanelFields(f.document, f.source, changed, catalogue, review, true, true));
  assert.throws(() => applyReviewedPanelFields(f.document, f.source, p, { ...catalogue, entries: [entry()] }, review, true, true));
  assert.throws(() => applyReviewedPanelFields(f.document, f.source, p, catalogue, review, true, false));
  const changed = applyPanelPropertyDraft(f.document, f.source, ["chest/carcass/top"], { ...panelPropertyDraft(f.document.panels.find(p => p.componentId === "chest/carcass/top")!), materialDescription: "SYNTHETIC change" });
  assert.throws(() => applyReviewedPanelFields(changed, f.source, p, catalogue, review, true, true));
  const forged = structuredClone(review); forged.rows[0].changes[0].after = { status: "unassigned", reason: "changed" }; assert.throws(() => applyReviewedPanelFields(f.document, f.source, p, catalogue, forged, true, true));
});
test("stale source dimensions cannot accept a reviewed proposal", () => { const f = fixture(), p = proposal(f.document), review = reviewPanelFields(f.document, f.source, p, catalogue), changed = fixture(1000); assert.throws(() => applyReviewedPanelFields(f.document, changed.source, p, catalogue, review, true)); });
test("merging committed fields back into a draft preserves unselected Advanced edits and removes detached-reference residue", () => {
  const f = fixture(), initial = panelPropertyDraft(f.document.panels.find(p => p.componentId === id)!), pending = structuredClone(initial); pending.materialDescription = "SYNTHETIC material"; pending.library!.material = null; pending.faces.b.finish = "specified"; pending.faces.b.finishId = "SYNTHETIC pending reverse finish";
  const applied = mergePanelDraftFields(pending, initial, ["material"]); assert.equal(applied.materialDescription, ""); assert.equal(applied.library?.material, undefined); assert.deepEqual(applied.faces.b, pending.faces.b);
});
for (const profile of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profile}/${convention}: guided proposals retain source-bound 29/87/26 drawing and variant safeguards`, () => {
  const f = fixture(), next = commit(f), p = manufacturingWorkflowProfile(getDrawingProfile(profile)); p.sheet.projectionConvention = convention;
  const generated = generateDrawingDocument(f.source, p, undefined, { properties: next, requestedPanelIds: [id], panelViews: { [id]: { face: "a", rotation: 0 } }, syntheticExample: true }); assert(generated.document, generated.issues.join("; "));
  const d = generated.document; assert.equal(d.reconciliation.panelQuantity, 29); assert.equal(d.componentDimensionCoverage.displayedDimensionIds.length, 87); assert.equal(d.functionalDimensionCoverage.displayedRequestIds.length, 26); assert.equal(d.functionalDimensionCoverage.deferredRequestIds.length, 20); assert.deepEqual(validateGADocument(d), []); assert.equal(d.manufacturingReady, false); assert.equal(d.complianceVerified, false); assert(d.hardware.allowances.every(a => a.purchasingQuantity === 0)); assert.equal(resolvePanelManufacturing(f.source, next).variants.length, 29);
});
