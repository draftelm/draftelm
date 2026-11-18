import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture, generateFurnitureBOM } from "../src/furniture";
import type { FurnitureResult, PanelComponent } from "../src/furniture";
import { createPanelManufacturingDocument, createPanelTopology, defaultPanelOrientation, panelFaceId, panelEdgeId, panelLocalToWorld, panelWorldToLocal, grainWorldDirection, validatePanelManufacturingDocument, resolvePanelManufacturing, validatePanelManufacturingPlan, unassignedProperty, provisionalProperty, manufacturingFingerprint } from "../src/manufacturing";
import type { EdgeTreatment, PanelManufacturingDocument, PanelOrientation, SurfaceFinish } from "../src/manufacturing";
import { generateDrawingDocument, getDrawingProfile, plotSheet, validateGADocument } from "../src/drawings";
import { PDFDocument, PDFRawStream } from "pdf-lib";
import { exportDrawingPDF } from "../src/drawings/pdf";
import { fullySpecifiedFixture, syntheticFinish, syntheticPanel, syntheticSource, syntheticTreatment, verify, verifySyntheticPanel } from "./panelManufacturingFixtures";

const valid = (document: PanelManufacturingDocument, source: FurnitureResult) => { const v = validatePanelManufacturingDocument(document, source); assert(v.valid, JSON.stringify(v.diagnostics.filter(d => d.severity === "error"))); return v; };
const reference = () => generateFurniture(createDemoChestSpecification());

test("reference foundation preserves all 29 occurrences and stock BOM; unknown facts stay unknown", () => {
  const source = reference(), before = JSON.stringify(source), document = createPanelManufacturingDocument(source), plan = resolvePanelManufacturing(source, document);
  assert.equal(JSON.stringify(source), before); assert.equal(document.panels.length, 29); assert.equal(plan.topology.length, 29);
  assert.equal(plan.topology.flatMap(t => t.faces).length, 58); assert.equal(plan.topology.flatMap(t => t.edges).length, 116);
  assert.equal(plan.variants.length, 29); assert.equal(plan.stockBlankGroups.length, 29);
  assert.equal(source.bom.filter(b => b.kind === "panel").length, 7);
  for (const p of document.panels) {
    assert.equal(p.material.status, "provisional"); assert(p.material.status === "provisional");
    assert(["demo-sheet", "demo-plywood"].includes(p.material.value.stockMaterialId));
    assert.equal(p.material.value.grade.status, "unassigned"); assert.deepEqual(p.material.value.manufacturerCodes, []);
    for (const f of [p.stockOrientation, p.grain, p.grainMatching, p.otherRequirements, ...p.faces.flatMap(f => [f.finish, f.requirements]), ...p.edges.map(e => e.treatment)]) assert.equal(f.status, "unassigned");
  }
  assert(plan.validation.valid); assert(!plan.validation.allPropertiesVerified);
  assert(plan.validation.diagnostics.some(d => d.code === "unresolved-property")); assert(plan.validation.diagnostics.some(d => d.code === "provisional-property"));
  assert(!JSON.stringify(document).toLowerCase().includes("oak"));
  assert.equal(plan.manufacturingReady, false); assert.equal(plan.approvedManufacturingData, false);
  assert.equal(source.manufacturingReady, false);
});

for (const thicknessAxis of ["x", "y", "z"] as const) test(`${thicknessAxis}-normal: stable broad faces, four edge surfaces, local/world inverse and actual extents`, () => {
  const p = syntheticPanel("synthetic/panel:with/chars");
  p.thicknessAxis = thicknessAxis; p.dimensions = { x: 500, y: 300, z: 700, [thicknessAxis]: 18 }; p.position = { x: -15, y: 28, z: 50 };
  const topology = createPanelTopology(p);
  assert.equal(new Set([...topology.faces, ...topology.edges].map(x => x.id)).size, 6);
  assert(topology.faces.every(f => f.id === panelFaceId(p.id, f.key)));
  assert(topology.edges.every(e => e.id === panelEdgeId(p.id, e.key) && e.adjacentFaceIds.length === 2));
  for (const f of [...topology.faces, ...topology.edges]) for (const [i, point] of f.worldCorners.entries()) {
    assert.deepEqual(panelWorldToLocal(topology.frame, point), f.localCorners[i]);
    assert.deepEqual(panelLocalToWorld(topology.frame, f.localCorners[i]), point);
    for (const axis of ["x", "y", "z"] as const) assert(point[axis] >= p.position[axis] && point[axis] <= p.position[axis] + p.dimensions[axis]);
  }
  const before = structuredClone(topology); p.dimensions[topology.frame.orientation.u.axis] = 200; p.dimensions[topology.frame.orientation.v.axis] = 800;
  const next = createPanelTopology(p); assert.deepEqual(next.frame.orientation, before.frame.orientation);
  assert.deepEqual(next.faces.map(f => f.id), before.faces.map(f => f.id)); assert.deepEqual(next.edges.map(e => e.id), before.edges.map(e => e.id));
});

