import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { generateDrawingDocument, getDrawingProfile, plotSheet, parseDrawingProfile, validateGADocument, assessComposition } from "../src/drawings";
import { containsRect, balloonBounds, segmentsIntersect } from "../src/drawings/annotationGeometry";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";
import { createAssemblyScenes } from "../src/drawings/assemblySheets";
import { projectedPanelOverlaps } from "../src/drawings/planning/explosion";
import { translateDrawingPanels } from "../src/drawings/planning/assemblies";
import { resolveDrawingStyle } from "../src/drawings/style";
import { fitScale } from "../src/drawings/viewports";
import { getPreConsolidationProfile } from "./drawingFixtures";

function fixture(width = 900, height = 850, depth = 500, count = 4, profile = getDrawingProfile()) {
  const s = createDemoChestSpecification(); s.dimensions = { width, height, depth }; s.drawerCount = count;
  const source = generateFurniture(s), before = JSON.stringify(source), output = generateDrawingDocument(source, profile);
  assert(output.document, output.issues.join("; ")); assert.equal(JSON.stringify(source), before);
  return { source, d: output.document };
}
for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) for (const width of [900, 1000, 1100, 1200]) test(`${profileId}/${convention}/${width}: composed A3 view families, physical bounds, balloons and conserved source`, () => {
  const p = getDrawingProfile(profileId); p.sheet.projectionConvention = convention;
  const { source, d } = fixture(width, 850, 500, 4, p);
  assert.equal(d.sheets.length, 12); assert.equal(d.reconciliation.panelQuantity, 29); assert.equal(d.componentDimensionPlan.dimensions.length, 87);
  assert.equal(d.functionalDimensionCoverage.displayedRequestIds.length, 26); assert.equal(d.functionalDimensionCoverage.deferredRequestIds.length, 20);
  assert.deepEqual(d.functionalContextPresentation!.diagnostics, []);
  assert.deepEqual(d.compositionReport.diagnostics, []);
  const front = d.sheets.find(s => s.viewports.some(v => v.id === "functional-context-front"))!;
  assert.deepEqual(front.viewports.filter(v => v.functionalContext?.kind === "detail").map(v => v.label.split(" - ")[0]), ["DETAIL D", "DETAIL E", "DETAIL F"]);
  assert(front.viewports.filter(v => v.functionalContext?.kind === "detail").every(v => v.scale >= 0.4), "Small front relationships need enlarged readable separation even at 1200 mm cabinet width.");
  const horizontal = d.sheets.find(s => s.viewports.some(v => v.functionalContext?.kind === "section"))!;
  assert.deepEqual(horizontal.viewports.filter(v => v.functionalContext?.kind === "detail").map(v => v.label.split(" - ")[0]), ["DETAIL I", "DETAIL J"]);
  assert(d.sheets.some(s => s.viewports.some(v => v.id === "context-section-A-A") && s.viewports.some(v => v.id === "context-detail-B")));
  for (const scene of createAssemblyScenes(source, d.assemblyPlan)) {
    if (scene.scope.kind !== "exploded") assert.deepEqual(projectedPanelOverlaps(translateDrawingPanels(scene.panels, scene.explosion.offsets), 24.99), []);
    const sheet = d.sheets.find(s => s.id === scene.id)!;
    for (const b of sheet.balloons ?? []) {
      assert(containsRect({ x: 13, y: 13, width: sheet.widthMm - 26, height: sheet.heightMm - 26 }, balloonBounds(b.center)));
      const length = Math.hypot(b.leaderPoints[1].x - b.leaderPoints[0].x, b.leaderPoints[1].y - b.leaderPoints[0].y);
      assert(length < 40, `${scene.id}: leader unnecessarily long (${length})`);
    }
    for (const [i, b] of (sheet.balloons ?? []).entries()) for (const c of (sheet.balloons ?? []).slice(i + 1)) assert(!segmentsIntersect(b.leaderPoints[0], b.leaderPoints[1], c.leaderPoints[0], c.leaderPoints[1]));
  }
  assert.equal(d.manufacturingReady, false); assert.equal(d.complianceVerified, false);
  assert(d.hardware.allowances.every(a => a.purchasingQuantity === 0 && !a.purchasingEligible));
});
for (const [height, depth, count] of [[600, 450, 1], [1000, 550, 3], [1600, 600, 8], [2200, 650, 12]]) for (const width of [900, 1000, 1100, 1200]) test(`${width}/${height}/${depth}/${count}: parameter range retains fitted geometry and functional coverage`, () => {
  const { d } = fixture(width, height, depth, count);
  assert.equal(d.reconciliation.panelQuantity, 5 + 6 * count);
  assert.equal(d.componentDimensionPlan.dimensions.length, 3 * (5 + 6 * count));
  assert(d.functionalContextPresentation!.assignments.every(a => a.state === "placed"));
  assert.deepEqual(d.compositionReport.diagnostics.filter(d => d.code !== "poor-utilisation"), []);
});

