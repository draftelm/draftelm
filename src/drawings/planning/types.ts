import type { Vector3 } from "../../furniture";
import type { ComponentReference, IsometricMode, Projection } from "../types";

export type GADimensionId = "overall-width" | "overall-height" | "carcass-depth" | "overall-depth";
export interface GAExtentReference {
  kind: "panel-envelope";
  assemblyId: string;
  scope: "closed-assembly-panels" | "carcass-panels";
  axis: "x" | "y" | "z";
  side: "min" | "max";
  /** Every panel attaining this extreme; no transient array-index identity. */
  componentIds: string[];
}
export interface GACornerAnchor {
  kind: "panel-corner";
  reference: ComponentReference;
  corner: { x: "min" | "max"; y: "min" | "max"; z: "min" | "max" };
  point: Vector3;
}
/** Model semantics only: no sheet rectangles, text offsets, font or plot scale. */
export interface SemanticGADimension {
  id: GADimensionId;
  meaning: "overall-cabinet-width" | "overall-cabinet-height" | "carcass-depth" | "overall-closed-depth-including-fronts";
  unit: "mm"; valueMm: number;
  measurement: { kind: "linear-axis-distance"; axis: "x" | "y" | "z";
    from: GAExtentReference; to: GAExtentReference };
  anchors: { from: GACornerAnchor; to: GACornerAnchor };
  relevantViews: Projection[];
  references: ComponentReference[];
  referenceContext: { frame: "engine-global-mm"; datumSystem: "not-assessed" };
  tolerance: { state: "unspecified" };
}
export interface GAViewIntent {
  id: string; projection: Projection; included: boolean;
  role: "primary" | "supporting";
  sourceComponentIds: string[]; dimensionIds: GADimensionId[];
  candidateBalloonIds: string[];
}
export interface GeneralAssemblyPlan {
  schemaVersion: 1; id: string;
  source: { family: string; rootAssemblyId: string; carcassAssemblyId: string;
    engineeringRevision: string };
  binding: {
    /** Canonical JSON snapshots, not security hashes or approval signatures. */
    sourceSnapshot: string; profileSnapshot: string; annotationSnapshot: string;
    plannerVersion: string; resolverVersion: string;
  };
  visibility: { algorithm: string; isometricMode: IsometricMode; cameraDirection: Vector3; computationalEpsilonMm: number };
  policy: { id: string; version: string; preferredPrimary: Projection;
    selectedPrimary: Projection | null; layoutStrategy: "drawer-chest-primary-and-supports-v1"; reasons: string[] };
  views: GAViewIntent[];
  dimensions: SemanticGADimension[];
  annotationReferences: { balloonIds: string[]; partsListId: string; itemKeys: string[] };
  coverage: { requiredDimensionIds: GADimensionId[]; displayedDimensionIds: GADimensionId[];
    missingDimensionIds: GADimensionId[]; scope: "four-nominal-GA-dimensions-only" };
  diagnostics: { code: "hidden-required-view" | "primary-view-hidden" | "assembly-views-hidden";
    dimensionId?: GADimensionId; message: string }[];
  manufacturingReady: false; complianceVerified: false;
  manufacturingVariants: "not-assessed";
}
export interface GAPlanResult { plan: GeneralAssemblyPlan | null; issues: string[] }
