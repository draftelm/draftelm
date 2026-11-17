import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { FurnitureResult, FurnitureSpecification } from "../src/furniture";
import { createFunctionalDimensionPlan, DEFAULT_FUNCTIONAL_REFERENCE_POLICY, generateDrawingDocument, getDrawingProfile, loadDrawingPreferences, measureParallelFaces, panelFaceReference, parseDrawingProfile, plotSheet, saveDrawingPreferences, validateFunctionalDimensionPlan, validateGADocument } from "../src/drawings";
import type { DrawingDocument, FunctionalKind, FunctionalDimensionPlan } from "../src/drawings";
import { functionalDetailCollisions, functionalDetailView } from "../src/drawings/functionalDetails";
import { containsRect, pointOnSegment, primitiveBounds } from "../src/drawings/annotationGeometry";
import { panelEdges } from "../src/drawings/edgeVisibility";
import { projectPoint } from "../src/drawings/projections";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";

const axes = ["x", "y", "z"] as const;
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fixture(edit: (s: FurnitureSpecification) => void = () => {}, profile = getDrawingProfile(), supplied?: FurnitureResult) {
  const s = createDemoChestSpecification(); edit(s);
  const result = supplied ?? generateFurniture(s), output = generateDrawingDocument(result, profile);
  assert(output.document, output.issues.join("; "));
  return { result, document: output.document, plan: output.document.functionalDimensionPlan };
}
const requests = (p: FunctionalDimensionPlan, kind: FunctionalKind) => p.requests.filter(r => r.kind === kind);
const values = (p: FunctionalDimensionPlan, kind: FunctionalKind) => requests(p, kind).map(r => p.dimensions.find(d => d.id === r.dimensionId)!.valueMm);
const detailViews = (d: DrawingDocument) => d.sheets.flatMap(s => s.viewports).filter(v => v.functionalDimension);

test("reference chest resolves real gaps/reveals/spaces and preserves every physical panel and existing component dimension", () => {
  const { result, document, plan } = fixture();
  assert.equal(plan.requests.length, 46); assert.equal(plan.dimensions.length, 43); assert.equal(plan.displayGroups.length, 9);
  assert.deepEqual(plan.diagnostics, []); assert(plan.requests.every(r => r.state === "resolved"));
  assert.deepEqual(values(plan, "front-gap"), [3, 3, 3]);
  for (const kind of ["front-left-reveal", "front-right-reveal", "front-bottom-reveal", "front-top-reveal"] as const) assert(values(plan, kind).every(v => v === 2));
  values(plan, "drawer-left-clearance").forEach(v => near(v, 12.7)); values(plan, "drawer-right-clearance").forEach(v => near(v, 12.7));
  assert.deepEqual(values(plan, "drawer-back-clearance"), [84, 84, 84, 84]); assert.deepEqual(values(plan, "back-rear-inset"), [10]);
  assert.deepEqual(values(plan, "drawer-cell-bottom-clearance"), [8, 24, 24, 24]);
  assert.deepEqual(values(plan, "drawer-cell-top-clearance"), [55.25, 55.25, 55.25, 39.25]);
  assert(values(plan, "front-box-bottom-offset").every(v => v === 24)); assert(values(plan, "front-rear-setback").every(v => v === 0));
  for (const kind of ["back-left-clearance", "back-right-clearance", "back-top-clearance", "back-bottom-clearance"] as const) assert.deepEqual(values(plan, kind), [0]);
  assert.equal(result.components.filter(p => p.kind === "panel").length, 29);
  assert.equal(document.componentDimensionPlan.dimensions.length, 87); assert.equal(document.componentDimensionCoverage.missingDimensionIds.length, 0);
  assert.equal(document.functionalDimensionCoverage.requiredRequestIds.length, 26); assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26);
  assert.equal(document.functionalDimensionCoverage.deferredRequestIds.length, 20); assert.equal(document.functionalDimensionCoverage.unplacedRequestIds.length, 0);
  assert.deepEqual(document.sheets.map(s => s.id), ["GA-001", "EA-001", "DS-001", "CS-001", "FD-001", "FD-002", "CP-001", "CP-002", "CP-003", "CL-001", "HW-001"]);
  assert.equal(document.sheets[0].viewports.find(v => v.projection === "isometric")!.entities.length, 53);
  assert.deepEqual(document.gaPlan.dimensions.map(d => d.valueMm), [900, 850, 500, 518]);
});

