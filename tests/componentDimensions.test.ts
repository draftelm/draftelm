import { getPreFunctionalProfile as getDrawingProfile } from "./drawingFixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import type { FurnitureResult } from "../src/furniture";
import { componentDimensionCollisions, componentDimensionId, componentFacePoint, createComponentDimensionPlan, DEFAULT_COMPONENT_DIMENSION_STYLE, fitComponentDimensions, generateDrawingDocument, placeComponentDimensions, plotSheet, validateComponentDimensionPlan, validateGADocument } from "../src/drawings";
import type { ComponentDimensionPlan, DrawingDocument } from "../src/drawings";
import { componentFaceViewport } from "../src/drawings/planning/componentDimensions";
import { componentDimensionCoverage } from "../src/drawings/componentDimensionLayout";
import { containsRect, primitiveBounds } from "../src/drawings/annotationGeometry";
import { modelToSheet, plotDimension } from "../src/drawings/dimensionPlot";
import { positionViewport } from "../src/drawings/viewports";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";

const axes = ["x", "y", "z"] as const;
const kinds = ["length", "width", "thickness"] as const;
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fixture(width = 900, count = 4, profile = getDrawingProfile(), source?: FurnitureResult) {
  const specification = createDemoChestSpecification(); specification.dimensions.width = width; specification.drawerCount = count;
  if (count > 4) specification.dimensions.height = count * 220;
  const result = source ?? generateFurniture(specification), output = generateDrawingDocument(result, profile);
  assert(output.document, output.issues.join("; "));
  return { result, document: output.document, plan: output.document.componentDimensionPlan };
}
const componentViews = (d: DrawingDocument) => d.sheets.flatMap(s => s.viewports).filter(v => v.projection === "panel-face");
function laidOutFace() {
  const { plan } = fixture(), group = plan.groups.find(g => g.componentIds.includes("chest/carcass/top"))!;
  return { plan, group, view: { ...componentFaceViewport(plan, group, true), frame: { x: 10, y: 28, width: 240, height: 180 }, origin: { x: 60, y: 130 }, scale: 0.1, scaleLabel: "1:10" } };
}

test("all 29 panel occurrences have three unique source-bound nominal geometry measurements and seven blank groups", () => {
  const { result, document, plan } = fixture(), panels = result.components.filter(p => p.kind === "panel");
  assert.equal(plan.dimensions.length, 87); assert.equal(plan.groups.length, 7);
  assert.equal(new Set(plan.dimensions.map(d => d.id)).size, 87);
  assert.equal(plan.binding.engineeringRevision, result.specificationRevision);
  assert.equal(plan.coverageScope, "nominal-rectangular-blanks-only");
  assert.deepEqual(plan.groups.flatMap(g => g.componentIds).sort(), panels.map(p => p.id).sort());
  for (const panel of panels) {
    const dimensions = plan.dimensions.filter(d => d.reference.componentId === panel.id);
    assert.deepEqual(dimensions.map(d => d.kind).sort(), [...kinds].sort());
    for (const d of dimensions) {
      assert.equal(d.valueMm, panel.dimensions[d.measurement.axis]); assert.equal(d.unit, "mm");
      assert.deepEqual(d.measurement.from, panel.position);
      near(d.measurement.to[d.measurement.axis] - d.measurement.from[d.measurement.axis], d.valueMm);
      assert.equal(d.reference.assemblyId, panel.assemblyId);
      assert(result.bom.some(b => b.id === d.reference.bomId && b.componentIds.includes(panel.id)));
      assert.equal(d.tolerance, "unspecified"); assert.equal(d.manufacturingDatum, "not-assessed");
      assert.equal(d.meaning, "nominal-rectangular-blank");
    }
    const thickness = dimensions.find(d => d.kind === "thickness")!;
    assert.equal(thickness.measurement.axis, panel.thicknessAxis); assert.equal(thickness.valueMm, panel.thickness);
  }
  assert.equal(document.componentDimensionCoverage.displayedDimensionIds.length, 87);
  assert.deepEqual(document.componentDimensionCoverage.missingDimensionIds, []);
});

