import { getPanelRegressionProfile as getDrawingProfile } from "./drawingFixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { createGeneralAssemblyPlan, generateDrawingDocument,  plotSheet, validateGADocument, validateGeneralAssemblyPlan } from "../src/drawings";
import type { DrawingDocument, DrawingProfile, GeneralAssemblyPlan } from "../src/drawings";
import type { FurnitureResult } from "../src/furniture";
import { canonicalDrawingSnapshot, presentGADimensions } from "../src/drawings/planning/gaPlan";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";
import { primitiveBounds, containsRect, overlaps } from "../src/drawings/annotationGeometry";
import { projectPoint } from "../src/drawings/projections";

const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fixture(profile = getDrawingProfile(), result = generateFurniture(createDemoChestSpecification())) {
  const output = generateDrawingDocument(result, profile); assert(output.document, output.issues.join(" "));
  return { result, profile, document: output.document, plan: output.document.gaPlan };
}
const dimensions = (plan: GeneralAssemblyPlan) => plan.dimensions.map(d => [d.id, d.valueMm]);
const ids = ["overall-width", "overall-height", "carcass-depth", "overall-depth"];

test("GA plan has four stable semantic dimensions, explicit source identity and model-space references", () => {
  const { result, plan } = fixture();
  assert.equal(plan.schemaVersion, 1); assert.equal(plan.source.family, "drawer-chest");
  assert.equal(plan.source.rootAssemblyId, "chest"); assert.equal(plan.source.carcassAssemblyId, "chest/carcass");
  assert.equal(plan.source.engineeringRevision, result.specificationRevision);
  assert.deepEqual(dimensions(plan), [["overall-width", 900], ["overall-height", 850], ["carcass-depth", 500], ["overall-depth", 518]]);
  assert.deepEqual(plan.coverage.displayedDimensionIds, ids); assert.deepEqual(plan.coverage.missingDimensionIds, []);
  assert.equal(plan.coverage.scope, "four-nominal-GA-dimensions-only");
  assert(Object.isFrozen(plan)); assert(Object.isFrozen(plan.dimensions));
  for (const d of plan.dimensions) {
    assert.equal(d.unit, "mm"); assert.equal(d.referenceContext.frame, "engine-global-mm"); assert.equal(d.referenceContext.datumSystem, "not-assessed");
    assert.deepEqual(d.tolerance, { state: "unspecified" });
    assert(!("scale" in d) && !("offsetPaperMm" in d) && !("textPosition" in d));
    const axis = d.measurement.axis;
    near(d.anchors.to.point[axis] - d.anchors.from.point[axis], d.valueMm);
    for (const [side, anchor] of Object.entries(d.anchors)) {
      const panel = result.components.find(c => c.id === anchor.reference.componentId)!; assert(panel.kind === "panel");
      assert(d.measurement[side as "from" | "to"].componentIds.includes(panel.id));
      assert.equal(anchor.reference.assemblyId, panel.assemblyId);
      assert(result.bom.some(line => line.id === anchor.reference.bomId && line.componentIds.includes(panel.id)));
      for (const a of ["x", "y", "z"] as const) near(anchor.point[a], panel.position[a] + (anchor.corner[a] === "max" ? panel.dimensions[a] : 0));
    }
  }
});

for (const changes of [{ width: 1100 }, { height: 1000 }, { depth: 600 }]) test(`${JSON.stringify(changes)} regenerates values/references and rejects a reused stale plan`, () => {
  const old = fixture(), s = createDemoChestSpecification(); Object.assign(s.dimensions, changes);
  const result = generateFurniture(s);
  assert(validateGeneralAssemblyPlan(old.plan, result, old.profile).some(i => i.includes("Stale GA plan")));
  const stale = generateDrawingDocument(result, old.profile, old.plan); assert.equal(stale.document, null);
  const current = fixture(old.profile, result);
  assert.deepEqual(current.plan.dimensions.map(d => d.id), ids);
  assert.deepEqual(current.plan.dimensions.map(d => d.valueMm), [s.dimensions.width, s.dimensions.height, s.dimensions.depth, s.dimensions.depth + s.panels.drawerFront.thickness]);
  assert.notEqual(current.plan.binding.sourceSnapshot, old.plan.binding.sourceSnapshot);
  assert.deepEqual(validateGADocument(current.document), []);
});

