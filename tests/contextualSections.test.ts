import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { FurnitureSpecification, PanelComponent } from "../src/furniture";
import { generateDrawingDocument, getDrawingProfile, generateSectionGeometry, cropSectionGeometry, contextualViewCollisions, createContextualSectionPlan, parseDrawingProfile, loadDrawingPreferences, saveDrawingPreferences, validateGADocument, plotSheet, SECTION_VIEW_IDS } from "../src/drawings";
import type { DrawingDocument, DrawingProfile, SectionDefinition } from "../src/drawings";
import { cameraDirection } from "../src/drawings/edgeVisibility";
import { projectPoint } from "../src/drawings/projections";
import { modelToSheet } from "../src/drawings/dimensionPlot";
import { containsRect, overlaps, primitiveBounds } from "../src/drawings/annotationGeometry";
import { plotSectionHatches, sectionHatchPatterns } from "../src/drawings/sectionPlot";
import { contextualSectionViews } from "../src/drawings/contextualSections";
import { canonicalDrawingSnapshot } from "../src/drawings/planning/gaPlan";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";

function fixture(edit: (s: FurnitureSpecification) => void = () => {}, profile = getDrawingProfile()) {
  const specification = createDemoChestSpecification(); edit(specification);
  const result = generateFurniture(specification), before = canonicalDrawingSnapshot(result), output = generateDrawingDocument(result, profile);
  assert.deepEqual(output.issues, []); assert(output.document); assert.equal(canonicalDrawingSnapshot(result), before);
  return { result, document: output.document, plan: output.document.contextualSectionPlan };
}
const contextViews = (d: DrawingDocument) => d.sheets.flatMap(s => s.viewports).filter(v => v.sectionData);
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("A-A intersects real required solids at their common width midpoint and accounts for every occurrence", () => {
  const { result, document, plan } = fixture(); assert(plan.section && plan.geometry && plan.detail);
  near(plan.section.plane.coordinateMm, 450); assert.deepEqual(plan.section.cuttingDirection, { x: -1, y: 0, z: 0 });
  assert.equal(plan.geometry.cutFaces.length, 19); assert.equal(plan.geometry.states.filter(s => s.status === "retained").length, 5);
  assert.equal(plan.geometry.states.filter(s => s.status === "removed").length, 5);
  assert.deepEqual(plan.geometry.states.map(s => s.reference.componentId).sort(), result.components.filter(c => c.kind === "panel").map(p => p.id).sort());
  for (const face of plan.geometry.cutFaces) {
    const p = result.components.find(c => c.id === face.reference.componentId); assert(p?.kind === "panel");
    assert(plan.section.plane.coordinateMm > p.position.x && plan.section.plane.coordinateMm < p.position.x + p.dimensions.x);
    assert(face.reference.bomId && result.bom.some(b => b.id === face.reference.bomId && b.componentIds.includes(p.id)));
    face.corners.forEach(c => { near(c.x, plan.section!.plane.coordinateMm); assert(c.y >= p.position.y && c.y <= p.position.y + p.dimensions.y && c.z >= p.position.z && c.z <= p.position.z + p.dimensions.z); });
    near(face.bounds.max.x - face.bounds.min.x, p.dimensions.z); near(face.bounds.max.y - face.bounds.min.y, p.dimensions.y);
  }
  assert.equal(document.reconciliation.panelQuantity, 29); assert.equal(document.componentDimensionPlan.dimensions.length, 87);
  assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26); assert.equal(document.functionalDimensionCoverage.unplacedRequestIds.length, 0);
  assert.equal(document.manufacturingReady, false); assert(document.hardware.allowances.every(a => a.purchasingQuantity === 0 && !a.purchasingEligible));
  assert.deepEqual(document.hardware.allowances.map(a => a.quantity).sort((a, b) => a - b), [8, 8, 160]);
});

