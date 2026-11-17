import type { Vector3 } from "../../furniture";
import type { Bounds2, Bounds3, ComponentReference, DrawingLine, Point2, Projection } from "../types";
import type { FunctionalDimensionId, ModelAxis } from "./functionalTypes";

export interface SectionDefinition {
  id: string; label: string; parentViewId: string; sourceRevision: string;
  plane: { axis: ModelAxis; coordinateMm: number };
  /** Observer looks into retained material in this direction. */
  cuttingDirection: Vector3; projection: Exclude<Projection, "isometric">;
  componentIds: string[]; requiredIntersectionIds: string[];
  selection: { rule: "functional-common-span-midpoint-1"; componentIds: string[]; intervalMm: [number, number] };
}
export interface SectionCutFace {
  id: string; sectionId: string; reference: ComponentReference;
  bounds: Bounds2; corners: Vector3[];
}
export interface SectionGeometry {
  algorithm: "axis-aligned-half-space-section-1"; sectionId: string;
  cutFaces: SectionCutFace[]; edges: DrawingLine[]; bounds: Bounds2;
  states: { reference: ComponentReference; status: "cut" | "retained" | "removed" | "tangent-retained" | "tangent-removed"; retainedBounds?: Bounds3 }[];
}
export interface ContextualDetailDefinition {
  id: string; label: string; parentSectionId: string; parentViewId: string;
  crop: Bounds2; relationshipRequestIds: string[]; componentIds: string[];
  rule: "lowest-drawer-rear-back-base-context-1";
}
export interface SectionDimensionBinding {
  id: string; view: "section" | "detail"; requestId: string; semanticDimensionId: FunctionalDimensionId;
  label: string; valueMm: number; axis: "horizontal" | "vertical";
  anchors: { sourceFaceId: string; sectionFaceId: string; componentId: string; point: Vector3;
    mapping: "direct-intersection" | "coplanar-carcass-rear-envelope" }[];
  from: Point2; to: Point2; references: ComponentReference[];
  role: "reference-repeat";
}
export interface ContextualSectionPlan {
  schemaVersion: 1; id: "contextual-section-plan";
  binding: { engineeringRevision: string; sourceSnapshot: string; profileSnapshot: string; ruleVersion: "chest-contextual-sections-1" };
  section: SectionDefinition | null; geometry: SectionGeometry | null; detail: ContextualDetailDefinition | null;
  dimensionBindings: SectionDimensionBinding[];
  diagnostics: { code: "unsupported-section" | "unsupported-context-anchor"; message: string; requestId?: string }[];
}
export interface SectionViewportData {
  kind: "parent" | "section" | "detail"; sectionId: string; detailId?: string;
  cutFaces: SectionCutFace[];
  dimensionBindings: SectionDimensionBinding[];
  deferredDimensionIds: string[];
  identifications?: { id: string; componentId: string; text: string; at: Point2; anchor: Point2 }[];
  deferredIdentificationIds?: string[];
}
export type SectionReferenceMarker =
  | { kind: "cutting-plane"; id: string; sectionId: string; label: string; from: Point2; to: Point2; direction: Point2; targetViewId: string }
  | { kind: "detail-boundary"; id: string; detailId: string; label: string; bounds: Bounds2; targetViewId: string };
export interface SectionPresentation {
  hostSheetId: string; detailSheetId: string; parentAssemblySheetId?: string; continuation: boolean;
  placedBindingIds: string[]; deferredBindingIds: string[]; diagnostics: string[];
}