test("position and quantity changes cannot reuse a plan even if the engineering revision string was left unchanged", () => {
  const { result, profile, plan } = fixture();
  const moved = structuredClone(result); moved.components[0].position.x += 1;
  assert(validateGeneralAssemblyPlan(plan, moved, profile).length);
  const changed = structuredClone(result); changed.bom[0].quantity++;
  assert.equal(generateDrawingDocument(changed, profile, plan).document, null);
});

test("profile presentation, visibility, numbering and company metadata are all revision-bound", () => {
  const { result, profile, plan } = fixture();
  const changes: ((p: DrawingProfile) => void)[] = [
    p => { p.sheet.projectionConvention = "first-angle"; }, p => { p.sheet.format = "A4"; },
    p => { p.titleBlock.companyName = "Example Joinery"; }, p => { p.numbering.revision = "B"; },
    p => { p.contents.assemblyViews = ["front"]; }, p => { p.annotations.itemNumberStyle = "prefixed"; },
    p => { p.contents.hardwareSchedule = false; },
  ];
  for (const change of changes) {
    const p = structuredClone(profile); change(p);
    assert(validateGeneralAssemblyPlan(plan, result, p).some(i => i.includes("Stale")));
    const regenerated = fixture(p, result);
    assert.deepEqual(dimensions(regenerated.plan), dimensions(plan));
  }
});

test("reordered source arrays retain plan identity, while a valid reusable plan is detached from caller objects", () => {
  const { result, profile, plan } = fixture(), reordered = structuredClone(result);
  reordered.components.reverse(); reordered.assemblies.reverse(); reordered.bom.reverse();
  reordered.assemblies.forEach(a => a.componentIds.reverse()); reordered.bom.forEach(line => line.componentIds.reverse());
  assert.deepEqual(validateGeneralAssemblyPlan(plan, reordered, profile), []);
  const candidate = structuredClone(plan), output = generateDrawingDocument(result, profile, candidate); assert(output.document);
  assert.deepEqual(output.document.gaPlan, plan); assert.notEqual(output.document.gaPlan, candidate);
  candidate.dimensions[0].valueMm = 123;
  assert.equal(output.document.gaPlan.dimensions[0].valueMm, 900);
});

test("unknown furniture policies and ambiguous/malformed source identities fail closed", () => {
  const { result } = fixture();
  const variants: FurnitureResult[] = [];
  const unknown = structuredClone(result), revision = JSON.parse(unknown.specificationRevision); revision.parameters.family = "future-wardrobe"; unknown.specificationRevision = JSON.stringify(revision); variants.push(unknown);
  const missing = structuredClone(result); missing.specificationRevision = "unidentified"; variants.push(missing);
  const cyclic = structuredClone(result); cyclic.assemblies.find(a => a.id === "chest/drawer-1")!.parentId = "chest/drawer-1"; variants.push(cyclic);
  for (const source of variants) { const output = createGeneralAssemblyPlan(source); assert.equal(output.plan, null); assert(output.issues.length); }
  assert(createGeneralAssemblyPlan(unknown).issues.some(i => i.includes("No registered GA policy")));
});

test("hidden supporting views retain all semantic values and identify missing preliminary coverage", async () => {
  const p = getDrawingProfile(); p.contents.assemblyViews = ["isometric"];
  const { plan, document } = fixture(p);
  assert.deepEqual(plan.coverage.missingDimensionIds, ids); assert.equal(plan.dimensions.length, 4);
  assert(plan.diagnostics.every(d => d.code === "hidden-required-view"));
  assert.equal(document.sheets[0].viewports.length, 1); assert.equal(document.sheets[0].viewports[0].dimensions.length, 0);
  assert(document.sheets[0].annotations[0].includes("0/4"));
  assert((await exportDrawingPDF(document)).length > 0); assert.equal(document.manufacturingReady, false);
  p.contents.assemblyViews = ["front"];
  const front = fixture(p).plan;
  assert.equal(front.policy.selectedPrimary, "front"); assert(front.diagnostics.some(d => d.code === "primary-view-hidden"));
  assert.deepEqual(front.coverage.missingDimensionIds, ["carcass-depth", "overall-depth"]);
  p.contents.assemblyViews = [];
  const none = fixture(p); assert.equal(none.plan.policy.selectedPrimary, null); assert(!none.document.sheets.some(s => s.id.startsWith("GA-")));
});