test("grouped drawings display two geometric dimensions and an explicitly linked thickness note without duplicate measurements", () => {
  const { result, document, plan } = fixture(), views = componentViews(document);
  assert.equal(views.length, 7);
  const covered: string[] = [];
  for (const view of views) {
    const group = plan.groups.find(g => g.id === view.semanticViewId)!;
    assert.equal(view.dimensions.length, 2); assert.deepEqual(view.dimensions.map(d => d.axis), ["horizontal", "vertical"]);
    for (const dimension of view.dimensions) {
      assert(dimension.semanticDimensionId); assert.equal(dimension.id, dimension.semanticDimensionId);
      assert.equal(dimension.placement?.status, "placed"); assert.equal(dimension.references.length, group.componentIds.length);
      assert.deepEqual(dimension.equivalentDimensionIds!.map(id => plan.dimensions.find(d => d.id === id)!.valueMm), group.componentIds.map(() => dimension.valueMm));
      covered.push(...dimension.equivalentDimensionIds!);
    }
    const thickness = view.thicknessDimension!; assert.equal(thickness.presentation, "normal-to-face-note");
    assert.equal(thickness.status, "placed"); covered.push(...thickness.equivalentDimensionIds);
    assert(!view.dimensions.some(d => d.semanticDimensionId === thickness.id));
    assert(!view.annotations.some(n => n.includes("Thickness")), "thickness is one linked annotation, not a duplicate free-text value");
    const sheet = document.sheets.find(s => s.viewports.includes(view))!;
    const note = plotSheet(document, sheet).find(e => e.kind === "text" && e.sourceId === thickness.id);
    assert(note?.kind === "text" && note.text === `Thickness ${thickness.valueMm} mm (normal to face)`);
    assert.deepEqual(note.references, view.references);
  }
  assert.equal(new Set(covered).size, 87); assert.equal(covered.length, 87);
  assert.equal(document.cuttingList.reduce((sum, row) => sum + row.quantity, 0), 29);
  assert.deepEqual(document.hardware.allowances.map(a => a.quantity).sort((a, b) => a - b), [8, 8, 160]);
  assert(document.hardware.allowances.every(a => a.purchasingQuantity === 0 && !a.purchasingEligible));
  assert.deepEqual(document.hardware.approvedPurchasingItems, []);
  assert.equal(document.manufacturingReady, false); assert.equal(document.complianceVerified, false);
  assert.equal(result.components.filter(p => p.kind === "panel").length, 29);
});

for (const width of [900, 1000, 1100]) for (const count of [1, 3, 4, 8]) test(`${width} mm / ${count} drawers: exact geometry, complete nominal coverage and stable surviving occurrence IDs`, () => {
  const { result, document, plan } = fixture(width, count), previous = fixture().plan;
  assert.equal(plan.dimensions.length, (5 + 6 * count) * 3);
  assert.equal(document.componentDimensionCoverage.missingDimensionIds.length, 0);
  for (const d of plan.dimensions) {
    assert.equal(d.id, componentDimensionId(d.reference.componentId, d.kind));
    const old = previous.dimensions.find(v => v.reference.componentId === d.reference.componentId && v.kind === d.kind);
    if (old) assert.equal(d.id, old.id);
  }
  for (const row of document.cuttingList) {
    const view = componentViews(document).find(v => v.references[0].bomId === row.bomId)!;
    assert.deepEqual(view.dimensions.map(d => d.valueMm), [row.cutSize!.length, row.cutSize!.width]);
    assert.equal(view.thicknessDimension!.valueMm, row.cutSize!.thickness);
  }
  const before = JSON.stringify(result); componentViews(document).forEach(v => componentDimensionCollisions(v));
  assert.equal(JSON.stringify(result), before);
});

