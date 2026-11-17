import { getPanelRegressionProfile as getDrawingProfile } from "./drawingFixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { DEFAULT_DRAWING_OPTIONS, DRAWING_PREFERENCES_KEY, generateDrawingDocument,  loadDrawingPreferences, parseDrawingProfile, plotSheet, reconcileDrawingParts, saveDrawingPreferences, SHEET_FORMATS } from "../src/drawings";
import { exportDrawingPDF, MM_TO_PT } from "../src/drawings/pdf";
import { titleBlockExtraHeight } from "../src/drawings/layout";
import type { DrawingDocument, DrawingProfile, PlotEntity, Projection } from "../src/drawings";
import type { PreferenceStorage } from "../src/drawings/preferences";

function generate(profile = getDrawingProfile()) {
  const result = generateFurniture(createDemoChestSpecification());
  const generated = generateDrawingDocument(result, profile);
  assert(generated.document, generated.issues.join(" "));
  return { result, document: generated.document };
}
function memoryStorage() {
  const values = new Map<string, string>();
  const storage: PreferenceStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  return { storage, values };
}
function texts(document: DrawingDocument) {
  return document.sheets.flatMap(s => plotSheet(document, s)).filter(e => e.kind === "text").map(e => e.text);
}

test("Panel-only profile preserves the six-sheet Phase 4B presentation and legacy options API", () => {
  const { result, document } = generate();
  const legacy = generateDrawingDocument(result, DEFAULT_DRAWING_OPTIONS); assert(legacy.document);
  assert.equal(document.profile.schemaVersion, 3); assert.equal(document.profile.id, "furniture-workshop");
  assert.deepEqual(document.sheets.map(s => s.id), ["GA-001", "CP-001", "CP-002", "CP-003", "CL-001", "HW-001"]);
  const compatible = getDrawingProfile(); compatible.annotations.balloons = false; compatible.annotations.assemblyPartsList = false;
  assert.deepEqual(generate(compatible).document, legacy.document);
  assert.deepEqual(document.cuttingList, legacy.document.cuttingList);
  const changed = getDrawingProfile(); changed.contents.assemblyViews.pop(); changed.titleBlock.projectName = "Other";
  assert.equal(getDrawingProfile().contents.assemblyViews.length, 4);
  assert.equal(getDrawingProfile().titleBlock.projectName, "DRAFTELM");
});

test("Engineering profile changes presentation without changing geometry or claiming compliance", () => {
  const a = generate(), b = generate(getDrawingProfile("engineering"));
  assert.equal(b.document.template, "engineering");
  assert.deepEqual(a.result, b.result);
  assert.deepEqual(a.document.sheets.map(s => s.viewports), b.document.sheets.map(s => s.viewports));
  assert.equal(b.document.complianceVerified, false); assert.equal(b.document.manufacturingReady, false);
  assert(texts(b.document).some(t => t.includes("compliance not yet verified")));
});

test("all 127 nonempty visibility combinations preserve full internal reconciliation and produce no empty pages", () => {
  const result = generateFurniture(createDemoChestSpecification()), before = JSON.stringify(result);
  const projections: Projection[] = ["front", "top", "right", "isometric"];
  for (let mask = 1; mask < 128; mask++) {
    const p = getDrawingProfile();
    p.contents.assemblyViews = projections.filter((_, i) => mask & (1 << i));
    p.contents.componentDrawings = !!(mask & 16); p.contents.cuttingList.include = !!(mask & 32); p.contents.hardwareSchedule = !!(mask & 64);
    const generated = generateDrawingDocument(result, p); assert(generated.document, `mask ${mask}: ${generated.issues}`);
    const d = generated.document;
    assert(d.reconciliation.valid); assert(reconcileDrawingParts(result, d.componentSchedule).valid);
    assert.equal(d.cuttingList.reduce((sum, row) => sum + row.quantity, 0), 29);
    assert.equal(d.componentSchedule.flatMap(row => row.componentIds).length, result.components.length);
    assert.deepEqual(d.sheets.find(s => s.id === "GA-001")?.viewports.map(v => v.projection) ?? [], p.contents.assemblyViews);
    assert.equal(d.sheets.some(s => s.id.startsWith("CP-")), p.contents.componentDrawings);
    assert.equal(d.sheets.some(s => s.id.startsWith("CL-")), p.contents.cuttingList.include);
    assert.equal(d.sheets.some(s => s.id.startsWith("HW-")), p.contents.hardwareSchedule);
    assert(d.sheets.every((s, i) => s.metadata.number === i + 1 && s.metadata.total === d.sheets.length && (s.viewports.length || s.table?.rows.length || s.assemblyPartsList?.rows.length)));
    assert.equal(new Set(d.sheets.map(s => s.metadata.drawingNumber)).size, d.sheets.length);
    assert.equal(d.manufacturingReady, false); assert.equal(d.complianceVerified, false);
    assert.equal(JSON.stringify(result), before);
  }
});

