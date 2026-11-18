import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { FurnitureSpecification } from "../src/furniture";
import { generateDrawingDocument, getDrawingProfile, plotSheet, validateGADocument, parseDrawingProfile, loadDrawingPreferences, saveDrawingPreferences, functionalContextCollisions, createFunctionalDimensionPlan, createContextualSectionPlan, createFunctionalContextPlan } from "../src/drawings";
import type { DrawingDocument, FunctionalKind, DrawingProfile } from "../src/drawings";
import { canonicalDrawingSnapshot } from "../src/drawings/planning/gaPlan";
import { verifiedFunctionalGroups } from "../src/drawings/planning/functionalGroups";
import { fitFunctionalContextView, functionalContextPresentation } from "../src/drawings/functionalContext";
import { cropSectionGeometry } from "../src/drawings/sectionGeometry";
import { orthographicLines } from "../src/drawings/projections";
import { modelToSheet } from "../src/drawings/dimensionPlot";
import { plotSectionHatches, plotSectionMarkers } from "../src/drawings/sectionPlot";
import { containsRect, overlaps, primitiveBounds } from "../src/drawings/annotationGeometry";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";

function fixture(edit: (s: FurnitureSpecification) => void = () => {}, profile = getDrawingProfile()) {
  const specification = createDemoChestSpecification(); edit(specification);
  const result = generateFurniture(specification), before = canonicalDrawingSnapshot(result), output = generateDrawingDocument(result, profile);
  assert.deepEqual(output.issues, []); assert(output.document); assert(output.document.functionalContextPlan);
  assert.equal(canonicalDrawingSnapshot(result), before);
  return { result, document: output.document, plan: output.document.functionalContextPlan };
}
const views = (d: DrawingDocument) => d.sheets.flatMap(s => s.viewports).filter(v => v.functionalContext);
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const displayFor = (d: DrawingDocument, kind: FunctionalKind) => d.functionalContextPlan!.displays.filter(g => g.requestIds.some(id => d.functionalDimensionPlan.requests.find(r => r.id === id)!.kind === kind));

test("26 source requests have exactly one primary contextual mapping; all 23 former legacy-only requests are accounted for", () => {
  const { document, plan } = fixture(), requests = document.functionalDimensionPlan.requests.filter(r => r.required);
  assert.equal(requests.length, 26); assert.equal(plan.displays.length, 9);
  const mapped = plan.displays.flatMap(d => d.requestIds);
  assert.deepEqual([...mapped].sort(), requests.map(r => r.id).sort()); assert.equal(new Set(mapped).size, 26);
  assert.equal(document.functionalContextPresentation!.assignments.filter(a => a.state === "placed").length, 26);
  assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26); assert.deepEqual(document.functionalDimensionCoverage.unplacedRequestIds, []);
  assert.equal(document.functionalDimensionCoverage.deferredRequestIds.length, 20);
  const formerThree = document.contextualSectionPlan.dimensionBindings.map(b => b.requestId);
  assert.equal(requests.filter(r => !formerThree.includes(r.id)).length, 23);
  assert(plan.displays.filter(d => d.source !== "existing-detail-B").every(d => d.viewId.startsWith("functional-context-detail:")));
  assert(document.sheets.every(s => !s.id.startsWith("FD-"))); assert.equal(document.sheets.length, 12);
  assert.equal(document.reconciliation.panelQuantity, 29); assert.equal(document.componentDimensionPlan.dimensions.length, 87);
});