for (const signs of [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]] as const) test(`explicit signed orientation ${signs}: physical IDs survive 180-degree rotations and grain follows local U/V`, () => {
  const p = syntheticPanel("synthetic/a");
  const orientation: PanelOrientation = { u: { axis: "x", sign: signs[0] }, v: { axis: "y", sign: signs[1] }, normal: { axis: "z", sign: signs[2] } };
  const topology = createPanelTopology(p, orientation);
  assert.equal(topology.faces[0].id, panelFaceId(p.id, "a")); assert.equal(topology.faces[0].outwardNormal.z, -signs[2]);
  assert.deepEqual(grainWorldDirection(topology, { direction: "longitudinal", sense: "positive" }), { x: signs[0], y: 0, z: 0 });
  assert.deepEqual(grainWorldDirection(topology, { direction: "transverse", sense: "negative" }), { x: 0, y: -signs[1], z: 0 });
  assert.equal(grainWorldDirection(topology, { direction: "non-directional" }), null);
  for (const f of topology.faces) for (const point of f.localCorners) assert.deepEqual(panelWorldToLocal(topology.frame, panelLocalToWorld(topology.frame, point)), point);
});

test("a quarter-turn maps an explicitly treated physical face/edge to the correct world side without changing IDs", () => {
  const p = syntheticPanel("synthetic/rotated"); p.dimensions = { x: 18, y: 300, z: 500 }; p.thicknessAxis = "x";
  const orientation: PanelOrientation = { u: { axis: "z", sign: -1 }, v: { axis: "y", sign: 1 }, normal: { axis: "x", sign: 1 } };
  const source = syntheticSource([p]), document = createPanelManufacturingDocument(source, { [p.id]: orientation }), record = document.panels[0];
  verifySyntheticPanel(record); const f = record.faces[0], e = record.edges[0];
  f.finish = verify(record, `faces/${f.faceId}/finish`, syntheticFinish(record, f.faceId, "synthetic-front-finish"));
  e.treatment = verify(record, `edges/${e.edgeId}/treatment`, syntheticTreatment(record, e.edgeId));
  const plan = resolvePanelManufacturing(source, document), topology = plan.topology[0];
  assert.equal(f.faceId, panelFaceId(p.id, "a")); assert.equal(e.edgeId, panelEdgeId(p.id, "u-min"));
  assert(topology.faces[0].worldCorners.every(point => point.x === p.position.x));
  assert(topology.edges[0].worldCorners.every(point => point.z === p.position.z + 500));
  assert.deepEqual(grainWorldDirection(topology, { direction: "longitudinal", sense: "positive" }), { x: 0, y: 0, z: -1 });
});

test("equal-sized verified panels share a property-scoped variant; opposite face finishes split variants but retain a stock blank group", () => {
  const { source, document } = fullySpecifiedFixture();
  assert(valid(document, source).allPropertiesVerified);
  let plan = resolvePanelManufacturing(source, document); assert.equal(plan.variants.length, 1); assert.equal(plan.variants[0].quantity, 2); assert.equal(plan.stockBlankGroups.length, 1);
  const p = document.panels[1], f = p.faces[1]; f.finish = verify<SurfaceFinish>(p, `faces/${f.faceId}/finish`, syntheticFinish(p, f.faceId, "synthetic-reverse-finish"));
  plan = resolvePanelManufacturing(source, document); assert.equal(plan.variants.length, 2); assert.equal(plan.stockBlankGroups.length, 1);
  assert(plan.variants.every(v => v.equivalence === "verified-properties-only" && v.manufacturingInterchangeability === "not-assessed"));
  assert.equal(plan.approvedManufacturingData, false); assert.equal(plan.manufacturingReady, false);
});

