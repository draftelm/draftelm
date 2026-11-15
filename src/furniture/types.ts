/** All lengths are millimetres. X right, Y up, Z rearward.
 * Origin: front-left-bottom of the carcass. Positions are minimum corners.
 * Dimensions are axis-aligned assembled extents, not ambiguous L/W labels.
 */
export interface Vector3 { x: number; y: number; z: number }
export type FurnitureFamily = "drawer-chest";
export interface PanelStock { materialId: string; thickness: number }
export interface PanelMaterial { id: string; name: string; kind: "sheet" }
export type VerificationArea = "materials" | "carcassJoinery" | "backFixing" |
  "drawerConstruction" | "runners" | "frontFixing" | "loadAndStability";
export interface Verification {
  status: "assumption" | "verified";
  description: string;
  evidence?: string;
  /** Exact canonical specification + engine revision approved by this record. */
  specificationRevision?: string;
}
export interface FurnitureSpecification {
  schemaVersion: 2;
  family: FurnitureFamily;
  units: "mm";
  dimensions: { width: number; height: number; depth: number };
  materials: PanelMaterial[];
  panels: { carcass: PanelStock; back: PanelStock; drawerWall: PanelStock;
    drawerBottom: PanelStock; drawerFront: PanelStock };
  drawerCount: number;
  construction: {
    carcass: "full-width-top-base";
    carcassScrewsPerJoint: number;
    back: { type: "square-cut-inset"; rearInset: number;
      /** Nominal per-edge design gap, prototype default 0. Not a manufacturing tolerance. */
      edgeClearance: number;
      fixing: "surface-brackets"; bracketCount: number; screwsPerBracket: number; mountingEdgeOffset: number };
    drawer: { joint: "front-rear-between-sides"; bottom: "under-box";
      depth: number; height: number; frontBottomOffset: number; rearClearance: number;
      bottomClearance: number; topClearance: number; screwsPerCorner: number;
      bottomScrewCount: number; bottomFixing: "screws-through-bottom" };
    fronts: { overlay: { left: number; right: number; top: number; bottom: number };
      edgeGap: { left: number; right: number; top: number; bottom: number };
      verticalGap: number; rearFaceSetback: number; attachmentEdgeMargin: number;
      fixing: "screws-from-box"; screwsPerFront: number };
  };
  hardware: {
    runner: { type: "side-mounted-ball-bearing"; definitionId: string;
      length: number; sideClearance: number; envelopeWidth: number;
      envelopeHeight: number; frontOffset: number; bottomOffset: number;
      screwsPerMember: number };
    screwId: string;
    backBracketId: string;
  };
  verification: Record<VerificationArea, Verification>;
}
export interface Assembly {
  id: string;
  name: string;
  parentId: string | null;
  /** Global coordinates; component positions are also global, never relative. */
  position: Vector3;
  componentIds: string[];
}
interface ComponentBase {
  id: string;
  assemblyId: string;
  name: string;
  quantity: number;
  position: Vector3;
}
export interface PanelComponent extends ComponentBase {
  kind: "panel";
  materialId: string;
  dimensions: Vector3;
  thickness: number;
  thicknessAxis: "x" | "y" | "z";
}
export interface HardwareComponent extends ComponentBase {
  kind: "hardware";
  hardwareId: string;
  /** Runner envelopes only. Fixing anchors are schematic, not drilling locations. */
  dimensions?: Vector3;
  placement: "envelope" | "schematic-anchor";
  /** Individually located bracket bearing/attachment anchors; not drill centres. */
  mounts?: MountingAnchor[];
}
export interface MountingAnchor {
  targetId: string;
  axis: "x" | "y" | "z";
  face: "min" | "max";
  point: Vector3;
}
export interface RequiredContact {
  firstId: string;
  secondId: string;
  axis: "x" | "y" | "z";
}
export type FurnitureComponent = PanelComponent | HardwareComponent;
export interface BOMLine {
  id: string;
  kind: FurnitureComponent["kind"];
  name: string;
  partNames: string[];
  itemId: string;
  quantity: number;
  unit: "piece";
  componentIds: string[];
  /** Cut dimensions: long face edge, short face edge, thickness; no grain rotation implied. */
  cutSize?: { length: number; width: number; thickness: number };
}
export interface FurnitureIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  componentIds?: string[];
}
export interface FurnitureResult {
  specificationRevision: string;
  assemblies: Assembly[];
  components: FurnitureComponent[];
  bom: BOMLine[];
  issues: FurnitureIssue[];
  geometryValid: boolean;
  assumptionsVerified: boolean;
  /** Phase 1 never certifies a manufacturing release. */
  manufacturingReady: false;
}
