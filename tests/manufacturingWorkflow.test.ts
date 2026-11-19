import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { applyPanelPropertyDraft, applyReviewedPanelPropertyEdit, createManufacturingSchedule, createPanelManufacturingDocument, createPanelTopology, emptyEdgeTreatment, groupManufacturingSchedule, manufacturingFingerprint, PANEL_SIDES, panelEdgeId, panelFaceView, panelPropertyDraft, parseEdgeTreatmentPresets, rebasePanelManufacturing, resolvePanelManufacturing, reviewPanelPropertyEdit, syntheticPanelExample, validatePanelManufacturingDocument } from "../src/manufacturing";
import type { PanelOrientation } from "../src/manufacturing";
import { generateDrawingDocument, getDrawingProfile, parseDrawingProfile, plotSheet, validateGADocument, loadDrawingPreferences, saveDrawingPreferences } from "../src/drawings";
import { manufacturingWorkflowProfile } from "../src/drawings/manufacturingOutput";
import { fullySpecifiedFixture, syntheticFinish, syntheticPanel, syntheticTreatment, verify } from "./panelManufacturingFixtures";
import { containsRect, primitiveBounds } from "../src/drawings/annotationGeometry";

const id = "chest/drawer-1/front", other = "chest/drawer-2/front";
const source = () => generateFurniture(createDemoChestSpecification());
function fixture() { const result = source(), properties = createPanelManufacturingDocument(result); return { result, properties, draft: panelPropertyDraft(properties.panels.find(p => p.componentId === id)!) }; }