for (const field of ["grain", "grainMatching", "material-grade", "face-finish", "face-requirements", "edge-treatment", "otherRequirements"] as const) test(`unknown ${field} never establishes manufacturing equivalence`, () => {
  const { source, document } = fullySpecifiedFixture();
  for (const p of document.panels) {
    if (field === "grain" || field === "grainMatching" || field === "otherRequirements") p[field] = unassignedProperty("Synthetic unresolved requirement");
    if (field === "material-grade") { assert(p.material.status === "verified"); const value = { ...p.material.value, grade: unassignedProperty<string | null>("Synthetic grade unresolved") }; p.material = verify(p, "material", value); }
    if (field === "face-finish") p.faces[0].finish = unassignedProperty("Synthetic finish unresolved");
    if (field === "face-requirements") p.faces[0].requirements = unassignedProperty("Synthetic good-face requirement unresolved");
    if (field === "edge-treatment") p.edges[0].treatment = unassignedProperty("Synthetic edge unresolved");
  }
  const plan = resolvePanelManufacturing(source, document); assert.equal(plan.variants.length, 2); assert(plan.variants.every(v => v.equivalence === "unresolved-occurrence"));
  assert.equal(plan.validation.allPropertiesVerified, false);
  if (field === "material-grade") assert.equal(plan.stockBlankGroups.length, 2);
});

test("provisional none, verified none and unassigned are different states; no treatment changes dimensions", () => {
  const { source, document } = fullySpecifiedFixture(), before = JSON.stringify(source);
  for (const p of document.panels) p.edges[0].treatment = provisionalProperty<EdgeTreatment>({ kind: "none" }, "Synthetic proposal only");
  let plan = resolvePanelManufacturing(source, document); assert.equal(plan.variants.length, 2); assert(!plan.validation.allPropertiesVerified);
  for (const p of document.panels) p.edges[0].treatment = verify<EdgeTreatment>(p, `edges/${p.edges[0].edgeId}/treatment`, { kind: "none" });
  plan = resolvePanelManufacturing(source, document); assert.equal(plan.variants.length, 1);
  const p = document.panels[1], e = p.edges[0]; e.treatment = verify(p, `edges/${e.edgeId}/treatment`, syntheticTreatment(p, e.edgeId, "lipping"));
  plan = resolvePanelManufacturing(source, document); assert.equal(plan.variants.length, 2); assert.equal(plan.stockBlankGroups.length, 1);
  assert.equal(JSON.stringify(source), before);
});

test("stock groups respect material identity, ordered stock axes and reversal constraints without adopting finish equivalence", () => {
  const a = syntheticPanel("synthetic/a"), b = syntheticPanel("synthetic/b", 1000); b.dimensions = { x: 300, y: 500, z: 18 };
  const source = syntheticSource([a, b]), document = createPanelManufacturingDocument(source); document.panels.forEach(verifySyntheticPanel);
  assert.equal(resolvePanelManufacturing(source, document).stockBlankGroups.length, 1);
  for (const p of document.panels) p.stockOrientation = verify(p, "stockOrientation", { kind: "directional", along: "u", reversalAllowed: true });
  assert.equal(resolvePanelManufacturing(source, document).stockBlankGroups.length, 2);
  const p = document.panels[1]; p.stockOrientation = verify(p, "stockOrientation", { kind: "directional", along: "v", reversalAllowed: true });
  assert.equal(resolvePanelManufacturing(source, document).stockBlankGroups.length, 1);
  p.stockOrientation = verify(p, "stockOrientation", { kind: "directional", along: "v", reversalAllowed: false });
  assert.equal(resolvePanelManufacturing(source, document).stockBlankGroups.length, 2);
  b.materialId = "synthetic-second-stock";
  const nextSource = syntheticSource([a, b]), next = createPanelManufacturingDocument(nextSource); next.panels.forEach(verifySyntheticPanel);
  assert.equal(resolvePanelManufacturing(nextSource, next).stockBlankGroups.length, 2);
});