for (const template of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${template} ${convention} ${format}: dominant isometric, aligned supports, readable disjoint parts list and exact values`, () => {
  const p = getDrawingProfile(template); p.sheet = { format, projectionConvention: convention };
  const { document, plan } = fixture(p), sheet = document.sheets[0];
  assert.equal(plan.policy.selectedPrimary, "isometric");
  const primary = sheet.viewports.find(v => v.role === "primary")!;
  assert.equal(primary.projection, "isometric");
  for (const support of sheet.viewports.filter(v => v.role === "supporting")) assert(primary.frame.width * primary.frame.height > support.frame.width * support.frame.height);
  const front = sheet.viewports.find(v => v.projection === "front")!, top = sheet.viewports.find(v => v.projection === "top")!, side = sheet.viewports.find(v => v.projection === "right")!;
  assert.equal(front.scale, top.scale); assert.equal(front.scale, side.scale); assert.equal(front.origin.x, top.origin.x); assert.equal(front.origin.y, side.origin.y);
  assert.equal(top.frame.y > front.frame.y, convention === "first-angle"); assert.equal(side.frame.x < front.frame.x, convention === "first-angle");
  assert.deepEqual(sheet.viewports.flatMap(v => v.dimensions).map(d => [d.semanticDimensionId, d.valueMm]), dimensions(plan));
  if (format === "A3") { assert.equal(primary.scale, 0.1); assert.equal(front.scale, 0.05); assert(sheet.assemblyPartsList); }
  if (format === "A4") assert(document.sheets.some(s => s.id.startsWith("AP-")));
  for (const page of document.sheets) {
    if (page.assemblyPartsList) assert(page.viewports.every(v => !overlaps(v.frame, page.assemblyPartsList!.frame)));
    for (const primitive of plotSheet(document, page)) assert(containsRect({ x: 10 - 1e-6, y: 10 - 1e-6, width: page.widthMm - 20 + 2e-6, height: page.heightMm - 20 + 2e-6 }, primitiveBounds(primitive)), JSON.stringify(primitive));
  }
});

test("semantic dimensions project through one adapter without deriving values from isometric lengths", () => {
  const { document, plan } = fixture();
  assert.deepEqual(presentGADimensions(plan, "isometric"), []);
  for (const view of document.sheets[0].viewports) {
    assert.deepEqual(view.dimensions, presentGADimensions(plan, view.projection as "front"));
    for (const d of view.dimensions) {
      const semantic = plan.dimensions.find(s => s.id === d.semanticDimensionId)!;
      assert.deepEqual(d.from, projectPoint(semantic.anchors.from.point, view.projection as "front"));
      assert.deepEqual(d.to, projectPoint(semantic.anchors.to.point, view.projection as "front"));
      assert.equal(d.valueMm, semantic.valueMm);
    }
  }
});

test("tampered semantic plans, visible dimensions, geometry or profile bindings cannot render or export", async () => {
  const { result, profile, document } = fixture();
  const badPlan = structuredClone(document.gaPlan); badPlan.dimensions[0].valueMm = 999;
  assert(validateGeneralAssemblyPlan(badPlan, result, profile).some(i => i.includes("Invalid GA plan")));
  assert.equal(generateDrawingDocument(result, profile, badPlan).document, null);
  const changes: ((d: DrawingDocument) => void)[] = [
    d => { d.sheets[0].viewports[0].dimensions[0].valueMm = 999; },
    d => { d.sheets[0].viewports[0].dimensions.pop(); },
    d => { d.sheets[0].viewports[0].entities[0].from.x += 5; },
    d => { d.profile.titleBlock.companyName = "Different source"; },
    d => { d.specificationRevision = "stale-revision"; },
    d => { d.drawingAnnotations.anchors[0].point.x += 1000; },
  ];
  for (const change of changes) {
    const d = structuredClone(document); change(d);
    assert(validateGADocument(d).length); assert.throws(() => plotSheet(d, d.sheets[0])); await assert.rejects(exportDrawingPDF(d));
  }
  const changed = createDemoChestSpecification(); changed.dimensions.width = 1000;
  const current = fixture(profile, generateFurniture(changed)).document;
  assert.throws(() => plotSheet(current, document.sheets[0]), /does not belong/);
  assert.deepEqual(plotSheet(current, structuredClone(current.sheets[0])), plotSheet(current, current.sheets[0]));
});

for (const count of [1, 3, 6]) test(`${count} drawers retain source identity, four nominal measures, all occurrences and BOM reconciliation`, () => {
  const s = createDemoChestSpecification(); s.drawerCount = count; if (count > 4) s.dimensions.height = count * 220;
  const { result, document } = fixture(getDrawingProfile(), generateFurniture(s));
  assert.equal(document.gaPlan.views[0].sourceComponentIds.length, 5 + 6 * count);
  assert.equal(document.componentSchedule.flatMap(row => row.componentIds).length, result.components.length);
  assert.equal(document.cuttingList.reduce((sum, row) => sum + row.quantity, 0), 5 + 6 * count);
  assert(document.reconciliation.valid); assert.deepEqual(validateGADocument(document), []);
});

test("planning leaves engineering geometry/BOM and annotation identities untouched; no manufacturing variants or approvals are invented", () => {
  const result = generateFurniture(createDemoChestSpecification()), profile = getDrawingProfile(), before = canonicalDrawingSnapshot(result), profileBefore = JSON.stringify(profile);
  const { document } = fixture(profile, result);
  assert.equal(canonicalDrawingSnapshot(result), before); assert.equal(JSON.stringify(profile), profileBefore);
  assert(!Object.isFrozen(result)); assert(!Object.isFrozen(result.components[0]));
  assert.equal(document.gaPlan.manufacturingVariants, "not-assessed");
  assert.deepEqual(document.gaPlan.annotationReferences.itemKeys, document.drawingAnnotations.items.map(item => item.key));
  assert.deepEqual(document.gaPlan.annotationReferences.balloonIds, document.drawingAnnotations.balloons.map(b => b.id));
  assert.equal(document.gaPlan.views[0].sourceComponentIds.length, 29);
  assert.equal(document.drawingAnnotations.items.length, 7); assert.equal(document.sheets[0].balloons!.length, 3);
  assert.deepEqual(document.hardware.allowances.map(row => row.quantity).sort((a, b) => a - b), [8, 8, 160]);
  assert(document.hardware.allowances.every(row => !row.purchasingEligible && row.purchasingQuantity === 0)); assert.deepEqual(document.hardware.approvedPurchasingItems, []);
  assert.equal(document.gaPlan.manufacturingReady, false); assert.equal(document.gaPlan.complianceVerified, false);
});

test("PDF preserves semantic dimension values and plan-selected geometry as vector content", async () => {
  const { document, plan } = fixture(), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length);
  const streams = pdf.context.enumerateIndirectObjects().filter(([, v]) => v instanceof PDFRawStream).map(([, v]) => v as PDFRawStream);
  assert(!streams.some(s => s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  const content = streams.map(s => new TextDecoder().decode(decodePDFRawStream(s).decode())).join("\n");
  for (const d of plan.dimensions) assert(content.includes(Buffer.from(String(d.valueMm)).toString("hex").toUpperCase()));
  const view = document.sheets[0].viewports.find(v => v.projection === "front")!;
  const dim = view.dimensions.find(d => d.semanticDimensionId === "overall-width")!;
  const fromX = (view.origin.x + dim.from.x * view.scale) * MM_TO_PT, toX = (view.origin.x + dim.to.x * view.scale) * MM_TO_PT;
  const paths = [...content.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(m => m.slice(1).map(Number));
  assert(paths.some(p => Math.abs(p[0] - fromX) < 1e-6 && Math.abs(p[2] - toX) < 1e-6 && Math.abs(p[1] - p[3]) < 1e-6));
  near(Math.abs(toX - fromX), 45 * MM_TO_PT);
});