test("empty settings withhold output and report a useful correction", () => {
  const p = getDrawingProfile(); p.contents = { assemblySheets: { exploded: false, drawers: false, carcass: false }, assemblyViews: [], componentDrawings: false, cuttingList: { include: false, placement: "after-components" }, hardwareSchedule: false };
  const generated = generateDrawingDocument(generateFurniture(createDemoChestSpecification()), p);
  assert.equal(generated.document, null); assert(generated.issues.some(i => i.includes("at least one")));
});

test("hidden details and schedules still detect a missing, duplicate or mismatched source part", () => {
  const p = getDrawingProfile(); p.contents.componentDrawings = false; p.contents.cuttingList.include = false; p.contents.hardwareSchedule = false;
  for (const mode of ["missing", "duplicate", "mismatch"]) {
    const r = generateFurniture(createDemoChestSpecification());
    const line = r.bom.find(l => l.componentIds.includes("chest/drawer-4/front"))!;
    if (mode === "missing") line.componentIds.pop();
    if (mode === "duplicate") line.componentIds.push(line.componentIds[0]);
    if (mode === "mismatch") line.cutSize!.length++;
    const g = generateDrawingDocument(r, p); assert.equal(g.document, null); assert(g.issues.length);
  }
});

test("omitted cutting lists have no dangling schedule instructions in component annotations", () => {
  const p = getDrawingProfile(); p.contents.cuttingList.include = false;
  const { document } = generate(p);
  assert(document.output.omittedSections.includes("cutting list"));
  assert(!document.sheets.flatMap(s => s.viewports).flatMap(v => v.annotations).some(t => t.includes("in schedule")));
  assert(texts(document).some(t => t.includes("hidden")));
});

test("assembly scale declarations include only selected views", () => {
  const p = getDrawingProfile(); p.contents.assemblyViews = ["isometric"];
  assert.equal(generate(p).document.sheets[0].metadata.scale, "iso 1:10 primary");
  p.contents.assemblyViews = ["front"];
  assert.equal(generate(p).document.sheets[0].metadata.scale, "1:10 orthographic");
});

for (const scheme of ["by-sheet-kind", "sequential"] as const) test(`${scheme} numbering remains unique and contiguous after cutting-list reordering and omissions`, () => {
  const p = getDrawingProfile(); p.contents.assemblyViews = []; p.contents.hardwareSchedule = false;
  p.contents.cuttingList.placement = "before-components";
  p.numbering = { prefix: "ACME", revision: "C2", startAt: 42, scheme };
  const { document } = generate(p);
  assert.equal(document.sheets[0].id, "CL-001");
  assert.deepEqual(document.sheets.map(s => s.metadata.drawingNumber), scheme === "sequential"
    ? ["ACME-042", "ACME-043", "ACME-044", "ACME-045"] : ["ACME-CL-042", "ACME-CP-042", "ACME-CP-043", "ACME-CP-044"]);
  assert(document.sheets.every((s, i) => s.metadata.number === i + 1 && s.metadata.total === 4 && s.metadata.revision === "C2"));
});

test("unverified allowances preserve exact BOM quantities and never become purchasing quantities", () => {
  const { document } = generate();
  assert.deepEqual(document.hardware.allowances.map(row => row.quantity).sort((a, b) => a - b), [8, 8, 160]);
  assert(document.hardware.allowances.every(row => row.verificationStatus === "unverified" && row.purchasingQuantity === 0 && !row.purchasingEligible));
  assert.deepEqual(document.hardware.approvedPurchasingItems, []); assert.equal(document.hardware.policy, "approved-only");
  const hardwareSheets = document.sheets.filter(s => s.id.startsWith("HW-"));
  assert(hardwareSheets.every(s => s.metadata.subject.includes("UNVERIFIED") && s.annotations.some(t => t.includes("Excluded from purchasing totals"))));
  assert(hardwareSheets.every(s => s.table!.columns[3].label === "Allowance qty"));
  const p = getDrawingProfile(); p.contents.hardwareSchedule = false;
  assert.deepEqual(generate(p).document.hardware, document.hardware);
});

