import type { FurnitureSpecification } from "./types";

/** Fresh, editable DEMONSTRATION specification. No hardware manufacturer claims. */
export function createDemoChestSpecification(): FurnitureSpecification {
  return {
    schemaVersion: 2, family: "drawer-chest", units: "mm",
    dimensions: { width: 900, height: 850, depth: 500 },
    materials: [
      { id: "demo-sheet", name: "Demonstration carcass/front sheet — grade unverified", kind: "sheet" },
      { id: "demo-plywood", name: "Demonstration plywood — grade unverified", kind: "sheet" },
    ],
    panels: {
      carcass: { materialId: "demo-sheet", thickness: 18 },
      back: { materialId: "demo-plywood", thickness: 6 },
      drawerWall: { materialId: "demo-plywood", thickness: 12 },
      drawerBottom: { materialId: "demo-plywood", thickness: 6 },
      drawerFront: { materialId: "demo-sheet", thickness: 18 },
    },
    drawerCount: 4,
    construction: {
      carcass: "full-width-top-base", carcassScrewsPerJoint: 4,
      back: { type: "square-cut-inset", rearInset: 10, edgeClearance: 1,
        fixing: "surface-brackets", bracketCount: 8, screwsPerBracket: 2, mountingEdgeOffset: 25 },
      drawer: { joint: "front-rear-between-sides", bottom: "under-box",
        depth: 400, height: 130, frontBottomOffset: 24, rearClearance: 10,
        bottomClearance: 8, topClearance: 8, screwsPerCorner: 2, bottomScrewCount: 8, bottomFixing: "screws-through-bottom" },
      fronts: { overlay: { left: 18, right: 18, top: 18, bottom: 18 },
        edgeGap: { left: 2, right: 2, top: 2, bottom: 2 }, verticalGap: 3,
        rearFaceSetback: 0, attachmentEdgeMargin: 10, fixing: "screws-from-box", screwsPerFront: 4 },
    },
    hardware: {
      runner: { type: "side-mounted-ball-bearing", definitionId: "generic-unverified-runner",
        length: 400, sideClearance: 12.7, envelopeWidth: 12.7, envelopeHeight: 45,
        frontOffset: 0, bottomOffset: 20, screwsPerMember: 3 },
      screwId: "generic-unverified-screw", backBracketId: "generic-unverified-back-bracket",
    },
    verification: {
      materials: { status: "assumption", description: "Sheet grades, thickness tolerances, grain and edge treatment are unverified." },
      carcassJoinery: { status: "assumption", description: "Square butt joints with four screws per joint; screw selection and joint strength unverified." },
      backFixing: { status: "assumption", description: "6 mm square-cut back, 10 mm rear inset, 1 mm edge clearance; eight individually anchored surface brackets with two screws each; 25 mm back-edge mounting offset is illustrative. No groove or rebate." },
      drawerConstruction: { status: "assumption", description: "12 mm walls, front/rear between sides; 6 mm bottom screwed upwards into wall edges underneath; full perimeter contact is required. 400 mm depth, 130 mm total box height; fixing quantities unverified." },
      runners: { status: "assumption", description: "12.7 mm side space, 400 mm length and 45 mm envelope height are illustrative, not manufacturer specifications. Three screws per member per mounting face." },
      frontFixing: { status: "assumption", description: "18 mm overlay, 2 mm perimeter gaps, 3 mm inter-front gap; rear face at carcass front, box front in direct contact at the same Z plane; box bottom 24 mm above its decorative front bottom; four attachment screws per front." },
      loadAndStability: { status: "assumption", description: "Loads, racking, drawer retention, anti-tip restraint and stability have not been engineered or tested." },
    },
  };
}