test("cut and retained visible edges are distinguished; hatching belongs only to actual cut material", () => {
  const { document, plan } = fixture(); assert(plan.geometry);
  const cut = new Set(plan.geometry.cutFaces.map(f => f.reference.componentId));
  assert(plan.geometry.edges.some(e => e.sectionRole === "projected")); assert(plan.geometry.edges.some(e => e.sectionRole === "cut"));
  for (const e of plan.geometry.edges) assert.equal(e.sectionRole, e.references.some(r => cut.has(r.componentId)) ? "cut" : "projected");
  for (const view of contextViews(document)) {
    const hatches = plotSectionHatches(view, plan.geometry.cutFaces);
    if (view.sectionData!.kind === "parent") { assert.equal(hatches.length, 0); continue; }
    assert(hatches.length > 0);
    for (const h of hatches) {
      assert(h.kind === "line"); assert.equal(h.role, "hatch"); assert.equal(h.references!.length, 1);
      const face = view.sectionData!.cutFaces.find(f => f.reference.componentId === h.references![0].componentId); assert(face);
      const a = modelToSheet(view, face.bounds.min), b = modelToSheet(view, face.bounds.max);
      for (const p of [h.from, h.to]) assert(containsRect({ x: a.x - 1e-6, y: b.y - 1e-6, width: b.x - a.x + 2e-6, height: a.y - b.y + 2e-6 }, { ...p, width: 0, height: 0 }));
    }
  }
  const patterns = sectionHatchPatterns(plan.geometry.cutFaces);
  const base = plan.geometry.cutFaces.find(f => f.reference.componentId.endsWith("/base"))!, back = plan.geometry.cutFaces.find(f => f.reference.componentId.endsWith("/back"))!;
  assert.notEqual(patterns.get(base.id), patterns.get(back.id));
  const detail = contextViews(document).find(v => v.sectionData!.kind === "detail")!;
  assert.equal(detail.sectionData!.identifications!.length, 3);
  assert.deepEqual(detail.sectionData!.identifications!.map(l => l.text), ["Rear", "Back", "Base"]);
});

test("detail is a true crop with surrounding solids and no invented closing edges", () => {
  const { plan, document } = fixture(); assert(plan.detail && plan.geometry);
  const crop = cropSectionGeometry(plan.geometry, plan.detail.crop), detail = contextViews(document).find(v => v.id === SECTION_VIEW_IDS.detail)!;
  assert.deepEqual(detail.entities, crop.edges); assert.deepEqual(detail.sectionData!.cutFaces, crop.cutFaces);
  assert(crop.cutFaces.length >= 4); assert(crop.edges.length > 8);
  assert(crop.cutFaces.some(f => f.reference.componentId.endsWith("/bottom")));
  assert(crop.cutFaces.some(f => f.reference.componentId.endsWith("/base")));
  for (const edge of crop.edges) {
    const original = plan.geometry.edges.find(e => e.id === edge.id)!; assert(original);
    const axis = Math.abs(edge.to.x - edge.from.x) > 1e-6 ? "x" : "y", cross = axis === "x" ? "y" : "x";
    near(edge.from[cross], original.from[cross]); near(edge.to[cross], original.to[cross]);
    assert(edge.from[axis] >= original.from[axis] - 1e-6 && edge.to[axis] <= original.to[axis] + 1e-6);
  }
  assert(!crop.edges.some(e => e.from.y === plan.detail!.crop.max.y && e.to.y === plan.detail!.crop.max.y));
});

test("context dimensions reuse functional IDs/values with explicit real-face or coplanar-envelope anchors", () => {
  const { document, plan, result } = fixture(); assert.equal(plan.dimensionBindings.length, 3);
  assert.deepEqual(plan.dimensionBindings.map(b => b.valueMm), [3, 84, 10]);
  for (const b of plan.dimensionBindings) {
    const d = document.functionalDimensionPlan.dimensions.find(d => d.id === b.semanticDimensionId)!;
    const request = document.functionalDimensionPlan.requests.find(r => r.id === b.requestId)!;
    assert.equal(d.id, request.dimensionId); assert.equal(b.valueMm, d.valueMm); assert.equal(b.role, "reference-repeat");
    for (const anchor of b.anchors) {
      const p = result.components.find(p => p.id === anchor.componentId); assert(p?.kind === "panel");
      for (const a of ["x", "y", "z"] as const) assert(anchor.point[a] >= p.position[a] - 1e-6 && anchor.point[a] <= p.position[a] + p.dimensions[a] + 1e-6);
      assert(document.functionalDimensionPlan.faces.some(f => f.id === anchor.sourceFaceId));
      near(anchor.point.x, plan.section!.plane.coordinateMm);
    }
    assert.deepEqual(b.from, projectPoint(b.anchors[0].point, "right")); assert.deepEqual(b.to, projectPoint(b.anchors[1].point, "right"));
    const placed = contextViews(document).flatMap(v => v.dimensions).find(d => d.id === b.id)!;
    assert.equal(placed.semanticDimensionId, d.id); assert.equal(placed.prefix, "REF ");
  }
  const inset = plan.dimensionBindings[2]; assert.equal(inset.anchors[1].mapping, "coplanar-carcass-rear-envelope");
  assert(inset.anchors[1].componentId.endsWith("/base")); assert.notEqual(inset.anchors[1].sourceFaceId, inset.anchors[1].sectionFaceId);
  const rear = document.functionalDimensionPlan.requests.find(r => r.id === plan.dimensionBindings[1].requestId)!;
  assert(rear.intent.status !== "not-directly-specified"); assert.equal(rear.intent.comparison, "minimum"); assert.equal(rear.intent.valueMm, 10);
});