test("composition diagnostics detect disturbed fitting, border margins, crossings and low utilisation without changing engineering coverage", () => {
  const { d } = fixture(), sheet = d.sheets.find(s => s.id === "EA-001")!, view = sheet.viewports[0];
  sheet.balloons![0].center.x = 12;
  sheet.balloons![0].leaderPoints = [{ x: 20, y: 30 }, { x: 40, y: 50 }];
  sheet.balloons![1].leaderPoints = [{ x: 20, y: 50 }, { x: 40, y: 30 }];
  view.origin.x = 500;
  view.scale = 0.001;
  const report = assessComposition(d.sheets), codes = report.diagnostics.map(d => d.code);
  assert(codes.includes("clipping")); assert(codes.includes("border-clearance")); assert(codes.includes("leader-crossing")); assert(codes.includes("poor-utilisation"));
  assert(validateGADocument(d).some(s => s.includes("composition diagnostics")));
  assert.equal(d.functionalDimensionCoverage.displayedRequestIds.length, 26);
});

test("conventional fitting chooses a uniform largest supported scale and larger context insets", () => {
  const { d } = fixture();
  const carcass = d.sheets.find(s => s.id === "CS-001")!, drawer = d.sheets.find(s => s.id === "DS-001")!;
  assert(carcass.viewports[0].scale >= 0.1); assert(drawer.viewports[0].scale >= 0.1);
  assert(drawer.viewports[0].scale <= drawer.viewports[1].scale * 2);
  const bounds = { min: { x: -200, y: -100 }, max: { x: 800, y: 400 } };
  assert.equal(fitScale(bounds, { x: 0, y: 0, width: 240, height: 130 }), 0.2);
  assert.equal(fitScale(bounds, { x: 0, y: 0, width: 130, height: 80 }), 0.05);
});

test("company style overrides round trip, reject unsafe values, retain old selections and preserve engineering meaning", () => {
  const p = getDrawingProfile("engineering"); p.presentation = { lineWeights: { "visible-outline": 0.5, dimension: 0.25 } };
  assert.deepEqual(parseDrawingProfile(p).profile, p);
  for (const width of [NaN, Infinity, -1, 0, 0.01, 4]) { const bad = structuredClone(p); bad.presentation!.lineWeights!.dimension = width; assert.equal(parseDrawingProfile(bad).profile, null); }
  assert.equal(parseDrawingProfile({ ...p, presentation: { lineWeights: { approval: 0.25 } } }).profile, null);
  const original = fixture(900, 850, 500, 4).d, styled = fixture(900, 850, 500, 4, p).d;
  assert.deepEqual(styled.cuttingList, original.cuttingList);
  assert.deepEqual(styled.componentDimensionPlan.dimensions, original.componentDimensionPlan.dimensions);
  assert.deepEqual(styled.functionalDimensionPlan.dimensions, original.functionalDimensionPlan.dimensions);
  assert.equal(resolveDrawingStyle(p).strokes["visible-outline"].width, 0.5);
  const legacy = fixture(900, 850, 500, 4, getPreConsolidationProfile()).d;
  assert(legacy.sheets.some(s => s.id.startsWith("FD-"))); assert.equal(legacy.functionalContextPlan, null);
});

for (const profileId of ["furniture-workshop", "engineering"]) for (const convention of ["first-angle", "third-angle"] as const) test(`${profileId}/${convention}: printed stroke, dash, text and vector PDF parity across view scales`, async () => {
  const p = getDrawingProfile(profileId); p.sheet.projectionConvention = convention;
  const { d } = fixture(900, 850, 500, 4, p), pdf = await PDFDocument.load(await exportDrawingPDF(d));
  assert.equal(pdf.getPageCount(), 12);
  assert(!pdf.context.enumerateIndirectObjects().some(([, s]) => s instanceof PDFRawStream && s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  for (const [i, sheet] of d.sheets.entries()) {
    const raw = pdf.getPages()[i].node.Contents(); assert(raw instanceof PDFArray);
    const content = raw.asArray().map(ref => { const s = pdf.context.lookup(ref); assert(s instanceof PDFRawStream); return new TextDecoder().decode(decodePDFRawStream(s).decode()); }).join("\n");
    for (const e of plotSheet(d, sheet)) {
      if (e.kind === "line") {
        assert(content.includes(`${e.width * MM_TO_PT} w`));
        if (e.dash) { assert(content.includes(`[${e.dash.map(n => n * MM_TO_PT).join(" ")}] 0 d`)); }
      }
      if (e.kind === "text" && e.sourceId && e.text.includes("REF")) { assert.equal(e.size, 2.5); assert(content.includes(`${e.size * MM_TO_PT} Tf`)); }
    }
  }
});
