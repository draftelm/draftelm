import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture } from "../src/furniture";
import { createPreviewModel } from "../src/components/furniture/viewerGeometry";
import { groupDrawerPanels, resetDrawerPositions, setDrawerOpening } from "../src/components/furniture/drawerMotion";
import { advanceVisualFrame, createExplosionPlan, explosionBounds, explosionOffsets, explosionStages, initialVisualFrame, visualFrameSettled } from "../src/components/furniture/explosion";
import type { ExplosionMode, VisualFrame } from "../src/components/furniture/explosion";

function setup(width = 900, height = 850, depth = 500, count = 4) {
  const s = createDemoChestSpecification(); Object.assign(s.dimensions, { width, height, depth }); s.drawerCount = count;
  const result = generateFurniture(s), model = createPreviewModel(result), drawers = groupDrawerPanels(result.assemblies, model);
  return { result, model, drawers, plan: createExplosionPlan(model, drawers) };
}
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function transformed(f: ReturnType<typeof setup>, mode: ExplosionMode, amount: number) {
  const offsets = explosionOffsets(f.plan, mode, amount);
  const parents = new Map(f.drawers.flatMap(d => d.panels.map(p => [p.component.id, d.id] as const)));
  return f.model.panels.map(p => {
    const parent = parents.get(p.component.id);
    return { id: p.component.id, size: p.size, center: p.center.map((v, a) => v + (parent ? offsets.drawerOffsets[parent][a] : 0) + offsets.panelOffsets[p.component.id][a]) };
  });
}
function settle(f: ReturnType<typeof setup>, frame: VisualFrame, mode: ExplosionMode, amount: number, positions: Record<string, number>) {
  for (let i = 0; i < 800; i++) {
    frame = advanceVisualFrame(frame, mode, amount, f.drawers, positions, 300, 1 / 60);
    if (visualFrameSettled(frame, mode, amount, f.drawers, positions, 300)) return frame;
  }
  assert.fail("Visual state did not settle");
}

test("assembly explosion keeps carcass fixed and translates each drawer rigidly along negative Z", () => {
  const f = setup(), offsets = explosionOffsets(f.plan, "assembly", 1), moved = transformed(f, "assembly", 1);
  for (const p of f.model.panels) {
    const m = moved.find(q => q.id === p.component.id)!;
    near(m.center[0], p.center[0]); near(m.center[1], p.center[1]);
    const drawer = f.drawers.find(d => d.id === p.component.assemblyId);
    near(m.center[2] - p.center[2], drawer ? offsets.drawerOffsets[drawer.id][2] : 0);
    assert.deepEqual(offsets.panelOffsets[p.component.id], [0, 0, 0]);
  }
  assert.equal(new Set(Object.values(offsets.drawerOffsets).map(v => v[2])).size, 4);
  assert(Object.values(offsets.drawerOffsets).every(v => v[2] < 0));
});

test("individual panel directions follow construction axes, not random displacement", () => {
  const { plan } = setup(), offsets = explosionOffsets(plan, "panels", 1).panelOffsets;
  for (const [id, axis, sign] of [
    ["chest/carcass/top", 1, 1], ["chest/carcass/base", 1, -1],
    ["chest/carcass/left", 0, -1], ["chest/carcass/right", 0, 1], ["chest/carcass/back", 2, 1],
    ["chest/drawer-1/front", 2, -1], ["chest/drawer-1/box-front", 2, -1], ["chest/drawer-1/rear", 2, 1],
    ["chest/drawer-1/left", 0, -1], ["chest/drawer-1/right", 0, 1], ["chest/drawer-1/bottom", 1, -1],
  ] as const) {
    assert.equal(Math.sign(offsets[id][axis]), sign);
    offsets[id].forEach((v, a) => { if (a !== axis) near(v, 0); });
  }
  assert(offsets["chest/drawer-1/front"][2] < offsets["chest/drawer-1/box-front"][2]);
});

test("progressive panel stage waits until complete drawers are extracted", () => {
  const f = setup();
  for (const n of [0, 0.1, 0.3, 0.4]) {
    const o = explosionOffsets(f.plan, "panels", n);
    assert(Object.values(o.panelOffsets).every(v => v.every(x => x === 0)));
    assert(Object.values(o.drawerOffsets).every(v => v[0] === 0 && v[1] === 0));
  }
  assert.deepEqual(explosionStages(0.4), { extraction: 1, panels: 0 });
  assert.equal(explosionStages(0.7).extraction, 1); near(explosionStages(0.7).panels, 0.5);
  assert(Object.values(explosionOffsets(f.plan, "panels", 1).panelOffsets).every(v => v.some(x => x !== 0)));
});

for (const mode of ["assembly", "panels"] as const) test(`${mode} zero/reset offsets preserve all closed coordinates and IDs`, () => {
  const f = setup(), moved = transformed(f, mode, 0);
  assert.deepEqual(moved.map(p => p.id), f.model.panels.map(p => p.component.id));
  for (const p of moved) assert.deepEqual(p.center, f.model.panels.find(q => q.component.id === p.id)!.center);
});