test("front gaps/reveals use cropped closed assembly outlines, sufficient adjacent context and verified repeated source measurements", () => {
  const { result, document, plan } = fixture();
  const panels = result.components.filter(c => c.kind === "panel").sort((a, b) => a.id.localeCompare(b.id)), edges = orthographicLines(panels, "front").map(line => ({ ...line, references: line.references.map(ref => ({ ...ref, bomId: result.bom.find(b => b.componentIds.includes(ref.componentId))!.id })) }));
  const parent = plan.views.find(v => v.kind === "parent")!; assert.deepEqual(parent.entities, edges);
  const fronts = plan.views.filter(v => v.kind === "detail" && v.projection === "front");
  assert.deepEqual(fronts.map(v => v.labelToken), ["D", "E", "F"]);
  for (const def of fronts) {
    assert(def.crop); assert(def.entities.length > 3); assert.equal(def.cutFaces.length, 0);
    const expected = cropSectionGeometry({ edges, cutFaces: [] }, def.crop);
    assert.deepEqual(def.entities, expected.edges);
    assert(def.entities.some(e => Math.abs(e.to.x - e.from.x) > 1e-6)); assert(def.entities.some(e => Math.abs(e.to.y - e.from.y) > 1e-6));
    const v = views(document).find(v => v.id === def.id)!; assert.equal(plotSectionHatches(v, [] ).length, 0);
  }
  const gap = displayFor(document, "front-gap")[0]; assert.equal(gap.valueMm, 3); assert.equal(gap.requestIds.length, 3);
  const left = displayFor(document, "front-left-reveal")[0], right = displayFor(document, "front-right-reveal")[0];
  assert.equal(left.valueMm, 2); assert.equal(right.valueMm, 2); assert.equal(left.requestIds.length, 4); assert.equal(right.requestIds.length, 4);
  assert.equal(displayFor(document, "front-bottom-reveal")[0].viewId, left.viewId); assert.equal(displayFor(document, "front-top-reveal")[0].viewId, right.viewId);
});

test("C-C is a true Y=94 mm horizontal section through drawer/carcass panels with cut-only hatching", () => {
  const { result, document, plan } = fixture(); assert.equal(plan.sections.length, 1);
  const { definition, geometry } = plan.sections[0]; assert.equal(definition.plane.axis, "y"); near(definition.plane.coordinateMm, 94);
  near(definition.plane.coordinateMm, (definition.selection.intervalMm[0] + definition.selection.intervalMm[1]) / 2);
  assert.deepEqual(definition.cuttingDirection, { x: 0, y: -1, z: 0 }); assert.equal(definition.projection, "top");
  assert.equal(geometry.cutFaces.length, 8); assert.equal(geometry.states.length, 29);
  for (const f of geometry.cutFaces) {
    const p = result.components.find(c => c.id === f.reference.componentId); assert(p?.kind === "panel");
    assert(definition.plane.coordinateMm > p.position.y && definition.plane.coordinateMm < p.position.y + p.dimensions.y);
    f.corners.forEach(c => near(c.y, definition.plane.coordinateMm)); near(f.bounds.max.x - f.bounds.min.x, p.dimensions.x); near(f.bounds.max.y - f.bounds.min.y, p.dimensions.z);
  }
  for (const v of views(document).filter(v => v.functionalContext!.sectionId)) {
    const ink = plotSectionHatches(v, geometry.cutFaces); assert(ink.length > 0);
    for (const line of ink) {
      assert(line.kind === "line"); const face = v.functionalContext!.cutFaces.find(f => f.reference.componentId === line.references![0].componentId); assert(face);
      const a = modelToSheet(v, face.bounds.min), b = modelToSheet(v, face.bounds.max);
      for (const p of [line.from, line.to]) assert(containsRect({ x: a.x - 1e-6, y: b.y - 1e-6, width: b.x - a.x + 2e-6, height: a.y - b.y + 2e-6 }, { ...p, width: 0, height: 0 }));
    }
  }
});

test("left/right 12.7 mm side spaces preserve all eight exact source occurrence links and cut-face witness points", () => {
  const { result, document } = fixture();
  for (const kind of ["drawer-left-clearance", "drawer-right-clearance"] as const) {
    const display = displayFor(document, kind)[0]; assert.equal(display.requestIds.length, 4); near(display.valueMm, 12.7);
    assert.equal(display.source, "horizontal-section"); assert.equal(new Set(display.dimensionIds).size, 4);
    for (const member of display.members) {
      near(member.to.x - member.from.x, display.valueMm); near(member.from.y, member.to.y); near(member.from.z, member.to.z);
      for (const [i, point] of [member.from, member.to].entries()) {
        const face = document.functionalDimensionPlan.faces.find(f => f.id === member.faceIds[i])!, p = result.components.find(c => c.id === face.reference.componentId); assert(p?.kind === "panel");
        for (const axis of ["x", "y", "z"] as const) assert(point[axis] >= face.bounds.min[axis] - 1e-6 && point[axis] <= face.bounds.max[axis] + 1e-6);
        assert.equal(member.sourceSectionPlane!.axis, "y"); near(member.sourceSectionPlane!.coordinateMm, point.y);
        if (member.sectionId) assert(document.functionalContextPlan!.sections.some(s => s.definition.id === member.sectionId));
      }
    }
  }
});