test("semantic identities and representative frames survive source reordering and transient BOM ID changes", () => {
  const { result, plan } = fixture(), reordered = structuredClone(result);
  reordered.components.reverse(); reordered.bom.reverse(); reordered.assemblies.reverse();
  reordered.bom.forEach(b => b.componentIds.reverse());
  assert.deepEqual(createComponentDimensionPlan(reordered, getDrawingProfile()), plan);
  reordered.bom.forEach((b, i) => { b.id = `reidentified-${i}`; });
  const next = fixture(900, 4, getDrawingProfile(), reordered).plan;
  assert.deepEqual(next.dimensions.map(d => d.id), plan.dimensions.map(d => d.id));
  assert.deepEqual(next.groups.map(g => g.id), plan.groups.map(g => g.id));
  assert(next.dimensions.every(d => d.reference.bomId!.startsWith("reidentified-")));
});

test("a shared blank across different assembly orientations retains each source frame and measured axis", () => {
  const s = createDemoChestSpecification(); s.panels.drawerFront = { ...s.panels.carcass }; s.drawerCount = 1; s.dimensions.height = 504;
  s.construction.fronts.edgeGap.left = 0; s.construction.fronts.edgeGap.right = 0;
  const { result, plan, document } = fixture(900, 1, getDrawingProfile(), generateFurniture(s));
  const group = plan.groups.find(g => g.componentIds.includes("chest/carcass/top"))!;
  assert.equal(group.componentIds.length, 3); assert.equal(group.quantity, 3);
  assert.equal(new Set(group.occurrences.map(o => o.normal)).size, 2);
  for (const occurrence of group.occurrences) {
    const panel = result.components.find(p => p.id === occurrence.componentId)!; assert(panel.kind === "panel");
    assert.equal(occurrence.normal, panel.thicknessAxis);
    assert.equal(plan.dimensions.find(d => d.id === occurrence.dimensionIds.thickness)!.valueMm, 18);
  }
  const view = componentViews(document).find(v => v.semanticViewId === group.id)!;
  const corner = componentFacePoint(group, view.bounds.max), representative = result.components.find(p => p.id === group.representativeId)!;
  assert(representative.kind === "panel");
  for (const axis of axes) near(corner[axis], representative.position[axis] + (axis === representative.thicknessAxis ? 0 : representative.dimensions[axis]));
});

test("equal face lengths choose deterministic model axes without declaring grain or inspection datums", () => {
  const s = createDemoChestSpecification(); s.drawerCount = 1; s.dimensions = { width: 500, height: 536, depth: 500 };
  const { plan } = fixture(500, 1, getDrawingProfile(), generateFurniture(s));
  const group = plan.groups.find(g => g.componentIds.includes("chest/carcass/top"))!;
  assert.equal(group.componentIds.length, 4);
  for (const frame of group.occurrences) assert(axes.indexOf(frame.u) < axes.indexOf(frame.v));
  assert(plan.dimensions.every(d => d.manufacturingDatum === "not-assessed"));
});

test("thickness edits resolve from the actual thin axis for every nonrepresentative member", () => {
  const s = createDemoChestSpecification(); s.dimensions = { width: 1100, height: 1000, depth: 600 };
  s.panels.carcass.thickness = 20; s.panels.back.thickness = 8; s.panels.drawerWall.thickness = 15; s.panels.drawerBottom.thickness = 8; s.panels.drawerFront.thickness = 22;
  const { result, plan } = fixture(1100, 4, getDrawingProfile(), generateFurniture(s));
  for (const d of plan.dimensions.filter(d => d.kind === "thickness")) {
    const panel = result.components.find(p => p.id === d.reference.componentId)!; assert(panel.kind === "panel");
    assert.equal(d.valueMm, panel.dimensions[panel.thicknessAxis]); assert.equal(d.valueMm, panel.thickness);
  }
});

