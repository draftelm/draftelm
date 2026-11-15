import test from "node:test";
import assert from "node:assert/strict";
import { createDemoChestSpecification, generateFurniture, validateComponentGeometry, validateFurnitureAssembly, validateRequiredContacts, getFurnitureRevision } from "../src/furniture";
import type { FurnitureSpecification, FurnitureResult, PanelComponent } from "../src/furniture";

function panel(r: FurnitureResult, id: string): PanelComponent {
  const p = r.components.find(c => c.id === id);
  assert(p?.kind === "panel", `Missing panel ${id}`);
  return p;
}
function valid(s = createDemoChestSpecification()) {
  const r = generateFurniture(s);
  assert.equal(r.geometryValid, true, JSON.stringify(r.issues));
  return r;
}
function invalid(change: (s: FurnitureSpecification) => void, code: string) {
  const s = createDemoChestSpecification(); change(s);
  const r = generateFurniture(s);
  assert.equal(r.geometryValid, false);
  assert.equal(r.manufacturingReady, false);
  assert.equal(r.bom.length, 0);
  assert(r.issues.some(i => i.code === code), JSON.stringify(r.issues));
}

test("reference carcass: 900 x 500 x 18, 814 side height, 864 internal width", () => {
  const r = valid();
  assert.deepEqual(panel(r, "chest/carcass/top").dimensions, { x: 900, y: 18, z: 500 });
  assert.deepEqual(panel(r, "chest/carcass/base").dimensions, { x: 900, y: 18, z: 500 });
  const left = panel(r, "chest/carcass/left"), right = panel(r, "chest/carcass/right");
  assert.deepEqual(left.dimensions, { x: 18, y: 814, z: 500 });
  assert.equal(right.position.x - (left.position.x + left.dimensions.x), 864);
  assert.equal(panel(r, "chest/carcass/top").position.y, 832);
  assert.equal(r.components.filter(c => c.kind === "panel").length, 29);
  assert.equal(r.assemblies.length, 6);
});

test("square back has nominal zero edge gap, rear inset and unverified surface hardware", () => {
  const r = valid();
  const back = panel(r, "chest/carcass/back");
  assert.deepEqual(back.dimensions, { x: 864, y: 814, z: 6 });
  assert.deepEqual(back.position, { x: 18, y: 18, z: 484 });
  assert.equal(r.components.filter(c => c.kind === "hardware" && c.hardwareId === "generic-unverified-back-bracket").length, 8);
});

test("drawer boxes use five non-overlapping panels and separate fronts", () => {
  const r = valid();
  const side = panel(r, "chest/drawer-1/left"), front = panel(r, "chest/drawer-1/box-front");
  assert.equal(side.dimensions.y, 124);
  assert.equal(side.dimensions.z, 400);
  assert.equal(side.position.x, 30.7);
  assert.equal(front.dimensions.x, 814.6);
  assert.equal(front.position.x, side.position.x + 12);
  assert.equal(panel(r, "chest/drawer-1/bottom").dimensions.x, 838.6);
  const first = panel(r, "chest/drawer-1/front"), second = panel(r, "chest/drawer-2/front");
  assert.deepEqual(first.dimensions, { x: 896, y: 209.25, z: 18 });
  assert.deepEqual(first.position, { x: 2, y: 2, z: -18 });
  assert.equal(second.position.y - first.position.y - first.dimensions.y, 3);
  assert.equal(r.components.filter(c => c.kind === "hardware" && c.hardwareId === "generic-unverified-runner").length, 8);
  assert.deepEqual(validateComponentGeometry(r.components), []);
});