test("cutting arrows and detail references share stable labels and real model coordinates", () => {
  const { document, plan } = fixture(); assert(plan.section && plan.detail);
  const views = contextViews(document), parent = views.find(v => v.id === plan.section!.parentViewId)!, section = views.find(v => v.id === plan.detail!.parentViewId)!;
  const marker = parent.sectionMarkers![0]; assert(marker.kind === "cutting-plane");
  assert.equal(marker.from.x, plan.section.plane.coordinateMm); assert.equal(marker.to.x, marker.from.x);
  assert.deepEqual(marker.direction, { x: -1, y: 0 }); assert.equal(marker.label, "A-A"); assert.equal(marker.targetViewId, section.id);
  const detail = section.sectionMarkers![0]; assert(detail.kind === "detail-boundary"); assert.equal(detail.label, "B"); assert.deepEqual(detail.bounds, plan.detail.crop);
  assert(views.some(v => v.id === detail.targetViewId)); assert.equal(new Set(views.flatMap(v => v.sectionMarkers ?? []).map(m => m.label)).size, 2);
  assert(document.sheets.find(s => s.id === "CS-001")!.annotations.some(n => n.includes("SC-001")));
});

for (const width of [900, 1000, 1100]) for (const count of [1, 3, 4, 8]) test(`${width} mm / ${count} drawers: intersections, traceability, deterministic geometry and full functional coverage`, () => {
  const { document, plan, result } = fixture(s => { s.dimensions.width = width; s.drawerCount = count; if (count === 8) s.dimensions.height = 1600; });
  assert(plan.section && plan.geometry); near(plan.section.plane.coordinateMm, width / 2); assert.equal(plan.geometry.states.length, 5 + 6 * count);
  assert.equal(plan.geometry.cutFaces.length, 3 + 4 * count); assert.equal(document.functionalDimensionCoverage.unplacedRequestIds.length, 0);
  assert.deepEqual(document.sectionPresentation!.diagnostics, []); assert.equal(document.sectionPresentation!.placedBindingIds.length, 3);
  assert.deepEqual(createContextualSectionPlan(result, document.profile, document.functionalDimensionPlan), plan);
  for (const view of contextViews(document)) assert.deepEqual(contextualViewCollisions(view), []);
  const main = contextViews(document).find(v => v.sectionData!.kind === "section")!, detail = contextViews(document).find(v => v.sectionData!.kind === "detail")!;
  assert(detail.scale > main.scale);
});

