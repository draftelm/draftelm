import type { Vector3 } from "../../furniture";
import type { ComponentReference } from "../types";

export type ComponentDimensionKind = "length" | "width" | "thickness";
export type ComponentDimensionId = `component-dimension:${string}:${ComponentDimensionKind}`;
export interface SemanticComponentDimension {
  id: ComponentDimensionId; kind: ComponentDimensionKind; unit: "mm"; valueMm: number;
  reference: ComponentReference & { bomId: string }; partTypeKey: string;
  measurement: { kind: "panel-axis-extent"; axis: "x" | "y" | "z"; from: Vector3; to: Vector3 };
  meaning: "nominal-rectangular-blank"; tolerance: "unspecified"; manufacturingDatum: "not-assessed";
}
export interface ComponentDrawingIntent {
  id: string; bomId: string; partTypeKey: string; componentIds: string[]; representativeId: string;
  quantity: number; label: string; materialId: string;
  /** Each occurrence has its own physical frame, including differently oriented
   * occurrences which legitimately share the existing nominal blank BOM. */
  occurrences: { componentId: string; origin: Vector3; u: "x" | "y" | "z"; v: "x" | "y" | "z"; normal: "x" | "y" | "z";
    /** Display may rotate long edge horizontally; physical u/v axes stay fixed. */
    displayAxes: { horizontal: "x" | "y" | "z"; vertical: "x" | "y" | "z" };
    dimensionIds: Record<ComponentDimensionKind, ComponentDimensionId> }[];
}
export interface ComponentDimensionPlan {
  schemaVersion: 1; id: "component-dimension-plan";
  binding: { engineeringRevision: string; sourceSnapshot: string; profileSnapshot: string; resolverVersion: "rectangular-panel-dimensions-1" };
  groups: ComponentDrawingIntent[]; dimensions: SemanticComponentDimension[];
  coverageScope: "nominal-rectangular-blanks-only";
}
/** Paper-space choices, never tolerances or engineering dimensions. Future
 * company policies can supply a reviewed style through this placement seam. */
export interface ComponentDimensionStyle {
  id: string; textSizeMm: number; arrowLengthMm: number; arrowHalfWidthMm: number; lineWidthMm: number;
  extensionGapMm: number; extensionOverrunMm: number; textGapMm: number;
  clearanceMm: number; laneSpacingMm: number; lanes: number; collisionGapMm: number;
}
export type DimensionPlacement = { status: "unplaced" } | {
  status: "placed"; side: "bottom" | "top" | "left" | "right"; arrows: "inside" | "outside"; style: ComponentDimensionStyle;
};
export interface LinkedThicknessDimension {
  id: ComponentDimensionId; semanticDimensionId: ComponentDimensionId; equivalentDimensionIds: ComponentDimensionId[];
  valueMm: number; references: ComponentReference[]; presentation: "normal-to-face-note"; status: "placed" | "unplaced";
}
export interface ComponentDimensionDiagnostic {
  code: "no-readable-placement" | "component-drawings-hidden";
  groupId?: string; dimensionIds: ComponentDimensionId[]; message: string;
}
export interface ComponentDimensionLayout {
  version: "rectangular-component-placement-1"; groupId: string; style: ComponentDimensionStyle;
  diagnostics: ComponentDimensionDiagnostic[];
}
export interface ComponentDimensionCoverage {
  requiredDimensionIds: ComponentDimensionId[]; displayedDimensionIds: ComponentDimensionId[];
  missingDimensionIds: ComponentDimensionId[]; diagnostics: ComponentDimensionDiagnostic[];
  scope: "nominal-rectangular-blanks-only";
}
