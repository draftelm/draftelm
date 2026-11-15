import type { FurnitureComponent, FurnitureIssue, FurnitureSpecification, RequiredContact, Vector3 } from "./types";
import { calculateBackBracketMounts, calculateDrawerLayout } from "./layout";
import { GEOMETRY_TOLERANCE_MM as EPS, validateComponentGeometry, validateFurnitureSpecification } from "./validation";

const axes = ["x", "y", "z"] as const;
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;
const samePoint = (a: Vector3, b: Vector3) => axes.every(axis => near(a[axis], b[axis]));

/** A face contact needs coincident opposed planes and positive area on both other axes.
 * Mere edge/corner touching, a gap, and penetration are not valid attachment contact.
 */
export function validateRequiredContacts(components: FurnitureComponent[], contacts: RequiredContact[]): FurnitureIssue[] {
  const byId = new Map(components.map(c => [c.id, c]));
  const issues: FurnitureIssue[] = [];
  for (const { firstId, secondId, axis } of contacts) {
    const a = byId.get(firstId), b = byId.get(secondId);
    const touching = a?.dimensions && b?.dimensions &&
      (near(a.position[axis] + a.dimensions[axis], b.position[axis]) || near(b.position[axis] + b.dimensions[axis], a.position[axis])) &&
      axes.filter(k => k !== axis).every(k => Math.min(a.position[k] + a.dimensions![k], b.position[k] + b.dimensions![k]) - Math.max(a.position[k], b.position[k]) > EPS);
    if (!touching) issues.push({ code: "required-contact", severity: "error", message: `Required ${axis}-face contact missing: ${firstId} / ${secondId}.`, componentIds: [firstId, secondId] });
  }
  return issues;
}