for (const [name, changes] of [
  ["width", { width: 1100 }], ["height", { height: 1000 }],
  ["depth", { depth: 600 }], ["all dimensions", { width: 1000, height: 950, depth: 550 }],
] as const) {
  test(`parametric change to ${name}`, () => {
    const s = createDemoChestSpecification(); Object.assign(s.dimensions, changes);
    const r = valid(s), { width: w, height: h, depth: d } = s.dimensions;
    assert.deepEqual(panel(r, "chest/carcass/top").dimensions, { x: w, y: 18, z: d });
    assert.equal(panel(r, "chest/carcass/left").dimensions.y, h - 36);
    assert.equal(panel(r, "chest/carcass/back").position.z, d - 16);
    assert.deepEqual(panel(r, "chest/carcass/back").dimensions, { x: w - 36, y: h - 36, z: 6 });
    assert.deepEqual(panel(r, "chest/carcass/back").position, { x: 18, y: 18, z: d - 16 });
    assert.deepEqual(r.bom.find(l => l.componentIds.includes("chest/carcass/back"))?.cutSize,
      { length: Math.max(w - 36, h - 36), width: Math.min(w - 36, h - 36), thickness: 6 });
    assert.equal(panel(r, "chest/drawer-1/bottom").dimensions.x, w - 36 - 25.4);
    assert.equal(panel(r, "chest/drawer-2/bottom").position.y, 26 + (h - 1) / 4);
  });
}

test("carcass thickness changes opening and side height without changing full-width top", () => {
  const s = createDemoChestSpecification(); s.panels.carcass.thickness = 22;
  const r = valid(s);
  assert.deepEqual(panel(r, "chest/carcass/top").dimensions, { x: 900, y: 22, z: 500 });
  assert.equal(panel(r, "chest/carcass/left").dimensions.y, 806);
  assert.deepEqual(panel(r, "chest/carcass/back").dimensions, { x: 856, y: 806, z: 6 });
  assert.deepEqual(panel(r, "chest/carcass/back").position, { x: 22, y: 22, z: 484 });
  assert.equal(panel(r, "chest/drawer-1/bottom").dimensions.x, 830.6);
});

test("box wall, bottom and front thicknesses are independent", () => {
  const s = createDemoChestSpecification(); s.panels.drawerWall.thickness = 15;
  s.panels.drawerBottom.thickness = 9; s.panels.drawerFront.thickness = 22;
  const r = valid(s);
  assert.equal(panel(r, "chest/drawer-1/left").dimensions.y, 121);
  assert.equal(panel(r, "chest/drawer-1/box-front").dimensions.x, 808.6);
  assert.equal(panel(r, "chest/drawer-1/front").position.z, -22);
});

test("configurable runner, back clearance and inset front", () => {
  const s = createDemoChestSpecification();
  s.hardware.runner.sideClearance = 15; s.hardware.runner.envelopeWidth = 15; s.hardware.runner.length = 350;
  s.hardware.runner.frontOffset = 10; s.construction.back.rearInset = 20;
  s.construction.back.edgeClearance = 2;
  s.construction.fronts.overlay = { left: 0, right: 0, top: 0, bottom: 0 };
  s.construction.fronts.rearFaceSetback = 18;
  const r = valid(s);
  assert.equal(panel(r, "chest/drawer-1/bottom").dimensions.x, 834);
  assert.equal(panel(r, "chest/drawer-1/front").position.z, 0);
  assert.equal(panel(r, "chest/carcass/back").position.z, 474);
});

test("BOM includes every component once, aggregates blanks and eight individual runners", () => {
  const r = valid();
  const ids = r.bom.flatMap(line => line.componentIds);
  assert.equal(new Set(ids).size, r.components.length);
  assert.deepEqual([...ids].sort(), r.components.map(c => c.id).sort());
  assert.equal(r.bom.reduce((n, l) => n + l.quantity, 0), r.components.reduce((n, c) => n + c.quantity, 0));
  assert.equal(r.bom.find(l => l.cutSize?.length === 900 && l.cutSize?.width === 500)?.quantity, 2);
  assert.deepEqual(r.bom.find(l => l.cutSize?.length === 900 && l.cutSize?.width === 500)?.partNames, ["Carcass base", "Carcass top"]);
  assert.equal(r.bom.find(l => l.itemId === "generic-unverified-runner")?.quantity, 8);
  assert.equal(r.bom.find(l => l.itemId === "generic-unverified-screw")?.quantity, 160);
});

test("deterministic IDs, input immutability and valid assembly references", () => {
  const s = createDemoChestSpecification(), snapshot = JSON.stringify(s);
  const r = valid(s); assert.deepEqual(r, generateFurniture(s)); assert.equal(JSON.stringify(s), snapshot);
  assert.equal(new Set(r.components.map(c => c.id)).size, r.components.length);
  const ids = new Set(r.assemblies.map(a => a.id));
  for (const a of r.assemblies) {
    if (a.parentId) assert(ids.has(a.parentId));
    assert.deepEqual(a.componentIds, r.components.filter(c => c.assemblyId === a.id).map(c => c.id));
  }
});