test("height, depth, rear inset, drawer depth and gaps regenerate geometry and reuse source measurements", () => {
  const { document, plan } = fixture(s => { s.dimensions = { width: 1100, height: 950, depth: 550 }; s.construction.drawer.depth = 430; s.construction.back.rearInset = 14; s.construction.fronts.verticalGap = 4; });
  assert.deepEqual(plan.dimensionBindings.map(b => b.valueMm), [4, 100, 14]);
  assert.equal(plan.geometry!.bounds.max.y, 950); assert.equal(plan.geometry!.bounds.max.x, 550);
  assert.deepEqual(document.sectionPresentation!.diagnostics, []);
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A1"] as const) test(`${profileId} / ${convention} / ${format}: readable composition, immutable GA and sheet/reference validity`, () => {
  const p = getDrawingProfile(profileId); p.sheet.format = format; p.sheet.projectionConvention = convention;
  const { document } = fixture(() => {}, p), off = structuredClone(p); off.contents.contextualSections = false;
  const previous = fixture(() => {}, off).document;
  assert.deepEqual(document.sheets.find(s => s.id === "GA-001")!.viewports, previous.sheets.find(s => s.id === "GA-001")!.viewports);
  assert.deepEqual(document.componentSchedule, previous.componentSchedule); assert.deepEqual(document.cuttingList, previous.cuttingList);
  assert.deepEqual(document.functionalDimensionCoverage, previous.functionalDimensionCoverage);
  assert.deepEqual(document.sectionPresentation!.diagnostics, []); assert.equal(document.sectionPresentation!.continuation, format !== "A1");
  assert.equal(document.sheets.filter(s => s.id.startsWith("SC-")).length, format === "A4" ? 2 : format === "A3" ? 1 : 0);
  for (const sheet of document.sheets.filter(s => s.viewports.some(v => v.sectionData))) {
    for (const view of sheet.viewports.filter(v => v.sectionData)) {
      assert.deepEqual(contextualViewCollisions(view), []);
      for (const other of sheet.viewports.filter(v => v.id !== view.id)) assert(!overlaps(view.frame, other.frame, 0));
      if (sheet.assemblyPartsList) { const t = sheet.assemblyPartsList; assert(!overlaps(view.frame, { ...t.frame, height: t.titleHeight + t.headerHeight + t.rows.reduce((sum, r) => sum + r.height, 0) }, 0)); }
    }
    for (const e of plotSheet(document, sheet)) if (e.sourceId?.startsWith("hatch:") || e.sourceId?.startsWith("marker:") || e.sourceId?.startsWith("context-repeat:")) assert(containsRect({ x: 10, y: 20, width: sheet.widthMm - 20, height: sheet.heightMm - 80 }, primitiveBounds(e)));
  }
  assert.equal(new Set(document.sheets.map(s => s.metadata.drawingNumber)).size, document.sheets.length);
  document.sheets.forEach((s, i) => { assert.equal(s.metadata.number, i + 1); assert.equal(s.metadata.total, document.sheets.length); });
});

test("stable IDs survive geometry and revision changes; stale plan or presentation is rejected", async () => {
  const original = fixture(), changed = fixture(s => { s.dimensions.width = 1100; });
  assert.equal(original.plan.section!.id, changed.plan.section!.id); assert.equal(original.plan.detail!.id, changed.plan.detail!.id);
  assert.deepEqual(original.plan.dimensionBindings.map(b => b.id), changed.plan.dimensionBindings.map(b => b.id));
  assert.notEqual(original.plan.binding.engineeringRevision, changed.plan.binding.engineeringRevision);
  assert.equal(generateDrawingDocument(changed.result, original.document.profile, original.document.gaPlan).document, null);
  const corruptions: ((d: DrawingDocument) => void)[] = [
    d => { d.contextualSectionPlan.section!.plane.coordinateMm++; }, d => { d.contextualSectionPlan.section!.cuttingDirection.x = 1; },
    d => { d.contextualSectionPlan.binding.engineeringRevision += "stale"; }, d => { d.contextualSectionPlan.geometry!.cutFaces[0].bounds.max.x++; },
    d => { d.contextualSectionPlan.dimensionBindings[0].valueMm++; }, d => { d.contextualSectionPlan.detail!.crop.max.x++; },
    d => { contextViews(d)[0].sectionMarkers![0].targetViewId = "missing"; }, d => { contextViews(d)[1].entities[0].sectionRole = "projected"; },
    d => { contextViews(d)[2].sectionData!.cutFaces.pop(); }, d => { contextViews(d)[2].dimensions[0].valueMm++; },
    d => { contextViews(d)[2].origin.x++; }, d => { d.sheets = d.sheets.filter(s => s.id !== "SC-001"); },
    d => { d.sectionPresentation!.placedBindingIds.pop(); }, d => { d.contextualSectionPlan = changed.plan; },
  ];
  for (const corrupt of corruptions) { const copy = structuredClone(original.document); corrupt(copy); assert(validateGADocument(copy).length); assert.throws(() => plotSheet(copy, copy.sheets[0])); await assert.rejects(exportDrawingPDF(copy)); }
});

test("over-constrained viewports explicitly defer measurements and labels with diagnostics", () => {
  const { result, plan } = fixture(), small = { x: 10, y: 23, width: 90, height: 90 };
  const views = contextualSectionViews(result, plan, { parent: small, section: small, detail: small }, "SC-001", "SC-001");
  assert(views.flatMap(v => [...v.sectionData!.deferredDimensionIds, ...(v.sectionData!.deferredIdentificationIds ?? [])]).length > 0);
  assert.throws(() => contextualSectionViews(result, plan, { parent: small, section: small, detail: { ...small, width: 45, height: 45 } }, "SC-001", "SC-001"), /cannot fit geometry/);
});