test("saving/loading local custom preferences preserves settings, base profile and output without storing geometry", () => {
  const { storage, values } = memoryStorage(), p = getDrawingProfile("engineering");
  p.sheet = { format: "A4", projectionConvention: "first-angle" }; p.contents.componentDrawings = false;
  p.contents.cuttingList.placement = "before-components"; p.titleBlock.companyName = "Example Joinery";
  p.numbering.startAt = 17;
  const original = JSON.stringify(p), saved = saveDrawingPreferences(storage, p, "engineering"); assert(saved.profile);
  assert.equal(JSON.stringify(p), original);
  const loaded = loadDrawingPreferences(storage); assert(loaded.profile);
  assert.equal(loaded.baseProfileId, "engineering"); assert.equal(loaded.profile.id, "custom-engineering");
  assert.deepEqual(loaded.profile, saved.profile);
  assert.deepEqual(generate(loaded.profile).document.sheets, generate(p).document.sheets);
  const raw = values.get(DRAWING_PREFERENCES_KEY)!;
  assert(!raw.includes("specificationRevision")); assert(!raw.includes("componentIds")); assert(!raw.includes("dimensions"));
  assert.equal(getDrawingProfile(loaded.baseProfileId).sheet.format, "A3", "reset gets factory defaults rather than saved changes");
});

test("missing, corrupted, oversized and unsupported saved preferences leave current settings usable", () => {
  const { storage, values } = memoryStorage(); assert.equal(loadDrawingPreferences(storage).profile, null);
  for (const raw of ["{broken", "null", "[]", "x".repeat(20001), JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ schemaVersion: 1, baseProfileId: "unknown", profile: getDrawingProfile() }), JSON.stringify({ schemaVersion: 1, baseProfileId: ["engineering"], profile: getDrawingProfile() })]) {
    values.set(DRAWING_PREFERENCES_KEY, raw); const loaded = loadDrawingPreferences(storage);
    assert.equal(loaded.profile, null); assert(loaded.message.length);
  }
  const p = getDrawingProfile(); p.numbering.startAt = NaN;
  assert.equal(saveDrawingPreferences(storage, p, "furniture-workshop").profile, null);
  assert.equal(saveDrawingPreferences(storage, getDrawingProfile(), "unknown").profile, null);
  const denied: PreferenceStorage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
  assert.equal(saveDrawingPreferences(denied, getDrawingProfile(), "furniture-workshop").profile, null);
  assert.equal(loadDrawingPreferences(denied).profile, null);
  assert.equal(generate().document.sheets.length, 6);
});

const invalidProfiles: [string, (p: DrawingProfile) => unknown][] = [
  ["future version", p => ({ ...p, schemaVersion: 4 })], ["unknown root fields", p => ({ ...p, manufacturingReady: true })],
  ["geometry overrides", p => ({ ...p, dimensions: { width: 1000 } })], ["purchasing override", p => ({ ...p, hardwarePurchasing: "all" })],
  ["duplicate views", p => ({ ...p, contents: { ...p.contents, assemblyViews: ["front", "front"] } })],
  ["unknown view", p => ({ ...p, contents: { ...p.contents, assemblyViews: ["perspective"] } })],
  ["coerced sheet format", p => ({ ...p, sheet: { ...p.sheet, format: ["A3"] } })],
  ["invalid booleans", p => ({ ...p, contents: { ...p.contents, hardwareSchedule: "false" } })],
  ["fractional numbering", p => ({ ...p, numbering: { ...p.numbering, startAt: 1.5 } })],
  ["empty revision", p => ({ ...p, numbering: { ...p.numbering, revision: "" } })],
  ["control characters", p => ({ ...p, titleBlock: { ...p.titleBlock, companyName: "A\nB" } })],
  ["executable extension", p => ({ ...p, extensions: { branding: { logoAssetId: "javascript:alert(1)" } } })],
  ["template markup", p => ({ ...p, extensions: { branding: { svg: "<svg/>" } } })],
  ["prototype pollution", p => JSON.parse(JSON.stringify(p).replace('"extensions":{}', '"extensions":{"__proto__":{"polluted":true}}'))],
];
for (const [name, change] of invalidProfiles) test(`profile validation rejects ${name}`, () => {
  const parsed = parseDrawingProfile(change(getDrawingProfile())); assert.equal(parsed.profile, null); assert(parsed.issues.length);
});

test("reserved branding/material/machining references round-trip safely and are inert", () => {
  const p = getDrawingProfile(); p.extensions = { branding: { logoAssetId: "logo-v1", borderTemplateId: "border-v1", importedTemplateId: "future-template" }, materials: { annotationProfileId: "material-v1" }, machining: { annotationProfileId: "machining-v1" } };
  const parsed = parseDrawingProfile(p); assert(parsed.profile);
  assert.deepEqual(parsed.profile.extensions, p.extensions);
  assert.deepEqual(generate(p).document.sheets, generate().document.sheets);
});