test("all face/edge references resolve to physical panel geometry with stable orientation and source BOM identity", () => {
  const { result, plan } = fixture();
  for (const face of plan.faces) {
    const panel = result.components.find(p => p.id === face.reference.componentId)!; assert(panel.kind === "panel");
    near(face.coordinateMm, panel.position[face.axis] + (face.side === "max" ? panel.dimensions[face.axis] : 0));
    assert.equal(face.normal[face.axis], face.side === "min" ? -1 : 1); assert.equal(face.formalDatum, "not-assessed");
    assert(result.bom.some(b => b.id === face.reference.bomId && b.componentIds.includes(panel.id)));
    assert.equal(face.reference.assemblyId, panel.assemblyId);
  }
  for (const edge of plan.edges) {
    const panel = result.components.find(p => p.id === edge.reference.componentId)!; assert(panel.kind === "panel");
    assert(panelEdges(panel).some(e => e.axis === edge.axis && JSON.stringify(e.from) === JSON.stringify(edge.from) && JSON.stringify(e.to) === JSON.stringify(edge.to)));
    assert(edge.faceIds.length >= 1);
    for (const id of edge.faceIds) { const face = plan.faces.find(f => f.id === id)!; near(edge.from[face.axis], face.coordinateMm); near(edge.to[face.axis], face.coordinateMm); }
  }
  for (const d of plan.dimensions) {
    const a = plan.faces.find(f => f.id === d.measurement.fromFaceId)!, b = plan.faces.find(f => f.id === d.measurement.toFaceId)!;
    near(d.valueMm, b.coordinateMm - a.coordinateMm);
    assert.equal(d.measurement.axis, a.axis); assert.equal(a.axis, b.axis);
    for (const [point, edgeId, face] of [[d.measurement.from, d.measurement.fromEdgeId, a], [d.measurement.to, d.measurement.toEdgeId, b]] as const) {
      const edge = plan.edges.find(e => e.id === edgeId)!;
      near(point[face.axis], face.coordinateMm);
      assert(axes.every(axis => point[axis] >= Math.min(edge.from[axis], edge.to[axis]) - 1e-6 && point[axis] <= Math.max(edge.from[axis], edge.to[axis]) + 1e-6));
    }
    near(Math.hypot(projectPoint(d.measurement.to, d.projection).x - projectPoint(d.measurement.from, d.projection).x, projectPoint(d.measurement.to, d.projection).y - projectPoint(d.measurement.from, d.projection).y), d.valueMm);
    assert.equal(d.basis, "measured-geometry"); assert.equal(d.tolerance, "unspecified"); assert.equal(d.manufacturingDatum, "not-assessed");
  }
});

test("actual clearances are distinct from nominal exact/minimum intent and source assumptions never become supplier specifications", () => {
  const { plan } = fixture();
  const rear = requests(plan, "drawer-back-clearance")[0], side = requests(plan, "drawer-left-clearance")[0];
  assert(rear.intent.status !== "not-directly-specified"); assert.equal(rear.intent.valueMm, 10); assert.equal(rear.intent.comparison, "minimum");
  assert.equal(rear.intent.status, "geometry-consistent"); assert.equal(rear.intent.validation, "geometry-check-only");
  assert.equal(rear.intent.nominalStatus, "unverified-nominal-assumption"); assert.equal(values(plan, "drawer-back-clearance")[0], 84);
  assert(side.intent.status !== "not-directly-specified"); assert.equal(side.intent.comparison, "exact"); assert.equal(side.intent.parameterPath, "hardware.runner.sideClearance");
  assert(requests(plan, "front-left-reveal").every(r => r.intent.status === "not-directly-specified"));
  assert(requests(plan, "drawer-cell-bottom-clearance").every(r => r.relationshipSpace === "usable-front-cell"));
  assert.equal(side.relationshipSpace, "opposed-faces");
});

