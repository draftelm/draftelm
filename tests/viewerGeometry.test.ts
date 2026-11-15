import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { createPreviewModel, selectPanels, toScenePanel } from "../src/components/furniture/viewerGeometry";

const reference = () => generateFurniture(createDemoChestSpecification());
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-10, `${a} differs from ${b}`);

test("all 29 physical panels have stable identities and unchanged XYZ bounds after conversion", () => {
  const result = reference(), before = JSON.stringify(result), model = createPreviewModel(result);
  assert.equal(model.error, null); assert.equal(model.panels.length, 29);
  assert.equal(new Set(model.panels.map(p => p.component.id)).size, 29);
  for (const p of model.panels) for (const [i, axis] of (["x", "y", "z"] as const).entries()) {
    near(p.size[i], p.component.dimensions[axis] / 1000);
    near(p.center[i] - p.size[i] / 2, p.component.position[axis] / 1000);
    near(p.center[i] + p.size[i] / 2, (p.component.position[axis] + p.component.dimensions[axis]) / 1000);
  }
  assert.equal(JSON.stringify(result), before);
});

test("front negative Z and thin X/Y/Z panel orientations are preserved", () => {
  const model = createPreviewModel(reference());
  const top = model.panels.find(p => p.component.id === "chest/carcass/top")!;
  const side = model.panels.find(p => p.component.id === "chest/carcass/left")!;
  const front = model.panels.find(p => p.component.id === "chest/drawer-1/front")!;
  assert.deepEqual(top.size, [0.9, 0.018000000000000002, 0.5]);
  near(side.size[0], 0.018); near(side.size[1], 0.814);
  near(front.center[2], -0.009); near(front.center[2] - front.size[2] / 2, -0.018);
});

test("global drawer coordinates do not get an extra assembly transform", () => {
  const model = createPreviewModel(reference());
  const p = model.panels.find(p => p.component.id === "chest/drawer-4/bottom")!;
  near(p.center[0], 0.45); near(p.center[1], 0.66575); near(p.center[2], 0.2);
});

test("bounds frame the full assembly including projecting decorative fronts", () => {
  const model = createPreviewModel(reference()); assert(model.bounds);
  near(model.bounds.size[0], 0.9); near(model.bounds.size[1], 0.85); near(model.bounds.size[2], 0.518);
  near(model.bounds.center[0], 0.45); near(model.bounds.center[1], 0.425); near(model.bounds.center[2], 0.241);
});

test("presentation roles distinguish carcass, boxes, decorative fronts and back", () => {
  const panels = createPreviewModel(reference()).panels;
  for (const [role, count] of [["carcass", 4], ["box", 20], ["front", 4], ["back", 1]] as const) assert.equal(panels.filter(p => p.role === role).length, count);
});

test("single-panel selection resolves exactly the clicked stable ID", () => {
  const model = createPreviewModel(reference());
  assert.deepEqual(selectPanels(["chest/drawer-4/box-front"], model.panels), { ids: ["chest/drawer-4/box-front"], activeId: "chest/drawer-4/box-front" });
});

test("BOM selection highlights all and only its linked panels", () => {
  const result = reference(), model = createPreviewModel(result);
  const line = result.bom.find(l => l.cutSize?.length === 900)!;
  const selection = selectPanels(line.componentIds, model.panels);
  assert.deepEqual(selection.ids, ["chest/carcass/base", "chest/carcass/top"]);
  assert.equal(selectPanels(line.componentIds, model.panels, "chest/carcass/top").activeId, "chest/carcass/top");
  const hardware = result.bom.find(l => l.kind === "hardware")!;
  assert.deepEqual(selectPanels(hardware.componentIds, model.panels), { ids: [], activeId: null });
});

test("stale selections, duplicated IDs and deselection are handled", () => {
  const s = createDemoChestSpecification(); s.drawerCount = 3;
  const panels = createPreviewModel(generateFurniture(s)).panels;
  assert.deepEqual(selectPanels(["chest/drawer-4/front"], panels), { ids: [], activeId: null });
  assert.deepEqual(selectPanels(["missing", "chest/carcass/top", "chest/carcass/top"], panels, "missing"), { ids: ["chest/carcass/top"], activeId: "chest/carcass/top" });
  assert.deepEqual(selectPanels([], panels), { ids: [], activeId: null });
});

for (const [name, change] of [
  ["empty numeric input", (s: ReturnType<typeof createDemoChestSpecification>) => { s.dimensions.width = NaN; }],
  ["fractional count", (s: ReturnType<typeof createDemoChestSpecification>) => { s.drawerCount = 3.5; }],
  ["unsupported count", (s: ReturnType<typeof createDemoChestSpecification>) => { s.drawerCount = 65; }],
  ["insufficient height", (s: ReturnType<typeof createDemoChestSpecification>) => { s.dimensions.height = 300; }],
  ["insufficient depth", (s: ReturnType<typeof createDemoChestSpecification>) => { s.dimensions.depth = 300; }],
] as const) test(`invalid ${name} never yields renderable panels or bounds`, () => {
  const s = createDemoChestSpecification(); change(s);
  const result = generateFurniture(s), model = createPreviewModel(result);
  assert.equal(result.geometryValid, false); assert.equal(result.bom.length, 0);
  assert(model.error); assert.deepEqual(model.panels, []); assert.equal(model.bounds, null);
});

test("even a claimed-valid result with malformed panel geometry is withheld", () => {
  const result = reference(), c = result.components.find(c => c.kind === "panel")!;
  assert(c.kind === "panel"); c.dimensions.x = Infinity;
  assert.equal(toScenePanel(c), null); assert(createPreviewModel(result).error);
});

test("parameter recalculation uses the engine's current dimensions and does not retain stale boxes", () => {
  const s = createDemoChestSpecification(); s.dimensions.width = 1000; s.drawerCount = 3;
  const model = createPreviewModel(generateFurniture(s));
  assert.equal(model.panels.length, 23);
  near(model.panels.find(p => p.component.id === "chest/carcass/top")!.size[0], 1);
  assert(model.panels.every(p => !p.component.id.startsWith("chest/drawer-4/")));
});

test("preview uses the nominal zero-gap back and its updated BOM link", () => {
  const result = reference(), model = createPreviewModel(result);
  const back = model.panels.find(p => p.component.id === "chest/carcass/back")!;
  near(back.size[0], 0.864); near(back.size[1], 0.814); near(back.size[2], 0.006);
  near(back.center[0] - back.size[0] / 2, 0.018);
  near(back.center[1] - back.size[1] / 2, 0.018);
  near(back.center[2] - back.size[2] / 2, 0.484);
  const line = result.bom.find(l => l.componentIds.includes(back.component.id))!;
  assert.deepEqual(line.cutSize, { length: 864, width: 814, thickness: 6 });
  assert.equal(selectPanels(line.componentIds, model.panels).activeId, back.component.id);
});
