import type { Vector3 } from "../../furniture";
import type { Bounds3, ComponentReference, Point2, Projection } from "../types";

export type ModelAxis = "x" | "y" | "z";
export type FaceSide = "min" | "max";
export type FunctionalKind = "front-gap" | "front-left-reveal" | "front-right-reveal" | "front-bottom-reveal" | "front-top-reveal" |
  "drawer-left-clearance" | "drawer-right-clearance" | "drawer-cell-bottom-clearance" | "drawer-cell-top-clearance" |
  "drawer-back-clearance" | "front-box-bottom-offset" | "front-rear-setback" | "back-rear-inset" |
  "back-left-clearance" | "back-right-clearance" | "back-bottom-clearance" | "back-top-clearance";
export type FunctionalDimensionId = `functional-dimension:${string}`;
export interface GeometricFaceReference {
  kind: "panel-face"; id: string; reference: ComponentReference; axis: ModelAxis; side: FaceSide;
  coordinateMm: number; normal: Vector3; bounds: Bounds3; formalDatum: "not-assessed";
}
export interface GeometricEdgeReference {
  kind: "panel-edge"; id: string; faceIds: string[]; reference: ComponentReference; axis: ModelAxis;
  fixedSides: Partial<Record<ModelAxis, FaceSide>>; from: Vector3; to: Vector3;
}
export interface FunctionalReferencePolicy {
  id: string; station: "overlap-midpoint" | "overlap-min";
  projections: Record<ModelAxis, Exclude<Projection, "isometric">>;
}
/** Proposal seam only: overrides need a future bound policy/validation/UI.
 * Geometric reference preferences never assign manufacturing datums. */
export interface FunctionalReferenceOverrideProposal {
  requestId: string; fromFaceId: string; toFaceId: string; reason: string; status: "proposed";
}
export type FunctionalDesignIntent = { status: "not-directly-specified" } | {
  status: "geometry-consistent" | "violated"; authority: "engineering-revision-parameter";
  parameterPath: string; valueMm: number; comparison: "exact" | "minimum";
  validation: "geometry-check-only"; nominalStatus: "unverified-nominal-assumption" | "verification-not-assessed";
};
export interface FunctionalDimension {
  id: FunctionalDimensionId; unit: "mm"; valueMm: number; basis: "measured-geometry";
  measurement: { kind: "parallel-face-distance"; axis: ModelAxis; fromFaceId: string; toFaceId: string;
    fromEdgeId: string; toEdgeId: string; from: Vector3; to: Vector3 };
  references: ComponentReference[]; projection: Exclude<Projection, "isometric">;
  tolerance: "unspecified"; manufacturingDatum: "not-assessed";
}
export interface FunctionalRelationshipRequest {
  id: string; kind: FunctionalKind; assemblyIds: string[]; componentIds: string[]; required: boolean;
  classification: "gap" | "reveal" | "clearance" | "offset" | "relative-position";
  relationshipSpace: "opposed-faces" | "projected-reference" | "usable-front-cell";
  label: string; state: "resolved" | "unsupported"; dimensionId?: FunctionalDimensionId;
  intent: FunctionalDesignIntent; reason?: string;
}
export interface FunctionalDisplayGroup {
  id: string; label: string; kind: FunctionalKind; representativeRequestId: string;
  requestIds: string[]; dimensionIds: FunctionalDimensionId[];
}
export interface FunctionalDimensionPlan {
  schemaVersion: 1; id: "functional-dimension-plan";
  binding: { engineeringRevision: string; sourceSnapshot: string; profileSnapshot: string; ruleVersion: "drawer-chest-functional-1" };
  referencePolicy: FunctionalReferencePolicy; faces: GeometricFaceReference[]; edges: GeometricEdgeReference[];
  dimensions: FunctionalDimension[]; requests: FunctionalRelationshipRequest[]; displayGroups: FunctionalDisplayGroup[];
  diagnostics: { code: "unsupported" | "intent-mismatch"; requestId?: string; message: string }[];
  coverageScope: "registered-rectangular-assembly-relationships-only";
}
export interface FunctionalDimensionPlacement {
  groupId: string; requestIds: string[]; dimensionIds: FunctionalDimensionId[]; representativeDimensionId: FunctionalDimensionId;
  from: Point2; to: Point2; valueMm: number; status: "placed" | "unplaced"; reason?: string;
}
export interface FunctionalDimensionCoverage {
  requiredRequestIds: string[]; displayedRequestIds: string[]; unplacedRequestIds: string[];
  unsupportedRequestIds: string[]; deferredRequestIds: string[];
  diagnostics: { code: "hidden" | "unplaced" | "unsupported"; requestIds: string[]; message: string }[];
}