for (const field of ["material", "stockOrientation", "grain", "good-face", "edge", "finish", "other"] as const) test(`explicit ${field} differences split manufacturing variants`, () => {
  const { source, document } = fullySpecifiedFixture(), p = document.panels[1];
  if (field === "material") { assert(p.material.status === "verified"); p.material = verify(p, "material", { ...p.material.value, manufacturerCodes: [{ manufacturerId: "another-synthetic-maker", code: "different-synthetic-code" }] }); }
  if (field === "stockOrientation") p.stockOrientation = verify(p, "stockOrientation", { kind: "directional", along: "u", reversalAllowed: false });
  if (field === "grain") p.grain = verify(p, "grain", { direction: "transverse", sense: "either" });
  if (field === "good-face") { const f = p.faces[0]; assert(f.requirements.status === "verified"); f.requirements = verify(p, `faces/${f.faceId}/requirements`, { ...f.requirements.value, goodFaceRequirements: [{ requirementId: "synthetic-good-face", description: "Synthetic explicit appearance requirement" }] }); }
  if (field === "edge") { const e = p.edges[0]; e.treatment = verify(p, `edges/${e.edgeId}/treatment`, syntheticTreatment(p, e.edgeId)); }
  if (field === "finish") { const f = p.faces[0]; f.finish = verify(p, `faces/${f.faceId}/finish`, syntheticFinish(p, f.faceId, "synthetic-finish-2")); }
  if (field === "other") p.otherRequirements = verify(p, "otherRequirements", [{ requirementId: "synthetic-requirement", specification: "Synthetic additional manufacturing requirement" }]);
  assert.equal(resolvePanelManufacturing(source, document).variants.length, 2);
});

test("matching is explicit, occurrence-bound and not inferred from adjacent drawer fronts", () => {
  const source = reference(), doc = createPanelManufacturingDocument(source);
  assert(doc.panels.filter(p => p.componentId.endsWith("/front")).every(p => p.grainMatching.status === "unassigned"));
  const { source: synthetic, document } = fullySpecifiedFixture();
  for (const [sequence, p] of document.panels.entries()) {
    p.grain = verify(p, "grain", { direction: "longitudinal", sense: "positive" });
    p.grainMatching = verify(p, "grainMatching", { kind: "specified", groupId: "synthetic-pattern-group", faceId: p.faces[0].faceId, sequence, originUvMm: { u: sequence * 500, v: 0 }, rotationDeg: 0 });
  }
  assert(valid(document, synthetic).allPropertiesVerified); assert.equal(resolvePanelManufacturing(synthetic, document).variants.length, 2);
  const p = document.panels[1]; assert(p.grainMatching.status === "verified"); p.grainMatching = verify(p, "grainMatching", { ...p.grainMatching.value, sequence: 0 });
  assert(validatePanelManufacturingDocument(document, synthetic).diagnostics.some(d => d.code === "incompatible-properties"));
});

for (const edit of ["dimension", "position", "material", "orientation", "quantity", "revision"] as const) test(`${edit} source changes invalidate existing property bindings`, () => {
  const { source, document } = fullySpecifiedFixture(); const next = structuredClone(source), panel = next.components[0] as PanelComponent;
  if (edit === "dimension") panel.dimensions.x += 1;
  if (edit === "position") panel.position.y += 1;
  if (edit === "material") panel.materialId = "synthetic-changed-stock";
  if (edit === "orientation") { panel.thicknessAxis = "x"; panel.dimensions = { x: 18, y: 300, z: 500 }; }
  if (edit === "quantity") panel.quantity++;
  if (edit === "revision") next.specificationRevision += "-changed";
  next.bom = generateFurnitureBOM(next.components);
  const report = validatePanelManufacturingDocument(document, next); assert(!report.valid); assert(report.diagnostics.some(d => d.code === "stale-source"));
  assert.throws(() => resolvePanelManufacturing(next, document));
});

test("local frame edits invalidate even provisional properties, and copying or modifying verification records is detected", () => {
  const { source, document } = fullySpecifiedFixture(), p = document.panels[0];
  p.orientation.u.sign = -1; p.orientation.v.sign = -1;
  const report = validatePanelManufacturingDocument(document, source); assert(!report.valid); assert(report.diagnostics.some(d => d.code === "stale-panel")); assert(report.diagnostics.some(d => d.code === "invalid-verification"));
  const f = fullySpecifiedFixture(); f.document.panels[1].grain = structuredClone(f.document.panels[0].grain);
  assert(validatePanelManufacturingDocument(f.document, f.source).diagnostics.some(d => d.code === "invalid-verification"));
  const g = fullySpecifiedFixture(); g.document.panels[0].grain = { ...g.document.panels[0].grain, value: { direction: "longitudinal", sense: "positive" } } as typeof g.document.panels[0]["grain"];
  assert(validatePanelManufacturingDocument(g.document, g.source).diagnostics.some(d => d.code === "invalid-verification"));
});