test("physical face axes and occurrence dimension IDs survive long/short edge swaps", () => {
  const original = fixture().plan, changed = fixture(400).plan;
  const frame = (p: ComponentDimensionPlan) => p.groups.flatMap(g => g.occurrences).find(o => o.componentId === "chest/carcass/base")!;
  const a = frame(original), b = frame(changed);
  assert.deepEqual([a.u, a.v, a.normal], [b.u, b.v, b.normal]);
  assert.notEqual(a.displayAxes.horizontal, b.displayAxes.horizontal);
  assert.deepEqual(a.dimensionIds, b.dimensionIds);
  assert.equal(original.dimensions.find(d => d.id === a.dimensionIds.length)!.measurement.axis, "x");
  assert.equal(changed.dimensions.find(d => d.id === b.dimensionIds.length)!.measurement.axis, "z");
});

test("plans are immutable and reject changed engineering revisions, geometry snapshots, profiles and tampered cached values", () => {
  const { result, plan } = fixture(), profile = getDrawingProfile(), before = JSON.stringify(result), settings = JSON.stringify(profile);
  const resolved = createComponentDimensionPlan(result, profile);
  assert(Object.isFrozen(resolved)); assert(Object.isFrozen(resolved.dimensions[0].measurement.to));
  assert.equal(JSON.stringify(result), before); assert.equal(JSON.stringify(profile), settings);
  assert.deepEqual(validateComponentDimensionPlan(plan, result, profile), []);
  assert(validateComponentDimensionPlan(plan, fixture(1000).result, profile).length);
  const revision = structuredClone(result); revision.specificationRevision += " "; assert(validateComponentDimensionPlan(plan, revision, profile).length);
  const moved = structuredClone(result); moved.components[0].position.x += 1; assert(validateComponentDimensionPlan(plan, moved, profile).length);
  profile.titleBlock.projectName = "Changed"; assert(validateComponentDimensionPlan(plan, result, profile).length);
  const copy: ComponentDimensionPlan = structuredClone(plan); copy.dimensions[0].valueMm++; assert(validateComponentDimensionPlan(copy, result, getDrawingProfile()).length);
});

test("paper placement uses projected extents and can switch to top/right when reserved regions block bottom/left", () => {
  const { view } = laidOutFace();
  const obstacles = [{ x: 56, y: 131, width: 100, height: 22 }, { x: 37, y: 76, width: 22, height: 60 }];
  const placed = placeComponentDimensions(view, DEFAULT_COMPONENT_DIMENSION_STYLE, obstacles);
  assert.deepEqual(placed.dimensions.map(d => d.placement?.status === "placed" ? d.placement.side : "unplaced"), ["top", "right"]);
  assert.deepEqual(componentDimensionCollisions(placed, obstacles), []);
  for (const d of placed.dimensions) {
    const a = modelToSheet(placed, d.from), b = modelToSheet(placed, d.to);
    near(Math.hypot(b.x - a.x, b.y - a.y), d.valueMm * placed.scale);
  }
});

test("short projected spans use outside arrows without changing measured values or shrinking text", () => {
  const { view } = laidOutFace(); view.scale = 0.005; view.scaleLabel = "1:200";
  const placed = placeComponentDimensions(view);
  assert(placed.dimensions.every(d => d.placement?.status === "placed" && d.placement.arrows === "outside"));
  assert.deepEqual(componentDimensionCollisions(placed), []);
  assert.deepEqual(placed.dimensions.map(d => d.valueMm), [900, 500]);
  for (const d of placed.dimensions) assert(plotDimension(placed, d).some(e => e.kind === "text" && e.size === 2.5));
});

test("collision checks detect outlines, labels/reserved regions, competing dimensions and clipping", () => {
  const { view } = laidOutFace(), placed = placeComponentDimensions(view);
  assert.deepEqual(componentDimensionCollisions(placed), []);
  const outline = structuredClone(placed); outline.dimensions[0].offsetPaperMm = 0; assert(componentDimensionCollisions(outline).length);
  const duplicate = structuredClone(placed); duplicate.dimensions[1] = { ...duplicate.dimensions[0], id: "duplicate" }; assert(componentDimensionCollisions(duplicate).some(i => i.includes("dimensions overlap")));
  assert(componentDimensionCollisions(placed, [{ ...placed.frame }]).length);
  const clipped = structuredClone(placed); clipped.origin.x -= 100; assert(componentDimensionCollisions(clipped).length);
});