function fullExtentInsideSheet(entity: PlotEntity, width: number, height: number) {
  if (entity.kind === "circle") {
    assert(entity.center.x - entity.radius >= 10 && entity.center.x + entity.radius <= width - 10 && entity.center.y - entity.radius >= 10 && entity.center.y + entity.radius <= height - 10); return;
  }
  if (entity.kind === "text") {
    const length = Array.from(entity.text).length * entity.size;
    const x = entity.at.x - (entity.rotation ? entity.size : entity.align === "middle" ? length / 2 : 0);
    const y = entity.at.y - (entity.rotation ? length / 2 : entity.size);
    const w = entity.rotation ? entity.size * 1.2 : length, h = entity.rotation ? length : entity.size * 1.2;
    assert(x >= 10 - 1e-6 && y >= 10 - 1e-6 && x + w <= width - 10 + 1e-6 && y + h <= height - 10 + 1e-6, JSON.stringify(entity));
  } else for (const point of entity.kind === "line" ? [entity.from, entity.to] : entity.points) {
    assert(point.x >= 10 - 1e-6 && point.x <= width - 10 + 1e-6 && point.y >= 10 - 1e-6 && point.y <= height - 10 + 1e-6);
  }
}
for (const format of ["A4", "A3", "A2", "A1"] as const) test(`${format}: company and optional metadata reserve space without losing required title-block information`, () => {
  const p = getDrawingProfile(); p.sheet.format = format;
  p.titleBlock.companyName = "Example Joinery";
  p.titleBlock.additionalFields = [{ label: "Client", value: "Example Client" }, { label: "Prepared by", value: "Design team" }, { label: "Reference", value: "Job-42" }];
  const { document } = generate(p), values = texts(document);
  for (const value of ["Example Joinery", "Example Client", "Design team", "Job-42", "PRELIMINARY - NOT FOR MANUFACTURE"]) assert(values.includes(value));
  for (const sheet of document.sheets) {
    const extra = titleBlockExtraHeight(sheet.metadata); assert.equal(extra, 20);
    for (const view of sheet.viewports) assert(view.frame.y + view.frame.height < sheet.heightMm - 60 - extra);
    if (sheet.table) assert(sheet.table.frame.y + sheet.table.headerHeight + sheet.table.rows.reduce((sum, row) => sum + row.height, 0) <= sheet.heightMm - 62 - extra + 1e-6);
    for (const entity of plotSheet(document, sheet)) fullExtentInsideSheet(entity, sheet.widthMm, sheet.heightMm);
  }
});

for (const selection of ["cutting-only", "hardware-only", "front-only", "custom-package"] as const) test(`${selection}: configured PDF pagination matches visible vector sheets`, async () => {
  const p = getDrawingProfile("engineering"); p.sheet.format = "A4";
  if (selection === "front-only") p.annotations.assemblyPartsList = false;
  p.titleBlock.companyName = "Example Joinery";
  if (selection !== "custom-package") p.contents = { assemblySheets: { exploded: false, drawers: false, carcass: false }, assemblyViews: selection === "front-only" ? ["front"] : [], componentDrawings: false,
    cuttingList: { include: selection === "cutting-only", placement: "before-components" }, hardwareSchedule: selection === "hardware-only" };
  else { p.contents.cuttingList.placement = "before-components"; p.numbering.scheme = "sequential"; p.numbering.startAt = 8; }
  const { document } = generate(p), pdf = await PDFDocument.load(await exportDrawingPDF(document));
  assert.equal(pdf.getPageCount(), document.sheets.length);
  assert.equal(pdf.getAuthor(), "Example Joinery");
  for (const page of pdf.getPages()) { assert(Math.abs(page.getWidth() - SHEET_FORMATS.A4.width * MM_TO_PT) < 1e-7); assert(Math.abs(page.getHeight() - SHEET_FORMATS.A4.height * MM_TO_PT) < 1e-7); }
  const streams = pdf.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream).map(([, value]) => value as PDFRawStream);
  assert(!streams.some(s => s.dict.get(pdf.context.obj("Subtype"))?.toString() === "/Image"));
  const content = streams.map(s => new TextDecoder().decode(decodePDFRawStream(s).decode())).join("\n");
  for (const sheet of document.sheets) assert(content.includes(Buffer.from(sheet.metadata.drawingNumber).toString("hex").toUpperCase()));
  if (selection === "hardware-only") assert(content.includes(Buffer.from("UNVERIFIED hardware allowances").toString("hex").toUpperCase()));
  if (selection === "front-only") assert.equal(pdf.getPageCount(), 1);
});