test("assumptions cannot be verified without evidence; phase 1 cannot certify manufacture", () => {
  const s = createDemoChestSpecification();
  assert.equal(valid(s).assumptionsVerified, false);
  for (const v of Object.values(s.verification)) v.status = "verified";
  assert.equal(valid(s).assumptionsVerified, false);
  for (const v of Object.values(s.verification)) { v.evidence = "Unit-test evidence only"; v.specificationRevision = getFurnitureRevision(s); }
  const r = valid(s);
  assert.equal(r.assumptionsVerified, true); assert.equal(r.manufacturingReady, false);
  assert(r.issues.some(i => i.code === "phase-1-only"));
});

test("drawer count is parametric within single-column construction", () => {
  const s = createDemoChestSpecification(); s.drawerCount = 3;
  const r = valid(s); assert.equal(r.components.filter(c => c.kind === "panel").length, 23);
  assert(!r.components.some(c => c.id.startsWith("chest/drawer-4/")));
});

const failures: [string, (s: FurnitureSpecification) => void, string][] = [
  ["NaN", s => { s.dimensions.width = NaN; }, "invalid-number"],
  ["infinity", s => { s.construction.fronts.verticalGap = Infinity; }, "invalid-number"],
  ["zero thickness", s => { s.panels.carcass.thickness = 0; }, "invalid-thickness"],
  ["negative gap", s => { s.construction.fronts.verticalGap = -1; }, "invalid-number"],
  ["excessive gap", s => { s.construction.fronts.verticalGap = 500; }, "front-gap"],
  ["impossible opening", s => { s.dimensions.width = 30; }, "carcass-opening"],
  ["shallow carcass", s => { s.dimensions.depth = 400; }, "drawer-depth"],
  ["short carcass", s => { s.dimensions.height = 500; }, "slot-fit"],
  ["fractional count", s => { s.drawerCount = 3.5; }, "invalid-count"],
  ["zero count", s => { s.drawerCount = 0; }, "invalid-count"],
  ["resource limit", s => { s.drawerCount = 100; }, "unsupported-count"],
  ["invalid fixing count", s => { s.construction.back.bracketCount = 1.5; }, "invalid-count"],
  ["runner side space", s => { s.hardware.runner.sideClearance = 10; }, "runner-fit"],
  ["runner length", s => { s.hardware.runner.length = 450; }, "runner-fit"],
  ["runner height", s => { s.hardware.runner.envelopeHeight = 200; }, "runner-fit"],
  ["runner bottom", s => { s.hardware.runner.bottomOffset = 0; }, "runner-fit"],
  ["box interior", s => { s.panels.drawerWall.thickness = 220; }, "box-fit"],
  ["back clearances", s => { s.construction.back.edgeClearance = 500; }, "back-fit"],
  ["legacy independent front setback", s => { Object.assign(s.construction.drawer, { frontSetback: 20 }); }, "unsupported-configuration"],
  ["unsupported overlay", s => { s.construction.fronts.overlay.left = 20; }, "unsupported-overlay"],
  ["unknown stock", s => { s.panels.back.materialId = "missing"; }, "unknown-material"],
  ["duplicate material", s => { s.materials.push({ ...s.materials[0] }); }, "invalid-material"],
  ["unsupported family", s => { Object.assign(s, { family: "wardrobe" }); }, "unsupported-configuration"],
  ["grooved back", s => { Object.assign(s.construction.back, { type: "grooved" }); }, "unsupported-configuration"],
  ["overlapping front", s => { s.construction.fronts.rearFaceSetback = 5; }, "panel-overlap"],
];
for (const [name, change, code] of failures) test(`rejects ${name}`, () => invalid(change, code));

