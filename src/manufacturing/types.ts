import type { Vector3 } from "../furniture";

export type ModelAxis = "x" | "y" | "z";
export interface SignedAxis { axis: ModelAxis; sign: 1 | -1 }
/** Local axes are physical identities, never sorted by face length. */
export interface PanelOrientation { u: SignedAxis; v: SignedAxis; normal: SignedAxis }
export type FaceKey = "a" | "b";
export type EdgeKey = "u-min" | "u-max" | "v-min" | "v-max";
export type PanelFaceId = `panel-face:${string}:${FaceKey}`;
export type PanelEdgeId = `panel-edge:${string}:${EdgeKey}`;
export interface LocalPoint { u: number; v: number; t: number }
export interface PanelTopology {
  version: "rectangular-panel-topology-1"; componentId: string; assemblyId: string;
  frame: { orientation: PanelOrientation; origin: Vector3; size: LocalPoint };
  faces: { id: PanelFaceId; key: FaceKey; localCorners: LocalPoint[]; worldCorners: Vector3[]; outwardNormal: Vector3 }[];
  /** These are four thickness-wide perimeter surfaces, not the twelve box line segments. */
  edges: { id: PanelEdgeId; key: EdgeKey; lengthMm: number; localCorners: LocalPoint[]; worldCorners: Vector3[]; outwardNormal: Vector3; adjacentFaceIds: PanelFaceId[] }[];
}
export interface PropertyVerification {
  engineeringRevision: string;
  /** Exact canonical value + component binding + orientation + property path. */
  subjectFingerprint: string;
  evidenceRefs: string[];
  verifiedBy: string;
}
/** Verification records express supplied evidence, never authenticated release approval. */
export type ManufacturingProperty<T> =
  | { status: "unassigned"; reason: string }
  | { status: "provisional"; value: T; reason: string }
  | { status: "verified"; value: T; verification: PropertyVerification };
export interface ManufacturerCode { manufacturerId: string; code: string }
export interface MaterialSpecification {
  catalogue?: import("./catalogue").CatalogueReference;
  stockMaterialId: string;
  description?: string;
  /** Null means explicitly not applicable; unassigned never establishes equivalence. */
  grade: ManufacturingProperty<string | null>; manufacturerCodes: ManufacturerCode[];
}
export interface ProcessMetadata { specificationId: string; notes: string[] }
export type SurfaceFinish = { kind: "none" } | {
  kind: "specified"; specificationId: string; manufacturerCodes: ManufacturerCode[];
  catalogue?: import("./catalogue").CatalogueReference;
  appearance: ManufacturingProperty<string | null>;
  process: ManufacturingProperty<ProcessMetadata | null>;
};
export type EdgeTreatment = { kind: "none" } | {
  kind: "edge-band" | "lipping" | "other";
  /** Omitted for an incomplete generic proposal; never an approved specification. */
  specificationId?: string;
  catalogue?: import("./catalogue").CatalogueReference;
  material: ManufacturingProperty<MaterialSpecification | null>;
  nominalThicknessMm: ManufacturingProperty<number | null>;
  appearance: ManufacturingProperty<string | null>;
  process: ManufacturingProperty<ProcessMetadata | null>;
};
export interface FaceRequirements {
  decorative: boolean; reverse: boolean;
  /** Explicit required visible face in service; not a camera visibility calculation. */
  visibleInService: boolean;
  goodFaceRequirements: { requirementId: string; description: string; manufacturerId?: string }[];
}
export type GrainSpecification = { direction: "non-directional" } | {
  /** Longitudinal = local U; transverse = local V, even when their lengths exchange. */
  direction: "longitudinal" | "transverse"; sense: "either" | "positive" | "negative";
};
export type GrainMatching = { kind: "independent" } | {
  kind: "specified"; groupId: string; faceId: PanelFaceId; sequence: number;
  /** Registration in a future common pattern layout; no continuity is inferred. */
  originUvMm: { u: number; v: number }; rotationDeg: 0 | 90 | 180 | 270;
};
export type StockOrientation = { kind: "non-directional" } | {
  kind: "directional"; along: "u" | "v"; reversalAllowed: boolean;
};
export interface PanelManufacturingProperties {
  componentId: string; assemblyId: string;
  binding: { engineeringRevision: string; panelSnapshot: string; orientationSnapshot: string };
  orientation: PanelOrientation;
  material: ManufacturingProperty<MaterialSpecification>;
  stockOrientation: ManufacturingProperty<StockOrientation>;
  grain: ManufacturingProperty<GrainSpecification>;
  grainMatching: ManufacturingProperty<GrainMatching>;
  faces: { faceId: PanelFaceId; requirements: ManufacturingProperty<FaceRequirements>; finish: ManufacturingProperty<SurfaceFinish> }[];
  edges: { edgeId: PanelEdgeId; treatment: ManufacturingProperty<EdgeTreatment> }[];
  /** Explicit extension seam; unknown is not an approved empty operation list. */
  otherRequirements: ManufacturingProperty<{ requirementId: string; specification: string }[]>;
}
export interface PanelManufacturingDocument {
  schemaVersion: 1;
  binding: { engineeringRevision: string; sourceSnapshot: string; resolverVersion: "panel-manufacturing-1" };
  panels: PanelManufacturingProperties[];
  manufacturingReady: false;
}
export interface ManufacturingDiagnostic {
  code: "invalid-source" | "invalid-schema" | "stale-source" | "stale-panel" | "invalid-reference" | "incompatible-properties" | "unresolved-property" | "provisional-property" | "invalid-verification" | "incomplete-matching";
  severity: "error" | "warning"; componentId?: string; path?: string; message: string;
}
export interface ManufacturingValidation {
  valid: boolean; diagnostics: ManufacturingDiagnostic[];
  /** This bounded property assessment is not a manufacturing release assessment. */
  allPropertiesVerified: boolean; manufacturingReady: false; approvedManufacturingData: false;
}
export interface ManufacturingGroup {
  id: string; fingerprint: string; componentIds: string[]; sourceBomIds: string[]; quantity: number;
  equivalence: "verified-properties-only" | "unresolved-occurrence";
  manufacturingInterchangeability: "not-assessed";
}
export interface PanelManufacturingPlan {
  binding: { engineeringRevision: string; propertiesSnapshot: string };
  topology: PanelTopology[];
  variants: ManufacturingGroup[]; stockBlankGroups: ManufacturingGroup[];
  validation: ManufacturingValidation;
  manufacturingReady: false; approvedManufacturingData: false;
}