for (const width of [900, 1000, 1100]) for (const count of [1, 3, 4, 8]) test(`${width} mm / ${count} drawers: geometry-derived relationships, stable surviving reference IDs and no stale panel memberships`, () => {
  const { result, document, plan } = fixture(s => { s.dimensions = { width, height: count > 4 ? count * 220 : 950, depth: 550 }; s.drawerCount = count; });
  assert.equal(requests(plan, "front-gap").length, count - 1); assert.equal(requests(plan, "drawer-left-clearance").length, count);
  assert.equal(document.functionalDimensionCoverage.unplacedRequestIds.length, 0); assert.equal(document.functionalDimensionCoverage.unsupportedRequestIds.length, 0);
  for (const request of plan.requests) {
    assert(request.componentIds.every(id => result.components.some(p => p.id === id && p.kind === "panel")));
    assert(request.assemblyIds.every(id => result.assemblies.some(a => a.id === id)));
    const dimension = plan.dimensions.find(d => d.id === request.dimensionId)!;
    const fromFace = plan.faces.find(f => f.id === dimension.measurement.fromFaceId)!, toFace = plan.faces.find(f => f.id === dimension.measurement.toFaceId)!;
    near(dimension.valueMm, toFace.coordinateMm - fromFace.coordinateMm);
  }
  assert(values(plan, "drawer-back-clearance").every(v => v === 134));
  assert.equal(document.reconciliation.panelCount, 5 + 6 * count);
  const original = fixture().plan;
  for (const face of plan.faces) { const old = original.faces.find(f => f.reference.componentId === face.reference.componentId && f.axis === face.axis && f.side === face.side); if (old) assert.equal(face.id, old.id); }
});

test("changed source overlay/gaps/inset/clearance/setback are measured without substituting nominal edge-gap inputs", () => {
  const { result, plan } = fixture(s => {
    s.construction.fronts.overlay.left = 16; s.construction.fronts.edgeGap.left = 4;
    s.construction.fronts.overlay.right = 17; s.construction.fronts.edgeGap.right = 3;
    s.construction.fronts.verticalGap = 5;
    s.construction.back.rearInset = 14; s.construction.back.edgeClearance = 1;
  });
  assert(values(plan, "front-left-reveal").every(v => v === 6)); assert(values(plan, "front-right-reveal").every(v => v === 4));
  assert(values(plan, "front-gap").every(v => Math.abs(v - 5) < 1e-6));
  const insetFronts = fixture(s => { s.construction.fronts.overlay = { left: 0, right: 0, top: 0, bottom: 0 }; s.construction.fronts.rearFaceSetback = 2; });
  assert(values(insetFronts.plan, "front-rear-setback").every(v => v === 2));
  assert.deepEqual(values(plan, "back-rear-inset"), [14]);
  for (const kind of ["back-left-clearance", "back-right-clearance", "back-bottom-clearance", "back-top-clearance"] as const) assert.deepEqual(values(plan, kind), [1]);
  const back = result.components.find(c => c.id === "chest/carcass/back")!, rear = result.components.find(c => c.id === "chest/drawer-1/rear")!;
  assert(rear.kind === "panel"); assert(values(plan, "drawer-back-clearance").every(v => v === back.position.z - rear.position.z - rear.dimensions.z));
});