test("scale fitting retries conventional reductions while retaining model geometry, IDs and readable values", () => {
  const { view } = laidOutFace(); view.frame = { x: 10, y: 28, width: 125, height: 100 };
  const initial = positionViewport(view), style = { ...DEFAULT_COMPONENT_DIMENSION_STYLE, clearanceMm: 25, lanes: 1 };
  const fitted = fitComponentDimensions(view, style);
  assert(fitted.scale < initial.scale); assert.deepEqual(fitted.componentDimensionLayout!.diagnostics, []);
  assert.deepEqual(fitted.entities, view.entities); assert.deepEqual(fitted.dimensions.map(d => d.valueMm), view.dimensions.map(d => d.valueMm));
  assert.deepEqual(componentDimensionCollisions(fitted), []);
});

test("impossible placement retains all semantic requests and reports diagnostics instead of drawing false dimensions", () => {
  const { view, plan } = laidOutFace(), blocked = placeComponentDimensions(view, DEFAULT_COMPONENT_DIMENSION_STYLE, [view.frame]);
  assert(blocked.dimensions.every(d => d.placement?.status === "unplaced")); assert.equal(blocked.thicknessDimension!.status, "unplaced");
  assert.equal(blocked.componentDimensionLayout!.diagnostics.length, 3);
  assert(blocked.dimensions.every(d => plotDimension(blocked, d).length === 0));
  const coverage = componentDimensionCoverage(plan, [blocked], true);
  assert.equal(coverage.displayedDimensionIds.length, 0); assert.equal(coverage.diagnostics.length, 3);
  assert(coverage.diagnostics.every(d => d.dimensionIds.length === view.references.length));
});