test("profiles persist optional sections; absent older flags stay off and subsets keep legacy coverage", () => {
  const { document } = fixture(); assert.equal(document.sheets.length, 12);
  const p = getDrawingProfile(); delete p.contents.contextualSections;
  assert.equal(fixture(() => {}, p).document.sheets.length, 11); assert.equal(fixture(() => {}, p).document.sectionPresentation, null);
  assert.equal(parseDrawingProfile({ ...p, contents: { ...p.contents, contextualSections: "yes" } }).profile, null);
  const entries = new Map<string, string>(), storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => { entries.set(k, v); } };
  p.contents.contextualSections = true; assert(saveDrawingPreferences(storage, p, p.id).profile); assert.equal(loadDrawingPreferences(storage).profile!.contents.contextualSections, true);
  p.contents.assemblySheets.carcass = false; const noCarcass = fixture(() => {}, p).document;
  assert(!noCarcass.sectionPresentation!.parentAssemblySheetId); assert.equal(noCarcass.functionalDimensionCoverage.displayedRequestIds.length, 26);
  p.numbering.scheme = "sequential"; p.numbering.startAt = 21; const numbered = fixture(() => {}, p).document;
  assert.equal(numbered.sheets[0].metadata.drawingNumber, "DRF-CD-021"); assert(contextViews(numbered).some(v => v.annotations.some(n => n.includes("SC-001"))));
});

const block = (id: string, x: number, y = 0, z = 0): PanelComponent => ({ id, assemblyId: "test", name: id, quantity: 1, kind: "panel", materialId: "test", position: { x, y, z }, dimensions: { x: 10, y: 20, z: 30 }, thickness: 10, thicknessAxis: "x" });
const definition = (ids: string[], projection: "right" | "top" | "front", coordinateMm: number, required: string[] = []): SectionDefinition => {
  const camera = cameraDirection(projection), axis = (["x", "y", "z"] as const).find(a => camera[a] !== 0)!;
  return { id: "section:test", label: "A-A", parentViewId: "test-parent", sourceRevision: "test-revision", componentIds: ids, requiredIntersectionIds: required,
    projection, plane: { axis, coordinateMm }, cuttingDirection: { x: -camera.x, y: -camera.y, z: -camera.z }, selection: { rule: "functional-common-span-midpoint-1", componentIds: ids, intervalMm: [0, 10] } };
};
for (const projection of ["right", "top", "front"] as const) test(`${projection}: reusable half-space intersections, cut face areas and tangent material`, () => {
  const p = block("one", 0), before = structuredClone(p), axis = definition([p.id], projection, 1).plane.axis;
  const g = generateSectionGeometry([p], definition([p.id], projection, p.dimensions[axis] / 2, [p.id]));
  assert.equal(g.cutFaces.length, 1); assert.equal(g.states[0].status, "cut"); assert.equal(g.edges.length, 4); assert.deepEqual(p, before);
  const tangent = cameraDirection(projection)[axis] > 0 ? p.dimensions[axis] : 0;
  const t = generateSectionGeometry([p], definition([p.id], projection, tangent));
  assert.equal(t.cutFaces.length, 0); assert.equal(t.states[0].status, "tangent-retained"); assert(t.edges.every(e => e.sectionRole === "projected"));
  assert.throws(() => generateSectionGeometry([p], definition([p.id], projection, tangent, [p.id])), /strictly intersect/);
});

test("retained opaque panels behind a cut face are occluded; removed/tangent-removed solids are unhatchable", () => {
  const cut = block("cut", 5), behind = block("behind", -10), removed = block("removed", 10);
  const g = generateSectionGeometry([cut, behind, removed], definition([cut.id, behind.id, removed.id], "right", 10, [cut.id]));
  assert.equal(g.cutFaces.length, 1); assert.equal(g.states.find(s => s.reference.componentId === removed.id)!.status, "tangent-removed");
  assert(g.edges.every(e => e.references.every(r => r.componentId === "cut")));
  const direction = definition([cut.id], "right", 10); direction.cuttingDirection.x = 1;
  assert.throws(() => generateSectionGeometry([cut], direction), /direction/);
  assert.throws(() => generateSectionGeometry([cut], definition(["missing"], "right", 10)), /missing/);
  assert.throws(() => generateSectionGeometry([cut, { ...cut, id: "overlap" }], definition(["cut", "overlap"], "right", 10)), /Overlapping cut material/);
});