test("shared physical face pairs have one measurement with separate intent checks, not contradictory duplicate dimensions", () => {
  const { plan, document } = fixture();
  const cell = requests(plan, "drawer-cell-bottom-clearance").find(r => r.assemblyIds.includes("chest/drawer-2"))!;
  const offset = requests(plan, "front-box-bottom-offset").find(r => r.assemblyIds.includes("chest/drawer-2"))!;
  assert.equal(cell.dimensionId, offset.dimensionId); assert.notDeepEqual(cell.intent, offset.intent);
  const keys = plan.dimensions.map(d => `${d.measurement.axis}:${d.measurement.fromFaceId}:${d.measurement.toFaceId}`);
  assert.equal(new Set(keys).size, keys.length);
  const shown = detailViews(document).flatMap(v => v.functionalDimension!.requestIds);
  assert.equal(new Set(shown).size, shown.length); assert.equal(shown.length, 26);
  assert(plan.displayGroups.every(g => g.dimensionIds.every(id => plan.dimensions.find(d => d.id === id)!.valueMm.toFixed(6) === plan.dimensions.find(d => d.id === g.dimensionIds[0])!.valueMm.toFixed(6))));
});

test("reordered source arrays preserve the complete plan; changed transient BOM IDs preserve geometric identities", () => {
  const { result, plan } = fixture(), reordered = structuredClone(result);
  reordered.components.reverse(); reordered.assemblies.reverse(); reordered.bom.reverse(); reordered.assemblies.forEach(a => a.componentIds.reverse()); reordered.bom.forEach(b => b.componentIds.reverse());
  assert.deepEqual(createFunctionalDimensionPlan(reordered, getDrawingProfile()), plan);
  reordered.bom.forEach((b, i) => { b.id = `changed-${i}`; });
  const next = fixture(() => {}, getDrawingProfile(), reordered).plan;
  assert.deepEqual(next.dimensions.map(d => d.id), plan.dimensions.map(d => d.id)); assert.deepEqual(next.faces.map(f => f.id), plan.faces.map(f => f.id));
  assert(next.dimensions.every(d => d.references.every(r => r.bomId!.startsWith("changed-"))));
});

test("source intent contradictions and missing review evidence remain explicit even with a claimed-valid engineering result", () => {
  const { result } = fixture(), moved = structuredClone(result);
  moved.components.find(c => c.id === "chest/drawer-2/front")!.position.y += 0.5;
  const plan = createFunctionalDimensionPlan(moved, getDrawingProfile());
  assert(plan.diagnostics.some(d => d.code === "intent-mismatch")); assert(requests(plan, "front-gap").some(r => r.intent.status === "violated"));
  const evidenceNotSupplied = structuredClone(result); evidenceNotSupplied.issues = evidenceNotSupplied.issues.filter(i => !i.code.startsWith("unverified:")); evidenceNotSupplied.assumptionsVerified = true;
  const unchecked = createFunctionalDimensionPlan(evidenceNotSupplied, getDrawingProfile());
  assert(unchecked.requests.every(r => r.intent.status === "not-directly-specified" || r.intent.nominalStatus === "verification-not-assessed"));
});

test("negative, nonparallel, nonoverlapping and unsupported camera relationships produce no invented values", () => {
  const { result } = fixture(), a = result.components.find(p => p.id === "chest/carcass/left")!, b = result.components.find(p => p.id === "chest/drawer-1/left")!;
  assert(a.kind === "panel" && b.kind === "panel");
  const from = panelFaceReference(result, a, "x", "max"), to = panelFaceReference(result, b, "x", "min");
  assert.throws(() => measureParallelFaces(to, from, "front"));
  assert.throws(() => measureParallelFaces(from, panelFaceReference(result, b, "y", "min"), "front"));
  assert.throws(() => measureParallelFaces(from, to, "right"));
  const moved = structuredClone(result); moved.components.find(p => p.id === "chest/drawer-1/front")!.position.x = -1;
  const plan = createFunctionalDimensionPlan(moved, getDrawingProfile()), bad = requests(plan, "front-left-reveal")[0];
  assert.equal(bad.state, "unsupported"); assert.equal(bad.dimensionId, undefined); assert(plan.diagnostics.some(d => d.requestId === bad.id));
  const far = structuredClone(result); far.components.find(p => p.id === "chest/drawer-1/left")!.position.z = 600;
  assert(requests(createFunctionalDimensionPlan(far, getDrawingProfile()), "drawer-left-clearance").some(r => r.state === "unsupported"));
});