test("front face A uses workshop sides; B mirrors horizontal physical edges and flipping twice restores them", () => {
  const topology = createPanelTopology(syntheticPanel("synthetic/map")), a = panelFaceView(topology, "a"), b = panelFaceView(topology, "b");
  assert.equal(a.sides.left.key, "u-min"); assert.equal(a.sides.right.key, "u-max"); assert.equal(a.sides.top.key, "v-max");
  assert.equal(b.sides.left.id, a.sides.right.id); assert.equal(b.sides.right.id, a.sides.left.id);
  assert.equal(b.sides.top.id, a.sides.top.id); assert.deepEqual(panelFaceView(topology, "a"), a);
});
for (const thicknessAxis of ["x", "y", "z"] as const) test(`signed, rotated and mirrored ${thicknessAxis}-normal panels retain physical face/edge mappings`, () => {
  const panel = syntheticPanel(`synthetic/${thicknessAxis}`); panel.thicknessAxis = thicknessAxis; panel.dimensions = { x: 500, y: 300, z: 400, [thicknessAxis]: 18 };
  const axes = (["x", "y", "z"] as const).filter(a => a !== thicknessAxis);
  for (const swap of [false, true]) for (const us of [1, -1] as const) for (const vs of [1, -1] as const) for (const ns of [1, -1] as const) {
    const orientation: PanelOrientation = { u: { axis: axes[swap ? 1 : 0], sign: us }, v: { axis: axes[swap ? 0 : 1], sign: vs }, normal: { axis: thicknessAxis, sign: ns } };
    const topology = createPanelTopology(panel, orientation), original = manufacturingFingerprint(topology);
    for (const rotation of [0, 90, 180, 270] as const) for (const face of ["a", "b"] as const) {
      const view = panelFaceView(topology, face, rotation);
      assert.equal(new Set(PANEL_SIDES.map(s => view.sides[s].id)).size, 4);
      for (const side of PANEL_SIDES) {
        const edge = view.sides[side], physical = topology.edges.find(e => e.id === edge.id)!;
        const axis = side === "left" || side === "right" ? view.right : view.up;
        const expected = side === "left" || side === "bottom" ? -1 : 1;
        assert.equal(physical.outwardNormal.x * axis.x + physical.outwardNormal.y * axis.y + physical.outwardNormal.z * axis.z, expected);
        assert.equal(edge.key, physical.key); assert.equal(edge.lengthMm, physical.lengthMm);
      }
      assert.equal(view.widthMm * view.heightMm, topology.frame.size.u * topology.frame.size.v);
    }
    assert.equal(manufacturingFingerprint(topology), original);
  }
});
test("diagram rotation moves the selected physical edge and grain without changing the property document", () => {
  const { result, properties, draft } = fixture(); draft.grain = "longitudinal"; draft.edges["u-min"] = { ...emptyEdgeTreatment(), kind: "edge-band" };
  const next = applyPanelPropertyDraft(properties, result, [id], draft), record = next.panels.find(p => p.componentId === id)!, panel = result.components.find(p => p.id === id)!; assert.equal(panel.kind, "panel"); if (panel.kind !== "panel") return;
  const topology = createPanelTopology(panel, record.orientation), edgeId = panelEdgeId(id, "u-min"), snapshot = manufacturingFingerprint(next);
  assert.equal(panelFaceView(topology, "a", 0).sides.left.id, edgeId); assert.equal(panelFaceView(topology, "b", 0).sides.right.id, edgeId);
  assert.equal(panelFaceView(topology, "a", 90).sides.top.id, edgeId); assert.equal(panelFaceView(topology, "a", 90).localU.y, -1);
  assert.equal(manufacturingFingerprint(next), snapshot);
  assert.throws(() => panelFaceView(topology, "a", 45 as 0));
});
test("generic banding is incomplete, source-bound and separate from unknown and explicit none", () => {
  const { result, properties, draft } = fixture(); const before = manufacturingFingerprint(result);
  draft.edges["v-min"].kind = "edge-band"; const generic = applyPanelPropertyDraft(properties, result, [id], draft), p = generic.panels.find(p => p.componentId === id)!;
  const treatment = p.edges.find(e => e.edgeId === panelEdgeId(id, "v-min"))!.treatment;
  assert.equal(treatment.status, "provisional"); if (treatment.value.kind === "none") return;
  assert.equal(treatment.value.specificationId, undefined); assert.equal(treatment.value.nominalThicknessMm.status, "unassigned");
  assert(validatePanelManufacturingDocument(generic, result).diagnostics.some(d => d.path?.endsWith("/specificationId")));
  assert(createManufacturingSchedule(result, generic).find(r => r.componentId === id)!.cells[6].includes("Specification: Not specified"));
  draft.edges["v-min"].kind = "none"; const none = applyPanelPropertyDraft(generic, result, [id], draft);
  assert(createManufacturingSchedule(result, none).find(r => r.componentId === id)!.cells[6].includes("None [P]"));
  draft.edges["v-min"].kind = ""; const unknown = applyPanelPropertyDraft(none, result, [id], draft);
  assert.equal(createManufacturingSchedule(result, unknown).find(r => r.componentId === id)!.cells[6], "Not specified");
  assert.equal(manufacturingFingerprint(result), before);
});
test("missing treatment specification prevents equivalence even with supplied verified children/parent", () => {
  const { source: result, document } = fullySpecifiedFixture();
  for (const p of document.panels) { const e = p.edges[0], path = `edges/${e.edgeId}/treatment`; e.treatment = verify(p, path, { kind: "edge-band", material: verify(p, `${path}/material`, null), nominalThicknessMm: verify(p, `${path}/nominalThicknessMm`, 1), appearance: verify(p, `${path}/appearance`, null), process: verify(p, `${path}/process`, null) }); }
  const plan = resolvePanelManufacturing(result, document); assert.equal(plan.variants.length, 2); assert(plan.variants.every(v => v.equivalence === "unresolved-occurrence")); assert(!plan.validation.allPropertiesVerified);
});
test("project and company edging presets round-trip plain fields and reject injected approval/invalid values", () => {
  const presets = [{ id: "project:test", scope: "project", name: "Test proposal", treatment: { ...emptyEdgeTreatment(), kind: "edge-band", thickness: "1" } }, { id: "company:test", scope: "company", name: "Test proposal", treatment: { ...emptyEdgeTreatment(), kind: "none" } }];
  assert.deepEqual(parseEdgeTreatmentPresets(JSON.stringify(presets)), presets);
  for (const change of [ { ...presets[0], approved: true }, { ...presets[0], treatment: { ...presets[0].treatment, thickness: "-1" } }, { ...presets[0], scope: "approved-company" }, { ...presets[0], treatment: { ...presets[0].treatment, specificationId: "\n" } } ]) assert.throws(() => parseEdgeTreatmentPresets(JSON.stringify([change])));
  assert.throws(() => parseEdgeTreatmentPresets(JSON.stringify([presets[0], presets[0]])));
});
test("bulk review pins exact occurrence IDs, values and current property snapshot", () => {
  const { result, properties, draft } = fixture(), ids = [id, other]; draft.grain = "transverse";
  const review = reviewPanelPropertyEdit(properties, result, ids, draft);
  assert.throws(() => applyReviewedPanelPropertyEdit(properties, result, ids, draft, review, false));
  assert.throws(() => applyReviewedPanelPropertyEdit(properties, result, ids, draft, null, true));
  assert.throws(() => applyReviewedPanelPropertyEdit(properties, result, [id, "chest/drawer-3/front"], draft, review, true));
  assert.throws(() => applyReviewedPanelPropertyEdit(properties, result, ids, { ...draft, grain: "longitudinal" }, review, true));
  const next = applyReviewedPanelPropertyEdit(properties, result, ids, draft, review, true);
  assert.deepEqual(next.panels.filter(p => p.grain.status !== "unassigned").map(p => p.componentId).sort(), [...ids].sort());
  assert.throws(() => applyReviewedPanelPropertyEdit(next, result, ids, draft, review, true));
  assert.equal(groupManufacturingSchedule(result, next).length, 29);
});
test("bulk review cannot survive a geometry change or explicit provisional rebase", () => {
  const { result, properties, draft } = fixture(), review = reviewPanelPropertyEdit(properties, result, [id, other], draft), specification = createDemoChestSpecification(); specification.dimensions.width = 1000;
  const changed = generateFurniture(specification);
  assert.throws(() => applyReviewedPanelPropertyEdit(properties, changed, [id, other], draft, review, true));
  const rebased = rebasePanelManufacturing(properties, changed).document;
  assert.throws(() => applyReviewedPanelPropertyEdit(rebased, changed, [id, other], draft, review, true));
});
test("single edits require no bulk approval and preserve engineering stock/grade and unedited manufacturing requirements", () => {
  const { source: result, document } = fullySpecifiedFixture(), before = structuredClone(document.panels[0]), draft = panelPropertyDraft(before);
  draft.materialDescription = "Synthetic user stock description"; draft.faces.a.finish = "specified"; draft.faces.a.finishId = "SYNTHETIC-USER-FINISH";
  const next = applyReviewedPanelPropertyEdit(document, result, [before.componentId], draft, null, false), p = next.panels[0];
  assert.deepEqual(p.grainMatching, before.grainMatching); assert.deepEqual(p.stockOrientation, before.stockOrientation); assert.deepEqual(p.otherRequirements, before.otherRequirements); assert.deepEqual(p.edges, before.edges);
  assert(p.material.status === "provisional" && before.material.status === "verified"); assert.deepEqual(p.material.value.grade, before.material.value.grade); assert.equal(p.material.value.stockMaterialId, before.material.value.stockMaterialId);
});
test("grouped verified variant display conserves quantities and every underlying occurrence/BOM link", () => {
  const { source: result, document } = fullySpecifiedFixture(), groups = groupManufacturingSchedule(result, document);
  assert.equal(groups.length, 1); assert.equal(groups[0].quantity, 2); assert.equal(groups[0].equivalence, "verified-properties-only");
  assert.deepEqual(groups[0].rows.map(r => r.componentId), result.components.map(p => p.id)); assert(groups[0].rows.every(r => r.cells.length === 10 && r.sourceBomId));
  const p = document.panels[1], f = p.faces[0]; f.finish = verify(p, `faces/${f.faceId}/finish`, syntheticFinish(p, f.faceId, "synthetic-different"));
  const split = groupManufacturingSchedule(result, document); assert.equal(split.length, 2); assert.equal(split.reduce((s, g) => s + g.quantity, 0), 2);
});
test("matching unknown/provisional proposals and reference equal blanks never become grouped equivalent parts", () => {
  const { result, properties, draft } = fixture(); draft.faces.a.finish = "specified"; draft.faces.a.finishId = "SYNTHETIC-SAME";
  const next = applyPanelPropertyDraft(properties, result, [id, other], draft), groups = groupManufacturingSchedule(result, next);
  assert.equal(groups.length, 29); assert(groups.every(g => g.equivalence === "unresolved-occurrence" && g.rows.length === 1));
  assert.equal(new Set(groups.flatMap(g => g.rows.map(r => r.componentId))).size, 29); assert.equal(groups.reduce((s, g) => s + g.quantity, 0), 29);
});
for (const profileId of ["engineering", "furniture-workshop"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId}/${convention} compact notes and output controls preserve geometry, dimensions and traceability`, () => {
  const { result, properties } = fixture(), profile = manufacturingWorkflowProfile(getDrawingProfile(profileId)); profile.sheet.projectionConvention = convention;
  const input = { properties: syntheticPanelExample(properties, result, id), requestedPanelIds: [id], syntheticExample: true };
  const full = generateDrawingDocument(result, getDrawingProfile(profileId), undefined, input), compact = generateDrawingDocument(result, profile, undefined, input); assert(full.document); assert(compact.document, compact.issues.join("; "));
  const document = compact.document; assert.equal(document.componentDimensionCoverage.displayedDimensionIds.length, 87); assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26); assert.equal(document.reconciliation.panelQuantity, 29);
  assert.deepEqual(document.cuttingList, full.document.cuttingList); assert.deepEqual(document.manufacturing, full.document.manufacturing);
  const panelSheets = document.sheets.filter(s => s.manufacturingComponentId); assert.equal(panelSheets.length, 1); assert(!panelSheets[0].manufacturingTable);
  const texts = plotSheet(document, panelSheets[0]).filter(e => e.kind === "text").map(e => e.text).join(" "); assert(texts.includes("SYNTHETIC-MATTE-A")); assert(texts.includes("SYNTHETIC-BAND"));
  assert.deepEqual(validateGADocument(document), []); assert(!document.manufacturingReady); assert(document.hardware.allowances.every(a => a.purchasingQuantity === 0));
  profile.contents.manufacturingOutput!.propertyDrawings = false; profile.contents.manufacturingOutput!.schedule = false;
  const hidden = generateDrawingDocument(result, profile, undefined, input); assert(hidden.document, hidden.issues.join("; ")); assert(!hidden.document.sheets.some(s => s.manufacturingComponentId || s.id.startsWith("MS-"))); assert.deepEqual(hidden.document.manufacturing, document.manufacturing); assert.deepEqual(validateGADocument(hidden.document), []);
});
test("selected-only output avoids automatic maps for every edited occurrence; detailed output remains available", () => {
  const { result, properties, draft } = fixture(); draft.grain = "transverse"; const next = applyPanelPropertyDraft(properties, result, [id, other], draft), profile = manufacturingWorkflowProfile(getDrawingProfile()), input = { properties: next, requestedPanelIds: [id], syntheticExample: false };
  const selected = generateDrawingDocument(result, profile, undefined, input); assert(selected.document, selected.issues.join("; ")); assert.equal(selected.document.sheets.filter(s => s.manufacturingComponentId && s.viewports.length).length, 1);
  profile.contents.manufacturingOutput!.panelScope = "selected-and-edited"; profile.contents.manufacturingOutput!.detailedTables = true;
  const all = generateDrawingDocument(result, profile, undefined, input); assert(all.document, all.issues.join("; ")); assert.equal(all.document.sheets.filter(s => s.manufacturingComponentId && s.viewports.length).length, 2); assert(all.document.sheets.some(s => s.manufacturingTable)); assert.deepEqual(all.document.manufacturing!.rows, selected.document.manufacturing!.rows);
});
test("new manufacturing profile settings persist, old profile migrations retain detailed output, invalid controls fail", () => {
  const profile = manufacturingWorkflowProfile(getDrawingProfile()), values = new Map<string, string>(), storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  saveDrawingPreferences(storage, profile, profile.id); const loaded = loadDrawingPreferences(storage).profile!; assert.deepEqual(loaded.contents, profile.contents); assert.deepEqual(loaded.sheet, profile.sheet);
  const old = getDrawingProfile(); assert(!parseDrawingProfile(old).profile!.contents.manufacturingOutput);
  for (const version of [1, 2]) { const legacy = structuredClone(old) as unknown as Record<string, unknown>; legacy.schemaVersion = version; const c = legacy.contents as Record<string, unknown>; for (const k of ["assemblySheets", "functionalDimensions", "contextualSections", "functionalPresentation"]) delete c[k]; const a = legacy.annotations as Record<string, unknown>; delete a.gaLevel; if (version === 1) delete legacy.annotations; const parsed = parseDrawingProfile(legacy); assert(parsed.profile, parsed.issues.join("; ")); assert(!parsed.profile.contents.manufacturingOutput); }
  for (const patch of [{ schedule: "yes" }, { approved: true }, { panelScope: "same-size" }]) { const bad = structuredClone(profile); Object.assign(bad.contents.manufacturingOutput!, patch); assert.equal(parseDrawingProfile(bad).profile, null); }
});
for (const format of ["A4", "A3", "A2", "A1"] as const) test(`all 29 compact panel maps at ${format} preserve nominal scales and avoid annotation clipping`, () => {
  const { result, properties } = fixture(), profile = manufacturingWorkflowProfile(getDrawingProfile()); profile.sheet.format = format;
  const generated = generateDrawingDocument(result, profile, undefined, { properties, requestedPanelIds: properties.panels.map(p => p.componentId), syntheticExample: false }); assert(generated.document, generated.issues.join("; "));
  const d = generated.document; assert.deepEqual(validateGADocument(d), []); assert.equal(d.sheets.filter(s => s.manufacturingComponentId && s.viewports.length).length, 29);
  for (const sheet of d.sheets.filter(s => s.manufacturingComponentId)) for (const view of sheet.viewports) { const original = d.sheets.flatMap(s => s.viewports).find(v => !v.manufacturingComponentId && v.references.some(r => r.componentId === view.manufacturingComponentId) && v.projection === "panel-face")!; assert.equal(view.scale, original.scale); assert(view.manufacturingInk!.every(e => containsRect(view.frame, primitiveBounds(e)))); }
});

test("editing one edge attribute preserves supplied material grade/codes, process notes and good-face identities", () => {
  const { source: result, document } = fullySpecifiedFixture(), p = document.panels[0], e = p.edges[0];
  e.treatment = verify(p, `edges/${e.edgeId}/treatment`, syntheticTreatment(p, e.edgeId));
  const f = p.faces[0]; assert(f.requirements.status === "verified"); f.requirements = verify(p, `faces/${f.faceId}/requirements`, { ...f.requirements.value, goodFaceRequirements: [{ requirementId: "synthetic-authoritative-id", description: "Synthetic criterion", manufacturerId: "synthetic-maker" }] });
  const draft = panelPropertyDraft(p); draft.edges["u-min"].thickness = "2"; draft.faces.a.role = "decorative-hidden";
  const next = applyPanelPropertyDraft(document, result, [p.componentId], draft), changed = next.panels[0].edges[0].treatment;
  assert(changed.status === "provisional" && changed.value.kind !== "none" && e.treatment.status === "verified" && e.treatment.value.kind !== "none");
  assert.deepEqual(changed.value.material, e.treatment.value.material); assert.deepEqual(changed.value.process, e.treatment.value.process); assert.deepEqual(changed.value.appearance, e.treatment.value.appearance);
  const requirements = next.panels[0].faces[0].requirements; assert(requirements.status === "provisional"); assert.deepEqual(requirements.value.goodFaceRequirements, [{ requirementId: "synthetic-authoritative-id", description: "Synthetic criterion", manufacturerId: "synthetic-maker" }]);
});

test("detailed property tables can be printed independently of optional panel maps", () => {
  const { result, properties } = fixture(), profile = manufacturingWorkflowProfile(getDrawingProfile());
  profile.contents.manufacturingOutput!.propertyDrawings = false; profile.contents.manufacturingOutput!.detailedTables = true;
  const generated = generateDrawingDocument(result, profile, undefined, { properties, requestedPanelIds: [id], syntheticExample: false }); assert(generated.document, generated.issues.join("; "));
  assert(generated.document.sheets.some(s => s.id.startsWith("MN-") && s.manufacturingTable)); assert(!generated.document.sheets.some(s => s.id.startsWith("MP-")));
  assert.deepEqual(validateGADocument(generated.document), []); assert.equal(generated.document.manufacturing!.rows.length, 29);
});

test("compact summaries use 2.5 mm printed notes and retain supplied other requirements", () => {
  const { result, properties } = fixture(), p = properties.panels.find(p => p.componentId === id)!;
  p.otherRequirements = { status: "provisional", reason: "Synthetic fixture only", value: [{ requirementId: "synthetic-note", specification: "SYNTHETIC extra requirement" }] };
  const generated = generateDrawingDocument(result, manufacturingWorkflowProfile(getDrawingProfile()), undefined, { properties, requestedPanelIds: [id], syntheticExample: false }); assert(generated.document, generated.issues.join("; "));
  const d = generated.document, sheet = d.sheets.find(s => s.manufacturingComponentId && s.viewports.length)!;
  const text = plotSheet(d, sheet).filter(e => e.kind === "text"); assert(text.some(e => e.text.includes("SYNTHETIC extra requirement") && e.size === 2.5));
  const bad = structuredClone(d); bad.sheets.find(s => s.id === sheet.id)!.viewports[0].annotations.push("Detached manufacturing instruction"); assert(validateGADocument(bad).length);
});

test("long compact notes continue readably and explicitly identify unlisted treatments as unknown", () => {
  const { result, properties } = fixture(), p = properties.panels.find(p => p.componentId === id)!;
  p.otherRequirements = { status: "provisional", reason: "Synthetic fixture only", value: [{ requirementId: "synthetic-long-note", specification: "Synthetic review note. ".repeat(150) }] };
  const profile = manufacturingWorkflowProfile(getDrawingProfile()); profile.sheet.format = "A4";
  const generated = generateDrawingDocument(result, profile, undefined, { properties, requestedPanelIds: [id], syntheticExample: false }); assert(generated.document, generated.issues.join("; "));
  const d = generated.document, continuations = d.sheets.filter(s => s.manufacturingComponentId === id && s.manufacturingTable); assert(continuations.length);
  assert(continuations.some(s => s.manufacturingTable!.rows.some(r => r.cells[0].join(" ") === "Unlisted edge treatments" && r.cells[1].join(" ") === "Not specified")));
  assert.deepEqual(validateGADocument(d), []);
});