test("unsupported source adapters and coincident contextual references are explicit, preserving all functional data", () => {
  const { document, result } = fixture(); const functional = structuredClone(document.functionalDimensionPlan); functional.requests = [];
  const unsupported = createContextualSectionPlan(result, document.profile, functional);
  assert.equal(unsupported.section, null); assert.equal(unsupported.diagnostics[0].code, "unsupported-section");
  const zero = fixture(s => { s.drawerCount = 1; s.construction.fronts.edgeGap.bottom = 0; s.construction.drawer.frontBottomOffset = 26; });
  assert.equal(zero.document.sectionPresentation!.deferredBindingIds.length, 1); assert(zero.document.sectionPresentation!.diagnostics.some(d => d.includes("coincident")));
  assert.equal(zero.document.functionalDimensionCoverage.unplacedRequestIds.length, 0);
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId} / ${convention}: section/browser/PDF vector parity, cut weight, hatches and references`, async () => {
  const p: DrawingProfile = getDrawingProfile(profileId); p.sheet.projectionConvention = convention;
  const { document } = fixture(() => {}, p), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length); assert(!pdf.context.enumerateIndirectObjects().some(([, s]) => s instanceof PDFRawStream && s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const [index, sheet] of document.sheets.entries()) {
    if (!sheet.viewports.some(v => v.sectionData)) continue;
    const contents = pdf.getPages()[index].node.Contents(); assert(contents instanceof PDFArray);
    const content = contents.asArray().map(ref => pdf.context.lookup(ref)).map(s => { assert(s instanceof PDFRawStream); return new TextDecoder().decode(decodePDFRawStream(s).decode()); }).join("\n");
    const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
    for (const e of plotSheet(document, sheet)) {
      if (e.kind === "line" && e.sourceId) {
        const expected = [e.from.x * MM_TO_PT, (sheet.heightMm - e.from.y) * MM_TO_PT, e.to.x * MM_TO_PT, (sheet.heightMm - e.to.y) * MM_TO_PT];
        assert(paths.some(path => path.every((n, i) => Math.abs(n - expected[i]) < 1e-6)));
      }
      if (e.kind === "text" && e.sourceId) assert(content.includes(Buffer.from(e.text).toString("hex").toUpperCase()));
    }
    assert(content.includes(String(0.45 * MM_TO_PT).slice(0, 10)));
  }
});

test("section identities and exact intersections are independent of source array ordering", () => {
  const { result, document, plan } = fixture(), reordered = structuredClone(result);
  reordered.components.reverse(); reordered.bom.reverse(); reordered.assemblies.reverse();
  reordered.assemblies.forEach(a => a.componentIds.reverse()); reordered.bom.forEach(b => b.componentIds.reverse());
  assert.deepEqual(createContextualSectionPlan(reordered, document.profile, document.functionalDimensionPlan), plan);
  const output = generateDrawingDocument(reordered, document.profile); assert.deepEqual(output.issues, []); assert(output.document);
  assert.deepEqual(contextViews(output.document), contextViews(document));
});

test("expanded title blocks preserve section frames, labels and mandatory functional coverage", () => {
  for (const format of ["A4", "A3", "A1"] as const) {
    const p = getDrawingProfile(); p.sheet.format = format; p.titleBlock.companyName = "Example company";
    p.titleBlock.additionalFields = Array.from({ length: 3 }, (_, i) => ({ label: `Review ${i}`, value: "Preliminary geometry only" }));
    const { document } = fixture(() => {}, p); assert.deepEqual(document.sectionPresentation!.diagnostics, []);
    assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26);
    assert(contextViews(document).every(v => v.frame.y + v.frame.height <= (format === "A4" ? 210 : format === "A3" ? 297 : 594) - 84));
  }
});

test("section depth visibility retains the exposed part of an uncut panel behind the cut face", () => {
  const front = block("cut", 5), behind = block("behind", -10, 10);
  const geometry = generateSectionGeometry([front, behind], definition([front.id, behind.id], "right", 10, [front.id]));
  const projected = geometry.edges.filter(e => e.sectionRole === "projected"); assert(projected.length > 0);
  assert(projected.every(e => Math.min(e.from.y, e.to.y) >= 20 - 1e-6));
  assert(projected.some(e => e.from.y === 30 && e.to.y === 30));
  assert(geometry.edges.filter(e => e.sectionRole === "cut").every(e => Math.max(e.from.y, e.to.y) <= 20 + 1e-6));
});