test("intersection checker allows touching but rejects real penetration and duplicates", () => {
  const r = valid();
  const a = panel(r, "chest/carcass/base"), b = panel(r, "chest/carcass/left");
  assert.deepEqual(validateComponentGeometry([a, b]), []);
  const moved = { ...b, position: { ...b.position, y: b.position.y - 0.5 } };
  assert(validateComponentGeometry([a, moved]).some(i => i.code === "panel-overlap"));
  assert(validateComponentGeometry([a, { ...a }]).some(i => i.code === "duplicate-id"));
  assert(validateComponentGeometry([{ ...a, thickness: 19 }]).some(i => i.code === "invalid-component"));
});

test("all four fronts share box pitch, cover boxes, and directly contact box-front faces", () => {
  const s = createDemoChestSpecification(), r = valid(s);
  const frontYs = [2, 214.25, 426.5, 638.75], bottomYs = [26, 238.25, 450.5, 662.75];
  for (let i = 0; i < 4; i++) {
    const id = `chest/drawer-${i + 1}`, front = panel(r, `${id}/front`), box = panel(r, `${id}/box-front`), bottom = panel(r, `${id}/bottom`);
    assert.equal(front.position.y, frontYs[i]);
    assert.equal(bottom.position.y, bottomYs[i]);
    assert.equal(front.position.z + front.dimensions.z, box.position.z);
    assert(front.position.y <= bottom.position.y);
    assert(front.position.y + front.dimensions.y >= bottom.position.y + 130);
    assert(front.position.x <= bottom.position.x);
    assert(front.position.x + front.dimensions.x >= bottom.position.x + bottom.dimensions.x);
    assert.deepEqual(validateRequiredContacts(r.components, [{ firstId: front.id, secondId: box.id, axis: "z" }]), []);
    if (i > 0) assert.equal(front.position.y - frontYs[i - 1] - front.dimensions.y, 3);
  }
  assert.deepEqual(validateFurnitureAssembly(s, r.components), []);
});

for (const [name, change, code] of [
  ["review regression: 200 mm front gaps", (s: FurnitureSpecification) => { s.construction.fronts.verticalGap = 200; }, "slot-fit"],
  ["zero running gap", (s: FurnitureSpecification) => { s.construction.fronts.verticalGap = 0; }, "front-gap"],
  ["narrow fronts cannot cover boxes", (s: FurnitureSpecification) => { s.construction.fronts.edgeGap.left = 400; s.construction.fronts.edgeGap.right = 400; }, "front-attachment"],
  ["floating runner", (s: FurnitureSpecification) => { s.hardware.runner.sideClearance = 15; }, "runner-fit"],
  ["runner wider than mounting space", (s: FurnitureSpecification) => { s.hardware.runner.envelopeWidth = 15; }, "runner-fit"],
  ["box bottom outside its front cell", (s: FurnitureSpecification) => { s.construction.drawer.frontBottomOffset = 0; }, "slot-fit"],
  ["box too high for front cell", (s: FurnitureSpecification) => { s.construction.drawer.frontBottomOffset = 100; }, "slot-fit"],
  ["insufficient screw attachment area", (s: FurnitureSpecification) => { s.construction.fronts.attachmentEdgeMargin = 65; }, "front-attachment"],
  ["single back bracket unsupported", (s: FurnitureSpecification) => { s.construction.back.bracketCount = 1; }, "back-mounting"],
  ["off-panel back mounting offset", (s: FurnitureSpecification) => { s.construction.back.mountingEdgeOffset = 500; }, "back-mounting"],
  ["bottom fixing allowance misses walls", (s: FurnitureSpecification) => { s.construction.drawer.bottomScrewCount = 3; }, "bottom-fixing"],
  ["unsupported grooved bottom", (s: FurnitureSpecification) => { Object.assign(s.construction.drawer, { bottomFixing: "grooved" }); }, "unsupported-configuration"],
] as const) test(`rejects ${name}`, () => invalid(change, code));

function changedComponent(id: string, change: (c: FurnitureResult["components"][number]) => void) {
  const s = createDemoChestSpecification(), r = valid(s), c = r.components.find(c => c.id === id);
  assert(c); change(c);
  return validateFurnitureAssembly(s, r.components);
}

test("detached decorative front is rejected even with zero panel intersections", () => {
  const issues = changedComponent("chest/drawer-1/front", c => { c.position.z -= 20; });
  assert(issues.some(i => i.code === "required-contact"));
  assert(issues.some(i => i.code === "assembly-placement"));
  assert(!issues.some(i => i.code === "panel-overlap"));
});

