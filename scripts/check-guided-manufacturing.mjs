/** Production Basic/Advanced hybrid regression. Existing Playwright + system Chrome.
 * DRAFTELM_PLAYWRIGHT_MODULE=/path/to/@playwright/test node scripts/check-guided-manufacturing.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), { chromium, expect } = require(process.env.DRAFTELM_PLAYWRIGHT_MODULE || "@playwright/test");
const { PDFDocument } = require("pdf-lib");
const root = fileURLToPath(new URL("../", import.meta.url)), artifacts = process.env.DRAFTELM_UX_ARTIFACTS || path.join(os.tmpdir(), "draftelm-5ux3"); await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
const checks = [], errors = []; const pass = label => { checks.push(label); console.log(`PASS: ${label}`); };
page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
await page.route("**/*", async route => { const url = new URL(route.request().url()); const file = url.pathname === "/furniture" ? path.join(root, ".next/server/app/furniture.html") : url.pathname.startsWith("/_next/static/") ? path.join(root, ".next", url.pathname.slice(7)) : null; try { if (!file) throw Error(); await route.fulfill({ body: await fs.readFile(file), contentType: { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream" }); } catch { await route.fulfill({ status: 404, body: "" }); } });
const workspace = text => page.getByRole("tablist", { name: "Furniture workspaces", exact: true }).getByRole("tab").filter({ hasText: text });
const tab = text => page.getByRole("tab", { name: text, exact: true });
const editor = page.getByRole("region", { name: "Panel manufacturing properties", exact: true });
const guided = editor.getByRole("region", { name: "Guided manufacturing proposal", exact: true });
const review = guided.getByRole("region", { name: "Guided proposal review", exact: true });
const select = editor.getByRole("combobox", { name: "Manufacturing panel occurrence", exact: true });
const id = "chest/drawer-1/front", second = "chest/drawer-2/front";
async function summary(text) { const el = page.getByText(text, { exact: true }).filter({ visible: true }); if (await el.locator("..").getAttribute("open") === null) await el.click(); }
async function prepare(count = 4) { await guided.getByRole("button", { name: `Review proposal for ${count} panels`, exact: true }).click(); await expect(review).toBeVisible(); }
async function apply() { await review.getByRole("checkbox", { name: "Confirm guided proposal scope and fields", exact: true }).check(); await review.getByRole("button", { name: "Apply reviewed proposal", exact: true }).click(); }
async function choose(combo, text) { const option = guided.getByRole("combobox", { name: combo, exact: true }).locator("option").filter({ hasText: text }); await guided.getByRole("combobox", { name: combo, exact: true }).selectOption(await option.getAttribute("value")); }
async function openQuestion(text) { const back = guided.getByRole("button", { name: "Decide later / back", exact: true }); if (await back.isVisible()) await back.click(); await guided.getByRole("button", { name: new RegExp(text) }).click(); }
const base = { owner: { kind: "company", id: "SYNTHETIC-TESTS" }, syntheticExample: true, version: 1 };
const entry = (id, kind, value) => ({ ...base, id, name: `SYNTHETIC ${id}`, kind, specification: { status: "provisional", reason: "Synthetic browser test fixture, not production data or approval", value: { kind, manufacturerCodes: [], supplierCodes: [], ...value } } });
const lib = { schemaVersion: 1, id: "synthetic-guided-browser", entries: [entry("Sheet", "material", { stockMaterialId: "demo-sheet", nominalThicknessMm: 18 }), entry("Band", "edge-treatment", { treatmentKind: "edge-band", specificationId: "SYNTHETIC-BAND", nominalThicknessMm: 1 }), entry("Finish", "finish", { specificationId: "SYNTHETIC-FINISH" })] };
try {
  await page.goto("http://draftelm-guided-test.local/furniture", { waitUntil: "networkidle" }); await workspace("Manufacturing").click();
  const groups = editor.getByRole("group", { name: "Manufacturing component groups", exact: true });
  await expect(groups.getByRole("button", { name: /Drawer fronts/ })).toContainText("4 panels"); await expect(groups.getByRole("button", { name: /Carcass/ })).toContainText("5 panels"); await expect(groups.getByRole("button", { name: /Drawer boxes/ })).toContainText("20 panels");
  await expect(select.locator("option")).toHaveCount(5); await expect(guided.getByRole("combobox", { name: "Material preset", exact: true }).locator("option")).toHaveCount(1); await expect(editor.getByRole("textbox", { name: "Panel material description", exact: true })).not.toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "basic-groups.png"), fullPage: true }); pass("reference 4/5/20 identity groups; Basic is preset-first and initially empty");

  await guided.getByRole("button", { name: "Continue with visual choices", exact: true }).click(); await openQuestion("Does the panel need a grain direction"); await guided.getByRole("button", { name: /Along displayed width/ }).click(); await guided.getByRole("button", { name: "Decide later / back", exact: true }).click();
  await prepare(); await expect(review).toContainText(second); await expect(review).toContainText("Preserved:"); await expect(review.getByRole("button", { name: "Apply reviewed proposal", exact: true })).toBeDisabled(); await apply();
  await tab("Schedule").click(); const rows = page.getByRole("region", { name: "Panel manufacturing schedule", exact: true }).locator("[data-manufacturing-row]"); await expect(rows).toHaveCount(29); for (const member of [id, second, "chest/drawer-3/front", "chest/drawer-4/front"]) await expect(rows.filter({ has: page.locator(`button`) }).locator(`xpath=.`).filter({ hasText: member }).first()).toContainText("U");
  await tab("Panel setup").click(); pass("no-preset grain-only group proposal requires review and conserves all schedule occurrences");

  // Local catalogue load is an actual supported path; every fixture is marked synthetic.
  await page.evaluate(lib => localStorage.setItem("draftelm.manufacturing-catalogue.v1", JSON.stringify(lib)), lib);
  await summary("Manufacturing libraries · 0 versions"); await editor.getByRole("button", { name: "Load libraries", exact: true }).click();
  await choose("Material preset", "SYNTHETIC Sheet"); await expect(guided.getByText(/Proposal: SYNTHETIC Sheet/)).toBeVisible();
  await prepare(); await expect(review).toContainText("Not specified");
  await tab("Schedule").click(); await expect(rows.filter({ hasText: id }).first()).not.toContainText("SYNTHETIC Sheet"); await tab("Panel setup").click();
  // A catalogue change invalidates an earlier confirmation; pins do not silently upgrade.
  const newer = structuredClone(lib); newer.entries.push({ ...structuredClone(lib.entries[0]), version: 2 });
  await page.evaluate(lib => localStorage.setItem("draftelm.manufacturing-catalogue.v1", JSON.stringify(lib)), newer); await editor.getByRole("button", { name: "Load libraries", exact: true }).click(); await expect(review).not.toBeVisible();
  await prepare(); await review.screenshot({ path: path.join(artifacts, "review-before-apply.png") }); await apply();
  await tab("Schedule").click(); await expect(rows.filter({ hasText: id }).first()).toContainText("SYNTHETIC Sheet"); await tab("Panel setup").click();
  await expect(guided.getByText(/Proposal: SYNTHETIC Sheet v1/)).toBeVisible(); pass("catalogue proposals do not commit; catalogue changes invalidate review; applied snapshots stay pinned");

  // Visual choice maps to the same physical edge through B/90 and mode changes.
  await guided.getByRole("button", { name: "Face B", exact: true }).click(); await guided.getByRole("button", { name: "Rotate visual panel 90 degrees", exact: true }).click();
  const left = guided.getByRole("button", { name: "Left edge", exact: true }); const edgeId = await left.getAttribute("data-physical-edge"); await left.click();
  await guided.getByRole("button", { name: "No treatment", exact: true }).click(); await expect(left).toHaveAttribute("data-treatment-state", "none");
  await guided.getByRole("button", { name: "Not specified", exact: true }).click(); await expect(left).toHaveAttribute("data-treatment-state", "unknown");
  await choose("Selected edge preset", "SYNTHETIC Band"); await expect(left).toHaveAttribute("data-treatment-state", "assigned");
  await editor.getByRole("button", { name: "Advanced", exact: true }).click(); await expect(editor.getByRole("combobox", { name: "Selected edge treatment state", exact: true })).toHaveValue("specified"); await expect(editor.getByRole("textbox", { name: "Selected edge treatment reference", exact: true })).toHaveValue("SYNTHETIC-BAND");
  await editor.screenshot({ path: path.join(artifacts, "advanced-mode.png") }); await editor.getByRole("button", { name: "Basic", exact: true }).click(); await expect(left).toHaveAttribute("data-physical-edge", edgeId);
  await select.selectOption(second); await workspace("Design").click(); await workspace("Manufacturing").click(); await select.selectOption(id); await expect(left).toHaveAttribute("data-physical-edge", edgeId); await expect(left).toHaveAttribute("data-treatment-state", "assigned");
  await guided.screenshot({ path: path.join(artifacts, "visual-specification.png") }); await prepare(); await expect(review).toContainText(edgeId.split(":").pop()); await apply(); pass("physical edge, unspecified/none and treatment proposals survive face flip/rotation, mode and panel/workspace navigation");

  // Advanced edits outside the chosen field mask survive a Basic apply.
  await editor.getByRole("button", { name: "Advanced", exact: true }).click(); await editor.getByRole("combobox", { name: "Face B surface finish", exact: true }).selectOption("specified"); await editor.getByRole("textbox", { name: "Face B finish code", exact: true }).fill("SYNTHETIC-ADVANCED-PENDING");
  await editor.getByRole("button", { name: "Basic", exact: true }).click(); await openQuestion("Does the panel need a grain direction"); await guided.getByRole("button", { name: /Along displayed width/ }).click(); await prepare(); await apply();
  await editor.getByRole("button", { name: "Advanced", exact: true }).click(); await expect(editor.getByRole("textbox", { name: "Face B finish code", exact: true })).toHaveValue("SYNTHETIC-ADVANCED-PENDING"); await editor.getByRole("button", { name: "Restore applied values", exact: true }).click(); await editor.getByRole("button", { name: "Basic", exact: true }).click();
  pass("field-specific Basic Apply preserves unrelated pending Advanced values");

  // Group changes cannot auto-map different physical frames or mixed stock.
  await groups.getByRole("button", { name: /Carcass/ }).click(); await expect(select.locator("option")).toHaveCount(6); await openQuestion("Does the panel need a grain direction"); await guided.getByRole("button", { name: /Along displayed width/ }).click(); await prepare(5); await expect(review.getByRole("alert").first()).toContainText("orientation differs"); await expect(review.getByRole("checkbox", { name: "Confirm guided proposal scope and fields", exact: true })).toBeDisabled();
  await guided.getByRole("button", { name: "Only this panel", exact: true }).click(); await prepare(1); await apply(); pass("mixed orientation conflicts block group copying; explicit individual scope remains usable");

  await groups.getByRole("button", { name: /Drawer fronts/ }).click(); await openQuestion("Does the panel need a grain direction"); await guided.getByRole("button", { name: "Non-directional", exact: true }).click(); await prepare();
  await workspace("Design").click(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("1000"); await workspace("Manufacturing").click(); await expect(editor.getByRole("alert")).toContainText("need review");
  await tab("Drawings & PDF").click(); await expect(page.getByRole("button", { name: "Export preliminary vector PDF", exact: true })).toBeDisabled(); await tab("Panel setup").click();
  await workspace("Design").click(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("900"); await workspace("Manufacturing").click(); await expect(review).not.toBeVisible(); await expect(guided.getByRole("button", { name: "Non-directional", exact: true })).toHaveAttribute("aria-pressed", "true"); await editor.getByRole("button", { name: "Restore applied values", exact: true }).click(); pass("source changes invalidate review and withhold exports without losing the proposal");

  await summary("Save locally, load & examples"); await editor.getByRole("button", { name: "Save applied properties locally", exact: true }).click(); const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("draftelm.panel-manufacturing.v1"))); assert.equal(saved.properties.panels.length, 29); assert.equal(saved.properties.manufacturingReady, false);
  await tab("Drawings & PDF").click(); const pdfDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Export preliminary vector PDF", exact: true }).click(); const file = path.join(artifacts, "guided-example.pdf"); await (await pdfDownload).saveAs(file); const pdf = await PDFDocument.load(await fs.readFile(file)); assert(pdf.getPageCount() >= 16);
  await page.setViewportSize({ width: 390, height: 844 }); await tab("Panel setup").click(); await expect(guided).toBeVisible(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: path.join(artifacts, "basic-mobile.png"), fullPage: true });
  await workspace("Manufacturing").focus(); await page.keyboard.press("Home"); await expect(workspace("Design")).toBeFocused(); await page.keyboard.press("End"); await expect(workspace("Manufacturing")).toBeFocused();
  assert.deepEqual(errors, []); pass("local applied-property save, vector PDF, responsive Basic and keyboard navigation");
  const report = { result: "PASS", checks, examplePages: pdf.getPageCount() }; await fs.writeFile(path.join(artifacts, "verification.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (e) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {}); throw e; }
finally { await browser.close(); }