test("unknown engineering adapters are explicitly unsupported, including functional-only export selection", () => {
  const { result } = fixture(), revision = JSON.parse(result.specificationRevision); revision.engineRevision = "future-engine-999";
  result.specificationRevision = JSON.stringify(revision);
  const profile = getDrawingProfile(), plan = createFunctionalDimensionPlan(result, profile);
  assert.equal(plan.dimensions.length, 0); assert(plan.diagnostics.some(d => d.code === "unsupported"));
  profile.contents.assemblyViews = []; profile.contents.assemblySheets = { exploded: false, drawers: false, carcass: false };
  profile.contents.componentDrawings = false; profile.contents.cuttingList.include = false; profile.contents.hardwareSchedule = false;
  const output = generateDrawingDocument(result, profile); assert.equal(output.document, null); assert(output.issues.some(i => i.includes("No supported sheets")));
});

test("reference preferences change view/station selection only and proposed overrides cannot become implicit datums", () => {
  const { result, plan } = fixture(), custom = { id: "company-reference-proposal", station: "overlap-min" as const, projections: { x: "top" as const, y: "right" as const, z: "top" as const } };
  const next = createFunctionalDimensionPlan(result, getDrawingProfile(), custom);
  assert(next.dimensions.every(d => plan.dimensions.some(old => old.id === d.id && old.valueMm === d.valueMm)));
  assert(next.diagnostics.some(d => d.code === "unsupported"), "a preferred view without a continuous reference station must be reported");
  assert(next.dimensions.every(d => d.projection === custom.projections[d.measurement.axis] && d.manufacturingDatum === "not-assessed"));
  const side = next.dimensions.find(d => d.id === requests(next, "drawer-left-clearance")[0].dimensionId)!;
  assert.equal(side.projection, "top"); near(side.valueMm, 12.7);
  assert.notDeepEqual(side.measurement.from, plan.dimensions.find(d => d.id === side.id)!.measurement.from);
  assert.throws(() => createFunctionalDimensionPlan(result, getDrawingProfile(), { ...DEFAULT_FUNCTIONAL_REFERENCE_POLICY, projections: { x: "right", y: "front", z: "right" } }));
});

test("unsupported construction contracts and error-bearing geometry results do not gain inferred functional values", () => {
  const { result } = fixture(), revision = JSON.parse(result.specificationRevision);
  revision.parameters.construction.back.type = "unregistered-back";
  const unsupported = structuredClone(result); unsupported.specificationRevision = JSON.stringify(revision);
  const plan = createFunctionalDimensionPlan(unsupported, getDrawingProfile());
  assert.equal(plan.dimensions.length, 0); assert(plan.diagnostics.some(d => d.code === "unsupported"));
  const invalid = structuredClone(result); invalid.issues.push({ code: "invalid", severity: "error", message: "Invalid geometry" });
  assert.throws(() => createFunctionalDimensionPlan(invalid, getDrawingProfile()));
});