test("source and record ordering does not alter topology, variant fingerprints, quantities or plan identity", () => {
  const { source, document } = fullySpecifiedFixture(), expected = resolvePanelManufacturing(source, document);
  const reordered = structuredClone(source); reordered.components.reverse(); reordered.assemblies.reverse(); reordered.assemblies.forEach(a => a.componentIds.reverse()); reordered.bom.reverse(); reordered.bom.forEach(b => b.componentIds.reverse());
  const properties = structuredClone(document); properties.panels.reverse(); properties.panels.forEach(p => { p.faces.reverse(); p.edges.reverse(); });
  assert.deepEqual(resolvePanelManufacturing(reordered, properties), expected);
  assert.equal(new Set(expected.variants.flatMap(v => v.componentIds)).size, 2); assert.equal(expected.variants.reduce((n, v) => n + v.quantity, 0), 2);
  assert.deepEqual(validatePanelManufacturingPlan(expected, source, document), []);
  const changed = structuredClone(expected); changed.variants[0].quantity++;
  assert(validatePanelManufacturingPlan(changed, source, document).length);
});

const invalidCases: [string, (d: PanelManufacturingDocument) => void][] = [
  ["foreign face", d => { d.panels[0].faces[0].faceId = d.panels[1].faces[0].faceId; }],
  ["foreign edge", d => { d.panels[0].edges[0].edgeId = d.panels[1].edges[0].edgeId; }],
  ["duplicate face", d => { d.panels[0].faces[1] = structuredClone(d.panels[0].faces[0]); }],
  ["missing edge", d => { d.panels[0].edges.pop(); }],
  ["missing panel", d => { d.panels.pop(); }],
  ["duplicate occurrence", d => { d.panels[1] = structuredClone(d.panels[0]); }],
  ["invalid local basis", d => { d.panels[0].orientation.u.axis = "z"; }],
  ["missing evidence", d => { const p = d.panels[0]; p.grain = verify(p, "grain", { direction: "non-directional" }); if (p.grain.status === "verified") p.grain.verification.evidenceRefs = []; }],
  ["conflicting face role", d => { const p = d.panels[0], f = p.faces[0]; f.requirements = verify(p, `faces/${f.faceId}/requirements`, { decorative: true, reverse: true, visibleInService: true, goodFaceRequirements: [] }); }],
  ["stock substitution", d => { const p = d.panels[0]; assert(p.material.status === "verified"); p.material = verify(p, "material", { ...p.material.value, stockMaterialId: "synthetic-other-stock" }); }],
];
for (const [label, tamper] of invalidCases) test(`invalid ${label} is diagnosed and cannot resolve into a manufacturing plan`, () => {
  const { source, document } = fullySpecifiedFixture(); tamper(document); const v = validatePanelManufacturingDocument(document, source);
  assert(!v.valid); assert(!v.allPropertiesVerified); assert(!v.approvedManufacturingData); assert.throws(() => resolvePanelManufacturing(source, document));
});

for (const value of [null, {}, { schemaVersion: 2 }, { manufacturingReady: true }, { panels: [] }, { status: "approved" }]) test(`untrusted malformed document ${JSON.stringify(value)} is rejected`, () => {
  assert.equal(validatePanelManufacturingDocument(value, reference()).valid, false);
});

test("nonfinite treatment values, unsupported fields and fabricated release flags are rejected at runtime", () => {
  const { source, document } = fullySpecifiedFixture(), p = document.panels[0], e = p.edges[0];
  const treatment = syntheticTreatment(p, e.edgeId); assert(treatment.kind !== "none"); treatment.nominalThicknessMm = provisionalProperty(NaN, "Synthetic invalid input");
  e.treatment = provisionalProperty(treatment, "Synthetic invalid input"); assert(!validatePanelManufacturingDocument(document, source).valid);
  const clean = fullySpecifiedFixture(); assert(!validatePanelManufacturingDocument({ ...clean.document, manufacturingReady: true }, clean.source).valid);
  assert(!validatePanelManufacturingDocument({ ...clean.document, machiningApproved: true }, clean.source).valid);
  assert(!validatePanelManufacturingDocument({ ...clean.document, panels: clean.document.panels.map(p => ({ ...p, fictitiousDatum: "A" })) }, clean.source).valid);
});

