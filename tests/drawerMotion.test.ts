import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { createPreviewModel } from "../src/components/furniture/viewerGeometry";
import { advanceDrawerOffset, clampDemoTravel, drawerMotionBounds, drawerOffset, drawerSelection, groupDrawerPanels, reconcileDrawerPositions, resetDrawerPositions, setDrawerOpening } from "../src/components/furniture/drawerMotion";

function setup(count = 4) {
  const s = createDemoChestSpecification(); s.drawerCount = count;
  const result = generateFurniture(s), model = createPreviewModel(result);
  return { result, model, drawers: groupDrawerPanels(result.assemblies, model) };
}
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-10);

test("drawer grouping follows each assembly and includes exactly its front and five box panels", () => {
  const { result, model, drawers } = setup();
  assert.equal(drawers.length, 4);
  for (const drawer of drawers) {
    const assembly = result.assemblies.find(a => a.id === drawer.id)!;
    assert.equal(drawer.panels.length, 6);
    assert(drawer.panels.every(p => p.component.assemblyId === drawer.id && assembly.componentIds.includes(p.component.id)));
    assert.equal(drawer.panels.filter(p => p.role === "front").length, 1);
    assert.equal(drawer.panels.filter(p => p.role === "box").length, 5);
  }
  const moving = new Set(drawers.flatMap(d => d.panels.map(p => p.component.id)));
  assert.equal(moving.size, 24);
  assert.deepEqual(model.panels.filter(p => !moving.has(p.component.id)).map(p => p.component.id).sort(), ["chest/carcass/back", "chest/carcass/base", "chest/carcass/left", "chest/carcass/right", "chest/carcass/top"]);
});

test("group membership cannot be inferred solely from a shared-looking ID", () => {
  const { result, model } = setup();
  result.assemblies.find(a => a.id === "chest/drawer-1")!.componentIds = [];
  assert(!groupDrawerPanels(result.assemblies, model).some(d => d.id === "chest/drawer-1"));
});

test("opening is a negative-Z translation in metres, with unchanged X and Y", () => {
  assert.deepEqual(drawerOffset(0, 300), [0, 0, 0]);
  assert.deepEqual(drawerOffset(0.5, 300), [0, 0, -0.15]);
  assert.deepEqual(drawerOffset(1, 300), [0, 0, -0.3]);
});

test("all six drawer panels share the same translation without mutating engineering or BOM data", () => {
  const { result, model, drawers } = setup(), before = JSON.stringify({ result, model });
  const offset = drawerOffset(0.75, 300);
  for (const p of drawers[0].panels) {
    const transformed = p.center.map((v, axis) => v + offset[axis]);
    near(transformed[0], p.center[0]); near(transformed[1], p.center[1]); near(transformed[2] - p.center[2], -0.225);
    assert.equal(p.component.position.z, p.component.id.endsWith("/front") ? -18 : p.component.id.endsWith("/rear") ? 388 : 0);
  }
  assert.equal(JSON.stringify({ result, model }), before);
});

test("drawer positions are independent and multiple drawers can remain open", () => {
  const { drawers } = setup(); const initial = resetDrawerPositions(drawers);
  const one = setDrawerOpening(drawers, initial, drawers[0].id, 1);
  const two = setDrawerOpening(drawers, one, drawers[2].id, 0.45);
  assert.equal(initial[drawers[0].id], 0);
  assert.equal(two[drawers[0].id], 1); assert.equal(two[drawers[2].id], 0.45);
  assert.equal(two[drawers[1].id], 0); assert.equal(two[drawers[3].id], 0);
  assert.equal(setDrawerOpening(drawers, two, drawers[0].id, 0)[drawers[2].id], 0.45);
});

test("Reset Drawers returns every current drawer to closed and drops stale keys", () => {
  const { drawers } = setup();
  const reset = resetDrawerPositions(drawers);
  assert.deepEqual(Object.keys(reset), drawers.map(d => d.id));
  assert(Object.values(reset).every(v => v === 0));
});