test("plans and geometry are immutable and changed model/profile/revision inputs invalidate cached relationships", () => {
  const { result, plan } = fixture(), before = JSON.stringify(result), profile = getDrawingProfile(), settings = JSON.stringify(profile);
  createFunctionalDimensionPlan(result, profile); assert.equal(JSON.stringify(result), before); assert.equal(JSON.stringify(profile), settings);
  assert(Object.isFrozen(plan)); assert(Object.isFrozen(plan.faces[0].bounds));
  assert.deepEqual(validateFunctionalDimensionPlan(plan, result, profile), []);
  assert(validateFunctionalDimensionPlan(plan, fixture(s => { s.dimensions.width = 1000; }).result, profile).length);
  const moved = structuredClone(result); moved.components[0].position.x++; assert(validateFunctionalDimensionPlan(plan, moved, profile).length);
  profile.sheet.projectionConvention = "first-angle"; assert(validateFunctionalDimensionPlan(plan, result, profile).length);
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${profileId} / ${convention} / ${format}: true reference-edge projections, readable placements and no clipping`, () => {
  const profile = getDrawingProfile(profileId); profile.sheet = { format, projectionConvention: convention };
  profile.titleBlock.companyName = "Example"; profile.titleBlock.additionalFields = [{ label: "Author", value: "Example" }, { label: "Project", value: "Example" }, { label: "Checked", value: "Example" }];
  const { document, plan } = fixture(s => { s.dimensions.width = 1100; }, profile);
  assert.equal(document.functionalDimensionCoverage.unplacedRequestIds.length, 0);
  for (const view of detailViews(document)) {
    assert.deepEqual(functionalDetailCollisions(view), []);
    const dimension = plan.dimensions.find(d => d.id === view.functionalDimension!.representativeDimensionId)!;
    assert.equal(view.projection, dimension.projection);
    assert.deepEqual(view.functionalDimension!.from, projectPoint(dimension.measurement.from, dimension.projection));
    for (const line of view.entities) for (const point of [line.from, line.to]) assert(plan.edges.some(edge => line.references.some(r => r.componentId === edge.reference.componentId) && pointOnSegment(point, projectPoint(edge.from, dimension.projection), projectPoint(edge.to, dimension.projection))));
  }
  for (const sheet of document.sheets.filter(s => s.id.startsWith("FD-"))) for (const e of plotSheet(document, sheet)) assert(containsRect({ x: 10 - 1e-6, y: 10 - 1e-6, width: sheet.widthMm - 20 + 2e-6, height: sheet.heightMm - 20 + 2e-6 }, primitiveBounds(e)), JSON.stringify(e));
});

test("zero separation is a linked coincident-face note and never a fake zero-length dimension", () => {
  const { result, plan } = fixture(), request = requests(plan, "back-left-clearance")[0];
  const view = functionalDetailView(result, plan, { id: "zero-detail", kind: request.kind, label: request.label, representativeRequestId: request.id, requestIds: [request.id], dimensionIds: [request.dimensionId!] }, { x: 10, y: 23, width: 200, height: 105 });
  assert.equal(view.functionalDimension!.valueMm, 0); assert.equal(view.dimensions.length, 0); assert.deepEqual(functionalDetailCollisions(view), []);
  const zeroInset = fixture(s => { s.construction.fronts.edgeGap.left = 0; });
  const zeroView = detailViews(zeroInset.document).find(v => v.functionalDimension!.valueMm === 0)!;
  const sheet = zeroInset.document.sheets.find(s => s.viewports.includes(zeroView))!;
  assert(plotSheet(zeroInset.document, sheet).some(e => e.kind === "text" && e.text === "Measured 0 mm (coincident reference planes)"));
});

test("an over-constrained detail reports deferred placement with every required occurrence still traceable", () => {
  const { result, plan } = fixture(), group = plan.displayGroups.find(g => g.kind === "front-gap")!;
  const frame = { x: 10, y: 23, width: 200, height: 105 };
  const view = functionalDetailView(result, plan, group, frame, [frame]);
  assert.equal(view.functionalDimension!.status, "unplaced");
  assert(view.functionalDimension!.reason); assert.deepEqual(view.functionalDimension!.requestIds, group.requestIds);
});

test("optional functional sheets persist safely and old profiles retain their earlier output", () => {
  const old = getDrawingProfile(); delete old.contents.functionalDimensions;
  assert.equal(fixture(() => {}, old).document.sheets.length, 9);
  assert.equal(fixture().document.sheets.length, 11);
  old.contents.functionalDimensions = false;
  const hidden = fixture(() => {}, old).document;
  assert.equal(hidden.functionalDimensionPlan.requests.length, 46); assert.equal(hidden.functionalDimensionCoverage.unplacedRequestIds.length, 26);
  assert.equal(hidden.functionalDimensionCoverage.diagnostics[0].code, "hidden");
  const entries = new Map<string, string>(), storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  old.contents.functionalDimensions = true; assert(saveDrawingPreferences(storage, old, "furniture-workshop").profile);
  const restored = loadDrawingPreferences(storage); assert(restored.profile?.contents.functionalDimensions);
  assert.equal(parseDrawingProfile({ ...old, contents: { ...old.contents, functionalDimensions: "yes" } }).profile, null);
});

for (const scheme of ["by-sheet-kind", "sequential"] as const) test(`${scheme}: functional-only subset retains source data and correct unique numbering`, () => {
  const profile = getDrawingProfile(); profile.contents.assemblyViews = []; profile.contents.assemblySheets = { exploded: false, drawers: false, carcass: false };
  profile.contents.componentDrawings = false; profile.contents.cuttingList.include = false; profile.contents.hardwareSchedule = false;
  profile.numbering.scheme = scheme; profile.numbering.startAt = 17;
  const { document } = fixture(() => {}, profile);
  assert.deepEqual(document.sheets.map(s => s.id), ["FD-001", "FD-002"]);
  assert.equal(new Set(document.sheets.map(s => s.metadata.drawingNumber)).size, 2);
  assert(document.sheets.every((s, i) => s.metadata.total === 2 && s.metadata.number === i + 1));
  assert.equal(document.reconciliation.panelQuantity, 29); assert.equal(document.componentDimensionPlan.dimensions.length, 87);
  assert(document.hardware.allowances.every(a => !a.purchasingEligible && a.purchasingQuantity === 0)); assert.equal(document.manufacturingReady, false);
});

test("render/PDF boundaries reject altered references, values, source intent, crops, placements and missing coverage", async () => {
  const { document } = fixture();
  const corruptions: ((d: DrawingDocument) => void)[] = [
    d => { d.functionalDimensionPlan.dimensions[0].valueMm++; }, d => { d.functionalDimensionPlan.faces[0].coordinateMm++; },
    d => { d.functionalDimensionPlan.edges[0].from.x++; }, d => { d.functionalDimensionPlan.binding.engineeringRevision += "stale"; },
    d => { detailViews(d)[0].dimensions[0].valueMm++; }, d => { detailViews(d)[0].entities[0].to.x++; },
    d => { detailViews(d)[0].referenceLabels![0].text = "Datum A"; }, d => { detailViews(d)[0].origin.x++; },
    d => { d.functionalDimensionCoverage.displayedRequestIds.pop(); }, d => { d.sheets = d.sheets.filter(s => s.id !== "FD-001"); },
  ];
  for (const corrupt of corruptions) { const copy = structuredClone(document); corrupt(copy); assert(validateGADocument(copy).length); assert.throws(() => plotSheet(copy, copy.sheets[0])); await assert.rejects(exportDrawingPDF(copy)); }
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId} / ${convention}: PDF/browser parity for reference edges, dimension paths, values and reference labels`, async () => {
  const profile = getDrawingProfile(profileId); profile.sheet.projectionConvention = convention;
  const { document } = fixture(() => {}, profile), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length);
  assert(!pdf.context.enumerateIndirectObjects().some(([, s]) => s instanceof PDFRawStream && s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const [index, sheet] of document.sheets.entries()) {
    if (!sheet.id.startsWith("FD-")) continue;
    const contents = pdf.getPages()[index].node.Contents(); assert(contents instanceof PDFArray);
    const content = contents.asArray().map(ref => pdf.context.lookup(ref)).map(stream => { assert(stream instanceof PDFRawStream); return new TextDecoder().decode(decodePDFRawStream(stream).decode()); }).join("\n");
    const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
    for (const e of plotSheet(document, sheet)) {
      if (e.kind === "line" && ["geometry", "dimension"].includes(e.role)) {
        const expected = [e.from.x * MM_TO_PT, (sheet.heightMm - e.from.y) * MM_TO_PT, e.to.x * MM_TO_PT, (sheet.heightMm - e.to.y) * MM_TO_PT];
        assert(paths.some(path => path.every((n, i) => Math.abs(n - expected[i]) < 1e-6)));
      }
      if (e.kind === "text" && (e.sourceId?.startsWith("functional-dimension:") || e.sourceId?.startsWith("edge:"))) assert(content.includes(Buffer.from(e.text).toString("hex").toUpperCase()));
    }
  }
});