test("shifted front with partial contact is still rejected by shared-layout validation", () => {
  assert(changedComponent("chest/drawer-4/front", c => { c.position.y += 50; }).some(i => i.code === "assembly-placement"));
});

test("bottom must contact all four walls with its specified full footprint", () => {
  const issues = changedComponent("chest/drawer-1/bottom", c => { c.position.y -= 1; });
  assert.equal(issues.filter(i => i.code === "required-contact").length, 4);
  assert(!issues.some(i => i.code === "panel-overlap"));
  assert(changedComponent("chest/drawer-1/bottom", c => { if (c.dimensions) c.dimensions.x -= 10; }).some(i => i.code === "assembly-placement"));
});

test("missing required panel or runner is rejected", () => {
  const s = createDemoChestSpecification(), r = valid(s);
  for (const id of ["chest/drawer-1/box-front", "chest/drawer-1/runner-left"]) {
    const issues = validateFurnitureAssembly(s, r.components.filter(c => c.id !== id));
    assert(issues.some(i => i.code === "required-contact"));
    assert(issues.some(i => i.code === "assembly-placement"));
  }
});

test("runner must touch drawer and cabinet, not float inside the side gap", () => {
  const issues = changedComponent("chest/drawer-1/runner-left", c => { c.position.x += 0.5; });
  assert(issues.some(i => i.code === "required-contact"));
  assert(issues.some(i => i.code === "hardware-interference"));
});

test("runner inside back panel and hardware-to-hardware intersections are detected", () => {
  const r = valid(), back = panel(r, "chest/carcass/back");
  const runner = r.components.find(c => c.id === "chest/drawer-1/runner-left"); assert(runner);
  const moved = { ...runner, position: { ...back.position } };
  assert(validateComponentGeometry([back, moved]).some(i => i.code === "hardware-interference"));
  assert(validateComponentGeometry([runner, { ...runner, id: "extra-runner" }]).some(i => i.code === "hardware-interference"));
});

test("contact validation distinguishes area contact, penetration, gaps and edge touching", () => {
  const r = valid(), base = panel(r, "chest/carcass/base"), side = panel(r, "chest/carcass/left");
  const contacts = [{ firstId: base.id, secondId: side.id, axis: "y" as const }];
  assert.deepEqual(validateRequiredContacts([base, side], contacts), []);
  for (const delta of [-1, 1]) assert(validateRequiredContacts([base, { ...side, position: { ...side.position, y: side.position.y + delta } }], contacts).length > 0);
  assert(validateRequiredContacts([base, { ...side, position: { ...side.position, x: 900 } }], contacts).length > 0);
});

test("eight back brackets have unique positions and valid back/carcass face anchors", () => {
  const s = createDemoChestSpecification(), r = valid(s);
  const brackets = r.components.filter(c => c.kind === "hardware" && c.hardwareId === s.hardware.backBracketId);
  assert.equal(brackets.length, 8);
  assert.equal(new Set(brackets.map(c => JSON.stringify(c.position))).size, 8);
  for (const c of brackets) {
    assert(c.kind === "hardware"); assert.equal(c.quantity, 1); assert.equal(c.mounts?.length, 2);
    assert.equal(c.mounts?.[0].point.z, 490);
  }
  assert.deepEqual(validateFurnitureAssembly(s, r.components), []);
  assert(validateFurnitureAssembly(s, r.components.filter(c => c.id !== brackets[0].id)).some(i => i.code === "bracket-mounting"));
});

test("back brackets cannot have displaced, duplicated or off-face anchors", () => {
  assert(changedComponent("chest/carcass/back-bracket-1", c => { c.position.x += 1; }).some(i => i.code === "bracket-mounting"));
  assert(changedComponent("chest/carcass/back-bracket-1", c => { if (c.kind === "hardware" && c.mounts) c.mounts[1].point.x += 1; }).some(i => i.code === "bracket-mounting"));
});

test("adjustable inset depth maintains direct screw contact", () => {
  const s = createDemoChestSpecification(); s.construction.fronts.overlay = { left: 0, right: 0, top: 0, bottom: 0 };
  s.construction.fronts.rearFaceSetback = 18;
  const r = valid(s);
  for (let i = 1; i <= 4; i++) {
    assert.equal(panel(r, `chest/drawer-${i}/front`).position.z, 0);
    assert.equal(panel(r, `chest/drawer-${i}/box-front`).position.z, 18);
  }
});