test("state reconciliation removes deleted drawers and newly added drawers start closed", () => {
  const four = setup().drawers, three = setup(3).drawers;
  const before = { [four[0].id]: 0.5, [four[3].id]: 1, removed: 1 };
  const reduced = reconcileDrawerPositions(three, before);
  assert.equal(reduced[four[0].id], 0.5); assert.equal(reduced[four[3].id], undefined);
  assert.equal(reduced.removed, undefined);
  assert.equal(reconcileDrawerPositions(four, reduced)[four[3].id], 0);
  assert.deepEqual(setDrawerOpening(three, before, four[3].id, 1), reduced);
  assert.deepEqual(reconcileDrawerPositions([], before), {});
});

for (const [input, expected] of [[-1, 0], [2, 1], [NaN, 0], [Infinity, 0]] as const) test(`drawer targets clamp safely: ${input}`, () => {
  const { drawers } = setup(); const p = setDrawerOpening(drawers, {}, drawers[0].id, input);
  assert.equal(p[drawers[0].id], expected);
  assert(drawerOffset(input, 300)[2] >= -0.3 && drawerOffset(input, 300)[2] <= 0);
});
for (const [input, expected] of [[-1, 0], [0, 0], [125, 125], [10000, 400], [NaN, 0], [Infinity, 0]] as const) test(`demo maximum travel is finite and clamped: ${input}`, () => {
  assert.equal(clampDemoTravel(input), expected);
  near(drawerOffset(1, input)[2], -expected / 1000);
});

test("animation advances smoothly and monotonically to each target without overshooting", () => {
  let z = 0;
  for (let i = 0; i < 180; i++) {
    const next = advanceDrawerOffset(z, 1, 300, 1 / 60);
    assert(next <= z && next >= -0.3);
    if (i === 0) assert(next < 0 && next > -0.3);
    z = next;
  }
  assert.equal(z, -0.3);
  for (let i = 0; i < 180; i++) {
    const next = advanceDrawerOffset(z, 0, 300, 1 / 60); assert(next >= z && next <= 0); z = next;
  }
  assert.equal(z, 0);
});

test("rapid reversals and invalid frame deltas cannot exceed travel limits", () => {
  let z = -0.1;
  for (const delta of [1 / 60, 10, NaN, -1, Infinity]) {
    z = advanceDrawerOffset(z, 1, 300, delta); assert(Number.isFinite(z) && z >= -0.3 && z <= 0);
    z = advanceDrawerOffset(z, 0, 300, delta); assert(Number.isFinite(z) && z >= -0.3 && z <= 0);
  }
});

test("lowering maximum travel clamps an already-open group before its next rendered frame", () => {
  assert.equal(advanceDrawerOffset(-0.3, 1, 50, 1 / 60), -0.05);
  assert.equal(advanceDrawerOffset(-0.3, 1, NaN, 1 / 60), 0);
  assert.equal(advanceDrawerOffset(-0.3, 1, 0, 1 / 60), 0);
});

test("component and grouped BOM selection highlight their complete parent drawers", () => {
  const { result, drawers } = setup();
  const single = drawerSelection(drawers, ["chest/drawer-2/left"]);
  assert.deepEqual(single.drawerIds, ["chest/drawer-2"]); assert.equal(single.highlightedIds.length, 6);
  const bottoms = result.bom.find(l => l.partNames.includes("Drawer bottom"))!;
  const grouped = drawerSelection(drawers, bottoms.componentIds);
  assert.equal(grouped.drawerIds.length, 4); assert.equal(grouped.highlightedIds.length, 24);
  assert.deepEqual(drawerSelection(drawers, ["chest/carcass/top"]), { drawerIds: [], highlightedIds: ["chest/carcass/top"] });
});

test("camera envelope includes demo travel without changing the closed model bounds", () => {
  const { model, drawers } = setup(), before = JSON.stringify(model.bounds);
  const bounds = drawerMotionBounds(model, drawers, 300)!;
  near(bounds.center[2] - bounds.size[2] / 2, -0.318);
  near(bounds.center[2] + bounds.size[2] / 2, 0.5);
  near(bounds.size[0], 0.9); near(bounds.size[1], 0.85);
  assert.equal(JSON.stringify(model.bounds), before);
});

test("invalid specifications expose no moving groups or stale movement bounds", () => {
  const s = createDemoChestSpecification(); s.drawerCount = 3.5;
  const r = generateFurniture(s), model = createPreviewModel(r);
  assert.deepEqual(groupDrawerPanels(r.assemblies, model), []);
  assert.equal(drawerMotionBounds(model, [], 300), null);
});
