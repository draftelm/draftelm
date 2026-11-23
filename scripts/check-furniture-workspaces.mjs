/** Production Chrome regression. Uses an existing Playwright installation; no app dependency.
 * DRAFTELM_PLAYWRIGHT_MODULE=/path/to/@playwright/test node scripts/check-furniture-workspaces.mjs
 * Optional DRAFTELM_UX_BASELINE_SHEETS / DRAFTELM_UX_BASELINE_PDF compare a pre-change capture.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium, expect } = require(process.env.DRAFTELM_PLAYWRIGHT_MODULE || "@playwright/test");
const { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream } = require("pdf-lib");
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = process.env.DRAFTELM_UX_ARTIFACTS || path.join(os.tmpdir(), "draftelm-5ux2");
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: process.env.DRAFTELM_BROWSER_CHANNEL || "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [], checks = [];
const mark = label => { checks.push(label); console.log(`PASS: ${label}`); };
let delayPDF = false, delayed = 0, downloadCount = 0, unloadWarnings = 0;
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
page.on("dialog", async dialog => { if (dialog.type() === "beforeunload") unloadWarnings++; await dialog.accept(); });
page.on("pageerror", e => errors.push(e.message)); page.on("download", () => downloadCount++);
const serveArtifact = async route => {
  const url = new URL(route.request().url());
  const file = url.pathname === "/furniture" ? path.join(root, ".next/server/app/furniture.html") : url.pathname.startsWith("/_next/static/") ? path.join(root, ".next", url.pathname.slice(7)) : null;
  try {
    if (!file || !file.startsWith(path.join(root, ".next") + path.sep)) throw Error("Not a build artifact");
    const body = await fs.readFile(file);
    if (delayPDF && file.endsWith(".js") && body.includes(Buffer.from("Only reconciled preliminary"))) { delayed++; await new Promise(resolve => setTimeout(resolve, 5000)); }
    await route.fulfill({ status: 200, body, contentType: { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream" });
  } catch { await route.fulfill({ status: 404, body: "" }); }
};
await page.route("**/*", serveArtifact);
const tab = name => page.getByRole("tab", { name, exact: true });
const workspaceTab = label => page.getByRole("tablist", { name: "Furniture workspaces" }).getByRole("tab").filter({ hasText: label });
const manufacturing = () => workspaceTab("Manufacturing").click();
const design = () => workspaceTab("Design").click();
const setup = () => tab("Panel setup").click();
const drawings = () => tab("Drawings & PDF").click();
const editor = page.getByRole("region", { name: "Panel manufacturing properties", exact: true });
const select = editor.getByRole("combobox", { name: "Manufacturing panel occurrence", exact: true });
const field = name => editor.getByRole("textbox", { name, exact: true });
const material = () => field("Panel material description");
const apply = () => editor.getByRole("button", { name: "Apply to current project", exact: true });
const schedule = page.getByRole("region", { name: "Panel manufacturing schedule", exact: true });
const row = id => schedule.locator(`[data-manufacturing-row="${id}"]`);
const sheet = page.getByRole("combobox", { name: "Drawing sheet", exact: true });
const exportButton = () => page.getByRole("button", { name: "Export preliminary vector PDF", exact: true });
const id = "chest/drawer-1/front", second = "chest/drawer-2/front";
async function openSummary(text) {
  const summary = page.getByText(text, { exact: true }).filter({ visible: true });
  if (await summary.locator("..").getAttribute("open") === null) await summary.click();
}
async function confirm() { await page.getByRole("dialog").getByRole("button", { name: "Confirm replacement", exact: true }).click(); }
async function dismiss() { await page.getByRole("dialog").getByRole("button", { name: "Keep current work", exact: true }).click(); }
async function storage() { await openSummary("Save locally, load & examples"); }
async function downloadPDF(name) { const pending = page.waitForEvent("download"); await exportButton().click(); const d = await pending; const file = path.join(artifacts, name); await d.saveAs(file); return file; }
function streams(pdf) { return pdf.getPages().map(p => { const contents = p.node.Contents(); const refs = contents instanceof PDFArray ? contents.asArray() : [contents]; return refs.map(ref => { const stream = pdf.context.lookup(ref); assert(stream instanceof PDFRawStream); return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"); }).join("\n"); }); }
try {
  await page.goto("http://draftelm-workspace-test.local/furniture", { waitUntil: "networkidle" });
  await expect(workspaceTab("Design")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Furniture parameters", exact: true }).locator('input[type="number"]')).toHaveCount(4);
  await expect(editor).not.toBeVisible(); await expect(exportButton()).not.toBeVisible();
  await expect(page.getByRole("combobox", { name: "Component", exact: true })).toHaveValue(id);
  await page.getByRole("region", { name: "Interactive furniture model" }).locator("canvas").waitFor();
  await page.screenshot({ path: path.join(artifacts, "design-workspace.png"), fullPage: true });
  // Keyboard tab navigation uses a single tab stop, with Arrow/Home/End support.
  await workspaceTab("Design").focus(); await page.keyboard.press("ArrowRight"); await expect(workspaceTab("Manufacturing")).toBeFocused();
  await expect(editor).toBeVisible(); await expect(select).toHaveValue(id);
  await expect(editor.getByRole("button", { name: "Basic", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home"); await expect(workspaceTab("Design")).toBeFocused(); await page.keyboard.press("End");
  await page.screenshot({ path: path.join(artifacts, "manufacturing-default.png"), fullPage: true });
  mark("initial Design focus, four inputs, shared selection and keyboard workspace navigation");

  await design();
  const canvas = page.getByRole("region", { name: "Interactive furniture model", exact: true }).locator("canvas");
  await canvas.scrollIntoViewIfNeeded(); const canvasBox = await canvas.boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2); await page.mouse.down(); await page.mouse.move(canvasBox.x + canvasBox.width / 2 + 70, canvasBox.y + canvasBox.height / 2 + 30, { steps: 15 }); await page.mouse.up(); await page.mouse.wheel(0, -120);
  await page.waitForTimeout(2200); const cameraBefore = await canvas.screenshot();
  await manufacturing(); await design(); await page.waitForTimeout(2200); const cameraAfter = await canvas.screenshot(); await fs.writeFile(path.join(artifacts, "camera-before.png"), cameraBefore); await fs.writeFile(path.join(artifacts, "camera-after.png"), cameraAfter); const cameraDifference = await page.evaluate(async ({ a, b }) => {
    const decode = async text => { const image = await createImageBitmap(new Blob([Uint8Array.from(atob(text), c => c.charCodeAt(0))], { type: "image/png" })); const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data; };
    const first = await decode(a), second = await decode(b); if (first.length !== second.length) return 1;
    let changed = 0; for (let i = 0; i < first.length; i += 4) if (Math.max(...[0, 1, 2].map(j => Math.abs(first[i + j] - second[i + j]))) > 20) changed++;
    return changed / (first.length / 4);
  }, { a: cameraBefore.toString("base64"), b: cameraAfter.toString("base64") });
  // WebGL resize/damping can move antialiased edge pixels. A reset/orbit loss changes broad faces.
  assert(cameraDifference < 0.015, `Camera changed after workspace switch: ${cameraDifference}`);
  await manufacturing(); mark("3D orbit/zoom retained across workspace navigation");

  await design(); await openSummary("Panel visibility"); await page.getByRole("checkbox", { name: "Back panel", exact: true }).uncheck(); await manufacturing(); await design(); await expect(page.getByRole("checkbox", { name: "Back panel", exact: true })).not.toBeChecked(); await page.getByRole("checkbox", { name: "Back panel", exact: true }).check();
  await openSummary("Inspect movement & exploded assembly"); const opening = page.getByRole("slider", { name: /Drawer 1 .*opening percent/ });
  await page.getByRole("button", { name: /^Open Drawer 1 / }).click(); await expect(opening).toHaveValue("100");
  await page.getByRole("slider", { name: "Explosion percent", exact: true }).focus(); await page.keyboard.press("End"); await expect(opening).toBeDisabled(); await page.getByRole("combobox", { name: "Explosion mode", exact: true }).selectOption("panels");
  await page.getByRole("button", { name: "Reset Explosion", exact: true }).click(); await expect(opening).toBeEnabled({ timeout: 10000 }); await expect(opening).toHaveValue("100");
  await manufacturing(); await design(); await expect(opening).toHaveValue("100"); await page.getByRole("button", { name: "Reset Drawers", exact: true }).click(); await expect(opening).toHaveValue("0");
  await page.getByRole("button", { name: "Reset design to reference", exact: true }).click(); await dismiss(); await expect(page.getByLabel("Carcass width (mm)", { exact: true })).toHaveValue("900");
  await manufacturing(); mark("visibility, drawer opening, both explosion modes and reset confirmation");

  // Before any changes, every drawing remains exactly the same SVG as pre-UX output.
  await drawings(); await expect(sheet.locator("option")).toHaveCount(16);
  const baseline = process.env.DRAFTELM_UX_BASELINE_SHEETS ? JSON.parse(await fs.readFile(process.env.DRAFTELM_UX_BASELINE_SHEETS, "utf8")) : null;
  const snapshots = {};
  for (const value of await sheet.locator("option").evaluateAll(os => os.map(o => o.value))) {
    await sheet.selectOption(value); snapshots[value] = await page.getByRole("region", { name: "Engineering drawings", exact: true }).locator("svg").evaluate(el => el.outerHTML);
    if (baseline) assert.equal(snapshots[value], baseline[value], `SVG changed: ${value}`);
  }
  if (baseline) assert.deepEqual(Object.keys(snapshots), Object.keys(baseline));
  await fs.writeFile(path.join(artifacts, "reference-sheets.json"), JSON.stringify(snapshots));
  const referenceFile = await downloadPDF("reference-package.pdf");
  const referencePDF = await PDFDocument.load(await fs.readFile(referenceFile)); assert.equal(referencePDF.getPageCount(), 16);
  assert(!referencePDF.context.enumerateIndirectObjects().some(([, s]) => s instanceof PDFRawStream && s.dict.get(referencePDF.context.obj("Subtype"))?.toString() === "/Image"));
  for (const p of referencePDF.getPages()) { assert(Math.abs(p.getWidth() / (72 / 25.4) - 420) < 0.01); assert(Math.abs(p.getHeight() / (72 / 25.4) - 297) < 0.01); }
  if (process.env.DRAFTELM_UX_BASELINE_PDF) assert.deepEqual(streams(referencePDF), streams(await PDFDocument.load(await fs.readFile(process.env.DRAFTELM_UX_BASELINE_PDF))), "PDF vector/text streams changed");
  mark("16 A3 reference pages, vector PDF and pre-change SVG/PDF parity");
  await setup(); await editor.getByRole("button", { name: "Advanced", exact: true }).click();

  // Multiple independent drafts, including fields hidden by mode, stay with each panel.
  await material().fill("SYNTHETIC UX FIRST DRAFT");
  await editor.getByRole("combobox", { name: "Panel grain orientation", exact: true }).selectOption("longitudinal");
  await editor.getByRole("button", { name: "Advanced", exact: true }).click();
  await field("Manufacturer material codes").fill("SYNTHETIC-MAKER=UX-CODE");
  await editor.getByRole("button", { name: "Flip to face B", exact: true }).click();
  await editor.getByRole("button", { name: "Rotate diagram 90°", exact: true }).click();
  await editor.getByRole("button", { name: "Left edge", exact: true }).click();
  await editor.getByRole("combobox", { name: "Selected edge treatment state", exact: true }).selectOption("none");
  await page.getByRole("link", { name: "DRAFTELM", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("Leave this furniture project"); await dismiss();
  await select.selectOption(second); await material().fill("SYNTHETIC UX SECOND DRAFT");
  await select.selectOption(id); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT"); await expect(field("Manufacturer material codes")).toHaveValue("SYNTHETIC-MAKER=UX-CODE");
  await expect(editor.getByRole("group", { name: "Interactive panel face B", exact: true })).toBeVisible();
  await expect(editor.getByRole("combobox", { name: "Selected edge treatment state", exact: true })).toHaveValue("none");
  await editor.getByRole("button", { name: "Basic", exact: true }).click();
  await design(); await expect(page.getByRole("combobox", { name: "Component", exact: true })).toHaveValue(id);
  await page.getByRole("link", { name: "DRAFTELM", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible(); await dismiss(); await expect(workspaceTab("Design")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("combobox", { name: "Component", exact: true }).selectOption(second); await manufacturing(); await expect(editor.getByRole("button", { name: "Basic", exact: true })).toHaveAttribute("aria-pressed", "true"); await editor.getByRole("button", { name: "Advanced", exact: true }).click(); await expect(material()).toHaveValue("SYNTHETIC UX SECOND DRAFT");
  await select.selectOption(id); await editor.getByRole("button", { name: "Advanced", exact: true }).click(); await expect(field("Manufacturer material codes")).toHaveValue("SYNTHETIC-MAKER=UX-CODE");
  await drawings(); await expect(page.getByText("2 panel draft(s) are pending.", { exact: false })).toBeVisible(); await tab("Schedule").click(); await expect(row(id)).not.toContainText("SYNTHETIC UX FIRST DRAFT");
  await setup(); await storage(); await expect(editor.getByRole("button", { name: "Save applied properties locally", exact: true })).toBeDisabled();
  mark("multi-panel draft, face/edge, mode and cross-workspace selection persistence; no implicit Apply");

  // Bulk review cannot silently overwrite a different panel's retained draft.
  await openSummary("Apply to several panels · 1 selected"); await editor.getByRole("checkbox", { name: `Apply properties to ${second}`, exact: true }).check();
  await expect(apply()).toBeDisabled(); await editor.getByRole("button", { name: "Review bulk changes", exact: true }).click(); await editor.getByRole("checkbox", { name: "Confirm exact manufacturing property scope", exact: true }).check();
  await apply().click(); await expect(page.getByRole("dialog")).toContainText(second); await dismiss();
  await select.selectOption(second); await expect(material()).toHaveValue("SYNTHETIC UX SECOND DRAFT"); await select.selectOption(id);
  await apply().click(); await confirm(); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT");
  await select.selectOption(second); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT");
  await tab("Schedule").click(); await expect(schedule.locator("tbody tr")).toHaveCount(29); await expect(schedule.locator("thead th")).toHaveCount(10); await expect(row(second)).toContainText("SYNTHETIC UX FIRST DRAFT"); await expect(row("chest/drawer-3/front")).not.toContainText("SYNTHETIC UX FIRST DRAFT");
  await row(id).getByRole("button").first().click(); await expect(select).toHaveValue(id); await expect(tab("Panel setup")).toHaveAttribute("aria-selected", "true");
  mark("exact bulk scope, confirmation of other dirty targets, conservative grouping and schedule-to-panel selection");

  // Undo/restore and local save/load clearly operate on applied values only.
  await material().fill("SYNTHETIC TEMP"); await editor.getByRole("button", { name: "Undo draft change", exact: true }).click(); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT");
  await material().fill("SYNTHETIC TEMP"); await editor.getByRole("button", { name: "Restore applied values", exact: true }).click(); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT");
  await material().fill("SYNTHETIC COPY ONLY"); await openSummary("Apply to several panels · 1 selected");
  await editor.getByRole("checkbox", { name: `Apply properties to ${id}`, exact: true }).uncheck(); await editor.getByRole("checkbox", { name: "Apply properties to chest/drawer-3/front", exact: true }).check();
  await apply().click(); await expect(material()).toHaveValue("SYNTHETIC COPY ONLY"); await expect(editor.getByRole("button", { name: "Restore applied values", exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Restore applied values", exact: true }).click(); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT");
  await storage(); await editor.getByRole("button", { name: "Save applied properties locally", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("draftelm.panel-manufacturing.v1"))); assert.equal(saved.properties.panels.length, 29); assert.equal(saved.properties.manufacturingReady, false);
  await material().fill("SYNTHETIC MUST KEEP"); await editor.getByRole("button", { name: "Load saved properties", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("discard pending drafts"); await page.keyboard.press("Escape"); await expect(material()).toHaveValue("SYNTHETIC MUST KEEP");
  await editor.getByRole("button", { name: "Load saved properties", exact: true }).click(); await confirm(); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT");
  await storage(); await editor.getByRole("button", { name: "Reset all panel properties", exact: true }).click(); await dismiss(); await expect(material()).toHaveValue("SYNTHETIC UX FIRST DRAFT");
  mark("draft undo/restore; explicit applied-property save; load/reset/Escape protection");

  // Create a reusable proposal, retain its unfinished form across panel/task navigation.
  const library = editor.getByRole("group", { name: "Material library controls", exact: true });
  await library.getByText("Create a reusable material proposal", { exact: true }).click();
  await library.getByRole("textbox", { name: "Material library name", exact: true }).fill("SYNTHETIC UX LIBRARY");
  await select.selectOption(second); await design(); await manufacturing(); await select.selectOption(id);
  await expect(library.getByRole("textbox", { name: "Material library name", exact: true })).toHaveValue("SYNTHETIC UX LIBRARY");
  await library.getByRole("button", { name: "Create material library version", exact: true }).click(); await library.getByRole("button", { name: "Use reviewed material preset", exact: true }).click(); await apply().click();
  await openSummary("Manufacturing libraries · 1 versions"); await editor.getByRole("button", { name: "Save libraries locally", exact: true }).click(); await editor.getByRole("button", { name: "Load libraries", exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("draftelm.manufacturing-catalogue.v1")).entries.length), 1);
  mark("retained library creation inputs, reviewed version staging and separate library persistence");

  // A pending draft pins its earlier source. Rebase must not transfer it silently.
  await material().fill("SYNTHETIC STALE DRAFT"); await design(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("1000"); await manufacturing();
  await expect(editor.getByRole("alert")).toContainText("need review"); await drawings(); await expect(exportButton()).toBeDisabled(); await setup();
  await editor.getByRole("checkbox", { name: "Reviewed surviving panel identities and orientation", exact: true }).check(); await design(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("1100"); await manufacturing(); await expect(editor.getByRole("checkbox", { name: "Reviewed surviving panel identities and orientation", exact: true })).not.toBeChecked(); await expect(editor.getByRole("button", { name: "Carry reviewed edits as provisional", exact: true })).toBeDisabled(); await design(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("1000"); await manufacturing();
  await editor.getByRole("checkbox", { name: "Reviewed surviving panel identities and orientation", exact: true }).check(); await editor.getByRole("button", { name: "Carry reviewed edits as provisional", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("discard pending drafts"); await dismiss();
  // Returning to the exact original source makes the retained draft editable again.
  await design(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("900"); await manufacturing(); await expect(material()).toHaveValue("SYNTHETIC STALE DRAFT");
  await design(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("1000"); await manufacturing(); await editor.getByRole("checkbox", { name: "Reviewed surviving panel identities and orientation", exact: true }).check(); await editor.getByRole("button", { name: "Carry reviewed edits as provisional", exact: true }).click(); await confirm();
  await expect(material()).toHaveValue("SYNTHETIC UX LIBRARY");
  await design(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("900"); await manufacturing(); await editor.getByRole("checkbox", { name: "Reviewed surviving panel identities and orientation", exact: true }).check(); await editor.getByRole("button", { name: "Carry reviewed edits as provisional", exact: true }).click(); await confirm();
  mark("pending-source pinning, stale export withholding, cancellation recovery and explicit provisional rebase");

  await drawings(); await openSummary("Drawing settings & local preferences");
  await page.getByRole("combobox", { name: "Drawing profile", exact: true }).selectOption("engineering"); await page.getByRole("combobox", { name: "Projection convention", exact: true }).selectOption("first-angle");
  await page.getByRole("button", { name: "Save preferences locally", exact: true }).click();
  await setup(); await design(); await manufacturing(); await drawings(); await expect(page.getByRole("combobox", { name: "Projection convention", exact: true })).toHaveValue("first-angle");
  await page.getByRole("button", { name: "Reset to profile defaults", exact: true }).click(); await dismiss(); await expect(page.getByRole("combobox", { name: "Projection convention", exact: true })).toHaveValue("first-angle");
  await page.getByRole("combobox", { name: "Projection convention", exact: true }).selectOption("third-angle"); await page.getByRole("button", { name: "Load saved preferences", exact: true }).click(); await confirm(); await expect(page.getByRole("combobox", { name: "Projection convention", exact: true })).toHaveValue("first-angle");
  mark("both profiles/projections; settings, source independence and explicit preference replacement");

  // A readable example for the screenshot and actual A3 PDF review.
  await setup(); await storage(); await editor.getByRole("button", { name: "Try synthetic example on this panel", exact: true }).click(); await confirm(); await expect(page.getByText(/SYNTHETIC EXAMPLE ACTIVE/)).toBeVisible();
  await editor.getByRole("button", { name: "Basic", exact: true }).click();
  // Collapse administration only; the actual editor remains immediately available.
  await page.getByText("Save locally, load & examples", { exact: true }).click();
  await page.screenshot({ path: path.join(artifacts, "manufacturing-workspace.png"), fullPage: true });
  await editor.getByRole("button", { name: "View this panel's manufacturing drawing", exact: true }).click(); await expect(sheet).toHaveValue("MP-001");
  await page.screenshot({ path: path.join(artifacts, "drawings-workspace.png"), fullPage: true });
  const exampleFile = await downloadPDF("reviewed-example-package.pdf"); const examplePDF = await PDFDocument.load(await fs.readFile(exampleFile));
  const exampleSheetIds = await sheet.locator("option").evaluateAll(os => os.map(o => o.value));
  const extracted = await PDFDocument.create(); const [copied] = await extracted.copyPages(examplePDF, [exampleSheetIds.indexOf("MP-001")]); extracted.addPage(copied); await fs.writeFile(path.join(artifacts, "reviewed-panel.pdf"), await extracted.save());
  await setup(); await storage(); await editor.getByRole("button", { name: "Exit synthetic example and restore", exact: true }).click(); await confirm(); await expect(page.getByText(/SYNTHETIC EXAMPLE ACTIVE/)).not.toBeVisible();
  mark("synthetic provenance, reversible example and reviewed A3 panel PDF");

  // Controls remain usable on a small display; overflow belongs to sheets/tables only.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of [setup, () => tab("Schedule").click(), drawings, design]) { await view(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Page overflow outside scroll containers"); }
  await page.screenshot({ path: path.join(artifacts, "design-mobile.png"), fullPage: true });
  await manufacturing(); await setup(); await page.screenshot({ path: path.join(artifacts, "manufacturing-mobile.png"), fullPage: true });
  // Every visible form control belongs to the active task, including keyboard focus.
  await workspaceTab("Manufacturing").focus(); await page.keyboard.press("Home"); await page.keyboard.press("Tab");
  assert(await page.evaluate(() => !document.activeElement.closest('[hidden], [inert]')), "Hidden workspace took keyboard focus");
  mark("390px responsive tasks, contained sheet/table overflow and hidden-panel keyboard exclusion");

  const fallbackPage = await browser.newPage();
  await fallbackPage.route("**/*", serveArtifact);
  await fallbackPage.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return String(type).includes("webgl") ? null : original.call(this, type, ...args); }; });
  await fallbackPage.goto("http://draftelm-workspace-test.local/furniture", { waitUntil: "networkidle" });
  await expect(fallbackPage.getByText(/3D viewer could not start|WebGL is unavailable/).first()).toBeVisible();
  await fallbackPage.getByRole("combobox", { name: "Component", exact: true }).selectOption(second);
  await fallbackPage.getByRole("tablist", { name: "Furniture workspaces" }).getByRole("tab").filter({ hasText: "Manufacturing" }).click();
  await expect(fallbackPage.getByRole("combobox", { name: "Manufacturing panel occurrence", exact: true })).toHaveValue(second);
  await fallbackPage.close(); mark("No-WebGL fallback retains component selection and manufacturing access");

  // A fresh document delays the lazy PDF chunk, then edits the source while it loads.
  await page.reload({ waitUntil: "networkidle" }); assert(unloadWarnings > 0, "Unsaved applied data did not warn before reload"); await manufacturing(); await drawings();
  await openSummary("Drawing settings & local preferences"); await page.getByRole("button", { name: "Load saved preferences", exact: true }).click(); await confirm(); await expect(page.getByRole("combobox", { name: "Projection convention", exact: true })).toHaveValue("first-angle");
  delayPDF = true; const previousDownloads = downloadCount; await exportButton().click(); await expect.poll(() => delayed).toBeGreaterThan(0);
  await design(); await page.getByLabel("Carcass width (mm)", { exact: true }).fill("1000"); await manufacturing(); await drawings();
  await expect(page.getByRole("alert").filter({ hasText: "Drawing inputs changed during export" })).toBeVisible({ timeout: 20000 }); assert.equal(downloadCount, previousDownloads); delayPDF = false;
  mark("unsaved applied-data unload warning; source edit during lazy PDF export cancels the stale download");
  assert.deepEqual(errors, [], "Browser runtime errors");
  const report = { result: "PASS", referencePages: 16, comparedSvgSheets: baseline ? 16 : 0, comparedPdfPages: process.env.DRAFTELM_UX_BASELINE_PDF ? 16 : 0, examplePages: examplePDF.getPageCount(), checks };
  await fs.writeFile(path.join(artifacts, "verification.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {}); throw error; }
finally { await browser.close(); }