test("A-A and B are reused for all four measured rear spaces and inset without duplicating semantic measurements", () => {
  const { document, plan } = fixture(), rear = displayFor(document, "drawer-back-clearance")[0], inset = displayFor(document, "back-rear-inset")[0];
  assert.equal(rear.valueMm, 84); assert.equal(rear.requestIds.length, 4); assert.equal(inset.valueMm, 10);
  assert.equal(rear.viewId, "context-detail-B"); assert.equal(rear.source, "existing-detail-B"); assert.equal(inset.viewId, rear.viewId);
  assert.equal(new Set(plan.displays.map(d => d.id)).size, plan.displays.length);
  const section = document.contextualSectionPlan.section!, detail = document.sheets.flatMap(s => s.viewports).find(v => v.id === rear.viewId)!;
  for (const member of rear.members) { near(member.from.x, section.plane.coordinateMm); near(member.to.x, section.plane.coordinateMm); near(member.to.z - member.from.z, 84); }
  assert.equal(inset.members[0].mappedFaceIds![1], document.contextualSectionPlan.dimensionBindings.find(b => b.id === inset.id)!.anchors[1].sectionFaceId);
  assert(detail.annotations.some(n => n.includes("source minimum 10 mm (unverified)")));
  assert.equal(detail.dimensions.find(d => d.valueMm === 84)!.prefix, "4x REF ");
  assert.equal(document.functionalDimensionPlan.dimensions.length, 43); assert.equal(document.functionalDimensionPlan.requests.length, 46);
});