export function validateFurnitureAssembly(s: FurnitureSpecification, components: FurnitureComponent[]): FurnitureIssue[] {
  const inputErrors = validateFurnitureSpecification(s).filter(i => i.severity === "error");
  if (inputErrors.length) return inputErrors;
  const issues = validateComponentGeometry(components);
  const byId = new Map(components.map(c => [c.id, c]));
  const contacts: RequiredContact[] = [];
  const expectedIds = new Set<string>();
  const contact = (firstId: string, secondId: string, axis: RequiredContact["axis"]) => contacts.push({ firstId, secondId, axis });
  const error = (code: string, message: string, componentIds: string[]) => issues.push({ code, severity: "error", message, componentIds });
  const expectGeometry = (id: string, position: Vector3, dimensions: Vector3, kind: FurnitureComponent["kind"]) => {
    expectedIds.add(id);
    const c = byId.get(id);
    if (!c || c.kind !== kind || c.quantity !== 1 || !c.dimensions || !samePoint(c.position, position) || !samePoint(c.dimensions, dimensions)) {
      error("assembly-placement", `${id} does not match the supported specification-derived geometry.`, [id]);
    }
  };
  const expectHardware = (id: string, hardwareId: string, quantity: number) => {
    expectedIds.add(id);
    const c = byId.get(id);
    if (c?.kind !== "hardware" || c.hardwareId !== hardwareId || c.quantity !== quantity) {
      error("assembly-hardware", `${id} is missing or has the wrong definition/quantity.`, [id]);
    }
  };
  const { width: w, height: h, depth: d } = s.dimensions, t = s.panels.carcass.thickness;
  expectGeometry("chest/carcass/base", { x: 0, y: 0, z: 0 }, { x: w, y: t, z: d }, "panel");
  expectGeometry("chest/carcass/top", { x: 0, y: h - t, z: 0 }, { x: w, y: t, z: d }, "panel");
  expectGeometry("chest/carcass/left", { x: 0, y: t, z: 0 }, { x: t, y: h - 2 * t, z: d }, "panel");
  expectGeometry("chest/carcass/right", { x: w - t, y: t, z: 0 }, { x: t, y: h - 2 * t, z: d }, "panel");
  const back = s.construction.back;
  expectHardware("chest/carcass/joint-screws", s.hardware.screwId, 4 * s.construction.carcassScrewsPerJoint);
  expectGeometry("chest/carcass/back", { x: t + back.edgeClearance, y: t + back.edgeClearance, z: d - back.rearInset - s.panels.back.thickness },
    { x: w - 2 * t - 2 * back.edgeClearance, y: h - 2 * t - 2 * back.edgeClearance, z: s.panels.back.thickness }, "panel");
  for (const side of ["left", "right"]) for (const end of ["base", "top"]) contact(`chest/carcass/${side}`, `chest/carcass/${end}`, "y");
  // Nominal zero clearance means four required edge-to-internal-face contacts.
  // Positive configured clearance deliberately removes those bearing contacts;
  // the separately validated bracket allowance still does not prove fixing strength.
  if (back.edgeClearance === 0) {
    for (const side of ["left", "right"]) contact("chest/carcass/back", `chest/carcass/${side}`, "x");
    for (const end of ["base", "top"]) contact("chest/carcass/back", `chest/carcass/${end}`, "y");
  }

  for (const row of calculateDrawerLayout(s)) {
    const id = row.id, p = row.box.position, size = row.box.dimensions;
    const wall = s.panels.drawerWall.thickness, bottom = s.panels.drawerBottom.thickness, runner = s.hardware.runner;
    expectGeometry(`${id}/front`, row.front.position, row.front.dimensions, "panel");
    expectGeometry(`${id}/bottom`, p, { x: size.x, y: bottom, z: size.z }, "panel");
    for (const [side, x] of [["left", p.x], ["right", p.x + size.x - wall]] as const) {
      expectGeometry(`${id}/${side}`, { x, y: p.y + bottom, z: p.z }, { x: wall, y: size.y - bottom, z: size.z }, "panel");
      for (const end of ["box-front", "rear"]) contact(`${id}/${side}`, `${id}/${end}`, "x");
    }
    for (const [end, z] of [["box-front", p.z], ["rear", p.z + size.z - wall]] as const) {
      expectGeometry(`${id}/${end}`, { x: p.x + wall, y: p.y + bottom, z }, { x: size.x - 2 * wall, y: size.y - bottom, z: wall }, "panel");
    }
    for (const wallId of ["left", "right", "box-front", "rear"]) contact(`${id}/bottom`, `${id}/${wallId}`, "y");
    contact(`${id}/front`, `${id}/box-front`, "z");
    for (const [side, x] of [["left", p.x - runner.envelopeWidth], ["right", p.x + size.x]] as const) {
      const runnerId = `${id}/runner-${side}`;
      expectGeometry(runnerId, { x, y: p.y + runner.bottomOffset, z: p.z + runner.frontOffset },
        { x: runner.envelopeWidth, y: runner.envelopeHeight, z: runner.length }, "hardware");
      expectHardware(runnerId, runner.definitionId, 1);
      contact(runnerId, `${id}/${side}`, "x");
      contact(runnerId, `chest/carcass/${side}`, "x");
    }
    expectHardware(`${id}/box-screws`, s.hardware.screwId, 4 * s.construction.drawer.screwsPerCorner + s.construction.drawer.bottomScrewCount);
    expectHardware(`${id}/front-screws`, s.hardware.screwId, s.construction.fronts.screwsPerFront);
    expectHardware(`${id}/runner-screws`, s.hardware.screwId, 4 * runner.screwsPerMember);
  }
  issues.push(...validateRequiredContacts(components, contacts));

  // Brackets have individual, two-face anchors. No unverified bracket solid is invented.
  const positions = new Set<string>();
  calculateBackBracketMounts(s).forEach((expected, i) => {
    const id = `chest/carcass/back-bracket-${i + 1}`, c = byId.get(id);
    expectedIds.add(id);
    expectHardware(`chest/carcass/back-screws-${i + 1}`, s.hardware.screwId, back.screwsPerBracket);
    if (c?.kind !== "hardware" || c.quantity !== 1 || c.hardwareId !== s.hardware.backBracketId || c.mounts?.length !== 2 ||
      !samePoint(c.position, expected[0].point)) {
      error("bracket-mounting", `${id} needs one individually located bracket and two attachment-face anchors.`, [id]);
      return;
    }
    const key = JSON.stringify(c.position);
    if (positions.has(key)) error("bracket-mounting", `${id} duplicates another bracket position.`, [id]);
    positions.add(key);
    c.mounts.forEach((mount, index) => {
      const target = byId.get(mount.targetId), e = expected[index];
      const faceCoordinate = target && target.dimensions ? target.position[mount.axis] + (mount.face === "max" ? target.dimensions[mount.axis] : 0) : NaN;
      if (target?.kind !== "panel" || !near(mount.point[mount.axis], faceCoordinate) ||
        !axes.filter(a => a !== mount.axis).every(a => mount.point[a] >= target.position[a] - EPS && mount.point[a] <= target.position[a] + target.dimensions[a] + EPS) ||
        mount.targetId !== e.targetId || mount.axis !== e.axis || mount.face !== e.face || !samePoint(mount.point, e.point)) {
        error("bracket-mounting", `${id} has an unsupported or off-face mounting anchor.`, [id, mount.targetId]);
      }
    });
  });
  for (const c of components) {
    if (!expectedIds.has(c.id)) error("unsupported-component", `${c.id} is not part of the supported construction.`, [c.id]);
  }
  return issues;
}
