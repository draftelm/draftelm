import type { Assembly, FurnitureResult, FurnitureSpecification, PanelStock, Vector3, MountingAnchor } from "./types";
import { generateFurnitureBOM } from "./bom";
import { validateFurnitureSpecification } from "./validation";
import { validateFurnitureAssembly } from "./assemblyValidation";
import { calculateBackBracketMounts, calculateDrawerLayout } from "./layout";
import { getFurnitureRevision } from "./revision";

/** Pure deterministic geometry. Input is never modified; IDs are stable semantic paths. */
export function generateFurniture(s: FurnitureSpecification): FurnitureResult {
  const issues = validateFurnitureSpecification(s);
  const assumptionsVerified = !issues.some(i => i.code.startsWith("unverified:"));
  const result: FurnitureResult = { specificationRevision: getFurnitureRevision(s), assemblies: [], components: [], bom: [], issues,
    geometryValid: false, assumptionsVerified, manufacturingReady: false };
  if (issues.some(i => i.severity === "error")) return result;
  const { width: w, height: h, depth: d } = s.dimensions;
  const stock = s.panels, t = stock.carcass.thickness;
  const back = s.construction.back, box = s.construction.drawer, runner = s.hardware.runner;
  const assembly = (id: string, name: string, parentId: string | null, position: Vector3): Assembly => {
    const a = { id, name, parentId, position, componentIds: [] };
    result.assemblies.push(a); return a;
  };
  const root = assembly("chest", "Drawer chest", null, { x: 0, y: 0, z: 0 });
  const carcass = assembly("chest/carcass", "Carcass", root.id, { x: 0, y: 0, z: 0 });
  const panel = (a: Assembly, key: string, name: string, material: PanelStock, dimensions: Vector3,
    position: Vector3, thicknessAxis: "x" | "y" | "z") => {
    const id = `${a.id}/${key}`;
    result.components.push({ id, assemblyId: a.id, kind: "panel", name, materialId: material.materialId,
      dimensions, position, quantity: 1, thickness: material.thickness, thicknessAxis });
    a.componentIds.push(id);
  };
  const hardware = (a: Assembly, key: string, name: string, hardwareId: string, quantity: number,
    position: Vector3, dimensions?: Vector3, mounts?: MountingAnchor[]) => {
    const id = `${a.id}/${key}`;
    result.components.push({ id, assemblyId: a.id, kind: "hardware", name, hardwareId, quantity,
      position, ...(dimensions ? { dimensions } : {}), ...(mounts ? { mounts } : {}), placement: dimensions ? "envelope" : "schematic-anchor" });
    a.componentIds.push(id);
  };
  panel(carcass, "base", "Carcass base", stock.carcass, { x: w, y: t, z: d }, { x: 0, y: 0, z: 0 }, "y");
  panel(carcass, "top", "Carcass top", stock.carcass, { x: w, y: t, z: d }, { x: 0, y: h - t, z: 0 }, "y");
  for (const [key, x] of [["left", 0], ["right", w - t]] as const) {
    panel(carcass, key, "Carcass side", stock.carcass, { x: t, y: h - 2 * t, z: d }, { x, y: t, z: 0 }, "x");
  }
  const backPosition = { x: t + back.edgeClearance, y: t + back.edgeClearance, z: d - back.rearInset - stock.back.thickness };
  panel(carcass, "back", "Inset square-cut back", stock.back,
    { x: w - 2 * t - 2 * back.edgeClearance, y: h - 2 * t - 2 * back.edgeClearance, z: stock.back.thickness }, backPosition, "z");
  hardware(carcass, "joint-screws", "Carcass joint screws (unverified selection)", s.hardware.screwId,
    4 * s.construction.carcassScrewsPerJoint, carcass.position);
  calculateBackBracketMounts(s).forEach((mounts, i) => {
    hardware(carcass, `back-bracket-${i + 1}`, "Back surface bracket (mounting detail unverified)", s.hardware.backBracketId, 1, mounts[0].point, undefined, mounts);
    hardware(carcass, `back-screws-${i + 1}`, "Back bracket screws", s.hardware.screwId, back.screwsPerBracket, mounts[0].point);
  });

  const wall = stock.drawerWall.thickness, bottom = stock.drawerBottom.thickness;
  for (const [i, row] of calculateDrawerLayout(s).entries()) {
    const { x, y, z } = row.box.position, boxWidth = row.box.dimensions.x;
    const a = assembly(row.id, `Drawer ${i + 1} (bottom to top)`, root.id, { x, y, z });
    panel(a, "bottom", "Drawer bottom", stock.drawerBottom, { x: boxWidth, y: bottom, z: box.depth }, { x, y, z }, "y");
    for (const [key, px] of [["left", x], ["right", x + boxWidth - wall]] as const) {
      panel(a, key, "Drawer side", stock.drawerWall, { x: wall, y: box.height - bottom, z: box.depth }, { x: px, y: y + bottom, z }, "x");
    }
    for (const [key, pz] of [["box-front", z], ["rear", z + box.depth - wall]] as const) {
      panel(a, key, "Drawer box front/rear", stock.drawerWall,
        { x: boxWidth - 2 * wall, y: box.height - bottom, z: wall }, { x: x + wall, y: y + bottom, z: pz }, "z");
    }
    panel(a, "front", "Separate drawer front", stock.drawerFront, row.front.dimensions, row.front.position, "z");
    for (const [key, rx] of [["left", x - runner.envelopeWidth], ["right", x + boxWidth]] as const) {
      hardware(a, `runner-${key}`, "Side-mounted ball-bearing runner (single side)", runner.definitionId, 1,
        { x: rx, y: y + runner.bottomOffset, z: z + runner.frontOffset },
        { x: runner.envelopeWidth, y: runner.envelopeHeight, z: runner.length });
    }
    hardware(a, "box-screws", "Drawer box screws", s.hardware.screwId, 4 * box.screwsPerCorner + box.bottomScrewCount, a.position);
    hardware(a, "front-screws", "Drawer front attachment screws", s.hardware.screwId, s.construction.fronts.screwsPerFront, a.position);
    // Two runners, each with a cabinet and a drawer mounting face.
    hardware(a, "runner-screws", "Runner mounting screws", s.hardware.screwId, 4 * runner.screwsPerMember, a.position);
  }
  issues.push(...validateFurnitureAssembly(s, result.components));
  result.geometryValid = !issues.some(i => i.severity === "error");
  if (result.geometryValid) result.bom = generateFurnitureBOM(result.components);
  issues.push({ code: "phase-1-only", severity: "info", message: "Geometry/BOM only: no manufacturing release. Joint details, loads, stability, tolerances, grain, edge treatment and hardware installation still require engineering approval." });
  return result;
}