for (const width of [900, 1000, 1100]) for (const count of [1, 3, 4, 8]) test(`${width} mm / ${count} drawers: full contextual coverage and unchanged engineering/BOM`, () => {
  const { document, plan } = fixture(s => { s.dimensions.width = width; s.drawerCount = count; if (count === 8) s.dimensions.height = 1600; });
  assert.equal(document.reconciliation.panelQuantity, 5 + 6 * count); assert.equal(document.componentDimensionPlan.dimensions.length, 3 * (5 + 6 * count));
  assert.equal(document.functionalContextPresentation!.assignments.length, count * 6 + 2); assert(document.functionalContextPresentation!.assignments.every(a => a.state === "placed"));
  assert.deepEqual(document.functionalContextPresentation!.diagnostics, []); assert.equal(displayFor(document, "front-gap").length, count === 1 ? 0 : 1);
  assert.equal(plan.sections[0].geometry.states.length, 5 + 6 * count); assert(document.sheets.every(s => !s.id.startsWith("FD-")));
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${profileId} / ${convention} / ${format}: readable referenced context without dimension/label/table collisions`, () => {
  const p = getDrawingProfile(profileId); p.sheet.format = format; p.sheet.projectionConvention = convention;
  const { document, plan } = fixture(() => {}, p);
  assert.deepEqual(document.functionalContextPresentation!.diagnostics, []); assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26);
  const markers = views(document).flatMap(v => v.sectionMarkers ?? []);
  assert.equal(new Set(markers.map(m => m.label)).size, markers.length);
  for (const marker of markers) {
    const target = views(document).find(v => v.id === marker.targetViewId); assert(target);
    if (marker.kind === "cutting-plane") { near(marker.from.y, plan.sections[0].definition.plane.coordinateMm); near(marker.to.y, marker.from.y); assert.deepEqual(marker.direction, { x: 0, y: -1 }); }
    else assert.deepEqual(marker.bounds, plan.views.find(v => v.id === marker.targetViewId)!.crop);
  }
  for (const sheet of document.sheets) for (const v of sheet.viewports.filter(v => v.functionalContext)) {
    assert.deepEqual(functionalContextCollisions(v), []);
    for (const other of sheet.viewports.filter(other => other.id !== v.id)) assert(!overlaps(v.frame, other.frame));
    if (sheet.assemblyPartsList) { const t = sheet.assemblyPartsList; assert(!overlaps(v.frame, { ...t.frame, height: t.titleHeight + t.headerHeight + t.rows.reduce((sum, r) => sum + r.height, 0) })); }
    for (const primitive of plotSectionMarkers(v)) assert(containsRect(v.frame, primitiveBounds(primitive)));
  }
  assert.equal(document.sheets.filter(s => s.id.startsWith("FC-")).length, format === "A4" ? 4 : format === "A1" ? 1 : 2);
  if (format === "A1") assert.equal(document.sheets.find(s => s.id === "DS-001")!.viewports.filter(v => v.functionalContext).length, 2);
});

test("dimension values follow changed height/depth, overlays, gap, drawer depth and unverified side-space input", () => {
  const { document } = fixture(s => {
    s.dimensions = { width: 1100, height: 950, depth: 550 }; s.construction.drawer.depth = 430; s.construction.back.rearInset = 14;
    s.construction.fronts.verticalGap = 4; s.construction.fronts.overlay.left = 17; s.construction.fronts.overlay.right = 16;
    s.hardware.runner.sideClearance = 14; s.hardware.runner.envelopeWidth = 14;
  });
  assert.equal(displayFor(document, "front-left-reveal")[0].valueMm, 3); assert.equal(displayFor(document, "front-right-reveal")[0].valueMm, 4);
  assert.equal(displayFor(document, "front-gap")[0].valueMm, 4); assert.equal(displayFor(document, "drawer-back-clearance")[0].valueMm, 100);
  assert.equal(displayFor(document, "back-rear-inset")[0].valueMm, 14); near(displayFor(document, "drawer-left-clearance")[0].valueMm, 14);
  assert.deepEqual(document.functionalContextPresentation!.diagnostics, []);
});

test("expanded company title blocks preserve linked view placement and quantity coverage", () => {
  for (const format of ["A4", "A3", "A1"] as const) {
    const p = getDrawingProfile(); p.sheet.format = format; p.titleBlock.companyName = "Example company";
    p.titleBlock.additionalFields = Array.from({ length: 3 }, (_, i) => ({ label: `Review ${i}`, value: "Preliminary only" }));
    const { document } = fixture(() => {}, p); assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26); assert.deepEqual(document.functionalContextPresentation!.diagnostics, []);
  }
});

test("equal display grouping checks actual face geometry and splits unequal values rather than trusting old rounded groups", () => {
  const { document } = fixture(), plan = structuredClone(document.functionalDimensionPlan), gapGroup = plan.displayGroups.find(g => g.kind === "front-gap")!;
  const request = plan.requests.find(r => r.id === gapGroup.requestIds[1])!, d = plan.dimensions.find(d => d.id === request.dimensionId)!;
  const to = plan.faces.find(f => f.id === d.measurement.toFaceId)!; to.coordinateMm += 0.01; d.valueMm += 0.01;
  const splits = verifiedFunctionalGroups(plan).filter(g => g.kind === "front-gap"); assert.equal(splits.length, 2);
  assert.deepEqual(splits.map(g => g.requestIds.length).sort(), [1, 2]); d.valueMm += 1;
  assert.throws(() => verifiedFunctionalGroups(plan), /contradicts source faces/);
});

test("contextual zero reveals are linked coincident-face notes, with no invented zero-length edge", () => {
  const { document } = fixture(s => { s.construction.fronts.edgeGap.left = 0; });
  const zero = displayFor(document, "front-left-reveal")[0]; assert.equal(zero.valueMm, 0);
  const v = views(document).find(v => v.id === zero.viewId)!; assert(v.functionalContext!.placedDisplayIds.includes(zero.id)); assert(!v.dimensions.some(d => d.id === zero.id));
  assert(v.functionalContext!.coincidentNotes.some(n => n.sourceId === zero.id && n.text.includes("Measured 0 mm")));
  assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 26);
});

test("hidden vertical or functional views retain explicit request-level missing coverage and never add FD sheets silently", () => {
  const p = getDrawingProfile(); p.contents.contextualSections = false;
  const { document } = fixture(() => {}, p); assert.equal(document.functionalDimensionCoverage.displayedRequestIds.length, 21);
  assert.equal(document.functionalDimensionCoverage.unplacedRequestIds.length, 5); assert(document.functionalContextPresentation!.assignments.filter(a => a.state === "unplaced").every(a => a.reason!.includes("hidden")));
  assert(document.sheets.every(s => !s.id.startsWith("FD-")));
  p.contents.functionalDimensions = false; const hidden = fixture(() => {}, p).document;
  assert.equal(hidden.functionalDimensionCoverage.displayedRequestIds.length, 0); assert.equal(hidden.functionalContextPresentation!.assignments.filter(a => a.state === "unplaced").length, 26);
});

test("over-constrained annotations remain traceable and explicitly deferred rather than falsely covered", () => {
  const { document, plan } = fixture(), v = views(document).find(v => v.functionalContext!.placedDisplayIds.length)!;
  const defs = plan.displays.filter(d => d.viewId === v.id), blocked = fitFunctionalContextView({ ...v, dimensions: [] }, defs, [v.frame]);
  assert.equal(blocked.functionalContext!.placedDisplayIds.length, 0); assert.equal(blocked.functionalContext!.deferredDisplayIds.length, defs.length);
  const modified = structuredClone(document.sheets); modified.find(s => s.viewports.some(x => x.id === v.id))!.viewports = modified.find(s => s.viewports.some(x => x.id === v.id))!.viewports.map(x => x.id === v.id ? blocked : x);
  const report = functionalContextPresentation(plan, document.functionalDimensionPlan, modified, true)!;
  assert(report.assignments.some(a => a.viewId === v.id && a.state === "unplaced")); assert(report.diagnostics.length > 0);
});

test("profiles retain older company settings and explicit diagnostic mode across save/load and numbering changes", () => {
  const p = getDrawingProfile(); p.contents.functionalPresentation = "isolated-edges";
  const r = generateFurniture(createDemoChestSpecification()); const old = generateDrawingDocument(r, p); assert.deepEqual(old.issues, []); assert(old.document);
  assert.equal(old.document.functionalContextPlan, null); assert.equal(old.document.sheets.filter(s => s.id.startsWith("FD-")).length, 2);
  delete p.contents.functionalPresentation; const migrated = parseDrawingProfile(p); assert(migrated.profile); assert.equal(migrated.profile.contents.functionalPresentation, undefined);
  assert.equal(generateDrawingDocument(r, migrated.profile).document!.sheets.filter(s => s.id.startsWith("FD-")).length, 2);
  assert.equal(parseDrawingProfile({ ...p, contents: { ...p.contents, functionalPresentation: "arbitrary-cad" } }).profile, null);
  const values = new Map<string, string>(), storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  p.contents.functionalPresentation = "contextual"; p.titleBlock.companyName = "Preserved company"; p.numbering.scheme = "sequential"; p.numbering.startAt = 37;
  assert(saveDrawingPreferences(storage, p, p.id).profile); const restored = loadDrawingPreferences(storage).profile!;
  assert.equal(restored.contents.functionalPresentation, "contextual"); assert.equal(restored.titleBlock.companyName, "Preserved company");
  const doc = fixture(() => {}, restored).document; assert.equal(doc.sheets[0].metadata.drawingNumber, "DRF-CD-037");
  assert.equal(new Set(doc.sheets.map(s => s.metadata.drawingNumber)).size, doc.sheets.length);
  for (const a of doc.functionalContextPresentation!.assignments) assert(doc.sheets.find(s => s.id === a.sheetId)!.viewports.some(v => v.id === a.viewId));
});

test("source geometry/BOM, clean GA and purchasing exclusions are unchanged by consolidation", () => {
  const { result, document } = fixture(), p = getDrawingProfile(); p.contents.functionalPresentation = "isolated-edges";
  const legacy = generateDrawingDocument(result, p).document!;
  assert.deepEqual(document.sheets.find(s => s.id === "GA-001")!.viewports, legacy.sheets.find(s => s.id === "GA-001")!.viewports);
  assert.deepEqual(document.componentSchedule, legacy.componentSchedule); assert.deepEqual(document.cuttingList, legacy.cuttingList);
  assert.deepEqual(document.hardware, legacy.hardware); assert.equal(document.manufacturingReady, false); assert.equal(document.complianceVerified, false);
  assert.deepEqual(document.hardware.allowances.map(a => a.quantity).sort((a,b) => a-b), [8,8,160]); assert(document.hardware.allowances.every(a => a.purchasingQuantity === 0 && !a.purchasingEligible));
});

test("stable source/display/section IDs survive size edits and source reordering; stale and corrupted packages are rejected", async () => {
  const original = fixture(), changed = fixture(s => { s.dimensions.width = 1100; });
  assert.deepEqual(original.plan.displays.map(d => d.id), changed.plan.displays.map(d => d.id)); assert.deepEqual(original.plan.views.map(v => v.id), changed.plan.views.map(v => v.id));
  assert.equal(generateDrawingDocument(changed.result, original.document.profile, original.document.gaPlan).document, null);
  const reordered = structuredClone(original.result); reordered.components.reverse(); reordered.assemblies.reverse(); reordered.bom.reverse(); reordered.assemblies.forEach(a => a.componentIds.reverse()); reordered.bom.forEach(b => b.componentIds.reverse());
  const functional = createFunctionalDimensionPlan(reordered, original.document.profile), section = createContextualSectionPlan(reordered, original.document.profile, functional);
  assert.deepEqual(createFunctionalContextPlan(reordered, original.document.profile, functional, section), original.plan);
  const corruptions: ((d: DrawingDocument) => void)[] = [
    d => { d.functionalContextPlan!.binding.engineeringRevision += "stale"; }, d => { d.functionalContextPlan!.sections[0].definition.plane.coordinateMm++; },
    d => { d.functionalContextPlan!.displays[0].valueMm++; }, d => { d.functionalContextPlan!.displays[0].members[0].from.x++; },
    d => { d.functionalContextPlan!.views[0].entities[0].from.x++; }, d => { d.functionalContextPresentation!.assignments.pop(); },
    d => { views(d)[0].sectionMarkers![0].targetViewId = "missing"; }, d => { views(d).find(v => v.dimensions.length)!.dimensions[0].valueMm++; },
    d => { d.sheets = d.sheets.filter(s => s.id !== "FC-001"); }, d => { views(d).find(v => v.functionalContext!.cutFaces.length)!.functionalContext!.cutFaces.pop(); },
  ];
  for (const corrupt of corruptions) { const copy = structuredClone(original.document); corrupt(copy); assert(validateGADocument(copy).length); assert.throws(() => plotSheet(copy, copy.sheets[0])); await assert.rejects(exportDrawingPDF(copy)); }
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId} / ${convention}: browser/PDF vector parity for contextual outlines, hatch, dimensions and references`, async () => {
  const p: DrawingProfile = getDrawingProfile(profileId); p.sheet.projectionConvention = convention;
  const { document } = fixture(() => {}, p), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length); assert(!pdf.context.enumerateIndirectObjects().some(([,s]) => s instanceof PDFRawStream && s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const [i, sheet] of document.sheets.entries()) {
    if (!sheet.viewports.some(v => v.functionalContext || v.id === "context-detail-B")) continue;
    const contents = pdf.getPages()[i].node.Contents(); assert(contents instanceof PDFArray);
    const content = contents.asArray().map(ref => pdf.context.lookup(ref)).map(s => { assert(s instanceof PDFRawStream); return new TextDecoder().decode(decodePDFRawStream(s).decode()); }).join("\n");
    const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
    for (const e of plotSheet(document, sheet)) {
      if (e.kind === "line" && e.sourceId) { const expected = [e.from.x * MM_TO_PT, (sheet.heightMm - e.from.y) * MM_TO_PT, e.to.x * MM_TO_PT, (sheet.heightMm - e.to.y) * MM_TO_PT]; assert(paths.some(path => path.every((n,j) => Math.abs(n - expected[j]) < 1e-6))); }
      if (e.kind === "text" && e.sourceId) assert(content.includes(Buffer.from(e.text).toString("hex").toUpperCase()));
    }
  }
});