const approvalMutations: [string, (s: FurnitureSpecification) => void][] = [
  ["bottom thickness", s => { s.panels.drawerBottom.thickness = 1; }],
  ["overall width", s => { s.dimensions.width += 10; }],
  ["runner envelope and space", s => { s.hardware.runner.envelopeWidth = 13; s.hardware.runner.sideClearance = 13; }],
  ["front gap", s => { s.construction.fronts.verticalGap = 4; }],
  ["back mounting position", s => { s.construction.back.mountingEdgeOffset = 30; }],
  ["bottom fixing count", s => { s.construction.drawer.bottomScrewCount = 12; }],
];
for (const [name, mutate] of approvalMutations) test(`approval evidence invalidates after changing ${name}`, () => {
  const s = createDemoChestSpecification(), revision = getFurnitureRevision(s);
  for (const v of Object.values(s.verification)) Object.assign(v, { status: "verified", evidence: "Test approval", specificationRevision: revision });
  assert.equal(valid(s).assumptionsVerified, true);
  mutate(s);
  const r = valid(s);
  assert.notEqual(r.specificationRevision, revision);
  assert.equal(r.assumptionsVerified, false);
  assert.equal(r.issues.filter(i => i.code.startsWith("unverified:")).length, 7);
  assert.equal(r.manufacturingReady, false);
  assert(Object.values(s.verification).every(v => v.specificationRevision === revision), "Old evidence is retained for audit, never silently reapproved.");
});

test("revision is independent of object key order and verification text", () => {
  const s = createDemoChestSpecification(), revision = getFurnitureRevision(s);
  s.dimensions = { depth: 500, height: 850, width: 900 };
  s.verification.materials.evidence = "Additional review note";
  assert.equal(getFurnitureRevision(s), revision);
  assert.equal(valid(s).assumptionsVerified, false);
});

test("required fixing allowances and hardware definitions cannot be omitted or substituted", () => {
  const s = createDemoChestSpecification(), r = valid(s);
  for (const id of ["chest/drawer-1/box-screws", "chest/drawer-1/front-screws", "chest/carcass/back-screws-1"]) {
    assert(validateFurnitureAssembly(s, r.components.filter(c => c.id !== id)).some(i => i.code === "assembly-hardware"));
  }
  assert(changedComponent("chest/drawer-1/runner-left", c => { if (c.kind === "hardware") c.hardwareId = "different-runner"; }).some(i => i.code === "assembly-hardware"));
  assert(changedComponent("chest/drawer-1/box-screws", c => { c.quantity = 1; }).some(i => i.code === "assembly-hardware"));
});

test("unmodelled packing or extra fittings are not silently accepted", () => {
  const s = createDemoChestSpecification(), r = valid(s);
  const extra = { ...panel(r, "chest/carcass/back"), id: "unapproved-packing", position: { x: 1000, y: 0, z: 0 } };
  assert(validateFurnitureAssembly(s, [...r.components, extra]).some(i => i.code === "unsupported-component"));
});

const backContacts = [
  { firstId: "chest/carcass/back", secondId: "chest/carcass/left", axis: "x" as const },
  { firstId: "chest/carcass/back", secondId: "chest/carcass/right", axis: "x" as const },
  { firstId: "chest/carcass/back", secondId: "chest/carcass/base", axis: "y" as const },
  { firstId: "chest/carcass/back", secondId: "chest/carcass/top", axis: "y" as const },
];

test("reference back bears against all four internal faces without positive-volume intersections", () => {
  const s = createDemoChestSpecification(), r = valid(s), back = panel(r, "chest/carcass/back");
  assert.equal(s.construction.back.edgeClearance, 0);
  assert.deepEqual(back.position, { x: 18, y: 18, z: 484 });
  assert.equal(back.position.x + back.dimensions.x, 882);
  assert.equal(back.position.y + back.dimensions.y, 832);
  assert.equal(s.dimensions.depth - (back.position.z + back.dimensions.z), 10);
  assert.deepEqual(validateRequiredContacts(r.components, backContacts), []);
  assert.deepEqual(validateComponentGeometry(r.components), []);
  const line = r.bom.find(l => l.componentIds.includes(back.id));
  assert.deepEqual(line?.cutSize, { length: 864, width: 814, thickness: 6 });
  assert.equal(line?.quantity, 1);
  assert.equal(r.assumptionsVerified, false);
  assert.equal(r.manufacturingReady, false);
});