test("demonstration stocks cannot be upgraded by manufacturing metadata; invalid source BOM and geometry are rejected", () => {
  const source = reference(), document = createPanelManufacturingDocument(source); verifySyntheticPanel(document.panels[0]);
  assert(validatePanelManufacturingDocument(document, source).diagnostics.some(d => d.code === "incompatible-properties" && d.path === "material"));
  const badBom = reference(); badBom.bom[0].quantity++; assert.throws(() => createPanelManufacturingDocument(badBom));
  const badGeometry = reference(); (badGeometry.components[0] as PanelComponent).dimensions.x = -1; assert.throws(() => createPanelManufacturingDocument(badGeometry));
  assert.throws(() => createPanelManufacturingDocument(reference(), { "not-a-panel": defaultPanelOrientation(syntheticPanel("synthetic")) }));
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId}/${convention}: manufacturing foundation does not change the 12-page package, 87 dimensions, vector PDF or purchasing exclusions`, async () => {
  const source = reference(), before = JSON.stringify(source), p = getDrawingProfile(profileId); p.sheet.projectionConvention = convention;
  const original = generateDrawingDocument(source, p); assert(original.document);
  const metadata = createPanelManufacturingDocument(source), propertiesBefore = JSON.stringify(metadata); resolvePanelManufacturing(source, metadata);
  assert.equal(JSON.stringify(metadata), propertiesBefore); assert.equal(JSON.stringify(source), before);
  const next = generateDrawingDocument(source, p); assert(next.document); assert.deepEqual(next.document, original.document);
  assert.equal(next.document.sheets.length, 12); assert.equal(next.document.componentDimensionPlan.dimensions.length, 87); assert.equal(next.document.functionalDimensionCoverage.displayedRequestIds.length, 26);
  assert.deepEqual(validateGADocument(next.document), []);
  assert.deepEqual(plotSheet(next.document, next.document.sheets[0]), plotSheet(original.document, original.document.sheets[0]));
  assert(next.document.hardware.allowances.every(a => a.purchasingQuantity === 0 && !a.purchasingEligible));
  const pdf = await PDFDocument.load(await exportDrawingPDF(next.document)); assert.equal(pdf.getPageCount(), 12);
  assert(!pdf.context.enumerateIndirectObjects().some(([,s]) => s instanceof PDFRawStream && s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
});

test("fingerprints are canonical finite JSON identities, not ambiguous string concatenations or authentication", () => {
  assert.equal(manufacturingFingerprint({ b: 2, a: 1 }), manufacturingFingerprint({ a: 1, b: 2 }));
  assert.notEqual(manufacturingFingerprint(["a|b", "c"]), manufacturingFingerprint(["a", "b|c"]));
  assert.throws(() => manufacturingFingerprint({ value: Infinity })); assert.throws(() => manufacturingFingerprint({ value: undefined }));
  assert.throws(() => manufacturingFingerprint({ [Symbol("not-json")]: "hidden specification" }));
  const topology = createPanelTopology(syntheticPanel("synthetic/a"));
  assert.throws(() => panelWorldToLocal(topology.frame, { x: NaN, y: 0, z: 0 }));
  assert.throws(() => panelLocalToWorld(topology.frame, { u: 0, v: Infinity, t: 0 }));
});

for (const width of [900, 1000, 1100, 1200]) test(`${width} mm: unchanged occurrence identities, exhaustive partitions and source quantity/BOM conservation`, () => {
  const s = createDemoChestSpecification(); s.dimensions.width = width;
  const source = generateFurniture(s), before = JSON.stringify(source), document = createPanelManufacturingDocument(source), plan = resolvePanelManufacturing(source, document);
  const ids = source.components.filter(p => p.kind === "panel").map(p => p.id).sort();
  assert.deepEqual(document.panels.map(p => p.componentId).sort(), ids);
  for (const groups of [plan.variants, plan.stockBlankGroups]) {
    assert.deepEqual(groups.flatMap(g => g.componentIds).sort(), ids);
    assert.equal(groups.reduce((n, g) => n + g.quantity, 0), 29);
    for (const g of groups) for (const id of g.componentIds) assert(g.sourceBomIds.some(bomId => source.bom.find(b => b.id === bomId)!.componentIds.includes(id)));
  }
  assert.equal(JSON.stringify(source), before);
});

test("verification attribution cannot create distinct variants, but a changed verified definition invalidates a cached plan", () => {
  const { source, document } = fullySpecifiedFixture(), initial = resolvePanelManufacturing(source, document);
  const p = document.panels[1]; assert(p.grain.status === "verified");
  p.grain.verification.verifiedBy = "another-synthetic-reviewer"; p.grain.verification.evidenceRefs = ["another-synthetic-evidence"];
  assert.equal(resolvePanelManufacturing(source, document).variants[0].fingerprint, initial.variants[0].fingerprint);
  p.grain = verify(p, "grain", { direction: "longitudinal", sense: "positive" });
  assert(validatePanelManufacturingPlan(initial, source, document).length);
  assert.equal(resolvePanelManufacturing(source, document).variants.length, 2);
  assert.equal(resolvePanelManufacturing(source, document).stockBlankGroups.length, 2);
});

test("single-member matching remains incomplete; foreign faces and non-directional contradictions are invalid", () => {
  const { source, document } = fullySpecifiedFixture(), p = document.panels[0];
  p.grain = verify(p, "grain", { direction: "longitudinal", sense: "positive" });
  const match = { kind: "specified" as const, groupId: "synthetic-single-group", faceId: p.faces[0].faceId, sequence: 0, originUvMm: { u: 0, v: 0 }, rotationDeg: 0 as const };
  p.grainMatching = verify(p, "grainMatching", match);
  const partial = valid(document, source); assert(!partial.allPropertiesVerified); assert(partial.diagnostics.some(d => d.code === "incomplete-matching"));
  p.grainMatching = verify(p, "grainMatching", { ...match, faceId: document.panels[1].faces[0].faceId });
  assert(validatePanelManufacturingDocument(document, source).diagnostics.some(d => d.code === "invalid-reference"));
  p.grainMatching = verify(p, "grainMatching", match); p.grain = verify(p, "grain", { direction: "non-directional" });
  assert(validatePanelManufacturingDocument(document, source).diagnostics.some(d => d.code === "incompatible-properties"));
});

test("nested treatment unknowns cannot hide behind a verified parent; negative or zero band thickness is rejected", () => {
  const { source, document } = fullySpecifiedFixture();
  for (const p of document.panels) {
    const e = p.edges[0], value = syntheticTreatment(p, e.edgeId); assert(value.kind !== "none");
    value.material = unassignedProperty("Synthetic unknown band stock"); e.treatment = verify(p, `edges/${e.edgeId}/treatment`, value);
  }
  assert.equal(resolvePanelManufacturing(source, document).variants.length, 2);
  for (const thickness of [-1, 0]) {
    const p = document.panels[0], e = p.edges[0], value = syntheticTreatment(p, e.edgeId); assert(value.kind !== "none");
    value.nominalThicknessMm = verify(p, `edges/${e.edgeId}/treatment/nominalThicknessMm`, thickness);
    e.treatment = verify(p, `edges/${e.edgeId}/treatment`, value); assert(!validatePanelManufacturingDocument(document, source).valid);
  }
});

test("orientation binding catches unreviewed provisional treatment remapping and malformed property arrays stay diagnostic", () => {
  const source = syntheticSource(), document = createPanelManufacturingDocument(source), p = document.panels[0];
  p.edges[0].treatment = provisionalProperty<EdgeTreatment>({ kind: "none" }, "Synthetic tentative treatment");
  p.orientation.u.sign = -1;
  assert(validatePanelManufacturingDocument(document, source).diagnostics.some(d => d.code === "stale-panel"));
  const malformed = createPanelManufacturingDocument(source) as unknown as { panels: { faces: unknown }[] };
  malformed.panels[0].faces = [null, 42]; assert(!validatePanelManufacturingDocument(malformed, source).valid);
  assert.throws(() => manufacturingFingerprint(new Array(1)));
});