test("future company presentation styles affect layout only and invalid styles fail explicitly", () => {
  const { view } = laidOutFace(), before = JSON.stringify(view);
  const placed = placeComponentDimensions(view, { ...DEFAULT_COMPONENT_DIMENSION_STYLE, id: "company-example", textSizeMm: 3, arrowLengthMm: 3 });
  assert(placed.dimensions.every(d => d.placement?.status === "placed" && d.placement.style.textSizeMm === 3));
  assert.equal(JSON.stringify(view), before); assert.deepEqual(placed.dimensions.map(d => d.valueMm), [900, 500]);
  for (const style of [{ ...DEFAULT_COMPONENT_DIMENSION_STYLE, textSizeMm: 1 }, { ...DEFAULT_COMPONENT_DIMENSION_STYLE, lanes: Infinity }]) assert.throws(() => placeComponentDimensions(view, style));
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${profileId} / ${convention} / ${format}: component dimensions fit view/sheet bands with complete coverage`, () => {
  const profile = getDrawingProfile(profileId); profile.sheet = { format, projectionConvention: convention };
  profile.titleBlock.companyName = "Example"; profile.titleBlock.additionalFields = [{ label: "Author", value: "Example" }, { label: "Project", value: "Example" }, { label: "Checked", value: "Example" }];
  const { document } = fixture(1100, 8, profile);
  assert.deepEqual(document.componentDimensionCoverage.missingDimensionIds, []);
  for (const view of componentViews(document)) assert.deepEqual(componentDimensionCollisions(view), []);
  for (const s of document.sheets.filter(s => s.id.startsWith("CP-"))) for (const e of plotSheet(document, s)) assert(containsRect({ x: 10 - 1e-6, y: 10 - 1e-6, width: s.widthMm - 20 + 2e-6, height: s.heightMm - 20 + 2e-6 }, primitiveBounds(e)), `${s.id}: ${JSON.stringify(e)}`);
});

test("hiding component drawings preserves all identities while reporting missing display coverage", () => {
  const profile = getDrawingProfile(); profile.contents.componentDrawings = false;
  const { document, plan } = fixture(900, 4, profile);
  assert.equal(plan.dimensions.length, 87); assert.equal(componentViews(document).length, 0);
  assert.equal(document.componentDimensionCoverage.missingDimensionIds.length, 87);
  assert.equal(document.componentDimensionCoverage.diagnostics[0].code, "component-drawings-hidden");
  assert.equal(document.reconciliation.panelQuantity, 29); assert.equal(document.manufacturingReady, false);
});

test("render and PDF reject stale component semantics, false thickness notes, detached dimensions and altered layout/coverage", async () => {
  const { document } = fixture();
  const corruptions: ((d: DrawingDocument) => void)[] = [
    d => { d.componentDimensionPlan.dimensions[0].valueMm++; },
    d => { d.componentDimensionPlan.binding.engineeringRevision += "stale"; },
    d => { componentViews(d)[0].dimensions[0].valueMm++; },
    d => { componentViews(d)[0].dimensions[0].references[0].bomId = "missing"; },
    d => { componentViews(d)[0].thicknessDimension!.valueMm++; },
    d => { componentViews(d)[0].dimensions[0].offsetPaperMm = 0; },
    d => { componentViews(d)[0].origin.x++; },
    d => { componentViews(d)[0].componentDimensionLayout!.diagnostics.push({ code: "no-readable-placement", dimensionIds: [], message: "invented" }); },
    d => { d.componentDimensionCoverage.displayedDimensionIds.pop(); },
    d => { d.sheets.find(s => s.id === "CP-001")!.viewports.pop(); },
    d => { componentViews(d)[0].entities[0].to.x++; },
  ];
  for (const corrupt of corruptions) {
    const copy = structuredClone(document); corrupt(copy); assert(validateGADocument(copy).length);
    assert.throws(() => plotSheet(copy, copy.sheets[0])); await assert.rejects(exportDrawingPDF(copy));
  }
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId} / ${convention}: per-page PDF dimensions/outlines equal browser vector plots`, async () => {
  const profile = getDrawingProfile(profileId); profile.sheet.projectionConvention = convention;
  const { document } = fixture(1000, 3, profile), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length);
  assert(!pdf.context.enumerateIndirectObjects().some(([, value]) => value instanceof PDFRawStream && value.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const [i, sheet] of document.sheets.entries()) {
    if (!sheet.id.startsWith("CP-")) continue;
    const contents = pdf.getPages()[i].node.Contents(); assert(contents instanceof PDFArray);
    const content = contents.asArray().map(ref => pdf.context.lookup(ref)).map(value => { assert(value instanceof PDFRawStream); return new TextDecoder().decode(decodePDFRawStream(value).decode()); }).join("\n");
    const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
    const primitives = plotSheet(document, sheet);
    for (const e of primitives.filter(e => e.kind === "line" && ["geometry", "dimension"].includes(e.role))) {
      assert(e.kind === "line"); const expected = [e.from.x * MM_TO_PT, (sheet.heightMm - e.from.y) * MM_TO_PT, e.to.x * MM_TO_PT, (sheet.heightMm - e.to.y) * MM_TO_PT];
      assert(paths.some(path => path.every((v, j) => Math.abs(v - expected[j]) < 1e-6)), sheet.id);
    }
    for (const e of primitives.filter(e => e.kind === "text" && e.sourceId?.startsWith("component-dimension:"))) {
      assert(e.kind === "text"); assert(content.includes(Buffer.from(e.text).toString("hex").toUpperCase()));
    }
    const arrows = primitives.filter(e => e.kind === "polygon" && e.sourceId?.startsWith("component-dimension:"));
    assert.equal(arrows.length, sheet.viewports.length * 4); assert(arrows.every(e => e.references?.length));
  }
});