test("zero-gap back cannot shrink away from its supporting faces even without collision", () => {
  const s = createDemoChestSpecification(), r = valid(s), back = panel(r, "chest/carcass/back");
  back.position.x += 1; back.position.y += 1;
  back.dimensions.x -= 2; back.dimensions.y -= 2;
  assert.deepEqual(validateComponentGeometry(r.components), []);
  const missing = validateFurnitureAssembly(s, r.components).filter(i => i.code === "required-contact");
  assert.equal(missing.length, 4);
  assert(missing.every(i => i.componentIds?.includes(back.id)));
});

test("zero-gap back shifted into the carcass fails collision and contact checks", () => {
  const issues = changedComponent("chest/carcass/back", c => { c.position.x += 0.5; });
  assert(issues.some(i => i.code === "panel-overlap"));
  assert(issues.some(i => i.code === "required-contact"));
});

for (const clearance of [0.5, 1, 2]) test(`explicit ${clearance} mm back edge clearance is preserved without claiming bearing contact`, () => {
  const s = createDemoChestSpecification(); s.construction.back.edgeClearance = clearance;
  const r = valid(s), back = panel(r, "chest/carcass/back");
  assert.deepEqual(back.position, { x: 18 + clearance, y: 18 + clearance, z: 484 });
  assert.deepEqual(back.dimensions, { x: 864 - 2 * clearance, y: 814 - 2 * clearance, z: 6 });
  assert.equal(validateRequiredContacts(r.components, backContacts).length, 4);
  assert.deepEqual(validateFurnitureAssembly(s, r.components), []);
  assert.deepEqual(validateComponentGeometry(r.components), []);
  assert.equal(r.manufacturingReady, false);
});

test("back clearance changes only back-related components, not any drawer geometry or hardware", () => {
  const s = createDemoChestSpecification(), zero = valid(s);
  s.construction.back.edgeClearance = 1;
  const cleared = valid(s);
  const drawers = (r: FurnitureResult) => r.components.filter(c => c.assemblyId.startsWith("chest/drawer-"));
  assert.deepEqual(drawers(zero), drawers(cleared));
});

test("eight brackets remain individually positioned unverified retention allowances at zero gap", () => {
  const s = createDemoChestSpecification(), r = valid(s);
  const brackets = r.components.filter(c => c.kind === "hardware" && c.hardwareId === s.hardware.backBracketId);
  assert.equal(brackets.length, 8);
  for (const c of brackets) {
    assert(c.kind === "hardware"); assert.equal(c.quantity, 1);
    assert(c.name.includes("unverified fixing allowance"));
    assert.equal(c.dimensions, undefined, "No invented physical bracket solid");
    assert.equal(c.mounts?.length, 2);
  }
  assert.deepEqual(brackets[0].position, { x: 43, y: 18 + 814 / 3, z: 490 });
  assert(r.issues.some(i => i.code === "unverified:backFixing"));
});

test("changing back edge clearance invalidates existing approval evidence", () => {
  const s = createDemoChestSpecification(), revision = getFurnitureRevision(s);
  for (const v of Object.values(s.verification)) Object.assign(v, { status: "verified", evidence: "Test-only record", specificationRevision: revision });
  assert.equal(valid(s).assumptionsVerified, true);
  s.construction.back.edgeClearance = 1;
  const r = valid(s);
  assert.equal(r.assumptionsVerified, false);
  assert.notEqual(r.specificationRevision, revision);
  assert(r.issues.some(i => i.code === "unverified:backFixing"));
  assert.equal(r.manufacturingReady, false);
});

for (const clearance of [-1, NaN, Infinity, 407]) test(`invalid back edge clearance ${clearance} cannot produce a BOM`, () => {
  invalid(s => { s.construction.back.edgeClearance = clearance; }, clearance === 407 ? "back-fit" : "invalid-number");
});