for (const dimensions of [[900, 850, 500, 4], [1100, 1000, 600, 4], [900, 850, 500, 3], [900, 850, 500, 1]] as const) test(`explosion supports ${dimensions.join("/")} with separated final boxes and finite camera bounds`, () => {
  const f = setup(...dimensions); assert(f.result.geometryValid);
  for (const mode of ["assembly", "panels"] as const) {
    // Sample illustrative AABB separation, including extraction and panel staging.
    for (const amount of [0, 0.1, 0.25, 0.4, 0.5, 0.7, 1]) {
    const panels = transformed(f, mode, amount);
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      assert(![0, 1, 2].every(a => Math.min(panels[i].center[a] + panels[i].size[a] / 2, panels[j].center[a] + panels[j].size[a] / 2) -
        Math.max(panels[i].center[a] - panels[i].size[a] / 2, panels[j].center[a] - panels[j].size[a] / 2) > 1e-8), `${mode}: ${panels[i].id} intersects ${panels[j].id}`);
    }
    }
    const bounds = explosionBounds(f.model, f.drawers, f.plan, 300)!;
    for (const amount of [0, 0.2, 0.4, 0.7, 1]) for (const p of transformed(f, mode, amount)) p.center.forEach((v, a) => {
      assert(v - p.size[a] / 2 >= bounds.center[a] - bounds.size[a] / 2 - 1e-8);
      assert(v + p.size[a] / 2 <= bounds.center[a] + bounds.size[a] / 2 + 1e-8);
    });
  }
});

test("activation closes visual opening first, never sums opening and explosion, and restores saved values", () => {
  const f = setup(), positions = { [f.drawers[0].id]: 1, [f.drawers[2].id]: 0.5 }, saved = JSON.stringify(positions);
  let frame = settle(f, initialVisualFrame("assembly"), "assembly", 0, positions);
  assert.equal(frame.openingZ[f.drawers[0].id], -0.3);
  for (let i = 0; i < 400; i++) {
    frame = advanceVisualFrame(frame, "assembly", 1, f.drawers, positions, 300, 1 / 60);
    if (frame.amount > 0) assert(Object.values(frame.openingZ).every(z => z === 0));
  }
  assert.equal(frame.amount, 1);
  frame = settle(f, frame, "assembly", 0, positions);
  assert.equal(frame.openingZ[f.drawers[0].id], -0.3); assert.equal(frame.openingZ[f.drawers[2].id], -0.15);
  assert.equal(JSON.stringify(positions), saved);
});

test("mode switching reassembles fully before changing directions, even after rapid reversals", () => {
  const f = setup(), positions = resetDrawerPositions(f.drawers);
  let frame = settle(f, initialVisualFrame("assembly"), "assembly", 1, positions), switched = false;
  for (let i = 0; i < 500; i++) {
    const next = advanceVisualFrame(frame, "panels", 1, f.drawers, positions, 300, 1 / 60);
    if (frame.mode !== next.mode) { assert.equal(next.amount, 0); switched = true; }
    frame = next;
  }
  assert(switched); assert.equal(frame.mode, "panels"); assert.equal(frame.amount, 1);
  frame = advanceVisualFrame(frame, "assembly", 1, f.drawers, positions, 300, 1 / 60);
  frame = settle(f, frame, "panels", 0.5, positions);
  assert.equal(frame.amount, 0.5); assert.equal(frame.mode, "panels");
});

test("Reset Drawers and Reset Explosion act independently on saved state", () => {
  const f = setup(), positions = setDrawerOpening(f.drawers, {}, f.drawers[0].id, 1);
  let frame = settle(f, initialVisualFrame("panels"), "panels", 1, positions);
  const cleared = resetDrawerPositions(f.drawers);
  frame = settle(f, frame, "panels", 1, cleared); assert.equal(frame.amount, 1);
  frame = settle(f, frame, "panels", 0, cleared); assert(Object.values(frame.openingZ).every(z => z === 0));
  assert.equal(positions[f.drawers[0].id], 1);
});

test("parameter/count revisions create fresh plans without deleted IDs or engine/BOM mutations", () => {
  const f = setup(), before = JSON.stringify(f.result);
  for (const mode of ["assembly", "panels"] as const) for (const n of [0, 0.2, 0.8, 1]) transformed(f, mode, n);
  assert.equal(JSON.stringify(f.result), before);
  const changed = setup(1000, 950, 600, 3);
  assert.equal(Object.keys(changed.plan.drawerOffsets).length, 3);
  assert(!Object.keys(changed.plan.panelOffsets).some(id => id.startsWith("chest/drawer-4/")));
  assert.notDeepEqual(changed.plan.drawerOffsets, f.plan.drawerOffsets);
  assert.equal(initialVisualFrame("assembly").amount, 0);
});

test("non-finite explosion inputs fail closed and invalid models have no plan/bounds", () => {
  const f = setup(); assert.deepEqual(explosionStages(NaN), { extraction: 0, panels: 0 });
  assert.deepEqual(explosionStages(-1), { extraction: 0, panels: 0 });
  assert.deepEqual(explosionStages(2), { extraction: 1, panels: 1 });
  const s = createDemoChestSpecification(); s.drawerCount = 3.5;
  const result = generateFurniture(s), model = createPreviewModel(result), drawers = groupDrawerPanels(result.assemblies, model), plan = createExplosionPlan(model, drawers);
  assert.deepEqual(plan, { drawerOffsets: {}, panelOffsets: {} }); assert.equal(explosionBounds(model, drawers, plan, 300), null);
  const frame = advanceVisualFrame(initialVisualFrame("assembly"), "assembly", NaN, f.drawers, {}, 300, NaN);
  assert.equal(frame.amount, 0);
});
